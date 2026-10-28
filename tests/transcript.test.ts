import { describe, expect, it } from "vitest";

import { normalizeTranscriptMessages } from "../src/services/transcript";

describe("normalizeTranscriptMessages", () => {
  it("normalizes user and assistant messages", () => {
    const items = normalizeTranscriptMessages([
      {
        id: "user-1",
        type: "user",
        text: "Hello",
        time: { created: 10 },
        files: [
          {
            data: "abc",
            mime: "text/plain",
            source: { type: "file", path: "/tmp/a.txt" },
            name: "a.txt",
          },
        ],
      },
      {
        id: "assistant-1",
        type: "assistant",
        agent: "build",
        model: { id: "gpt", providerID: "openai" },
        time: { created: 20 },
        content: [
          { type: "text", text: "Hi" },
          { type: "reasoning", text: "Thinking" },
          {
            type: "tool",
            id: "tool-1",
            name: "read",
            time: { created: 21 },
            state: {
              status: "completed",
              input: { path: "/tmp/a.txt" },
              content: [{ type: "text", text: "file contents" }],
            },
          },
        ],
      },
    ]);

    expect(items).toMatchObject([
      {
        id: "user-1",
        kind: "user",
        text: "Hello",
        agent: "build",
        attachments: ["a.txt"],
      },
      { id: "assistant-1:0", kind: "assistant", text: "Hi", agent: "build", model: "openai/gpt" },
      { id: "assistant-1:1", kind: "reasoning", text: "Thinking", agent: "build" },
      {
        id: "assistant-1:2",
        kind: "tool",
        name: "read",
        status: "completed",
        input: '{\n  "path": "/tmp/a.txt"\n}',
        output: "file contents",
        agent: "build",
      },
    ]);
  });

  it("derives the user prompt agent from the next assistant reply across messages", () => {
    const items = normalizeTranscriptMessages([
      {
        id: "user-1",
        type: "user",
        text: "Do a thing",
        time: { created: 10 },
      },
      {
        id: "switch-1",
        type: "model-switched",
        time: { created: 15 },
        model: { id: "gpt", providerID: "openai" },
      },
      {
        id: "assistant-1",
        type: "assistant",
        agent: "explore",
        model: { id: "gpt", providerID: "openai" },
        time: { created: 20 },
        content: [{ type: "text", text: "Done" }],
      },
    ]);

    expect(items[0]).toMatchObject({ kind: "user", agent: "explore" });
  });

  it("falls back to the session agent for a prompt with no assistant reply", () => {
    const items = normalizeTranscriptMessages(
      [
        {
          id: "user-1",
          type: "user",
          text: "Still pending",
          time: { created: 10 },
        },
      ],
      "plan",
    );

    expect(items[0]).toMatchObject({ kind: "user", agent: "plan" });
  });

  it("omits the user agent when neither a reply nor a fallback exists", () => {
    const items = normalizeTranscriptMessages([
      {
        id: "user-1",
        type: "user",
        text: "Orphan",
        time: { created: 10 },
      },
    ]);

    expect(items[0]).not.toHaveProperty("agent");
  });

  it("normalizes activity messages", () => {
    const items = normalizeTranscriptMessages([
      {
        id: "idle-1",
        type: "idle",
        time: { created: 30 },
        outcome: "succeeded",
      },
    ]);

    expect(items).toEqual([
      {
        id: "idle-1",
        kind: "activity",
        timestamp: 30,
        label: "Session succeeded",
        detail: undefined,
      },
    ]);
  });

  it("normalises a completed compaction into its own item with the summary", () => {
    const items = normalizeTranscriptMessages([
      {
        id: "a1",
        type: "assistant",
        agent: "build",
        model: { id: "gpt", providerID: "openai" },
        time: { created: 30 },
        content: [{ type: "text", text: "before compaction" }],
        tokens: {
          input: 38_000,
          output: 5_600,
          reasoning: 23,
          cache: { read: 0, write: 0 },
        },
      },
      {
        id: "cmp-1",
        type: "compaction",
        time: { created: 40 },
        status: "completed",
        reason: "manual",
        tokens: {
          input: 1_159,
          output: 1_285,
          reasoning: 11,
          cache: { read: 43_173, write: 0 },
        },
        summary: "## Objective\n- Build the extension",
      },
    ]);

    expect(items).toEqual([
      {
        id: "a1:0",
        kind: "assistant",
        timestamp: 30,
        text: "before compaction",
        agent: "build",
        model: "openai/gpt",
      },
      {
        id: "cmp-1",
        kind: "compaction",
        timestamp: 40,
        status: "completed",
        reason: "manual",
        fromTokens: 43_623,
        toTokens: 1_285,
        summary: "## Objective\n- Build the extension",
      },
    ]);
  });

  it("falls back to the summarisation prompt when no earlier turn is in the page", () => {
    const items = normalizeTranscriptMessages([
      {
        id: "cmp-1",
        type: "compaction",
        time: { created: 40 },
        status: "completed",
        reason: "auto",
        tokens: {
          input: 975,
          output: 1_261,
          reasoning: 224,
          cache: { read: 222_816, write: 0 },
        },
        summary: "summary",
      },
    ]);

    expect(items[0]).toMatchObject({ fromTokens: 223_791, toTokens: 1_261 });
  });

  it("carries the error for a failed compaction and omits a missing summary", () => {
    const items = normalizeTranscriptMessages([
      {
        id: "cmp-2",
        type: "compaction",
        time: { created: 50 },
        status: "failed",
        reason: "auto",
        error: { message: "Provider rejected the summary request." },
      },
    ]);

    expect(items).toEqual([
      {
        id: "cmp-2",
        kind: "compaction",
        timestamp: 50,
        status: "failed",
        reason: "auto",
        fromTokens: 0,
        toTokens: 0,
        error: "Provider rejected the summary request.",
      },
    ]);
  });
});
