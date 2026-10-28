import { describe, expect, it } from "vitest";

import { groupTranscriptToolCalls } from "../webview/src/lib/transcriptGroups";
import type { TranscriptItem } from "../src/shared/protocol";

const tool = (id: string, agent: string | null = "build", name = "read"): TranscriptItem => ({
  id,
  kind: "tool",
  timestamp: 1,
  name,
  status: "completed",
  input: "",
  output: "",
  ...(agent === null ? {} : { agent }),
});

describe("groupTranscriptToolCalls", () => {
  it("groups adjacent tool calls from the same agent", () => {
    const items = [
      tool("tool-1"),
      tool("tool-2"),
      tool("tool-3", "build", "grep"),
      tool("tool-4"),
      tool("tool-5"),
      tool("tool-6", "build", "blob"),
    ];

    expect(groupTranscriptToolCalls(items)).toEqual([
      {
        kind: "tool-group",
        id: "tool-group:tool-1",
        agent: "build",
        items,
      },
    ]);
  });

  it("leaves a single tool call ungrouped", () => {
    const items = [tool("tool-1")];

    expect(groupTranscriptToolCalls(items)).toEqual([
      {
        kind: "item",
        id: "tool-1",
        item: items[0],
      },
    ]);
  });

  it("splits groups at non-tool transcript entries", () => {
    const reasoning: TranscriptItem = {
      id: "reasoning-1",
      kind: "reasoning",
      timestamp: 2,
      text: "Thinking",
      agent: "build",
    };

    expect(
      groupTranscriptToolCalls([tool("tool-1"), tool("tool-2"), reasoning, tool("tool-3")]),
    ).toEqual([
      {
        kind: "tool-group",
        id: "tool-group:tool-1",
        agent: "build",
        items: [tool("tool-1"), tool("tool-2")],
      },
      { kind: "item", id: "reasoning-1", item: reasoning },
      { kind: "item", id: "tool-3", item: tool("tool-3") },
    ]);
  });

  it("splits adjacent tool calls when the agent changes", () => {
    expect(
      groupTranscriptToolCalls([
        tool("tool-1", "build"),
        tool("tool-2", "build"),
        tool("tool-3", "explore"),
        tool("tool-4", "explore"),
      ]),
    ).toEqual([
      {
        kind: "tool-group",
        id: "tool-group:tool-1",
        agent: "build",
        items: [tool("tool-1", "build"), tool("tool-2", "build")],
      },
      {
        kind: "tool-group",
        id: "tool-group:tool-3",
        agent: "explore",
        items: [tool("tool-3", "explore"), tool("tool-4", "explore")],
      },
    ]);
  });

  it("groups adjacent tools without an agent together", () => {
    const items = [tool("tool-1", null), tool("tool-2", null)];

    expect(groupTranscriptToolCalls(items)).toEqual([
      {
        kind: "tool-group",
        id: "tool-group:tool-1",
        items,
      },
    ]);
  });
});
