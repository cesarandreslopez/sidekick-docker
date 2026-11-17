import React from 'react';
import { execFallback } from '../dashboard/execFallback.js';
import { resolveExecShell } from '../dashboard/execShell';
import type { Command } from 'commander';
import { ComposeClient, EventWatcher, StatsSampler, dockerCliEnv, shortId, errorMessage, browserHostForEndpoint, describeDockerEndpoint } from 'sidekick-docker-shared';
import { debugLog } from '../utils/debug';
import { ansi } from '../formatters';
import {
  DASHBOARD_EXIT_SIGNALS,
  connectingLine,
  createFatalHandler,
  execFallbackBanner,
  inkStdout,
  installFatalGuard,
  signalExitCode,
} from './dashboardLifecycle';
import { createViewScheduler, sameComposeTarget, viewTargets } from './viewTargets';
import type { ViewTargets } from './viewTargets';
import { connectOrExit } from '../utils/connect';
import { copyToClipboard } from '../utils/clipboard';
import { openUrl } from '../utils/openUrl';
import { DockerState } from '../dashboard/DockerState';
import type { DetailKind } from '../dashboard/DockerState';
import { ContainersPanel, CONTAINER_TAB } from '../dashboard/panels/ContainersPanel';
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
import { startupWarningText } from '../dashboard/ink/resourceErrors';

