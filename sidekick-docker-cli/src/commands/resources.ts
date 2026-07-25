import { formatBytes, shortId } from 'sidekick-docker-shared';
import { ansi } from '../formatters';
import { connectOrExit } from '../utils/connect';
import { renderTable, type TableColumn } from '../utils/textTable';

interface GlobalOpts {
  socket?: string;
}

interface FormatOpts {
  format?: string;
  quiet?: boolean;
}

/** Terminal width for table layout; null when piped, so columns take natural widths. */
function outputWidth(): number | null {
  return process.stdout.isTTY && process.stdout.columns ? process.stdout.columns : null;
}

/**
 * Shared shape for the read-only listing commands: `--quiet` wins over
 * `--format json`, both suppress headers and prose, and an empty result prints
 * a single human line (never a bare table header).
 *
 * Mirrors `ps` so every listing behaves the same way in a pipeline.
 */
function emit<T>(
  items: T[],
  opts: FormatOpts,
  cfg: {
    id: (item: T) => string;
    empty: string;
    columns: TableColumn[];
    row: (item: T) => string[];
  },
): void {
  if (opts.quiet) {
    for (const item of items) console.log(cfg.id(item));
    return;
  }
  if (opts.format === 'json') {
    console.log(JSON.stringify(items, null, 2));
    return;
  }
  if (items.length === 0) {
    console.log(cfg.empty);
    return;
  }
  for (const line of renderTable(cfg.columns, items.map(cfg.row), outputWidth())) {
    console.log(line);
  }
}

export async function imagesAction(opts: FormatOpts & { all?: boolean }, globalOpts: GlobalOpts): Promise<void> {
  const client = await connectOrExit(globalOpts);
  const images = await client.listImages(opts.all ?? false);
  emit(images, opts, {
    id: (i) => i.id,
    empty: 'No images found.',
    columns: [
      { header: 'IMAGE ID', min: 12, max: 12 },
      { header: 'REPOSITORY:TAG', flex: true, min: 16 },
      { header: 'SIZE', max: 10 },
      { header: 'CREATED', max: 20 },
    ],
    row: (i) => [
      i.id,
      i.repoTags[0] ?? '<none>:<none>',
      formatBytes(i.size),
      i.created.toLocaleDateString(),
    ],
  });
}

export async function volumesAction(opts: FormatOpts, globalOpts: GlobalOpts): Promise<void> {
  const client = await connectOrExit(globalOpts);
  const volumes = await client.listVolumes();
  emit(volumes, opts, {
    id: (v) => v.name,
    empty: 'No volumes found.',
    columns: [
      { header: 'NAME', flex: true, min: 16 },
      { header: 'DRIVER', max: 12 },
      { header: 'IN USE', max: 24 },
      { header: 'MOUNTPOINT', flex: true, min: 16 },
    ],
    row: (v) => [
      v.name,
      v.driver,
      v.usedBy.length > 0 ? v.usedBy.join(', ') : '-',
      v.mountpoint,
    ],
  });
}

export async function networksAction(opts: FormatOpts, globalOpts: GlobalOpts): Promise<void> {
  const client = await connectOrExit(globalOpts);
  const networks = await client.listNetworks();
  emit(networks, opts, {
    id: (n) => n.id,
    empty: 'No networks found.',
    columns: [
      { header: 'NETWORK ID', min: 12, max: 12 },
      { header: 'NAME', flex: true, min: 12 },
      { header: 'DRIVER', max: 10 },
      { header: 'SCOPE', max: 8 },
      { header: 'SUBNET', flex: true, min: 12 },
      { header: 'CONTAINERS', max: 10 },
    ],
    row: (n) => [
      n.id,
      n.name,
      n.driver,
      n.scope,
      n.ipam.map(p => p.subnet).filter(Boolean).join(', ') || '-',
      String(n.containers.length),
    ],
  });
}

/**
 * One-shot resource usage for every running container, like
 * `docker stats --no-stream`. Streaming is deliberately not offered: a
 * scriptable command should terminate.
 */
