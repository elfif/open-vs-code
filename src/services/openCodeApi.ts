import {
  ClientError,
  OpenCode,
  isForbiddenError,
  isUnauthorizedError,
  type ModelRef,
  type SessionInfo,
  type SessionMessageInfo,
} from "@opencode/client";

import type {
  PromptFileAttachmentInput,
  PromptSkillAttachmentInput,
} from "../shared/promptDocuments";
import type {
  PromptCatalog,
  PromptModel,
  PromptSelection,
  SessionListItem,
  TranscriptItem,
} from "../shared/protocol";
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

  public constructor(credential: OpenCodeCredential, client?: ReturnType<typeof OpenCode.make>) {
    this.client =
      client ??
      OpenCode.make({
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

  public async createSession(directory: string, signal?: AbortSignal): Promise<SessionListItem> {
    const response = await this.client.session.create(
      {
        location: { directory },
      },
      { signal },
    );

    return toSessionListItem(response);
  }

  public async getPromptCatalog(directory: string, signal?: AbortSignal): Promise<PromptCatalog> {
    const [agents, models, providers, skills, defaultModel] = await Promise.all([
      this.client.agent.list({ location: { directory } }, { signal }),
      this.client.model.list({ location: { directory } }, { signal }),
      this.client.provider.list({ location: { directory } }, { signal }),
      this.client.skill.list({ location: { directory } }, { signal }),
      this.client.model
        .default({ location: { directory } }, { signal })
        .catch(() => ({ data: null })),
    ]);
    const availableProviderIds = new Set(
      providers.data
        .filter((provider) => provider.activation !== "disabled")
        .map((provider) => provider.id),
    );

    return {
      agents: agents.data
        .filter((agent) => !agent.hidden && agent.mode !== "subagent")
        .map((agent) => ({
          id: agent.id,
          name: agent.name,
          ...(agent.model ? { model: toPromptModel(agent.model) } : {}),
        })),
      models: models.data
        .filter((model) => model.enabled && availableProviderIds.has(model.providerID))
        .map((model) => ({
          id: model.id,
          providerID: model.providerID,
          name: model.name,
          variants: model.variants.map((variant) => variant.id),
        })),
      providers: providers.data
        .filter((provider) => provider.activation !== "disabled")
        .map((provider) => ({ id: provider.id, name: provider.name })),
      skills: skills.data.map((skill) => ({ id: skill.id, name: skill.name })),
      defaultModel: defaultModel.data ? toPromptModel(defaultModel.data) : null,
    };
  }

  public async prompt(
    sessionID: string,
    text: string,
    files: readonly PromptFileAttachmentInput[],
    skills: readonly PromptSkillAttachmentInput[],
    selection: PromptSelection,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.client.session.switchAgent({ sessionID, agent: selection.agent }, { signal });
    await this.client.session.switchModel({ sessionID, model: selection.model }, { signal });
    await this.client.session.prompt(
      {
        sessionID,
        text,
        ...(files.length > 0 ? { files } : {}),
        ...(skills.length > 0 ? { skills } : {}),
      },
      { signal },
    );
  }

  public async getActiveSessionIds(signal?: AbortSignal): Promise<Set<string>> {
    const response = await this.client.session.active({ signal });
    return new Set(Object.keys(response));
  }
}

function toSessionListItem(session: SessionInfo): SessionListItem {
  return {
    id: session.id,
    title: session.title?.trim() || "Untitled session",
    updatedAt: session.time.updated ?? session.time.created,
    ...(session.agent ? { agent: session.agent } : {}),
    ...(session.model ? { model: toPromptModel(session.model) } : {}),
  };
}

function toPromptModel(model: ModelRef): PromptModel {
  return {
    providerID: model.providerID,
    id: model.id,
    ...(model.variant ? { variant: model.variant } : {}),
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
