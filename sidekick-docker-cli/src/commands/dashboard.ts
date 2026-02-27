import React from 'react';
import { spawnSync } from 'child_process';
import type { Command } from 'commander';
import { DockerClient, ComposeClient, EventWatcher } from 'sidekick-docker-shared';
import { DockerState } from '../dashboard/DockerState';
import { ContainersPanel } from '../dashboard/panels/ContainersPanel';
import { ServicesPanel } from '../dashboard/panels/ServicesPanel';
import { ImagesPanel } from '../dashboard/panels/ImagesPanel';
import { VolumesPanel } from '../dashboard/panels/VolumesPanel';
import { NetworksPanel } from '../dashboard/panels/NetworksPanel';
import { LogStreamManager } from '../dashboard/LogStreamManager';
import { StatsStreamManager } from '../dashboard/StatsStreamManager';
import type { SidePanel } from '../dashboard/panels/types';
import { Dashboard } from '../dashboard/ink/Dashboard';
import { enableMouse, disableMouse } from '../dashboard/ink/mouse';

export async function dashboardAction(_opts: Record<string, unknown>, cmd: Command): Promise<void> {
  const globalOpts = cmd.parent?.opts() ?? cmd.opts();
  const socketPath = globalOpts.socket as string | undefined;

  // Create Docker client
  const client = new DockerClient(socketPath ? { socketPath } : undefined);

  // Test connection
  const ok = await client.ping();
  if (!ok) {
    console.error('Error: Cannot connect to Docker daemon. Is Docker running?');
    process.exit(1);
  }

  // Create state and do initial refresh
  const cwd = process.cwd();
  const state = new DockerState(client, cwd);
  await state.refresh();

  // Create compose client
  const composeClient = new ComposeClient();

  // Action callback — refresh state after any mutation
  const onAction = () => {
    state.refresh().then(() => scheduleRender()).catch(() => {});
  };

  // Stream managers for logs and stats
  const logManager = new LogStreamManager(client, () => {
    state.setSelectedLogs(logManager.getLogs());
    scheduleRender();
  });

  const statsManager = new StatsStreamManager(client, state.getStatsCollector(), () => {
    scheduleRender();
  });

  // Selection-driven streaming: start/stop streams when selection changes
  const onSelectionChange = (panelId: string, itemId: string | null) => {
    if (panelId === 'containers') {
      logManager.select(itemId);
      statsManager.select(itemId);
      // Fetch env vars if not cached
      if (itemId && !state.getInspectedEnv(itemId)) {
        client.inspectContainer(itemId).then(info => {
          state.setInspectedEnv(itemId, info.Config.Env || []);
          scheduleRender();
        }).catch(() => {});
      }
    } else {
      logManager.select(null);
      statsManager.select(null);
    }
  };

  // Create panels (onExec wired below after render is available)
  const panels: SidePanel[] = [
    new ContainersPanel(client, onAction),
    new ServicesPanel(composeClient, onAction, cwd),
    new ImagesPanel(client, onAction),
    new VolumesPanel(client, onAction),
    new NetworksPanel(client, onAction),
  ];

  // Start event watcher for real-time updates
  const watcher = new EventWatcher(client, {
    onEvent: (event) => {
      state.processEvent(event);
      scheduleRender();
    },
    onError: () => {
      // Non-fatal — will auto-reconnect
    },
  });
  watcher.start();

  // Periodic refresh fallback (30s)
  const refreshInterval = setInterval(() => {
    state.refresh().then(() => scheduleRender()).catch(() => {});
  }, 30_000);

  // Exec trigger ref: Dashboard populates this with a function to start exec overlay
  const execTriggerRef: React.RefObject<((containerId: string, containerName: string) => void) | null> = { current: null };

  // Fallback: tear down Ink and use spawnSync when node-pty is unavailable
  const onExecFallback = (containerId: string) => {
    instance.clear();
    instance.unmount();
    disableMouse();

    spawnSync('docker', ['exec', '-it', containerId, '/bin/sh'], {
      stdio: 'inherit',
    });

    // Re-create the Ink instance after the shell exits
    instance = render(
      React.createElement(Dashboard, {
        panels,
        metrics: state.getMetrics(),
        onSelectionChange,
        execTriggerRef,
        onExecFallback,
      }),
    );
    enableMouse();
  };

  // Render with Ink
  const { render } = await import('ink');

  let instance = render(
    React.createElement(Dashboard, {
      panels,
      metrics: state.getMetrics(),
      onSelectionChange,
      execTriggerRef,
      onExecFallback,
    }),
  );

  // Wire exec handler: ContainersPanel calls through the trigger ref
  const containersPanel = panels[0] as ContainersPanel;
  containersPanel.setOnExec((containerId: string) => {
    // Find container name for the overlay header
    const container = state.getMetrics().containers.find(c => c.id === containerId);
    const name = container?.name ?? containerId.substring(0, 12);

    if (execTriggerRef.current) {
      execTriggerRef.current(containerId, name);
    } else {
      // Ref not populated yet — direct fallback
      onExecFallback(containerId);
    }
  });

  // Re-render bridge: throttled
  let renderTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleRender() {
    if (renderTimer) return;
    renderTimer = setTimeout(() => {
      renderTimer = null;
      instance.rerender(
        React.createElement(Dashboard, {
          panels,
          metrics: state.getMetrics(),
          onSelectionChange,
          execTriggerRef,
          onExecFallback,
        }),
      );
    }, 100);
  }

  // Cleanup
  let stopped = false;
  function cleanup() {
    if (stopped) return;
    stopped = true;
    try { logManager.dispose(); } catch { /* ignore */ }
    try { statsManager.dispose(); } catch { /* ignore */ }
    try { clearInterval(refreshInterval); } catch { /* ignore */ }
    try { watcher.stop(); } catch { /* ignore */ }
    try { client.dispose(); } catch { /* ignore */ }
    for (const panel of panels) {
      panel.dispose?.();
    }
  }

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Wait for exit
  await instance.waitUntilExit();
  cleanup();
  process.exit(0);
}
