/**
 * The recording sandbox: a Docker daemon of its own and a neutral home, so
 * nothing from your machine reaches the screen.
 *
 * - The daemon is docker:29-dind, published on 127.0.0.1:2375 only and on a
 *   network of its own (it is an unauthenticated root daemon: never bind it
 *   wider, and keep other containers off its network). Its /var/lib/docker is a
 *   named volume, which avoids overlay-on-overlay and keeps pulled images
 *   between runs. Your own images, volumes and containers are on the other
 *   daemon and never appear. Before anything destructive, assertSandboxDaemon()
 *   checks that what answers on the port really is that container.
 * - HOME is /tmp/acme-docker (short and neutral; not sidekick-agent-hub's
 *   /tmp/acme, whose project folder has the same name) and the project is
 *   /tmp/acme-docker/storefront, because compose labels record the project's
 *   host path and the dashboard can show them. prepareSandbox() refuses a root
 *   that exists, is not empty and is not marked as this rig's sandbox.
 * - DOCKER_CONFIG is a bare config.json (no credsStore, no currentContext) with
 *   only the compose plugin linked in. Without that link `docker compose`
 *   vanishes silently: the dashboard reads a missing plugin as "no compose
 *   config" and the planned services disappear.
 * - The TUI is the npm package itself (`npm pack`, installed under
 *   /tmp/acme-docker/npm), so it behaves as an npm install does: no node-pty, exec
 *   falls back to `docker exec -it`.
 * - The dashboard is always started with `--socket tcp://127.0.0.1:2375`. With
 *   the default socket its "Connecting to…" line and version overlay would
 *   print /Users/<you>/.docker/run/docker.sock.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEMO_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
export const REPO_ROOT = dirname(DEMO_DIR);
export const SANDBOX_ROOT = process.env.SK_DEMO_ROOT ?? '/tmp/acme-docker';
export const PROJECT_NAME = 'storefront';
export const ENDPOINT = 'tcp://127.0.0.1:2375';
export const DIND_NAME = 'sidekick-demo-dind';
const DIND_NETWORK = 'sidekick-demo';
const DIND_IMAGE = 'docker:29-dind';
const DIND_VOLUME = 'sidekick-demo-dind';
const MARKER = '.sidekick-docker-demo-sandbox';
const COMPOSE_PLUGIN_CANDIDATES = [
  '/Applications/Docker.app/Contents/Resources/cli-plugins/docker-compose',
  '/usr/local/lib/docker/cli-plugins/docker-compose',
  '/usr/libexec/docker/cli-plugins/docker-compose',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function sandboxPaths(root = SANDBOX_ROOT) {
  return {
    root,
    home: root,
    project: join(root, PROJECT_NAME),
    statusProject: join(root, 'status-page'),
    dockerConfig: join(root, '.docker'),
    npmPrefix: join(root, 'npm'),
    vscodeUserData: join(root, 'vscode', 'user-data'),
    vscodeExtensions: join(root, 'vscode', 'extensions'),
  };
}

/** Where `docker` lives on this machine; its folder goes on the sandbox PATH. */
function dockerBinDir() {
  const which = spawnSync('/usr/bin/which', ['docker'], { encoding: 'utf8' });
  const bin = which.stdout.trim();
  if (!bin) throw new Error('docker CLI not found on PATH');
  return dirname(bin);
}

/**
 * The environment every sandboxed process gets: built from scratch, not from
 * process.env, so nothing personal (USER, real HOME, DOCKER_HOST, contexts)
 * leaks into the recording.
 */
export function sandboxEnv(paths = sandboxPaths(), extra = {}) {
  const PATH = [join(paths.npmPrefix, 'bin'), dirname(process.execPath), dockerBinDir(), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':');
  return {
    HOME: paths.home,
    USER: 'demo',
    LOGNAME: 'demo',
    SHELL: '/bin/sh',
    PATH,
    DOCKER_CONFIG: paths.dockerConfig,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    LANG: 'en_US.UTF-8',
    TZ: process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    ...extra,
  };
}

