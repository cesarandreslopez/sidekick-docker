/** A selection owns a generation, including while its stream request is pending. */
export class StreamSession {
  private generation = 0;
  private controller: AbortController | null = null;

  start(): { generation: number; signal: AbortSignal } {
    this.stop();
    this.controller = new AbortController();
    return { generation: this.generation, signal: this.controller.signal };
  }

  isCurrent(session: { generation: number; signal: AbortSignal }): boolean {
    return session.generation === this.generation && !session.signal.aborted;
  }

  stop(): void {
    this.generation++;
    this.controller?.abort();
    this.controller = null;
  }
}
