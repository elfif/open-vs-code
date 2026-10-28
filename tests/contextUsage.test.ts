import { describe, expect, it } from "vitest";

import {
  computeContextUsage,
  findCompactionAfter,
  toContextUsage,
} from "../src/services/contextUsage";

const usage = (input: number, output: number, reasoning = 0, cacheRead = 0, cacheWrite = 0) => ({
  input,
  output,
  reasoning,
  cache: { read: cacheRead, write: cacheWrite },
});

function assistant(id: string, created: number, tokens?: ReturnType<typeof usage>) {
  return {
    id,
    type: "assistant",
    agent: "build",
    model: { id: "gpt", providerID: "openai" },
    time: { created },
    content: [],
    ...(tokens ? { tokens } : {}),
  } as never;
}

function compaction(
  id: string,
  created: number,
  status: "running" | "completed" | "failed",
  tokens?: ReturnType<typeof usage>,
  summary = "summary",
) {
  return {
    id,
    type: "compaction",
    time: { created },
    status,
    reason: "manual",
    summary,
    ...(tokens ? { tokens } : {}),
  } as never;
}

const user = (id: string, created: number) =>
  ({
    id,
    type: "user",
    text: "hi",
    time: { created },
  }) as never;

describe("toContextUsage", () => {
  it("sums every token bucket", () => {
    expect(toContextUsage(usage(100, 20, 30, 400, 5))).toEqual({
      total: 555,
      input: 100,
      output: 20,
      reasoning: 30,
      cacheRead: 400,
      cacheWrite: 5,
      compacted: false,
    });
  });

  it("returns null without tokens", () => {
    expect(toContextUsage(undefined)).toBeNull();
  });

  it("treats missing and negative buckets as zero", () => {
    const partial = { input: 10, output: -5 } as never;

    expect(toContextUsage(partial)).toEqual({
      total: 10,
      input: 10,
      output: 0,
      reasoning: 0,
      cacheRead: 0,
      cacheWrite: 0,
      compacted: false,
    });
  });
});

describe("computeContextUsage", () => {
  it("uses the most recent assistant turn", () => {
    const result = computeContextUsage([
      assistant("a1", 10, usage(100, 10)),
      user("u2", 20),
      assistant("a2", 30, usage(500, 40, 10, 1_000, 0)),
    ]);

    expect(result).toEqual({
      total: 1_550,
      input: 500,
      output: 40,
      reasoning: 10,
      cacheRead: 1_000,
      cacheWrite: 0,
      compacted: false,
    });
  });

  it("skips assistant messages without tokens", () => {
    const result = computeContextUsage([assistant("a1", 10, usage(100, 10)), assistant("a2", 20)]);

    expect(result?.total).toBe(110);
  });

  it("replaces the last assistant turn with the compaction summary size", () => {
    const result = computeContextUsage([
      assistant("a1", 10, usage(9_000, 900)),
      compaction("c1", 20, "completed", usage(1_159, 1_285, 11, 43_173), "x".repeat(5_112)),
    ]);

    // The compaction's own tokens (1159 + 1285 + 11 + 43173 = 45628) are the
    // summarisation call, NOT the resulting context. Only the summary survives.
    expect(result).toEqual({
      total: 1_285,
      input: 0,
      output: 1_285,
      reasoning: 0,
      cacheRead: 0,
      cacheWrite: 0,
      compacted: true,
    });
  });

  it("estimates the summary size from text when no output tokens are reported", () => {
    const result = computeContextUsage([
      assistant("a1", 10, usage(9_000, 900)),
      compaction("c1", 20, "completed", undefined, "x".repeat(5_112)),
    ]);

    expect(result?.total).toBe(1_278);
    expect(result?.compacted).toBe(true);
  });

  it("never reports the compaction call usage as occupancy", () => {
    const result = computeContextUsage([
      assistant("a1", 10, usage(38_000, 5_600)),
      compaction("c1", 20, "completed", usage(975, 1_261, 224, 222_816), "summary"),
    ]);

    expect(result?.total).toBe(1_261);
    expect(result!.total).toBeLessThan(43_600);
  });

  it("ignores failed and running compactions", () => {
    const result = computeContextUsage([
      assistant("a1", 10, usage(900, 100)),
      compaction("c1", 20, "failed"),
      compaction("c2", 30, "running"),
    ]);

    expect(result?.total).toBe(1_000);
  });

  it("prefers the assistant turn when it follows the compaction", () => {
    const result = computeContextUsage([
      compaction("c1", 10, "completed", usage(500, 100)),
      assistant("a1", 20, usage(2_000, 200)),
    ]);

    expect(result?.total).toBe(2_200);
  });

  it("returns null when nothing reported tokens", () => {
    expect(computeContextUsage([user("u1", 10)])).toBeNull();
    expect(computeContextUsage([])).toBeNull();
  });
});

describe("findCompactionAfter", () => {
  const messages = [
    compaction("c1", 100, "completed"),
    compaction("c2", 200, "running"),
    compaction("c3", 300, "failed"),
  ];

  it("ignores compactions older than the cutoff", () => {
    expect(findCompactionAfter(messages, 500)).toBeNull();
  });

  it("ignores compactions that are still running", () => {
    expect(findCompactionAfter(messages, 150)).toBe("failed");
    expect(findCompactionAfter([messages[1]], 50)).toBeNull();
  });

  it("reports the newest terminal status", () => {
    expect(findCompactionAfter(messages, 50)).toBe("failed");
    expect(
      findCompactionAfter(
        [compaction("c1", 200, "failed"), compaction("c2", 300, "completed")],
        100,
      ),
    ).toBe("completed");
  });

  it("includes a compaction created exactly at the cutoff", () => {
    expect(findCompactionAfter(messages, 300)).toBe("failed");
  });
});
