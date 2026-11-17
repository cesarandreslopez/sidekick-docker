/**
 * Seeds the sandbox daemon with the storefront stack and the odds and ends the
 * demos show, then waits until every container has reached the state a clip
 * relies on. Every take starts from a fresh seed, so a prune in one clip never
 * leaves the next one short of stopped containers.
 *
 *   node lib/stack.mjs          start the daemon, seed, check, print the summary
 *
 * What it leaves behind, on the sandbox daemon only:
 * - storefront: web, api ×3, worker ×2, db, cache, loadgen (running), payments
 *   (unhealthy: its probe says why), reports (paused), mailer (crashed, restarted
 *   5×), migrate (exit 3), cache-warmer (OOM killed, exit 137), search (declared,
 *   not created);
 * - status-page: one stopped service, a second project in another state;
 * - nightly-export: a stopped container with 48 MB in its writable layer, so a
 *   container prune reclaims a visible amount;
 * - a dangling image, an anonymous volume holding 24 MB and an unused network.
 */
import { DIND_NAME, assertSandboxDaemon, dockerIn, prepareSandbox, startDaemon } from './sandbox.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const json = (paths, args) =>
  dockerIn(paths, args)
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));

/** Wipe the sandbox daemon back to images only. It is demo-only, so this touches nothing of yours. */
function wipe(paths) {
  assertSandboxDaemon(); // never run the removals below against anything but the sandbox container
  const ids = dockerIn(paths, ['ps', '-aq']).split('\n').filter(Boolean);
  if (ids.length) dockerIn(paths, ['rm', '-f', '-v', ...ids]);
  dockerIn(paths, ['volume', 'prune', '-a', '-f'], { allowFail: true });
  dockerIn(paths, ['network', 'prune', '-f'], { allowFail: true });
  dockerIn(paths, ['image', 'prune', '-f'], { allowFail: true });
}

export async function seedStack(paths, { log = () => {} } = {}) {
  log('wipe the sandbox daemon');
  wipe(paths);

  log('build storefront/app');
  dockerIn(paths, ['compose', 'build', 'api'], { timeout: 900_000 });
  log('compose up storefront');
  dockerIn(paths, ['compose', 'up', '-d', '--scale', 'search=0'], { timeout: 900_000 });

  log('compose up + stop status-page');
  dockerIn(paths, ['compose', 'up', '-d'], { cwd: paths.statusProject, timeout: 300_000 });
  dockerIn(paths, ['compose', 'stop'], { cwd: paths.statusProject });

  log('extras: export container, dangling image, anonymous volume, unused network');
  dockerIn(paths, ['run', '--name', 'nightly-export', 'alpine:3.22', 'sh', '-c', "echo 'INFO  writing nightly export'; head -c 50331648 /dev/urandom > /export.tar; echo 'INFO  export written size=48MB'"]);
  for (const build of ['1', '2']) {
    dockerIn(paths, ['build', '-q', '-t', 'storefront/tools:latest', '-'], {
      input: `FROM alpine:3.22\nRUN echo build-${build} > /build-id && head -c ${build === '1' ? 6291456 : 3145728} /dev/urandom > /tools.bin\n`,
    });
  }
  dockerIn(paths, ['run', '--name', 'seed-upload', '-v', '/data', 'alpine:3.22', 'sh', '-c', 'head -c 25165824 /dev/urandom > /data/upload.bin']);
  dockerIn(paths, ['rm', 'seed-upload']); // without -v: the anonymous volume stays behind
  dockerIn(paths, ['network', 'create', '--subnet', '10.42.0.0/24', '--label', 'com.example.team=platform', 'legacy-bridge']);

  log('pause reports');
  await waitFor(paths, () => state(paths, 'storefront-reports-1')?.Status === 'running', 'reports running', 60_000);
  dockerIn(paths, ['pause', 'storefront-reports-1']);

  log('wait for every container to settle');
  await waitFor(paths, () => problems(paths).length === 0, 'stack settled', 150_000);
}

function state(paths, name) {
  const out = dockerIn(paths, ['inspect', '-f', '{{json .State}}|{{.RestartCount}}', name], { allowFail: true }).trim();
  if (!out) return null;
  const [s, restarts] = out.split('|');
  return { ...JSON.parse(s), RestartCount: Number(restarts) };
}

async function waitFor(paths, ok, what, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (ok()) return;
    await sleep(1500);
  }
  const left = problems(paths);
  throw new Error(`timed out waiting for ${what}${left.length ? `:\n- ${left.join('\n- ')}` : ''}`);
}

