import { ClientError, type OpenCodeClient } from "@opencode/client";
import { describe, expect, it } from "vitest";

import { basicAuthHeader, normalizeServerUrl, toApiError } from "../src/services/openCodeApi";
import { AGENT_COLOR_PALETTE } from "../src/shared/agentColor";

describe("normalizeServerUrl", () => {
  it("adds http and removes trailing slashes", () => {
    expect(normalizeServerUrl("localhost:4096/")).toBe("http://localhost:4096/");
    expect(normalizeServerUrl("https://example.com/open-code//")).toBe(
      "https://example.com/open-code",
    );
  });

  it("rejects non-http protocols", () => {
    expect(() => normalizeServerUrl("ftp://example.com")).toThrow(
      "Server URL must use http or https.",
    );
  });
});

describe("basicAuthHeader", () => {
  it("uses the OpenCode basic auth username", () => {
    expect(basicAuthHeader("secret")).toBe(
      `Basic ${Buffer.from("opencode:secret").toString("base64")}`,
    );
  });
});

describe("toApiError", () => {
  it("classifies unauthorized errors as auth", () => {
    const error = Object.assign(new Error("nope"), { _tag: "UnauthorizedError" });

    expect(toApiError(error)).toEqual({ kind: "auth", message: "nope" });
  });

  it("classifies transport failures as network", () => {
    const error = new ClientError("Transport", { cause: new Error("ECONNREFUSED") });

    expect(toApiError(error).kind).toBe("network");
  });

  it("classifies timeout aborts as timeout", () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    const error = new ClientError("Transport", { cause: abort });

    expect(toApiError(error).kind).toBe("timeout");
  });
});

