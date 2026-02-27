import { Command } from 'commander';
import { dashboardAction } from './commands/dashboard';
import { psAction } from './commands/ps';
import { logsAction } from './commands/logs';

declare const __CLI_VERSION__: string;

const program = new Command();

program
  .name('sidekick-docker')
  .description('Docker management TUI dashboard')
  .version(__CLI_VERSION__)
  .option('--socket <path>', 'Docker socket path')
  .action(async (_opts, cmd) => {
    await dashboardAction(_opts, cmd);
  });

program
  .command('ps')
  .description('List containers')
  .option('-a, --all', 'Show all containers (default: running only)', false)
  .action(async (opts) => {
    await psAction(opts);
  });

program
  .command('logs <container>')
  .description('Stream container logs')
  .option('-f, --follow', 'Follow log output', true)
  .option('-n, --tail <lines>', 'Number of lines to show from the end', '100')
  .action(async (container, opts) => {
    await logsAction(container, opts);
  });

program.parseAsync().catch((err) => {
  console.error(err);
  process.exit(1);
});