/** Run docker against the sandbox daemon, in the sandbox environment. */
export function dockerIn(paths, args, { cwd = paths.project, input, timeout = 600_000, allowFail = false } = {}) {
  const res = spawnSync('docker', args, { cwd, input, encoding: 'utf8', timeout, env: sandboxEnv(paths, { DOCKER_HOST: ENDPOINT }), maxBuffer: 64 << 20 });
  if (res.status !== 0 && !allowFail) {
    throw new Error(`docker ${args.join(' ')} failed (${res.status}):\n${res.stderr || res.stdout}`);
  }
  return res.stdout ?? '';
}

/**
 * Create (or refresh) the sandbox folders. `fresh` wipes the whole root first.
 * Everything below deletes or overwrites paths under `root`, so a root that
 * exists, is not empty and does not carry this rig's marker is refused, and the
 * marker is only ever written into a directory this function created or found empty.
 */
export function prepareSandbox({ fresh = false, root = SANDBOX_ROOT } = {}) {
  const paths = sandboxPaths(root);
  if (existsSync(root) && readdirSync(root).length > 0 && !existsSync(join(root, MARKER))) {
    throw new Error(`${root} exists, is not empty and is not a sidekick-docker demo sandbox; refusing to use it (set SK_DEMO_ROOT to a new folder)`);
  }
  if (fresh && existsSync(root)) rmSync(root, { recursive: true, force: true });
  if (!existsSync(join(root, MARKER))) {
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, MARKER), 'Recording sandbox for sidekick-docker/demo. Safe to delete.\n');
  }
  for (const dir of [paths.dockerConfig, join(paths.dockerConfig, 'cli-plugins'), paths.vscodeUserData, paths.vscodeExtensions]) mkdirSync(dir, { recursive: true });

  writeFileSync(join(paths.dockerConfig, 'config.json'), '{}\n');
  const plugin = COMPOSE_PLUGIN_CANDIDATES.find((p) => existsSync(p));
  if (!plugin) throw new Error(`docker compose plugin not found (looked in ${COMPOSE_PLUGIN_CANDIDATES.join(', ')})`);
  const link = join(paths.dockerConfig, 'cli-plugins', 'docker-compose');
  rmSync(link, { force: true });
  symlinkSync(plugin, link);

  // The stack is copied, not linked: compose records the project's host path.
  rmSync(paths.project, { recursive: true, force: true });
  const statusSrc = join(DEMO_DIR, 'stack', 'status');
  cpSync(join(DEMO_DIR, 'stack'), paths.project, { recursive: true, filter: (src) => !src.startsWith(statusSrc) });
  rmSync(paths.statusProject, { recursive: true, force: true });
  cpSync(join(DEMO_DIR, 'stack', 'status'), paths.statusProject, { recursive: true });
  return paths;
}

/** Start the sandbox daemon (or reuse a running one) and wait until it answers. */
export async function startDaemon() {
  const inspect = spawnSync('docker', ['inspect', '-f', '{{.State.Running}} {{index .HostConfig.NetworkMode}}', DIND_NAME], { encoding: 'utf8' });
  if (inspect.stdout.trim() !== `true ${DIND_NETWORK}`) {
    spawnSync('docker', ['rm', '-f', DIND_NAME], { stdio: 'ignore' });
    // A network of its own: on the default bridge, any other container could reach the unauthenticated daemon.
    // Its subnet stays clear of the 172.17-31 and 192.168 pools the inner daemon gives its own networks: an
    // overlap routes the replies to forwarded connections into an inner network, and the port answers with EOF.
    spawnSync('docker', ['network', 'rm', DIND_NETWORK], { stdio: 'ignore' });
    execFileSync('docker', ['network', 'create', '--subnet', '10.98.0.0/24', DIND_NETWORK], { stdio: 'ignore' });
    execFileSync('docker', ['run', '-d', '--name', DIND_NAME, '--network', DIND_NETWORK, '--privileged', '-p', '127.0.0.1:2375:2375', '-e', 'DOCKER_TLS_CERTDIR=', '-v', `${DIND_VOLUME}:/var/lib/docker`, DIND_IMAGE], { stdio: 'ignore' });
  }
  for (let i = 0; i < 60; i++) {
    const v = spawnSync('docker', ['-H', ENDPOINT, 'version', '--format', '{{.Server.Version}}'], { encoding: 'utf8' });
    if (v.status === 0 && v.stdout.trim()) {
      assertSandboxDaemon();
      return v.stdout.trim();
    }
    await sleep(1000);
  }
  throw new Error(`the sandbox daemon on ${ENDPOINT} did not come up`);
}

