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
      { id: "user-1", kind: "user", text: "Hello", attachments: ["a.txt"] },
      { id: "assistant-1:0", kind: "assistant", text: "Hi", agent: "build", model: "openai/gpt" },
      { id: "assistant-1:1", kind: "reasoning", text: "Thinking" },
      {
        id: "assistant-1:2",
        kind: "tool",
        name: "read",
        status: "completed",
        input: '{\n  "path": "/tmp/a.txt"\n}',
        output: "file contents",
      },
    ]);
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
});