export async function statsAction(opts: FormatOpts, globalOpts: GlobalOpts): Promise<void> {
  const client = await connectOrExit(globalOpts);
  const running = (await client.listContainers(true)).filter(c => c.state === 'running');

  let failed = 0;
  const samples = await Promise.all(running.map(async (c) => {
    try {
      return { container: c, stats: await client.sampleStats(c.id) };
    } catch {
      // Container stopped between listing and sampling.
      failed++;
      return null;
    }
  }));
  const rows = samples.filter((s): s is NonNullable<typeof s> => s !== null);

  // Dropping every sample silently and then printing "No running containers."
  // reports a healthy empty host, at exit 0, when the truth is that sampling
  // failed. A scriptable command must not lie about that.
  if (failed > 0) {
    console.error(`Warning: ${failed} of ${running.length} container(s) could not be sampled.`);
  }
  if (running.length > 0 && rows.length === 0) {
    console.error('Error: no container could be sampled.');
    process.exitCode = 1;
    return;
  }

  emit(rows, opts, {
    id: (r) => shortId(r.container.id),
    empty: 'No running containers.',
    columns: [
      { header: 'CONTAINER ID', min: 12, max: 12 },
      { header: 'NAME', flex: true, min: 12 },
      { header: 'CPU %', max: 8 },
      { header: 'MEM', max: 20 },
      { header: 'MEM %', max: 8 },
      { header: 'NET I/O', max: 20 },
      { header: 'PIDS', max: 6 },
    ],
    row: (r) => [
      shortId(r.container.id),
      r.container.name,
      `${r.stats.cpuPercent.toFixed(2)}%`,
      `${formatBytes(r.stats.memoryUsage)} / ${formatBytes(r.stats.memoryLimit)}`,
      `${r.stats.memoryPercent.toFixed(2)}%`,
      `${formatBytes(r.stats.networkRx)} / ${formatBytes(r.stats.networkTx)}`,
      String(r.stats.pids),
    ],
  });
}

/** Aggregate disk usage — `docker system df`. */
export async function dfAction(opts: FormatOpts, globalOpts: GlobalOpts): Promise<void> {
  const client = await connectOrExit(globalOpts);
  const usage = await client.diskUsage();

  if (opts.format === 'json') {
    console.log(JSON.stringify(usage, null, 2));
    return;
  }

  const columns: TableColumn[] = [
    { header: 'TYPE', min: 12 },
    { header: 'SIZE', max: 12 },
    { header: 'RECLAIMABLE', max: 12 },
  ];
  const rows = [
    ['Images', formatBytes(usage.imagesSize), '-'],
    ['Containers', formatBytes(usage.containersSize), '-'],
    ['Local Volumes', formatBytes(usage.volumesSize), '-'],
    ['Build Cache', formatBytes(usage.buildCacheSize), formatBytes(usage.buildCacheReclaimable)],
  ];
  for (const line of renderTable(columns, rows, outputWidth())) {
    console.log(line);
  }
  console.log(ansi.bold(`\nTotal: ${formatBytes(usage.totalSize)}`));
}

/**
 * Raw `docker inspect` output for a container, as JSON.
 *
 * inspectContainer has been on DockerClient the whole time with no consumer;
 * the detail tabs surface a curated subset, and there was no way to reach
 * mounts, restart policy, resource limits or health history at all.
 */
export async function inspectAction(
  nameOrId: string,
  _opts: FormatOpts,
  globalOpts: GlobalOpts,
): Promise<void> {
  // An empty argument would make the id-prefix fallback below match every
  // container ('' is a prefix of everything), silently inspecting an arbitrary
  // one and exiting 0.
  const query = nameOrId.trim();
  if (!query) {
    console.error('Error: no such container: (empty)');
    process.exitCode = 1;
    return;
  }

  const client = await connectOrExit(globalOpts);

  // Accept a name as well as an id, matching `docker inspect`.
  const containers = await client.listContainers(true);
  let match = containers.find(c => c.id === query)
    ?? containers.find(c => c.name === query);

  if (!match) {
    // Prefix fallback. Docker refuses an ambiguous prefix rather than picking
    // one, and so must a command whose output gets piped into other tools.
    const prefixed = containers.filter(c => c.id.startsWith(query));
    if (prefixed.length > 1) {
      console.error(
        `Error: multiple containers match "${query}": ${prefixed.map(c => shortId(c.id)).join(', ')}`,
      );
      process.exitCode = 1;
      return;
    }
    match = prefixed[0];
  }

  if (!match) {
    console.error(`Error: no such container: ${query}`);
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify(await client.inspectContainer(match.id), null, 2));
}
