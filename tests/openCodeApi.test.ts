import { ClientError, type OpenCodeClient } from "@opencode/client";
import { describe, expect, it } from "vitest";

import { basicAuthHeader, normalizeServerUrl, toApiError } from "../src/services/openCodeApi";

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

  it("prompts with only the session ID and text", async () => {
    const calls: unknown[] = [];
    const client = {
      session: {
        prompt: async (input: unknown) => {
          calls.push(input);
          return { data: {} };
        },
      },
    } as unknown as OpenCodeClient;

    const { OpenCodeApi } = await import("../src/services/openCodeApi");
    const api = new OpenCodeApi({ serverUrl: "http://localhost:4096", password: "secret" }, client);
    await api.prompt("ses_1", "hello");

    expect(calls).toEqual([{ sessionID: "ses_1", text: "hello" }]);
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
});