describe("OpenCodeApi mutations", () => {
  it("creates a session with only the workspace location", async () => {
    const calls: unknown[] = [];
    const client = {
      session: {
        create: async (input: unknown) => {
          calls.push(input);
          return {
            id: "ses_1",
            projectID: "project_1",
            cost: 0,
            tokens: {
              input: 0,
              output: 0,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
            time: { created: 10, updated: 20 },
            title: "New session",
            location: { directory: "/workspace" },
          };
        },
      },
    } as unknown as OpenCodeClient;

    const { OpenCodeApi } = await import("../src/services/openCodeApi");
    const api = new OpenCodeApi({ serverUrl: "http://localhost:4096", password: "secret" }, client);
    const session = await api.createSession("/workspace");

    expect(calls).toEqual([{ location: { directory: "/workspace" } }]);
    expect(session).toEqual({ id: "ses_1", title: "New session", updatedAt: 20 });
  });

  it("switches agent and model before prompting", async () => {
    const calls: Array<[string, unknown]> = [];
    const client = {
      session: {
        switchAgent: async (input: unknown) => {
          calls.push(["agent", input]);
        },
        switchModel: async (input: unknown) => {
          calls.push(["model", input]);
        },
        prompt: async (input: unknown) => {
          calls.push(["prompt", input]);
          return { data: {} };
        },
      },
    } as unknown as OpenCodeClient;

    const { OpenCodeApi } = await import("../src/services/openCodeApi");
    const api = new OpenCodeApi({ serverUrl: "http://localhost:4096", password: "secret" }, client);
    await api.prompt(
      "ses_1",
      "hello",
      [{ uri: "data:text/plain;base64,aGk=", name: "note.txt" }],
      [],
      {
        agent: "build",
        model: { providerID: "openai", id: "gpt-5", variant: "high" },
      },
    );

    expect(calls).toEqual([
      ["agent", { sessionID: "ses_1", agent: "build" }],
      [
        "model",
        {
          sessionID: "ses_1",
          model: { providerID: "openai", id: "gpt-5", variant: "high" },
        },
      ],
      [
        "prompt",
        {
          sessionID: "ses_1",
          text: "hello",
          files: [{ uri: "data:text/plain;base64,aGk=", name: "note.txt" }],
        },
      ],
    ]);
  });

  it("sends native skill attachments with the prompt", async () => {
    const calls: Array<[string, unknown]> = [];
    const client = {
      session: {
        switchAgent: async (input: unknown) => {
          calls.push(["agent", input]);
        },
        switchModel: async (input: unknown) => {
          calls.push(["model", input]);
        },
        prompt: async (input: unknown) => {
          calls.push(["prompt", input]);
          return { data: {} };
        },
      },
    } as unknown as OpenCodeClient;

    const { OpenCodeApi } = await import("../src/services/openCodeApi");
    const api = new OpenCodeApi({ serverUrl: "http://localhost:4096", password: "secret" }, client);
    await api.prompt("ses_1", "/release prepare v2", [], [{ id: "release" }], {
      agent: "build",
      model: { providerID: "openai", id: "gpt-5" },
    });

    expect(calls[2]).toEqual([
      "prompt",
      {
        sessionID: "ses_1",
        text: "/release prepare v2",
        skills: [{ id: "release" }],
      },
    ]);
  });

  it("loads selectable agents, models, providers, and the default model", async () => {
    const inputs: unknown[] = [];
    const location = { location: { directory: "/workspace" } };
    const client = {
      agent: {
        list: async (input: unknown) => {
          inputs.push(input);
          return {
            data: [
              {
                id: "build",
                name: "Build",
                mode: "primary",
                hidden: false,
                model: { providerID: "openai", id: "gpt-5", variant: "high" },
              },
              { id: "task", name: "Task", mode: "subagent", hidden: false },
              { id: "plan", name: "Plan", mode: "primary", hidden: false },
              { id: "hidden", name: "Hidden", mode: "all", hidden: true },
            ],
          };
        },
      },
      model: {
        list: async (input: unknown) => {
          inputs.push(input);
          return {
            data: [
              {
                id: "gpt-5",
                providerID: "openai",
                name: "GPT-5",
                enabled: true,
                variants: [{ id: "high" }, { id: "low" }],
              },
              {
                id: "disabled",
                providerID: "openai",
                name: "Disabled",
                enabled: false,
                variants: [],
              },
              {
                id: "unavailable",
                providerID: "disabled",
                name: "Unavailable",
                enabled: true,
                variants: [],
              },
            ],
          };
        },
        default: async (input: unknown) => {
          inputs.push(input);
          return { data: { id: "gpt-5", providerID: "openai" } };
        },
      },
      provider: {
        list: async (input: unknown) => {
          inputs.push(input);
          return {
            data: [
              { id: "openai", name: "OpenAI", activation: "enabled" },
              { id: "disabled", name: "Disabled", activation: "disabled" },
            ],
          };
        },
      },
      skill: {
        list: async (input: unknown) => {
          inputs.push(input);
          return {
            data: [
              {
                id: "release",
                name: "Git Release",
                description: "Prepare a repository release",
                autoinvoke: false,
                path: "/workspace/.opencode/skills/release/SKILL.md",
                content: "Release workflow",
              },
            ],
          };
        },
      },
    } as unknown as OpenCodeClient;

    const { OpenCodeApi } = await import("../src/services/openCodeApi");
    const api = new OpenCodeApi({ serverUrl: "http://localhost:4096", password: "secret" }, client);

    await expect(api.getPromptCatalog("/workspace")).resolves.toEqual({
      agents: [
        {
          id: "build",
          name: "Build",
          color: AGENT_COLOR_PALETTE[0],
          model: { providerID: "openai", id: "gpt-5", variant: "high" },
        },
        {
          id: "plan",
          name: "Plan",
          // Palette index 2: the visible `task` subagent occupies index 1 (TUI parity).
          color: AGENT_COLOR_PALETTE[2],
        },
      ],
      models: [
        {
          id: "gpt-5",
          providerID: "openai",
          name: "GPT-5",
          variants: ["high", "low"],
        },
      ],
      providers: [{ id: "openai", name: "OpenAI" }],
      skills: [{ id: "release", name: "Git Release" }],
      defaultModel: { providerID: "openai", id: "gpt-5" },
    });
    expect(inputs).toEqual([location, location, location, location, location]);
  });

  it("reads active session IDs", async () => {
    const client = {
      session: {
        active: async () => ({
          ses_1: { type: "running" },
          ses_2: { type: "running" },
        }),
      },
    } as unknown as OpenCodeClient;

    const { OpenCodeApi } = await import("../src/services/openCodeApi");
    const api = new OpenCodeApi({ serverUrl: "http://localhost:4096", password: "secret" }, client);

    expect(await api.getActiveSessionIds()).toEqual(new Set(["ses_1", "ses_2"]));
  });

  it("prefers the input limit and falls back to the context limit", async () => {
    const client = {
      agent: { list: async () => ({ data: [] }) },
      model: {
        list: async () => ({
          data: [
            {
              id: "with-input",
              providerID: "openai",
              name: "With Input",
              enabled: true,
              variants: [],
              limit: { context: 400_000, input: 272_000, output: 128_000 },
            },
            {
              id: "context-only",
              providerID: "openai",
              name: "Context Only",
              enabled: true,
              variants: [],
              limit: { context: 200_000, output: 64_000 },
            },
            {
              id: "zero-limit",
              providerID: "openai",
              name: "Zero Limit",
              enabled: true,
              variants: [],
              limit: { context: 0, output: 0 },
            },
          ],
        }),
        default: async () => ({ data: null }),
      },
      provider: {
        list: async () => ({ data: [{ id: "openai", name: "OpenAI", activation: "enabled" }] }),
      },
      skill: { list: async () => ({ data: [] }) },
    } as unknown as OpenCodeClient;

    const { OpenCodeApi } = await import("../src/services/openCodeApi");
    const api = new OpenCodeApi({ serverUrl: "http://localhost:4096", password: "secret" }, client);
    const catalog = await api.getPromptCatalog("/workspace");

    expect(catalog.models.map((model) => [model.id, model.contextLimit])).toEqual([
      ["with-input", 272_000],
      ["context-only", 200_000],
      ["zero-limit", undefined],
    ]);
  });

  it("returns transcript items with the session context usage", async () => {
    const calls: unknown[] = [];
    const client = {
      message: {
        list: async (input: unknown) => {
          calls.push(input);
          return {
            data: [
              {
                id: "a2",
                type: "assistant",
                agent: "build",
                model: { id: "gpt", providerID: "openai" },
                time: { created: 30 },
                content: [{ type: "text", text: "latest" }],
                tokens: {
                  input: 500,
                  output: 40,
                  reasoning: 10,
                  cache: { read: 1_000, write: 0 },
                },
              },
              {
                id: "a1",
                type: "assistant",
                agent: "build",
                model: { id: "gpt", providerID: "openai" },
                time: { created: 10 },
                content: [{ type: "text", text: "older" }],
                tokens: {
                  input: 100,
                  output: 10,
                  reasoning: 0,
                  cache: { read: 0, write: 0 },
                },
              },
            ],
          };
        },
      },
    } as unknown as OpenCodeClient;

    const { OpenCodeApi } = await import("../src/services/openCodeApi");
    const api = new OpenCodeApi({ serverUrl: "http://localhost:4096", password: "secret" }, client);
    const snapshot = await api.listMessages("ses_1");

    expect(calls).toEqual([{ sessionID: "ses_1", limit: 50, order: "desc" }]);
    expect(snapshot.items.map((item) => item.id)).toEqual(["a1:0", "a2:0"]);
    expect(snapshot.usage?.total).toBe(1_550);
    expect(snapshot.messages.map((message) => message.id)).toEqual(["a1", "a2"]);
  });

  it("compacts a session through the native endpoint", async () => {
    const calls: unknown[] = [];
    const client = {
      session: {
        compact: async (input: unknown) => {
          calls.push(input);
          return { data: { id: "msg_1" } };
        },
      },
    } as unknown as OpenCodeClient;

    const { OpenCodeApi } = await import("../src/services/openCodeApi");
    const api = new OpenCodeApi({ serverUrl: "http://localhost:4096", password: "secret" }, client);
    await api.compactSession("ses_1");

    expect(calls).toEqual([{ sessionID: "ses_1" }]);
  });
});
