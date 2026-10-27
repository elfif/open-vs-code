import { ClientError } from "@opencode/client";
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
