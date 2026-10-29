import { describe, expect, it } from "vitest";

import {
  contextFillPercent,
  contextGradientSize,
  contextLevel,
  contextPercent,
  findContextLimit,
  formatContextLabel,
  formatTokenCount,
  formatContextPercent,
  formatContextTooltip,
  formatCompactionDelta,
  shouldHighlightCompact,
} from "../src/shared/contextBar";
import type { PromptCatalog } from "../src/shared/protocol";

describe("contextPercent", () => {
  it("returns the real ratio against the limit", () => {
    expect(contextPercent(100, 400)).toBe(25);
    expect(contextPercent(200, 200)).toBe(100);
  });

  it("can exceed 100 when the model shrank", () => {
    expect(contextPercent(300, 200)).toBe(150);
  });

  it("is null without a usable limit", () => {
    expect(contextPercent(100, null)).toBeNull();
    expect(contextPercent(100, undefined)).toBeNull();
    expect(contextPercent(100, 0)).toBeNull();
    expect(contextPercent(100, -1)).toBeNull();
    expect(contextPercent(100, Number.NaN)).toBeNull();
  });

  it("is null for a nonsensical token total", () => {
    expect(contextPercent(-1, 100)).toBeNull();
    expect(contextPercent(Number.POSITIVE_INFINITY, 100)).toBeNull();
  });
});

describe("contextFillPercent", () => {
  it("clamps to the track", () => {
    expect(contextFillPercent(-10)).toBe(0);
    expect(contextFillPercent(42)).toBe(42);
    expect(contextFillPercent(150)).toBe(100);
    expect(contextFillPercent(null)).toBe(0);
  });
});

describe("contextLevel", () => {
  it("is safe below the warning threshold", () => {
    expect(contextLevel(0)).toBe("safe");
    expect(contextLevel(49.9)).toBe("safe");
  });

  it("warns from 50 up to 75", () => {
    expect(contextLevel(50)).toBe("warn");
    expect(contextLevel(75)).toBe("warn");
  });

  it("is dangerous above 75", () => {
    expect(contextLevel(75.1)).toBe("danger");
    expect(contextLevel(150)).toBe("danger");
  });

  it("is safe when the limit is unknown", () => {
    expect(contextLevel(null)).toBe("safe");
  });
});

describe("shouldHighlightCompact", () => {
  it("stays quiet below 80 percent", () => {
    expect(shouldHighlightCompact(0)).toBe(false);
    expect(shouldHighlightCompact(79.9)).toBe(false);
  });

  it("highlights from 80 percent up", () => {
    expect(shouldHighlightCompact(80)).toBe(true);
    expect(shouldHighlightCompact(130)).toBe(true);
  });

  it("never highlights without a usable limit", () => {
    expect(shouldHighlightCompact(null)).toBe(false);
  });
});

describe("contextGradientSize", () => {
  it("stretches the gradient across the whole track", () => {
    expect(contextGradientSize(50)).toBe("200% 100%");
    expect(contextGradientSize(25)).toBe("400% 100%");
    expect(contextGradientSize(100)).toBe("100% 100%");
  });

  it("falls back to the track size for an empty fill", () => {
    expect(contextGradientSize(0)).toBe("100% 100%");
    expect(contextGradientSize(-5)).toBe("100% 100%");
  });
});

describe("formatTokenCount", () => {
  it("formats thousands and millions", () => {
    expect(formatTokenCount(0)).toBe("0");
    expect(formatTokenCount(999)).toBe("999");
    expect(formatTokenCount(1_000)).toBe("1k");
    expect(formatTokenCount(1_500)).toBe("1.5k");
    expect(formatTokenCount(42_100)).toBe("42.1k");
    expect(formatTokenCount(200_000)).toBe("200k");
    expect(formatTokenCount(1_000_000)).toBe("1M");
    expect(formatTokenCount(1_234_567)).toBe("1.23M");
    expect(formatTokenCount(1_200_000)).toBe("1.2M");
  });
});

describe("formatContextPercent", () => {
  it("rounds to a whole percent", () => {
    expect(formatContextPercent(21.4)).toBe("21%");
    expect(formatContextPercent(21.6)).toBe("22%");
  });
});

describe("formatCompactionDelta", () => {
  it("renders the reduction", () => {
    expect(formatCompactionDelta(43_623, 1_285)).toBe(", from 43.6k to 1.3k");
    expect(formatCompactionDelta(223_791, 1_261)).toBe(", from 223.8k to 1.3k");
  });

  it("is empty when the original size is unknown", () => {
    expect(formatCompactionDelta(0, 1_285)).toBe("");
    expect(formatCompactionDelta(Number.NaN, 1_285)).toBe("");
  });
});

describe("formatContextLabel", () => {
  it("shows used, max, and percent", () => {
    expect(formatContextLabel(42_100, 200_000)).toBe("42.1k / 200k (21%)");
  });

  it("shows n/a without a usable limit", () => {
    expect(formatContextLabel(42_100, null)).toBe("42.1k / n/a");
    expect(formatContextLabel(42_100, 0)).toBe("42.1k / n/a");
  });

  it("still shows the real percent past 100", () => {
    expect(formatContextLabel(260_000, 200_000)).toBe("260k / 200k (130%)");
  });
});

describe("formatContextTooltip", () => {
  it("lists the token breakdown", () => {
    expect(
      formatContextTooltip(
        {
          total: 555,
          input: 100,
          output: 20,
          reasoning: 30,
          cacheRead: 400,
          cacheWrite: 5,
          compacted: false,
        },
        200_000,
      ),
    ).toBe(
      [
        "Total: 555",
        "Input: 100",
        "Output: 20",
        "Reasoning: 30",
        "Cache read: 400",
        "Cache write: 5",
        "Max context: 200k",
      ].join("\n"),
    );
  });

  it("explains a post-compaction reading instead of a turn breakdown", () => {
    expect(
      formatContextTooltip(
        {
          total: 1_285,
          input: 0,
          output: 1_285,
          reasoning: 0,
          cacheRead: 0,
          cacheWrite: 0,
          compacted: true,
        },
        200_000,
      ),
    ).toBe(
      [
        "Compacted summary",
        "Summary: 1.3k",
        "Max context: 200k",
        "Measured again on the next turn",
      ].join("\n"),
    );
  });

  it("marks an unknown limit", () => {
    expect(formatContextTooltip(null, null)).toContain("Max context: unknown");
  });
});

describe("findContextLimit", () => {
  const catalog: PromptCatalog = {
    agents: [],
    models: [
      {
        id: "gpt-5",
        providerID: "openai",
        name: "GPT-5",
        variants: [],
        contextLimit: 400_000,
      },
      { id: "plain", providerID: "openai", name: "Plain", variants: [] },
    ],
    providers: [],
    commands: [],
    skills: [],
    defaultModel: null,
  };

  it("reads the limit of the selected model", () => {
    expect(findContextLimit(catalog, { providerID: "openai", id: "gpt-5" })).toBe(400_000);
  });

  it("is null when the model has no limit", () => {
    expect(findContextLimit(catalog, { providerID: "openai", id: "plain" })).toBeNull();
  });

  it("is null for an unknown model or catalog", () => {
    expect(findContextLimit(catalog, { providerID: "openai", id: "missing" })).toBeNull();
    expect(findContextLimit(null, { providerID: "openai", id: "gpt-5" })).toBeNull();
    expect(findContextLimit(catalog, null)).toBeNull();
  });
});
