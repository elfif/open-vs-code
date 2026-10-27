import { describe, expect, it, vi } from "vitest";

import {
  PollingController,
  type TimerHandle,
  type TimerScheduler,
} from "../src/services/pollingController";

class FakeScheduler implements TimerScheduler {
  public readonly timers = new Map<number, () => void>();
  private nextId = 1;

  public setTimeout(callback: () => void): TimerHandle {
    const id = this.nextId++;
    this.timers.set(id, callback);
    return { id };
  }

  public clearTimeout(handle: TimerHandle): void {
    this.timers.delete(handle.id);
  }

  public runAll(): void {
    const callbacks = [...this.timers.values()];
    this.timers.clear();
    callbacks.forEach((callback) => callback());
  }
}

describe("PollingController", () => {
  it("does not run while hidden", async () => {
    const tick = vi.fn(async () => undefined);
    const scheduler = new FakeScheduler();
    const controller = new PollingController(1000, tick, scheduler);

    controller.setVisible(false);
    scheduler.runAll();
    await Promise.resolve();

    expect(tick).not.toHaveBeenCalled();
  });

  it("runs immediately when visible and schedules the next tick", async () => {
    const tick = vi.fn(async () => undefined);
    const scheduler = new FakeScheduler();
    const controller = new PollingController(1000, tick, scheduler);

    controller.setVisible(true);
    await Promise.resolve();

    expect(tick).toHaveBeenCalledTimes(1);
    expect(scheduler.timers.size).toBe(1);

    scheduler.runAll();
    await Promise.resolve();

    expect(tick).toHaveBeenCalledTimes(2);
  });

  it("does not overlap ticks", async () => {
    let releaseFirst = () => undefined;
    const tick = vi
      .fn<[], Promise<void>>()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseFirst = () => resolve();
          }),
      )
      .mockImplementation(async () => undefined);

    const scheduler = new FakeScheduler();
    const controller = new PollingController(1000, tick, scheduler);

    controller.setVisible(true);
    await Promise.resolve();
    controller.trigger();
    controller.trigger();

    expect(tick).toHaveBeenCalledTimes(1);

    releaseFirst();
    await Promise.resolve();
    await Promise.resolve();

    expect(tick).toHaveBeenCalledTimes(1);
    expect(scheduler.timers.size).toBe(1);
  });

  it("uses a dynamic interval when provided", async () => {
    let interval = 1000;
    const tick = vi.fn(async () => undefined);
    const scheduler = new FakeScheduler();
    const controller = new PollingController(() => interval, tick, scheduler);

    controller.setVisible(true);
    await Promise.resolve();
    expect(scheduler.timers.size).toBe(1);

    interval = 2000;
    scheduler.runAll();
    await Promise.resolve();

    expect(tick).toHaveBeenCalledTimes(2);
    expect(scheduler.timers.size).toBe(1);
  });

  it("stops scheduling after dispose", async () => {
    const tick = vi.fn(async () => undefined);
    const scheduler = new FakeScheduler();
    const controller = new PollingController(1000, tick, scheduler);

    controller.setVisible(true);
    await Promise.resolve();
    controller.dispose();
    scheduler.runAll();
    await Promise.resolve();

    expect(tick).toHaveBeenCalledTimes(1);
    expect(scheduler.timers.size).toBe(0);
  });
});
