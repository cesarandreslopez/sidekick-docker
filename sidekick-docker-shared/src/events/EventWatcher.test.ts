import { describe, it, expect, vi } from 'vitest';
import { EventWatcher } from './EventWatcher';
import type { DockerClient } from '../docker/DockerClient';
import type { DockerEvent } from '../types/events';

function makeMockClient(events: DockerEvent[]): DockerClient {
  return {
    streamEvents: vi.fn(async function* () {
      for (const e of events) {
        yield e;
      }
    }),
  } as unknown as DockerClient;
}

describe('EventWatcher', () => {
  it('emits events from the stream', async () => {
    const events: DockerEvent[] = [
      {
        type: 'start',
        resourceType: 'container',
        resourceId: 'abc123',
        timestamp: new Date(),
        attributes: { name: 'test' },
      },
    ];

    const received: DockerEvent[] = [];
    const client = makeMockClient(events);
    const watcher = new EventWatcher(client, {
      onEvent: (e) => received.push(e),
    });

    watcher.start();
    // Give async generator time to yield
    await new Promise(resolve => setTimeout(resolve, 50));
    watcher.stop();

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe('start');
    expect(received[0].resourceId).toBe('abc123');
  });

  it('reports running state', () => {
    const client = makeMockClient([]);
    const watcher = new EventWatcher(client, { onEvent: () => {} });

    expect(watcher.isRunning).toBe(false);
    watcher.start();
    expect(watcher.isRunning).toBe(true);
    watcher.stop();
    expect(watcher.isRunning).toBe(false);
  });

  it('calls onError when stream fails', async () => {
    const client = {
      streamEvents: vi.fn(async function* () {
        throw new Error('connection lost');
        // Need yield for TS to see this as async generator
        yield undefined as never;
      }),
    } as unknown as DockerClient;

    const errors: Error[] = [];
    const watcher = new EventWatcher(client, {
      onEvent: () => {},
      onError: (e) => errors.push(e),
    });

    watcher.start();
    await new Promise(resolve => setTimeout(resolve, 100));
    watcher.stop();

    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0].message).toBe('connection lost');
  });
});
