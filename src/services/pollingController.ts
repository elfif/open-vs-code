export interface TimerHandle {
  readonly id: ReturnType<typeof setTimeout>;
}

export interface TimerScheduler {
  setTimeout(callback: () => void, delayMs: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

const defaultScheduler: TimerScheduler = {
  setTimeout(callback, delayMs) {
    return { id: setTimeout(callback, delayMs) };
  },
  clearTimeout(handle) {
    clearTimeout(handle.id);
  },
};

export class PollingController {
  private visible = false;
  private pending = false;
  private timer: TimerHandle | undefined;
  private disposed = false;

  public constructor(
    private readonly intervalMs: number,
    private readonly tick: () => Promise<void>,
    private readonly scheduler: TimerScheduler = defaultScheduler,
  ) {}

  public setVisible(visible: boolean): void {
    if (this.disposed) {
      return;
    }

    this.visible = visible;

    if (!visible) {
      this.cancelTimer();
      return;
    }

    void this.run();
  }

  public trigger(): void {
    if (!this.disposed && this.visible) {
      void this.run();
    }
  }

  public dispose(): void {
    this.disposed = true;
    this.visible = false;
    this.cancelTimer();
  }

  private async run(): Promise<void> {
    if (this.disposed || !this.visible || this.pending) {
      return;
    }

    this.pending = true;

    try {
      await this.tick();
    } finally {
      this.pending = false;

      if (!this.disposed && this.visible) {
        this.schedule();
      }
    }
  }

  private schedule(): void {
    this.cancelTimer();
    this.timer = this.scheduler.setTimeout(() => {
      this.timer = undefined;
      void this.run();
    }, this.intervalMs);
  }

  private cancelTimer(): void {
    if (this.timer) {
      this.scheduler.clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
}
