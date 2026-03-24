import React from 'react';
import { spawnSync } from 'child_process';
import type { Command } from 'commander';
import { DockerClient, ComposeClient, EventWatcher, shortId } from 'sidekick-docker-shared';
import { copyToClipboard } from '../utils/clipboard';
import { DockerState } from '../dashboard/DockerState';
import { ContainersPanel } from '../dashboard/panels/ContainersPanel';
import { ServicesPanel } from '../dashboard/panels/ServicesPanel';
import { ImagesPanel } from '../dashboard/panels/ImagesPanel';
import { VolumesPanel } from '../dashboard/panels/VolumesPanel';
import { NetworksPanel } from '../dashboard/panels/NetworksPanel';
import { LogStreamManager } from '../dashboard/LogStreamManager';
import { StatsStreamManager } from '../dashboard/StatsStreamManager';
import { ComposeLogStreamManager } from '../dashboard/ComposeLogStreamManager';
import type { SidePanel } from '../dashboard/panels/types';
import { Dashboard } from '../dashboard/ink/Dashboard';
import type { DashboardViewState } from '../dashboard/ink/Dashboard';
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
    state.refresh().then(() => scheduleRender()).catch(e => console.debug('refresh failed:', e));
  };

  // Error callback — panels report action failures
  const onError = (msg: string) => {
    console.debug('panel action failed:', msg);
  };

  let logFlushTimer: ReturnType<typeof setTimeout> | null = null;
  let composeLogFlushTimer: ReturnType<typeof setTimeout> | null = null;

  // Stream managers for logs and stats
  const logManager = new LogStreamManager(client, () => {
    if (logFlushTimer) return;
    logFlushTimer = setTimeout(() => {
      logFlushTimer = null;
      state.setSelectedLogs(logManager.getLogs());
      logSeverityCounts = logManager.getSeverityCounts();
      scheduleRender();
    }, 100);
  });

  const flushLogsNow = () => {
    if (logFlushTimer) {
      clearTimeout(logFlushTimer);
      logFlushTimer = null;
    }
    state.setSelectedLogs(logManager.getLogs());
    logSeverityCounts = logManager.getSeverityCounts();
    scheduleRender();
  };

  // Mutable severity counts from log stream (UI state, not domain state)
  let logSeverityCounts = logManager.getSeverityCounts();

  const statsManager = new StatsStreamManager(client, state.getStatsCollector(), () => {
    scheduleRender();
  });

  const composeLogManager = new ComposeLogStreamManager(composeClient, () => {
    if (composeLogFlushTimer) return;
    composeLogFlushTimer = setTimeout(() => {
      composeLogFlushTimer = null;
      state.clearComposeLogs();
      for (const entry of composeLogManager.getLogs()) {
        state.appendComposeLog(entry);
      }
      scheduleRender();
    }, 100);
  });

  const flushComposeLogsNow = () => {
    if (composeLogFlushTimer) {
      clearTimeout(composeLogFlushTimer);
      composeLogFlushTimer = null;
    }
    state.clearComposeLogs();
    for (const entry of composeLogManager.getLogs()) {
      state.appendComposeLog(entry);
    }
    scheduleRender();
  };

  const onViewStateChange = (viewState: DashboardViewState) => {
    const { panelId, itemId, detailTabIndex, sortField } = viewState;
    const wantsLiveStats = sortField === 'cpu'
      || sortField === 'mem'
      || sortField === 'net'
      || sortField === 'io'
      || sortField === 'pids';

    if (panelId === 'containers') {
      void logManager.select(detailTabIndex === 0 ? itemId : null);
      void statsManager.select(itemId && (detailTabIndex === 1 || wantsLiveStats) ? itemId : null);
      void composeLogManager.selectCompose(null, null);
      flushLogsNow();
      flushComposeLogsNow();
      // Fetch env vars if not cached
      if (itemId && !state.getInspectedEnv(itemId)) {
        client.getContainerEnv(itemId).then(env => {
          state.setInspectedEnv(itemId, env);
          scheduleRender();
        }).catch(e => console.debug('getContainerEnv failed:', e));
      }
      // Fetch filesystem changes if not cached
      if (itemId && !state.getContainerChanges(itemId)) {
        client.getContainerChanges(itemId).then(changes => {
          state.setContainerChanges(itemId, changes);
          scheduleRender();
        }).catch(e => console.debug('getContainerChanges failed:', e));
      }
    } else if (panelId === 'services' && itemId) {
      void logManager.select(null);
      void statsManager.select(null);
      if (detailTabIndex === 1) {
        const parts = itemId.split(':');
        if (parts[0] === 'project') {
          void composeLogManager.selectCompose(parts.slice(1).join(':'), null);
        } else if (parts[0] === 'service') {
          void composeLogManager.selectCompose(parts[1], parts.slice(2).join(':'));
        }
      } else {
        void composeLogManager.selectCompose(null, null);
      }
      flushLogsNow();
      flushComposeLogsNow();
    } else if (panelId === 'images') {
      void logManager.select(null);
      void statsManager.select(null);
      void composeLogManager.selectCompose(null, null);
      flushLogsNow();
      flushComposeLogsNow();
      // Fetch image layers if not cached
      if (itemId && !state.getImageLayers(itemId)) {
        client.getImageHistory(itemId).then(layers => {
          state.setImageLayers(itemId, layers);
          scheduleRender();
        }).catch(e => console.debug('getImageHistory failed:', e));
      }
    } else {
      void logManager.select(null);
      void statsManager.select(null);
      void composeLogManager.selectCompose(null, null);
      flushLogsNow();
      flushComposeLogsNow();
    }
  };

  // Create panels (onExec wired below after render is available)
  const panels: SidePanel[] = [
    new ContainersPanel(client, onAction, onError),
    new ServicesPanel(composeClient, onAction, cwd, onError),
    new ImagesPanel(client, onAction, onError),
    new VolumesPanel(client, onAction, onError),
    new NetworksPanel(client, onAction, onError),
  ];

  // Start event watcher for real-time updates
  const watcher = new EventWatcher(client, {
    onEvent: (event) => {
      state.processEvent(event);
      scheduleRender();
    },
    onError: (err) => {
      console.debug('event watcher error:', err.message);
    },
  });
  watcher.start();

  // Periodic refresh fallback (30s)
  const refreshInterval = setInterval(() => {
    state.refresh().then(() => scheduleRender()).catch(e => console.debug('periodic refresh failed:', e));
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
        metrics: getEnrichedMetrics(),
        onViewStateChange,
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
      metrics: getEnrichedMetrics(),
      onViewStateChange,
      execTriggerRef,
      onExecFallback,
    }),
  );

  // Wire exec handler: ContainersPanel calls through the trigger ref
  const containersPanel = panels[0] as ContainersPanel;
  containersPanel.setOnExec((containerId: string) => {
    // Find container name for the overlay header
    const container = state.getMetrics().containers.find(c => c.id === containerId);
    const name = container?.name ?? shortId(containerId);

    if (execTriggerRef.current) {
      execTriggerRef.current(containerId, name);
    } else {
      // Ref not populated yet — direct fallback
      onExecFallback(containerId);
    }
  });

  // Wire copy logs handler
  containersPanel.setOnCopyLogs((text: string) => {
    copyToClipboard(text);
  });
  const servicesPanel = panels[1] as ServicesPanel;
  servicesPanel.setOnCopyLogs((text: string) => {
    copyToClipboard(text);
  });

  // Re-render bridge: throttled
  let renderTimer: ReturnType<typeof setTimeout> | null = null;
  function getEnrichedMetrics() {
    const m = state.getMetrics();
    m.logSeverityCounts = logSeverityCounts;
    m.logSeverityTimeSeries = logManager.getSeverityTimeSeries();
    m.logTemplates = logManager.getTemplates();
    return m;
  }
  function scheduleRender() {
    if (renderTimer) return;
    renderTimer = setTimeout(() => {
      renderTimer = null;
      instance.rerender(
        React.createElement(Dashboard, {
          panels,
          metrics: getEnrichedMetrics(),
          onViewStateChange,
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
    try { composeLogManager.dispose(); } catch { /* ignore */ }
    try { if (logFlushTimer) clearTimeout(logFlushTimer); } catch { /* ignore */ }
    try { if (composeLogFlushTimer) clearTimeout(composeLogFlushTimer); } catch { /* ignore */ }
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
