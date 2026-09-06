import { StringDecoder } from 'node:string_decoder';

type ByteStream = AsyncIterable<Buffer | string> & { destroy?: () => void };

/** Dockerode aborts both pending HTTP requests and their response streams. */
export async function streamRequest<T>(request: Promise<T>, signal?: AbortSignal): Promise<T | undefined> {
  try {
    return await request;
  } catch (error) {
    if (!signal?.aborted) throw error;
    return undefined;
  }
}

/** Own the stream even when cancellation happened while its request was pending. */
export async function* abortableChunks(stream: ByteStream, signal?: AbortSignal): AsyncIterable<Buffer> {
  const destroy = () => stream.destroy?.();
  signal?.addEventListener('abort', destroy, { once: true });
  try {
    if (signal?.aborted) return;
    for await (const chunk of stream) {
      if (signal?.aborted) return;
      yield Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    }
  } catch (error) {
    if (!signal?.aborted) throw error;
  } finally {
    signal?.removeEventListener('abort', destroy);
    destroy();
  }
}

/** Transport chunks are neither UTF-8 boundaries nor record boundaries. */
export class LineDecoder {
  private decoder = new StringDecoder('utf8');
  private pending = '';

  push(chunk: Buffer): string[] {
    return this.lines(this.decoder.write(chunk));
  }

  end(): string[] {
    const lines = this.lines(this.decoder.end());
    if (this.pending) lines.push(this.pending.replace(/\r$/, ''));
    this.pending = '';
    return lines;
  }

  private lines(text: string): string[] {
    const parts = (this.pending + text).split('\n');
    this.pending = parts.pop()!;
    return parts.map(line => line.replace(/\r$/, ''));
  }
}

export async function* streamLines(chunks: AsyncIterable<Buffer>): AsyncIterable<string> {
  const decoder = new LineDecoder();
  for await (const chunk of chunks) yield* decoder.push(chunk);
  yield* decoder.end();
}
