import { describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { DockerClient } from './DockerClient';

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of stream) values.push(value);
  return values;
}

async function* bytes(data: Buffer): AsyncIterable<Buffer> {
  // Every byte is a separate transport chunk, including UTF-8 and headers.
  for (let i = 0; i < data.length; i++) yield data.subarray(i, i + 1);
}

function clientWith(docker: unknown): DockerClient {
  const client = new DockerClient();
  Object.assign(client, { docker });
  return client;
}

function frame(channel: number, data: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header[0] = channel;
  header.writeUInt32BE(data.length, 4);
  return Buffer.concat([header, data]);
}

describe('stream transport boundaries', () => {
  it('retains fragmented events, UTF-8, and a final record without a newline', async () => {
    const event = { Type: 'container', Action: 'start', Actor: { ID: 'web', Attributes: { name: 'café' } } };
    const data = Buffer.from(`${JSON.stringify(event)}\nmalformed\n${JSON.stringify(event)}`);
    const client = clientWith({ getEvents: async () => bytes(data) });
    expect((await collect(client.streamEvents())).map(e => e.attributes.name)).toEqual(['café', 'café']);
  });

  it('retains fragmented stats after the initial sample fails', async () => {
    const client = clientWith({ getContainer: () => ({ stats: async ({ stream }: { stream: boolean }) => {
      if (!stream) throw new Error('initial reading failed');
      return bytes(Buffer.from('{"memory_stats":{"usage":50,"limit":100}}\n'));
    } }) });
    expect(await collect(client.streamStats('web'))).toMatchObject([{ memoryUsage: 50, memoryPercent: 50 }]);
  });

  it.each([true, false])('decodes live logs with Tty=%s', async tty => {
    const payload = Buffer.from('2026-09-06T12:00:00.000Z café\r\nlast line');
    const data = tty ? payload : Buffer.concat([
      frame(1, payload.subarray(0, 28)), frame(1, payload.subarray(28)),
      frame(2, Buffer.from('error\n')),
    ]);
    const client = clientWith({ getContainer: () => ({
      inspect: async () => ({ Config: { Tty: tty } }),
      logs: async () => bytes(data),
    }) });
    const entries = await collect(client.streamLogs('web'));
    expect(entries.find(e => e.message === 'café')?.timestamp?.toISOString()).toBe('2026-09-06T12:00:00.000Z');
    expect(entries.some(e => e.message === 'last line')).toBe(true);
    if (!tty) expect(entries).toContainEqual({ timestamp: null, message: 'error', stream: 'stderr' });
  });

  it('cancels an idle stream and releases its abort listener', async () => {
    const stream = new PassThrough();
    const abort = new AbortController();
    const remove = vi.spyOn(abort.signal, 'removeEventListener');
    const client = clientWith({ getEvents: async () => stream });
    const result = collect(client.streamEvents(undefined, abort.signal));
    await new Promise(resolve => setImmediate(resolve));
    abort.abort();
    expect(await result).toEqual([]);
    expect(stream.destroyed).toBe(true);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it.each(['events', 'logs', 'stats'] as const)('cancels a pending %s request', async kind => {
    const abort = new AbortController();
    const request = vi.fn(({ abortSignal }: { abortSignal: AbortSignal }) => new Promise((_resolve, reject) => {
      abortSignal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    const client = clientWith({ getEvents: request, getContainer: () => ({ inspect: request, stats: request }) });
    const stream = kind === 'events' ? client.streamEvents(undefined, abort.signal)
      : kind === 'logs' ? client.streamLogs('web', {}, abort.signal) : client.streamStats('web', abort.signal);
    const result = collect(stream as AsyncIterable<unknown>);
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ abortSignal: abort.signal }));
    abort.abort();
    expect(await result).toEqual([]);
  });

  it('closes a stream whose request completes after cancellation', async () => {
    const stream = new PassThrough();
    let complete!: (stream: PassThrough) => void;
    const client = clientWith({ getEvents: () => new Promise(resolve => { complete = resolve; }) });
    const abort = new AbortController();
    const result = collect(client.streamEvents(undefined, abort.signal));
    abort.abort();
    complete(stream);
    expect(await result).toEqual([]);
    expect(stream.destroyed).toBe(true);
  });
});
