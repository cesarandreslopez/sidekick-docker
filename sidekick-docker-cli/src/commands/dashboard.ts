import React from 'react';
import { execFallback } from '../dashboard/execFallback.js';
import type { Command } from 'commander';
import { ComposeClient, EventWatcher, StatsSampler, dockerCliEnv, shortId, errorMessage } from 'sidekick-docker-shared';
import { debugLog } from '../utils/debug';
import { connectOrExit } from '../utils/connect';
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

export async function dashboardAction(_opts: Record<string, unknown>, cmd: Command): Promise<void> {
  const globalOpts = cmd.optsWithGlobals();

  // Create Docker client and verify the daemon is reachable
  const socket = globalOpts.socket as string | undefined;
  const client = await connectOrExit({ socket });

  // Create state and do initial refresh
  const cwd = process.cwd();
  let stateChanged = () => {};
  const state = new DockerState(client, cwd, () => stateChanged());
  await state.refresh();

  // Subprocesses cannot see the endpoint dockerode was configured with, so
  // every spawned `docker` (compose, exec) needs these overrides or --socket
  // is silently ignored and they talk to the default daemon instead.
  const cliEnv = socket ? dockerCliEnv(socket) : undefined;
  const composeClient = new ComposeClient(cliEnv);

  // Action callback — refresh state after any mutation
  const onAction = () => {
    state.refresh().then(() => scheduleRender()).catch((e: unknown) => { debugLog('refresh failed:', e); });
  };

  let logFlushTimer: ReturnType<typeof setTimeout> | null = null;
  let composeLogFlushTimer: ReturnType<typeof setTimeout> | null = null;
  let secondaryLogFlushTimer: ReturnType<typeof setTimeout> | null = null;
  let secondaryComposeLogFlushTimer: ReturnType<typeof setTimeout> | null = null;

  // Re-render bridge: throttled (must be declared before stream managers that call scheduleRender)
  let renderTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleRender() {
    if (renderTimer) return;
    renderTimer = setTimeout(() => {
      renderTimer = null;
      // Skip render if stdout can't keep up — next tick will catch up with latest state
      if (process.stdout.writableLength > process.stdout.writableHighWaterMark) return;
      instance.rerender(
        React.createElement(Dashboard, {
          panels,
          metrics: getEnrichedMetrics(),
          onViewStateChange,
          execTriggerRef,
          onExecFallback,
          dockerEnv: cliEnv,
        }),
      );
    }, 200);
  }

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

  // Secondary stream managers for compare mode
  const secondaryLogManager = new LogStreamManager(client, () => {
    if (secondaryLogFlushTimer) return;
    secondaryLogFlushTimer = setTimeout(() => {
      secondaryLogFlushTimer = null;
      state.setSecondaryLogs(secondaryLogManager.getLogs());
      secondaryLogSeverityCounts = secondaryLogManager.getSeverityCounts();
      scheduleRender();
    }, 100);
  });

  const flushSecondaryLogsNow = () => {
    if (secondaryLogFlushTimer) {
      clearTimeout(secondaryLogFlushTimer);
      secondaryLogFlushTimer = null;
    }
    state.setSecondaryLogs(secondaryLogManager.getLogs());
    secondaryLogSeverityCounts = secondaryLogManager.getSeverityCounts();
    scheduleRender();
  };

  let secondaryLogSeverityCounts = secondaryLogManager.getSeverityCounts();

  const statsManager = new StatsStreamManager(client, state.getStatsCollector(), () => {
    scheduleRender();
  });

  // Fills in stats for every row when the list itself needs them (sorting by a
  // stats field). statsManager alone only ever covers the selected container.
  const statsSampler = new StatsSampler({
    sample: (id) => client.sampleStats(id),
    push: (id, stats) => { state.getStatsCollector().push(id, stats); },
    onChange: () => { scheduleRender(); },
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

  const secondaryComposeLogManager = new ComposeLogStreamManager(composeClient, () => {
    if (secondaryComposeLogFlushTimer) return;
    secondaryComposeLogFlushTimer = setTimeout(() => {
      secondaryComposeLogFlushTimer = null;
      state.setSecondaryComposeLogs(secondaryComposeLogManager.getLogs());
      scheduleRender();
    }, 100);
  });

  const flushSecondaryComposeLogsNow = () => {
    if (secondaryComposeLogFlushTimer) {
      clearTimeout(secondaryComposeLogFlushTimer);
      secondaryComposeLogFlushTimer = null;
    }
    state.setSecondaryComposeLogs(secondaryComposeLogManager.getLogs());
    scheduleRender();
  };

  const onViewStateChange = (viewState: DashboardViewState) => {
    const { panelId, itemId, detailTabIndex, sortField, compareItemId } = viewState;
    const wantsLiveStats = sortField === 'cpu'
      || sortField === 'mem'
      || sortField === 'net'
      || sortField === 'io'
      || sortField === 'pids';

    // Sorting compares every row, so it needs a sample per container — not
    // just the selected one. Running containers only; stopped ones report zeros.
    statsSampler.setIds(
      wantsLiveStats && panelId === 'containers'
        ? state.getRunningContainerIds()
        : [],
    );

    if (panelId === 'containers') {
      void logManager.select(detailTabIndex === 0 ? itemId : null);
      void statsManager.select(itemId && (detailTabIndex === 1 || wantsLiveStats) ? itemId : null);
      void composeLogManager.selectCompose(null, null);
      // Secondary compare stream: only when on Logs tab and a compare item is pinned
      void secondaryLogManager.select(detailTabIndex === 0 && compareItemId ? compareItemId : null);
      void secondaryComposeLogManager.selectCompose(null, null);
      flushLogsNow();
      flushComposeLogsNow();
      flushSecondaryLogsNow();
      flushSecondaryComposeLogsNow();
      // Fetch env vars if not cached
      if (itemId && !state.getInspectedEnv(itemId)) {
        client.getContainerEnv(itemId).then(env => {
          state.clearDetailError('env', itemId);
          state.setInspectedEnv(itemId, env);
          scheduleRender();
        }).catch((e: unknown) => {
          // Record it so the pane can say what went wrong instead of sitting
          // on "Loading…" forever.
          state.setDetailError('env', itemId, errorMessage(e));
          scheduleRender();
        });
      }
      // Fetch filesystem changes if not cached
      if (itemId && !state.getContainerChanges(itemId)) {
        client.getContainerChanges(itemId).then(changes => {
          state.clearDetailError('changes', itemId);
          state.setContainerChanges(itemId, changes);
          scheduleRender();
        }).catch((e: unknown) => {
          state.setDetailError('changes', itemId, errorMessage(e));
          scheduleRender();
        });
      }
    } else if (panelId === 'services' && itemId) {
      void logManager.select(null);
      void statsManager.select(null);
      void secondaryLogManager.select(null);
      if (detailTabIndex === 1) {
        const parts = itemId.split(':');
        if (parts[0] === 'project') {
          void composeLogManager.selectCompose(parts.slice(1).join(':'), null);
        } else if (parts[0] === 'service') {
          void composeLogManager.selectCompose(parts[1], parts.slice(2).join(':'));
        }
        // Secondary compose compare stream
        if (compareItemId) {
          const cParts = compareItemId.split(':');
          if (cParts[0] === 'project') {
            void secondaryComposeLogManager.selectCompose(cParts.slice(1).join(':'), null);
          } else if (cParts[0] === 'service') {
            void secondaryComposeLogManager.selectCompose(cParts[1], cParts.slice(2).join(':'));
          }
        } else {
          void secondaryComposeLogManager.selectCompose(null, null);
        }
      } else {
        void composeLogManager.selectCompose(null, null);
        void secondaryComposeLogManager.selectCompose(null, null);
      }
      flushLogsNow();
      flushComposeLogsNow();
      flushSecondaryLogsNow();
      flushSecondaryComposeLogsNow();
    } else if (panelId === 'images') {
      void logManager.select(null);
      void statsManager.select(null);
      void composeLogManager.selectCompose(null, null);
      void secondaryLogManager.select(null);
      void secondaryComposeLogManager.selectCompose(null, null);
      flushLogsNow();
      flushComposeLogsNow();
      flushSecondaryLogsNow();
      flushSecondaryComposeLogsNow();
      // Fetch image layers if not cached
      if (itemId && !state.getImageLayers(itemId)) {
        client.getImageHistory(itemId).then(layers => {
          state.clearDetailError('layers', itemId);
          state.setImageLayers(itemId, layers);
          scheduleRender();
        }).catch((e: unknown) => {
          state.setDetailError('layers', itemId, errorMessage(e));
          scheduleRender();
        });
      }
    } else {
      void logManager.select(null);
      void statsManager.select(null);
      void composeLogManager.selectCompose(null, null);
      void secondaryLogManager.select(null);
      void secondaryComposeLogManager.selectCompose(null, null);
      flushLogsNow();
      flushComposeLogsNow();
      flushSecondaryLogsNow();
      flushSecondaryComposeLogsNow();
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
    onError: (err) => {
      debugLog('event watcher error:', err);
    },
  });
  watcher.start();

  // Periodic refresh fallback (30s)
  const refreshInterval = setInterval(() => {
    state.refresh().then(() => scheduleRender()).catch((e: unknown) => { debugLog('periodic refresh failed:', e); });
  }, 30_000);

  // Optional memory/stream diagnostics (SIDEKICK_DEBUG_STREAMS=1)
  let debugInterval: ReturnType<typeof setInterval> | null = null;
  if (process.env.SIDEKICK_DEBUG_STREAMS === '1') {
    debugInterval = setInterval(() => {
      const mem = process.memoryUsage();
      const heapMB = (mem.heapUsed / 1024 / 1024).toFixed(1);
      const rssMB = (mem.rss / 1024 / 1024).toFixed(1);
      const extMB = (mem.external / 1024 / 1024).toFixed(1);
      const bufMB = (mem.arrayBuffers / 1024 / 1024).toFixed(1);
      const stdoutBuf = process.stdout.writableLength;
      const stdoutHWM = process.stdout.writableHighWaterMark;
      const templateDiag = logManager.getTemplateDiagnostics();
      const secondaryDiag = secondaryLogManager.getTemplateDiagnostics();
      debugLog(`heap=${heapMB}MB rss=${rssMB}MB ext=${extMB}MB bufs=${bufMB}MB stdout=${stdoutBuf}/${stdoutHWM} templates=${JSON.stringify(templateDiag)} secondary=${JSON.stringify(secondaryDiag)}`);
    }, 60_000);
  }

  // Exec trigger ref: Dashboard populates this with a function to start exec overlay
  const execTriggerRef: React.RefObject<((containerId: string, containerName: string) => void) | null> = { current: null };

  let externalExec = false;
  const execAbort = new AbortController();
  const onExecFallback = async (containerId: string): Promise<void> => {
    externalExec = true;
    try {
      await execFallback(containerId, cliEnv, execAbort.signal);
    } finally {
      externalExec = false;
    }
  };

  // Render with Ink
  const { render } = await import('ink');

  const instance = render(
    React.createElement(Dashboard, {
      panels,
      metrics: getEnrichedMetrics(),
      onViewStateChange,
      execTriggerRef,
      onExecFallback,
      dockerEnv: cliEnv,
    }),
  );

  stateChanged = scheduleRender;

  // Wire exec handler: ContainersPanel calls through the trigger ref
  const containersPanel = panels[0] as ContainersPanel;
  containersPanel.setOnExec((containerId: string) => {
    // Find container name for the overlay header
    const container = state.getMetrics().containers.find(c => c.id === containerId);
    const name = container?.name ?? shortId(containerId);

    if (execTriggerRef.current) {
      execTriggerRef.current(containerId, name);
    } else {
      throw new Error('The terminal is still starting. Try Exec again.');
    }
  });

  // Wire copy logs handler
  containersPanel.setOnCopyLogs((text: string) => copyToClipboard(text));
  const servicesPanel = panels[1] as ServicesPanel;
  servicesPanel.setOnCopyLogs((text: string) => copyToClipboard(text));

  function getEnrichedMetrics() {
    const m = state.getMetrics();
    m.logSeverityCounts = logSeverityCounts;
    m.logSeverityTimeSeries = logManager.getSeverityTimeSeries();
    m.logTemplates = logManager.getTemplates();
    m.secondaryLogSeverityCounts = secondaryLogSeverityCounts;
    m.secondaryLogSeverityTimeSeries = secondaryLogManager.getSeverityTimeSeries();
    return m;
  }

  // Cleanup
  let stopped = false;
  function cleanup() {
    if (stopped) return;
    stopped = true;
    execAbort.abort();
    try { logManager.dispose(); } catch { /* ignore */ }
    try { secondaryLogManager.dispose(); } catch { /* ignore */ }
    try { statsManager.dispose(); } catch { /* ignore */ }
    try { statsSampler.dispose(); } catch { /* ignore */ }
    try { composeLogManager.dispose(); } catch { /* ignore */ }
    try { secondaryComposeLogManager.dispose(); } catch { /* ignore */ }
    try { if (logFlushTimer) clearTimeout(logFlushTimer); } catch { /* ignore */ }
    try { if (secondaryLogFlushTimer) clearTimeout(secondaryLogFlushTimer); } catch { /* ignore */ }
    try { if (composeLogFlushTimer) clearTimeout(composeLogFlushTimer); } catch { /* ignore */ }
    try { if (secondaryComposeLogFlushTimer) clearTimeout(secondaryComposeLogFlushTimer); } catch { /* ignore */ }
    try { clearInterval(refreshInterval); } catch { /* ignore */ }
    try { if (debugInterval) clearInterval(debugInterval); } catch { /* ignore */ }
    try { watcher.stop(); } catch { /* ignore */ }
    try { state.dispose(); } catch { /* ignore */ }
    try { client.dispose(); } catch { /* ignore */ }
    for (const panel of panels) {
      panel.dispose?.();
    }
  }

  const onSigint = () => { if (!externalExec) cleanup(); };
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', cleanup);

  // Wait for exit
  await instance.waitUntilExit();
  process.removeListener('SIGINT', onSigint);
  process.removeListener('SIGTERM', cleanup);
  cleanup();
  process.exit(0);
}
