import { DockerClient, errorMessage } from 'sidekick-docker-shared';

export async function logsAction(container: string, opts: { follow?: boolean; tail?: string }): Promise<void> {
  const client = new DockerClient();

  const ok = await client.ping();
  if (!ok) {
    console.error('Error: Cannot connect to Docker daemon. Is Docker running?');
    process.exit(1);
  }

  try {
    for await (const entry of client.streamLogs(container, {
      follow: opts.follow ?? true,
      tail: parseInt(opts.tail || '100', 10),
    })) {
      const ts = entry.timestamp ? entry.timestamp.toISOString().substring(11, 23) : '';
      const prefix = entry.stream === 'stderr' ? '\x1b[31m' : '';
      const reset = entry.stream === 'stderr' ? '\x1b[0m' : '';
      console.log(`${prefix}${ts} ${entry.message}${reset}`);
    }
  } catch (err) {
    const msg = errorMessage(err);
    if (msg.includes('no such container') || msg.includes('No such container')) {
      console.error(`Error: Container "${container}" not found.`);
    } else {
      console.error(`Error: ${msg}`);
    }
    process.exit(1);
  }
}
