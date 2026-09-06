// Artifact smoke test: npm tarball and production VSIX, outside node_modules.
// Requires Node >=22.12, tar, unzip, and npm (vsce is fetched as in release CI).
import { createRequire } from 'node:module';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const requireShared = createRequire(join(root, 'sidekick-docker-shared/package.json'));
const { Server } = requireShared('ssh2');
const run = promisify(execFile);
const temp = await mkdtemp(join(tmpdir(), 'sidekick-package-test-'));
const clients = new Set();
const paths = [];
let server;
async function command(file, args, options = {}) {
  const result = await run(file, args, { cwd: root, maxBuffer: 8 * 1024 * 1024, timeout: 120000, ...options });
  return result.stdout;
}
try {
  console.log('Packing CLI and production VSIX…');
  const packed = JSON.parse(await command('npm', ['pack', '--json', '--pack-destination', temp], { cwd: join(root, 'sidekick-docker-cli') }));
  await command('tar', ['-xzf', join(temp, packed[0].filename), '-C', temp]);
  const vsix = join(temp, 'sidekick.vsix');
  await command('npx', ['--yes', '@vscode/vsce', 'package', '--no-dependencies', '-o', vsix], { cwd: join(root, 'sidekick-docker-vscode') });
  const extensionDir = join(temp, 'vsix');
  await mkdir(extensionDir);
  await command('unzip', ['-q', vsix, '-d', extensionDir]);

  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  server = new Server({ hostKeys: [privateKey.export({ type: 'pkcs1', format: 'pem' })] }, client => {
    clients.add(client);
    client.on('error', () => {});
    client.on('close', () => clients.delete(client));
    // Local, ephemeral fixture; no real credentials or SSH agent are used.
    client.on('authentication', context => context.method === 'none' ? context.accept() : context.reject());
    client.on('ready', () => client.on('session', accept => accept().on('exec', (acceptExec, reject, info) => {
      if (info.command !== 'docker system dial-stdio') { reject(); return; }
      const stream = acceptExec();
      stream.on('error', () => {});
      let request = '';
      stream.on('data', chunk => {
        request += chunk.toString();
        if (!request.includes('\r\n\r\n')) return;
        const url = request.split(' ')[1];
        paths.push(url);
        if (url.includes('/events')) {
          stream.write('HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n');
          return;
        }
        const body = url.includes('_ping') ? 'OK' : JSON.stringify([{
          Id: 'fixture123', Names: ['/ssh-fixture'], Image: 'fixture:latest', State: 'running', Status: 'Up', Ports: [], Created: 1700000000, Labels: {},
        }]);
        stream.end(`HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);
      });
    })));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const env = { ...process.env, DOCKER_HOST: `ssh://fixture@127.0.0.1:${server.address().port}`, NO_COLOR: '1' };
  delete env.SSH_AUTH_SOCK;
  delete env.DOCKER_TLS_VERIFY;
  delete env.DOCKER_CERT_PATH;
  delete env.DOCKER_PATH_PREFIX;
  delete env.NODE_PATH;
  const cli = await command(process.execPath, [join(temp, 'package/dist/sidekick-docker.mjs'), 'ps', '--format', 'json'], { cwd: temp, env, timeout: 20000 });
  assert.equal(JSON.parse(cli)[0].name, 'ssh-fixture');
  console.log('Packaged CLI loaded containers over SSH');
  const before = paths.length;
  console.log((await command(process.execPath, [join(root, 'scripts/fixtures/extension-smoke.cjs'), join(extensionDir, 'extension/out/extension.js')], { cwd: temp, env, timeout: 20000 })).trim());
  assert(paths.slice(before).some(p => p.includes('_ping')));
  assert(paths.slice(before).some(p => p.includes('/containers/json')));
} catch (error) {
  console.error('SSH requests observed:', paths);
  throw error;
} finally {
  for (const client of clients) client.end();
  if (server) await new Promise(resolve => server.close(resolve));
  await rm(temp, { recursive: true, force: true });
}
