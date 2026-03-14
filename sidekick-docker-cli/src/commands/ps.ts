import { DockerClient, shortId } from 'sidekick-docker-shared';
import { formatPorts, stateIcon, formatUptime } from '../formatters';

export async function psAction(opts: { all?: boolean }): Promise<void> {
  const client = new DockerClient();

  const ok = await client.ping();
  if (!ok) {
    console.error('Error: Cannot connect to Docker daemon. Is Docker running?');
    process.exit(1);
  }

  const containers = await client.listContainers(opts.all ?? false);

  if (containers.length === 0) {
    console.log(opts.all ? 'No containers found.' : 'No running containers. Use --all to show all.');
    return;
  }

  // Simple table output
  const header = ['CONTAINER ID', 'NAME', 'IMAGE', 'STATUS', 'PORTS'].map(h => h.padEnd(20)).join('');
  console.log(header);
  console.log('-'.repeat(100));

  for (const c of containers) {
    const row = [
      shortId(c.id).padEnd(20),
      `${stateIcon(c.state)} ${c.name}`.padEnd(20),
      c.image.padEnd(20),
      formatUptime(c.status).padEnd(20),
      formatPorts(c.ports),
    ].join('');
    console.log(row);
  }
}