export async function dashboardAction(_opts: Record<string, unknown>, cmd: Command): Promise<void> {
  const globalOpts = cmd.optsWithGlobals();

  // Create Docker client and verify the daemon is reachable. A slow endpoint
  // (ssh://, a remote tcp://) used to be a blank wait with no hint of where
  // it was connecting.
  const socket = globalOpts.socket as string | undefined;
  if (process.stderr.isTTY) process.stderr.write(`${ansi.dim(connectingLine(describeDockerEndpoint(socket)))}\n`);
  const client = await connectOrExit({ socket, verbose: globalOpts.verbose === true });
  // The status bar names the endpoint only when it is not the default; the
  // version overlay (V) always describes it.
  const endpointLabel = (socket ?? process.env.DOCKER_HOST ?? '').trim() || undefined;
  const endpointDescription = describeDockerEndpoint(socket);

  // Subprocesses cannot see the endpoint dockerode was configured with, so
  // every spawned `docker` (compose, exec) needs these overrides or --socket
  // is silently ignored and they talk to the default daemon instead.
  const cliEnv = socket ? dockerCliEnv(socket) : undefined;
  const execShell = resolveExecShell(globalOpts.shell as string | undefined);
  // Commander sets `mouse: false` for --no-mouse.
  const mouse = globalOpts.mouse !== false;
  const composeClient = new ComposeClient(cliEnv);

  // Create state and do initial refresh
  const cwd = process.cwd();
  let stateChanged = () => {};
  const state = new DockerState(client, cwd, () => stateChanged(), { cliEnv });
  await state.refresh();
  // Resources the first refresh could not list (and why), shown once on mount.
  const startupWarning = startupWarningText(state.getMetrics().resourceErrors);

  // Ctrl+R: an explicit refresh also re-reads the compose file, and drops the
  // selected item's cached inspect, diff and layers — they used to stay as
  // first fetched until the item was removed. Replaying the view fetches them
  // again. Resolves with the resources that could not be listed, and why.
  const onRefresh = () => {
    if (lastView?.itemId) state.invalidateDetails(lastView.itemId);
    return state.refresh({ reloadCompose: true }).then(() => {
      viewScheduler.flush();
      return state.getMetrics().resourceErrors ?? {};
    });
  };

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
          onRefresh,
          startupWarning,
          endpointLabel,
          endpointDescription,
          execShell,
          mouse,
        }),
      );
    }, 200);
  }

  // Stream managers for logs and stats. They consult the state so a stream of
  // a stopped container ends instead of reconnecting, and resume on start.
  const containerTarget = { isTargetRunning: (id: string | null) => (id ? state.isContainerRunning(id) : undefined) };
  const composeTarget = {
    isTargetRunning: (id: { project: string | null; service: string | null }) =>
      (id.project ? state.isComposeTargetRunning(id.project, id.service) : undefined),
  };
  const logManager = new LogStreamManager(client, () => {
    if (logFlushTimer) return;
    logFlushTimer = setTimeout(() => {
      logFlushTimer = null;
      state.setSelectedLogs(logManager.getLogs());
      logSeverityCounts = logManager.getSeverityCounts();
      scheduleRender();
    }, 100);
  }, containerTarget);

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
  }, containerTarget);

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
  }, containerTarget);

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
  }, composeTarget);

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
  }, composeTarget);

  const flushSecondaryComposeLogsNow = () => {
    if (secondaryComposeLogFlushTimer) {
      clearTimeout(secondaryComposeLogFlushTimer);
      secondaryComposeLogFlushTimer = null;
    }
    state.setSecondaryComposeLogs(secondaryComposeLogManager.getLogs());
    scheduleRender();
  };

  // Lazy detail fetches (env, filesystem changes, image layers). Deduped while
  // in flight: moving j/k back and forth used to fire the same request again
  // each time the row was revisited before the first answer came back. A
  // failure is recorded (the pane says why) and retried on the next visit.
  const inflightDetails = new Set<string>();
  // Keys invalidated while their fetch was in flight: that result predates the
  // change, so it is dropped and fetched again.
  const staleDetails = new Set<string>();
  function fetchDetail<T>(kind: DetailKind, id: string, cached: unknown, fetch: () => Promise<T>, keep: (value: T) => void, invalidated = false): void {
    const key = DockerState.detailErrorKey(kind, id);
    if (cached !== undefined) return;
    if (inflightDetails.has(key)) {
      if (invalidated) staleDetails.add(key);
      return;
    }
    inflightDetails.add(key);
    staleDetails.delete(key);
    fetch().then((value) => {
      if (staleDetails.has(key)) return;
      state.clearDetailError(kind, id);
      keep(value);
    }).catch((e: unknown) => {
      if (!staleDetails.has(key)) state.setDetailError(kind, id, errorMessage(e));
    }).finally(() => {
      inflightDetails.delete(key);
      if (staleDetails.delete(key)) fetchDetail(kind, id, undefined, fetch, keep);
      scheduleRender();
    });
  }

  const flushAllLogsNow = () => {
    flushLogsNow();
    flushComposeLogsNow();
    flushSecondaryLogsNow();
    flushSecondaryComposeLogsNow();
  };

  // What each manager streams, as last applied. Mutable: release() stops a
  // stream ahead of the debounced apply and records that here.
  let applied: ViewTargets | null = null;

  /** Start the streams and fetches the view needs (debounced; see viewScheduler). */
  const applyView = (view: DashboardViewState) => {
    const t = viewTargets(view);
    applied = { ...t };
    // Sorting by a stats field compares every row, so it needs a sample per
    // running container, not just the selected one.
    statsSampler.setIds(t.sampleAllStats ? state.getRunningContainerIds() : []);
    void logManager.select(t.log);
    void statsManager.select(t.stats);
    void secondaryLogManager.select(t.secondaryLog);
    void composeLogManager.selectCompose(t.compose.project, t.compose.service);
    void secondaryComposeLogManager.selectCompose(t.secondaryCompose.project, t.secondaryCompose.service);
    flushAllLogsNow();
    const { details, changes, layers } = t;
    if (details) fetchDetail('details', details, state.getContainerDetails(details), () => client.getContainerDetails(details), d => state.setContainerDetails(details, d));
    if (changes) fetchDetail('changes', changes, state.getContainerChanges(changes), () => client.getContainerChanges(changes), c => state.setContainerChanges(changes, c));
    if (layers) fetchDetail('layers', layers, state.getImageLayers(layers), () => client.getImageHistory(layers), l => state.setImageLayers(layers, l));
  };

  /** Runs on every view change: stop at once whatever the new view no longer streams. */
  const releaseView = (view: DashboardViewState) => {
    const was = applied;
    if (!was) return;
    const next = viewTargets(view);
    let released = false;
    if (was.log !== null && was.log !== next.log) { void logManager.select(null); was.log = null; released = true; }
    if (was.stats !== null && was.stats !== next.stats) { void statsManager.select(null); was.stats = null; released = true; }
    if (was.secondaryLog !== null && was.secondaryLog !== next.secondaryLog) { void secondaryLogManager.select(null); was.secondaryLog = null; released = true; }
    if (was.compose.project !== null && !sameComposeTarget(was.compose, next.compose)) {
      void composeLogManager.selectCompose(null, null);
      was.compose = { project: null, service: null };
      released = true;
    }
    if (was.secondaryCompose.project !== null && !sameComposeTarget(was.secondaryCompose, next.secondaryCompose)) {
      void secondaryComposeLogManager.selectCompose(null, null);
      was.secondaryCompose = { project: null, service: null };
      released = true;
    }
    if (released) flushAllLogsNow();
  };

  const viewScheduler = createViewScheduler<DashboardViewState>({ apply: applyView, release: releaseView });

  let lastView: DashboardViewState | null = null;
  const onViewStateChange = (viewState: DashboardViewState) => {
    lastView = viewState;
    viewScheduler.change(viewState);
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
    // The state's onChange schedules the render, and only when the event
    // changed something — healthcheck exec events no longer repaint.
    onEvent: (event) => {
      state.processEvent(event);
      // A health/lifecycle event drops the selected container's cached
      // details; re-fetch at once if its Env or Config tab is on screen.
      const view = lastView;
      if (view?.panelId === 'containers' && view.itemId === event.resourceId
        && (view.detailTabIndex === CONTAINER_TAB.env || view.detailTabIndex === CONTAINER_TAB.config)) {
        const id = view.itemId;
        fetchDetail('details', id, state.getContainerDetails(id), () => client.getContainerDetails(id), d => state.setContainerDetails(id, d), true);
      }
    },
    onError: (err) => {
      debugLog('event watcher error:', err);
      // The event stream failing is usually the daemon going away: refresh
      // now, so the dashboard says so instead of waiting for the 30 s poll.
      state.refresh().then(() => scheduleRender()).catch((e: unknown) => { debugLog('refresh after event error failed:', e); });
    },
  });
  watcher.start();

  // While the daemon is unreachable, look for it every 5 s: the 30 s fallback
  // below was the only retry, so a restarted Docker Desktop took up to half a
  // minute to come back.
  const reconnectPoll = setInterval(() => {
    if (state.isDaemonConnected()) return;
    state.refresh().then(() => scheduleRender()).catch((e: unknown) => { debugLog('reconnect poll failed:', e); });
  }, 5_000);

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
  const onExecFallback = async (containerId: string, containerName: string): Promise<void> => {
    externalExec = true;
    try {
      // Ink has left the alternate screen by now: say where the dashboard went.
      process.stderr.write(`${ansi.dim(execFallbackBanner(containerName))}\n`);
      await execFallback(containerId, cliEnv, execAbort.signal, execShell, containerName);
    } finally {
      externalExec = false;
    }
  };

  // Render with Ink, in the alternate screen: the user's scrollback and shell
  // output come back untouched on exit. Ctrl+C is the dashboard's own key —
  // with Ink's default exitOnCtrlC it never reached the embedded exec shell.
  const { render } = await import('ink');

  const instance = render(
    React.createElement(Dashboard, {
      panels,
      metrics: getEnrichedMetrics(),
      onViewStateChange,
      execTriggerRef,
      onExecFallback,
      dockerEnv: cliEnv,
      onRefresh,
      startupWarning,
      endpointLabel,
      endpointDescription,
      execShell,
      mouse,
    }),
    { alternateScreen: true, exitOnCtrlC: false, stdout: inkStdout(process.stdout) },
  );

  const streamManagers = [logManager, secondaryLogManager, statsManager, composeLogManager, secondaryComposeLogManager];
  stateChanged = () => {
    // A container that just started gets its finished stream back.
    for (const m of streamManagers) m.targetStateChanged();
    scheduleRender();
  };

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
  // Published ports live on the daemon's host — not localhost for a tcp:// or ssh:// endpoint.
  containersPanel.setOnOpenUrl(openUrl, browserHostForEndpoint(socket ?? process.env.DOCKER_HOST));
  const servicesPanel = panels[1] as ServicesPanel;
  servicesPanel.setOnCopyLogs((text: string) => copyToClipboard(text));

  function getEnrichedMetrics() {
    const m = state.getMetrics();
    m.logSeverityCounts = logSeverityCounts;
    m.logSeverityTimeSeries = logManager.getSeverityTimeSeries();
    m.logTemplates = logManager.getTemplates();
    m.secondaryLogSeverityCounts = secondaryLogSeverityCounts;
    m.secondaryLogSeverityTimeSeries = secondaryLogManager.getSeverityTimeSeries();
    m.logStreamState = logManager.getStreamState();
    m.composeLogStreamState = composeLogManager.getStreamState();
    m.secondaryLogStreamState = secondaryLogManager.getStreamState();
    m.secondaryComposeLogStreamState = secondaryComposeLogManager.getStreamState();
    m.statsStreamState = statsManager.getStreamState();
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
    try { if (renderTimer) clearTimeout(renderTimer); } catch { /* ignore */ }
    try { clearInterval(refreshInterval); } catch { /* ignore */ }
    try { clearInterval(reconnectPoll); } catch { /* ignore */ }
    try { viewScheduler.dispose(); } catch { /* ignore */ }
    try { if (debugInterval) clearInterval(debugInterval); } catch { /* ignore */ }
    try { watcher.stop(); } catch { /* ignore */ }
    try { state.dispose(); } catch { /* ignore */ }
    try { client.dispose(); } catch { /* ignore */ }
    for (const panel of panels) {
      panel.dispose?.();
    }
  }

  // Registering a listener suppresses Node's default exit-on-signal, so the
  // handler has to finish the job: stop everything, unmount Ink (which leaves
  // the alternate screen and restores the cursor and raw mode) and let
  // waitUntilExit() below exit with the signal's status (SIGINT 130, SIGTERM
  // 143), not 0. The timer is a backstop if unmounting itself hangs.
  let exitCode = 0;
  const onSignal = (signal: NodeJS.Signals) => {
    // During the `docker exec` fallback the child owns the terminal and Ctrl+C
    // belongs to it.
    if (signal === 'SIGINT' && externalExec) return;
    exitCode = signalExitCode(signal);
    cleanup();
    instance.unmount();
    setTimeout(() => process.exit(exitCode), 2000).unref();
  };
  for (const signal of DASHBOARD_EXIT_SIGNALS) process.on(signal, onSignal);

  // An uncaught error used to be printed into the alternate screen (or a raw
  // terminal) and vanish with it: restore the terminal first, then report.
  const removeFatalGuard = installFatalGuard(createFatalHandler({
    teardown: () => { cleanup(); instance.unmount(); },
    write: (text) => { process.stderr.write(text); },
    exit: (code) => process.exit(code),
    describe: errorMessage,
    verbose: globalOpts.verbose === true || Boolean(process.env.DEBUG),
  }));

  // Wait for exit
  try {
    await instance.waitUntilExit();
  } finally {
    for (const signal of DASHBOARD_EXIT_SIGNALS) process.removeListener(signal, onSignal);
    removeFatalGuard();
    cleanup();
  }
  process.exit(exitCode);
}
