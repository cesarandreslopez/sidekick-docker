import { Command, Option } from 'commander';
import { errorMessage } from 'sidekick-docker-shared';
import { dashboardAction } from './commands/dashboard';
import { psAction } from './commands/ps';
import { logsAction } from './commands/logs';
import { imagesAction, volumesAction, networksAction, statsAction, dfAction, inspectAction } from './commands/resources';
import { setColorEnabled } from './formatters';
import { parseTail } from './utils/parseTail';

declare const __CLI_VERSION__: string;

// `ps --format json | head -1` closes the pipe early; exit quietly instead of stack-tracing.
process.stdout.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE') process.exit(0);
});

const program = new Command();

program
  .name('sidekick-docker')
  .description('Interactive Docker dashboard (TUI), plus scriptable ps and logs commands')
  .version(__CLI_VERSION__)
  .option('--socket <endpoint>', 'Docker endpoint: socket path, unix:// or tcp://host[:port] URL')
  .option('--no-color', 'Disable colored output')
  .option('--verbose', 'Show full error details')
  .action(async (_opts, cmd) => {
    await dashboardAction(_opts, cmd);
  });

program.hook('preAction', (thisCommand) => {
  if (thisCommand.opts().color === false) setColorEnabled(false);
});

program
  .command('ps')
  .description('List containers')
  .option('-a, --all', 'Show all containers (default: running only)', false)
  .addOption(new Option('--format <format>', 'Output format').choices(['table', 'json']).default('table'))
  .option('-q, --quiet', 'Only print container IDs', false)
  .action(async (opts, cmd) => {
    await psAction(opts, cmd.optsWithGlobals());
  });

program
  .command('logs <container>')
  .description('Stream container logs')
  .option('-f, --follow', 'Follow log output (default when attached to a terminal)')
  .option('--no-follow', 'Print logs and exit')
  .option('-n, --tail <lines>', 'Number of lines to show from the end', parseTail, 100)
  .action(async (container, opts, cmd) => {
    const followSource = cmd.getOptionValueSource('follow');
    const follow = followSource === undefined || followSource === 'default'
      ? process.stdout.isTTY === true
      : opts.follow === true;
    await logsAction(container, { follow, tail: opts.tail }, cmd.optsWithGlobals());
  });

// ── Read-only listing commands ──────────────────────────────────────
// All follow the `ps` contract: --format table|json, -q for bare ids.
const listFormat = (cmd: Command): Command => cmd
  .addOption(new Option('--format <format>', 'Output format').choices(['table', 'json']).default('table'))
  .option('-q, --quiet', 'Only print IDs/names', false);

listFormat(program.command('images').description('List images'))
  .option('-a, --all', 'Include intermediate layers', false)
  .action(async (opts, cmd) => {
    await imagesAction(opts, cmd.optsWithGlobals());
  });

listFormat(program.command('volumes').description('List volumes'))
  .action(async (opts, cmd) => {
    await volumesAction(opts, cmd.optsWithGlobals());
  });

listFormat(program.command('networks').description('List networks'))
  .action(async (opts, cmd) => {
    await networksAction(opts, cmd.optsWithGlobals());
  });

listFormat(program.command('stats').description('One-shot resource usage for running containers'))
  .action(async (opts, cmd) => {
    await statsAction(opts, cmd.optsWithGlobals());
  });

program
  .command('df')
  .description('Show Docker disk usage')
  .addOption(new Option('--format <format>', 'Output format').choices(['table', 'json']).default('table'))
  .action(async (opts, cmd) => {
    await dfAction(opts, cmd.optsWithGlobals());
  });

program
  .command('inspect <container>')
  .description('Print raw inspect output for a container as JSON')
  .action(async (container, opts, cmd) => {
    await inspectAction(container, opts, cmd.optsWithGlobals());
  });

program.addHelpText('after', `
Examples:
  $ sidekick-docker                          launch the interactive dashboard
  $ sidekick-docker ps -a                    list all containers
  $ sidekick-docker ps --format json | jq    machine-readable output
  $ sidekick-docker ps -q                    container IDs only
  $ sidekick-docker logs web --no-follow -n 50
  $ sidekick-docker images -q | xargs docker rmi
  $ sidekick-docker stats --format json         one-shot CPU/memory for all
  $ sidekick-docker df                          what is using the disk
  $ sidekick-docker inspect web | jq .State
  $ sidekick-docker --socket /run/user/1000/docker.sock ps

Environment:
  DOCKER_HOST    Docker endpoint used when --socket is not given (unix://, tcp://, ssh://)
  NO_COLOR       disable colored output    FORCE_COLOR   force colored output
`);

program.parseAsync().catch((err) => {
  console.error(`Error: ${errorMessage(err)}`);
  if (program.opts().verbose || process.env.DEBUG) console.error(err);
  process.exit(1);
});
