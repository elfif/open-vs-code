import {
  ClientError,
  OpenCode,
  isForbiddenError,
  isUnauthorizedError,
  type SessionInfo,
  type SessionMessageInfo,
} from "@opencode/client";

import type { SessionListItem, TranscriptItem } from "../shared/protocol";
import { normalizeTranscriptMessages } from "./transcript";

export const SESSION_PAGE_SIZE = 50;
export const MESSAGE_PAGE_SIZE = 50;

export type ApiErrorKind = "auth" | "network" | "timeout" | "server";

export interface ApiError {
  readonly kind: ApiErrorKind;
  readonly message: string;
}

export interface OpenCodeCredential {
  readonly serverUrl: string;
  readonly password: string;
}

export function normalizeServerUrl(input: string): string {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new Error("Server URL is required.");
  }

  const withProtocol = trimmed.includes("://") ? trimmed : `http://${trimmed}`;
  let url: URL;

  try {
    url = new URL(withProtocol);
  } catch {
    throw new Error("Enter a valid OpenCode server URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Server URL must use http or https.");
  }

  if (!url.hostname) {
    throw new Error("Server URL must include a host.");
  }

  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "");

  return url.toString();
}

export function basicAuthHeader(password: string): string {
  return `Basic ${Buffer.from(`opencode:${password}`, "utf8").toString("base64")}`;
}

export function toApiError(error: unknown): ApiError {
  if (isUnauthorizedError(error) || isForbiddenError(error)) {
    return { kind: "auth", message: errorMessage(error) ?? "Authentication failed." };
  }

  if (error instanceof ClientError) {
    if (error.reason === "Transport") {
      if (isAbortError(error.cause)) {
        return { kind: "timeout", message: "The OpenCode server request timed out." };
      }

      return {
        kind: "network",
        message: "Could not reach the OpenCode server. Check that it is running and reachable.",
      };
    }

    if (error.reason === "UnexpectedStatus") {
      const status = statusFromCause(error.cause);

      if (status === 401 || status === 403) {
        return { kind: "auth", message: "OpenCode rejected the server password." };
      }

      return {
        kind: "server",
        message: status
          ? `OpenCode server returned HTTP ${status}.`
          : "OpenCode returned an unexpected response.",
      };
    }

    return { kind: "server", message: error.message };
  }

  if (isAbortError(error)) {
    return { kind: "timeout", message: "The OpenCode server request timed out." };
  }

  return { kind: "server", message: errorMessage(error) ?? "OpenCode request failed." };
}

export class OpenCodeApi {
  private readonly client: ReturnType<typeof OpenCode.make>;

  public constructor(credential: OpenCodeCredential) {
    this.client = OpenCode.make({
      baseUrl: normalizeServerUrl(credential.serverUrl),
      headers: {
        authorization: basicAuthHeader(credential.password),
      },
    });
  }

  public async validateConnection(signal?: AbortSignal): Promise<string> {
    const info = await this.client.server.info({ signal });
    return info.version;
  }

  public async listSessions(directory: string, signal?: AbortSignal): Promise<SessionListItem[]> {
    const response = await this.client.session.list(
      {
        directory,
        limit: SESSION_PAGE_SIZE,
        order: "desc",
      },
      { signal },
    );

    return response.data.map(toSessionListItem);
  }

  public async listMessages(sessionID: string, signal?: AbortSignal): Promise<TranscriptItem[]> {
    const response = await this.client.message.list(
      {
        sessionID,
        limit: MESSAGE_PAGE_SIZE,
        order: "desc",
      },
      { signal },
    );

    return normalizeTranscriptMessages([...response.data].reverse());
  }
}

function toSessionListItem(session: SessionInfo): SessionListItem {
  return {
    id: session.id,
    title: session.title?.trim() || "Untitled session",
    updatedAt: session.time.updated ?? session.time.created,
  };
}

function errorMessage(error: unknown): string | undefined {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = error.message;

    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }

  return undefined;
}

function isAbortError(value: unknown): boolean {
  return value instanceof Error && (value.name === "AbortError" || value.name === "TimeoutError");
}

function statusFromCause(value: unknown): number | undefined {
  if (typeof value === "object" && value !== null && "status" in value) {
    const status = value.status;

    if (typeof status === "number") {
      return status;
    }
  }

  return undefined;
}

export type { SessionMessageInfo };
