import type { ContainerInfo } from 'sidekick-docker-shared';
import { shortId, stateColor } from 'sidekick-docker-shared';
import { formatPorts, ansi } from '../formatters';
import { connectOrExit } from '../utils/connect';
import { renderTable, type TableColumn } from '../utils/textTable';

const STATE_ANSI: Record<string, (s: string) => string> = {
  green: ansi.green,
  yellow: ansi.yellow,
  cyan: ansi.cyan,
  red: ansi.red,
  gray: ansi.gray,
};

function stateAnsi(state: ContainerInfo['state']): (s: string) => string {
  return STATE_ANSI[stateColor(state)] ?? ((s: string) => s);
}

export async function psAction(
  opts: { all?: boolean; format?: string; quiet?: boolean },
  globalOpts: { socket?: string },
): Promise<void> {
  const client = await connectOrExit(globalOpts);

  const containers = await client.listContainers(opts.all ?? false);

  // --quiet wins over --format json; both suppress headers and prose.
  if (opts.quiet) {
    for (const c of containers) console.log(shortId(c.id));
    return;
  }

  if (opts.format === 'json') {
    console.log(JSON.stringify(containers, null, 2));
    return;
  }

  if (containers.length === 0) {
    console.log(opts.all ? 'No containers found.' : 'No running containers. Use --all to show all.');
    return;
  }

  const columns: TableColumn[] = [
    { header: 'CONTAINER ID', min: 12, max: 12 },
    { header: 'NAME', flex: true, min: 12 },
    { header: 'IMAGE', flex: true, min: 12 },
    // Colorized after padding so escape codes never affect layout.
    { header: 'STATUS', max: 22, decorate: (cell, row) => stateAnsi(containers[row].state)(cell) },
    { header: 'PORTS', flex: true, min: 10 },
  ];

  const rows = containers.map(c => [shortId(c.id), c.name, c.image, c.status, formatPorts(c.ports)]);
  const width = process.stdout.isTTY && process.stdout.columns ? process.stdout.columns : null;

  for (const line of renderTable(columns, rows, width)) {
    console.log(line);
  }
}