/** Everything that is not yet the way the clips need it. Empty when ready. */
export function problems(paths) {
  const issues = [];
  const want = (name, test, describe) => {
    const s = state(paths, name);
    if (!s) issues.push(`${name}: missing`);
    else if (!test(s)) issues.push(`${name}: ${describe(s)}`);
  };
  const health = (s) => s.Health?.Status ?? 'none';
  for (const n of ['storefront-api-1', 'storefront-api-2', 'storefront-api-3']) want(n, (s) => s.Running && health(s) === 'healthy', (s) => `${s.Status}/${health(s)}`);
  for (const n of ['storefront-web-1', 'storefront-db-1', 'storefront-cache-1']) want(n, (s) => s.Running && health(s) === 'healthy', (s) => `${s.Status}/${health(s)}`);
  for (const n of ['storefront-worker-1', 'storefront-worker-2', 'storefront-loadgen-1']) want(n, (s) => s.Running, (s) => s.Status);
  want('storefront-payments-1', (s) => s.Running && health(s) === 'unhealthy', (s) => `${s.Status}/${health(s)}`);
  want('storefront-reports-1', (s) => s.Paused, (s) => s.Status);
  want('storefront-mailer-1', (s) => !s.Running && !s.Restarting && s.RestartCount >= 5, (s) => `${s.Status}, restarted ${s.RestartCount}×`);
  want('storefront-migrate-1', (s) => s.Status === 'exited' && s.ExitCode === 3, (s) => `${s.Status} exit ${s.ExitCode}`);
  want('storefront-cache-warmer-1', (s) => s.Status === 'exited' && s.OOMKilled && s.ExitCode === 137, (s) => `${s.Status} exit ${s.ExitCode} oom=${s.OOMKilled}`);
  want('status-page-uptime-1', (s) => s.Status === 'exited', (s) => s.Status);
  want('nightly-export', (s) => s.Status === 'exited' && s.ExitCode === 0, (s) => `${s.Status} exit ${s.ExitCode}`);
  return issues;
}

/**
 * The full preflight: container states plus the daemon features the clips show.
 * Throws with every failure listed; returns a one-line summary when clean.
 */
export function assertStack(paths) {
  const issues = problems(paths);

  const services = dockerIn(paths, ['compose', 'config', '--services'], { allowFail: true }).split('\n').filter(Boolean);
  if (!services.includes('search') || !services.includes('api')) issues.push(`docker compose config under the sandbox env lists [${services.join(', ')}] (plugin or project dir broken?)`);

  const diff = dockerIn(paths, ['diff', 'storefront-api-1'], { allowFail: true });
  for (const want of ['A /app/cache/products.json', 'C /app/config/runtime.json', 'D /app/config/seed.sql']) {
    if (!diff.includes(want)) issues.push(`docker diff storefront-api-1 lacks "${want}"`);
  }

  const stats = json(paths, ['stats', '--no-stream', '--format', '{{json .}}', 'storefront-api-1']);
  if (!stats.length || stats[0].MemUsage.startsWith('0B')) issues.push('docker stats reports nothing for storefront-api-1');

  if (!dockerIn(paths, ['images', '--filter', 'dangling=true', '-q']).trim()) issues.push('no dangling image');
  const anon = json(paths, ['volume', 'ls', '--filter', 'dangling=true', '--format', '{{json .}}']).filter((v) => (v.Labels ?? '').includes('com.docker.volume.anonymous'));
  if (!anon.length) issues.push('no anonymous dangling volume');
  if (!dockerIn(paths, ['network', 'ls', '--filter', 'name=legacy-bridge', '-q']).trim()) issues.push('no legacy-bridge network');

  if (issues.length) throw new Error(`preflight failed on the sandbox daemon (${DIND_NAME}):\n- ${issues.join('\n- ')}`);
  const count = dockerIn(paths, ['ps', '-aq']).split('\n').filter(Boolean).length;
  return `preflight clean: ${count} containers in their demo states, compose config, diff, stats, dangling image, anonymous volume`;
}

/** Daemon up, sandbox prepared, stack seeded and checked. Returns the sandbox paths. */
export async function freshStack({ log = () => {} } = {}) {
  const version = await startDaemon();
  log(`sandbox daemon: Docker Engine ${version}`);
  const paths = prepareSandbox();
  await seedStack(paths, { log });
  log(assertStack(paths));
  return paths;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await freshStack({ log: (m) => console.log(`  ${m}`) });
}
