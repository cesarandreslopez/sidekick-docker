import { errorMessage, formatTimestampTime } from 'sidekick-docker-shared';
import { ansi } from '../formatters';
import { connectOrExit } from '../utils/connect';

export async function logsAction(
  container: string,
  opts: { follow: boolean; tail: number },
  globalOpts: { socket?: string },
): Promise<void> {
  const client = await connectOrExit(globalOpts);

  // Stderr so piped stdout stays clean; doubles as the "connecting" cue.
  if (opts.follow && process.stderr.isTTY) {
    console.error(ansi.dim(`Streaming logs for "${container}" — press Ctrl+C to stop`));
  }

  try {
    for await (const entry of client.streamLogs(container, {
      follow: opts.follow,
      tail: opts.tail,
    })) {
      const ts = entry.timestamp ? formatTimestampTime(entry.timestamp) : '';
      const line = `${ts} ${entry.message}`;
      console.log(entry.stream === 'stderr' ? ansi.red(line) : line);
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
