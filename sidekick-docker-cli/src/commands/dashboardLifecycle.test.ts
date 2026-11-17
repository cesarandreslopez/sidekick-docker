import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  DASHBOARD_EXIT_SIGNALS,
  connectingLine,
  createFatalHandler,
  execFallbackBanner,
  inkStdout,
  installFatalGuard,
  pauseTerminalRead,
  signalExitCode,
  stripScrollbackErase,
} from './dashboardLifecycle';

describe('signalExitCode (T37)', () => {
  it('exits 128 + the signal number, as shells report a killed process', () => {
    expect(signalExitCode('SIGINT')).toBe(130);
    expect(signalExitCode('SIGTERM')).toBe(143);
    expect(signalExitCode('SIGHUP')).toBe(129);
  });

  it('covers every signal the dashboard listens for', () => {
    for (const s of DASHBOARD_EXIT_SIGNALS) expect(signalExitCode(s)).toBeGreaterThan(128);
  });
});

describe('stripScrollbackErase (T1)', () => {
  it('drops ESC[3J from Ink\'s clear-terminal sequence and keeps the rest', () => {
    expect(stripScrollbackErase('\x1b[2J\x1b[3J\x1b[Hframe\x1b[3J')).toBe('\x1b[2J\x1b[Hframe');
  });

  it('leaves non-string chunks alone', () => {
    const buf = Buffer.from('x');
    expect(stripScrollbackErase(buf)).toBe(buf);
  });
});

function fakeStream(isTTY: boolean) {
  const written: unknown[] = [];
  const stream = Object.assign(new EventEmitter(), {
    isTTY,
    columns: 80,
    rows: 24,
    write(chunk: unknown) { written.push(chunk); return true; },
  });
  return { stream: stream as unknown as NodeJS.WriteStream & { columns: number }, written };
}

describe('inkStdout (T1)', () => {
  it('strips scrollback erases on a TTY while size and listeners stay live', () => {
    const { stream, written } = fakeStream(true);
    const out = inkStdout(stream);
    out.write('\x1b[2J\x1b[3J\x1b[Hhello');
    expect(written).toEqual(['\x1b[2J\x1b[Hhello']);
    stream.columns = 120;
    expect(out.columns).toBe(120);
    const onResize = vi.fn();
    out.on('resize', onResize);
    stream.emit('resize');
    expect(onResize).toHaveBeenCalledTimes(1);
    expect(out.isTTY).toBe(true);
  });

  it('hands a non-TTY stream back unchanged', () => {
    const { stream } = fakeStream(false);
    expect(inkStdout(stream)).toBe(stream);
  });
});

describe('createFatalHandler (T37)', () => {
  it('restores the terminal before printing, then exits 1', () => {
    const order: string[] = [];
    const handler = createFatalHandler({
      teardown: () => order.push('teardown'),
      write: (t) => order.push(`write:${t}`),
      exit: (code) => order.push(`exit:${code}`),
      describe: (e) => (e instanceof Error ? e.message : String(e)),
    });
    handler(new Error('boom'));
    expect(order).toEqual(['teardown', 'write:Error: boom\n', 'exit:1']);
  });

  it('still reports the error when teardown throws, and runs only once', () => {
    const write = vi.fn();
    const exit = vi.fn();
    const handler = createFatalHandler({
      teardown: () => { throw new Error('unmount failed'); },
      write, exit, describe: String,
    });
    handler('first');
    handler('second');
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('Error: first\n');
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('adds the stack when verbose', () => {
    const write = vi.fn();
    const err = new Error('boom');
    createFatalHandler({ teardown: () => {}, write, exit: () => {}, describe: () => 'boom', verbose: true })(err);
    expect(write).toHaveBeenLastCalledWith(`${err.stack}\n`);
  });
});

describe('installFatalGuard', () => {
  it('listens for uncaught exceptions and rejections until removed', () => {
    const proc = new EventEmitter();
    const handler = vi.fn();
    const remove = installFatalGuard(handler, proc as unknown as NodeJS.Process);
    proc.emit('uncaughtException', new Error('a'));
    proc.emit('unhandledRejection', 'b');
    expect(handler).toHaveBeenCalledTimes(2);
    remove();
    expect(proc.listenerCount('uncaughtException') + proc.listenerCount('unhandledRejection')).toBe(0);
  });
});

describe('pauseTerminalRead (exec fallback)', () => {
  it('cancels the pending read and starts a fresh one on resume', () => {
    const handle = { reading: true, readStop: vi.fn(() => 0), readStart: vi.fn(() => 0) };
    const resume = pauseTerminalRead({ _handle: handle } as unknown as NodeJS.ReadStream);
    expect(handle.readStop).toHaveBeenCalledTimes(1);
    expect(handle.reading).toBe(false);
    resume();
    expect(handle.readStart).toHaveBeenCalledTimes(1);
    expect(handle.reading).toBe(true);
    resume();
    expect(handle.readStart).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a reading handle', () => {
    const idle = { reading: false, readStop: vi.fn(), readStart: vi.fn() };
    pauseTerminalRead({ _handle: idle } as unknown as NodeJS.ReadStream)();
    expect(idle.readStop).not.toHaveBeenCalled();
    expect(idle.readStart).not.toHaveBeenCalled();
    expect(() => pauseTerminalRead({} as NodeJS.ReadStream)()).not.toThrow();
  });
});

describe('stderr lines (T7, T19)', () => {
  it('names the endpoint being connected to', () => {
    expect(connectingLine('tcp://build:2375')).toBe('Connecting to tcp://build:2375…');
  });

  it('says where the dashboard went during the exec fallback', () => {
    expect(execFallbackBanner('web')).toBe('Shell in web — type exit to return to sidekick-docker');
  });
});