/**
 * Throw unless the daemon answering on ENDPOINT is the sandbox container: its
 * engine name is the dind container's hostname. Called before anything that
 * removes containers or volumes there.
 */
export function assertSandboxDaemon() {
  const engine = spawnSync('docker', ['-H', ENDPOINT, 'info', '--format', '{{.Name}}'], { encoding: 'utf8' }).stdout.trim();
  const container = spawnSync('docker', ['inspect', '-f', '{{.Config.Hostname}}', DIND_NAME], { encoding: 'utf8' }).stdout.trim();
  if (!engine || !container || engine !== container) {
    throw new Error(`the daemon on ${ENDPOINT} ("${engine}") is not the ${DIND_NAME} container ("${container}"); refusing to touch it`);
  }
}

/** Stop the sandbox daemon and remove its network. `purge` also drops its image cache volume. */
export function stopDaemon({ purge = false } = {}) {
  spawnSync('docker', ['rm', '-f', DIND_NAME], { stdio: 'ignore' });
  spawnSync('docker', ['network', 'rm', DIND_NETWORK], { stdio: 'ignore' });
  if (purge) spawnSync('docker', ['volume', 'rm', DIND_VOLUME], { stdio: 'ignore' });
}

const mtime = (p) => (existsSync(p) ? statSync(p).mtimeMs : 0);

/**
 * Install the CLI the way npm users get it: `npm pack` the package, then a
 * global install into the sandbox prefix. Repacks when the bundle changed.
 * Returns the path of the installed `sidekick-docker` binary.
 */
export function ensureCli(paths) {
  const pkgDir = join(REPO_ROOT, 'sidekick-docker-cli');
  const bundle = join(pkgDir, 'dist', 'sidekick-docker.mjs');
  if (!existsSync(bundle)) throw new Error('build the CLI first: npm run build (repo root)');
  const outDir = join(DEMO_DIR, 'out', 'cli');
  mkdirSync(outDir, { recursive: true });
  const version = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).version;
  const tgz = join(outDir, `sidekick-docker-${version}.tgz`);
  if (mtime(tgz) < Math.max(mtime(bundle), mtime(join(pkgDir, 'README.md')), mtime(join(pkgDir, 'package.json')))) {
    for (const f of readdirSync(outDir)) if (f.endsWith('.tgz')) rmSync(join(outDir, f));
    execFileSync('npm', ['pack', '--pack-destination', outDir], { cwd: pkgDir, stdio: 'ignore' });
  }
  const bin = join(paths.npmPrefix, 'bin', 'sidekick-docker');
  const installed = join(paths.npmPrefix, 'lib', 'node_modules', 'sidekick-docker', 'dist', 'sidekick-docker.mjs');
  if (mtime(installed) < mtime(tgz)) {
    execFileSync('npm', ['install', '--global', '--prefix', paths.npmPrefix, '--no-audit', '--no-fund', tgz], { stdio: 'ignore' });
  }
  if (existsSync(join(paths.npmPrefix, 'lib', 'node_modules', 'node-pty'))) throw new Error('node-pty ended up in the sandbox install; the recording would not match an npm install');
  return bin;
}
