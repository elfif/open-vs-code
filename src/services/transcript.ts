import type {
  ModelRef,
  PromptFileAttachment,
  SessionMessageAssistant,
  SessionMessageAssistantTool,
  SessionMessageInfo,
  SessionMessageUser,
  SessionMessageToolStateCompleted,
  SessionMessageToolStateError,
  ToolContent,
} from "@opencode/client";

import type { TranscriptItem } from "../shared/protocol";
import { compactionSizes } from "./contextUsage";

export function normalizeTranscriptMessages(
  messages: readonly SessionMessageInfo[],
): TranscriptItem[] {
  return messages.flatMap((message, index) => toTranscriptItems(message, index, messages));
}

function toTranscriptItems(
  message: SessionMessageInfo,
  index: number,
  messages: readonly SessionMessageInfo[],
): TranscriptItem[] {
  switch (message.type) {
    case "user":
      return [toUserItem(message)];
    case "assistant":
      return toAssistantItems(message);
    case "agent-switched":
      return [
        activity(
          message.id,
          message.time.created,
          `Agent switched to ${message.agent}`,
          message.previous,
        ),
      ];
    case "model-switched":
      return [
        activity(
          message.id,
          message.time.created,
          `Model switched to ${formatModel(message.model)}`,
          message.previous ? formatModel(message.previous) : undefined,
        ),
      ];
    case "location-switched":
      return [
        activity(
          message.id,
          message.time.created,
          `Location switched to ${message.location.directory}`,
          message.previous?.location.directory,
        ),
      ];
    case "synthetic":
      return [activity(message.id, message.time.created, "Synthetic message", message.text)];
    case "system":
      return [activity(message.id, message.time.created, "System message", message.text)];
    case "skill":
      return [
        activity(
          message.id,
          message.time.created,
          `Skill activated: ${message.name}`,
          message.text,
        ),
      ];
    case "shell":
      return [
        activity(
          message.id,
          message.time.created,
          `Shell ${message.status}: ${message.command}`,
          message.output?.output,
        ),
      ];
    case "compaction": {
      const summary = "summary" in message ? message.summary : undefined;
      const { fromTokens, toTokens } = compactionSizes(messages, index);

      return [
        {
          id: message.id,
          kind: "compaction",
          timestamp: message.time.created,
          status: message.status,
          reason: message.reason,
          fromTokens,
          toTokens,
          ...(summary ? { summary } : {}),
          ...("error" in message && message.error ? { error: message.error.message } : {}),
        },
      ];
    }
    case "idle":
      return [
        activity(
          message.id,
          message.time.created,
          `Session ${message.outcome}`,
          message.error?.message,
        ),
      ];
  }
}

function toUserItem(message: SessionMessageUser): TranscriptItem {
  return {
    id: message.id,
    kind: "user",
    timestamp: message.time.created,
    text: message.text,
    attachments: [
      ...(message.files ?? []).map(fileAttachmentLabel),
      ...(message.agents ?? []).map((agent) => `@${agent.name}`),
      ...(message.skills ?? []).map((skill) => `skill:${skill.name}`),
    ],
  };
}

function toAssistantItems(message: SessionMessageAssistant): TranscriptItem[] {
  const error = message.error?.message;

  return message.content.map((content, index): TranscriptItem => {
    const id = `${message.id}:${index}`;

    if (content.type === "text") {
      return {
        id,
        kind: "assistant",
        timestamp: message.time.created,
        text: content.text,
        agent: message.agent,
        model: formatModel(message.model),
        error,
      };
    }

    if (content.type === "reasoning") {
      return {
        id,
        kind: "reasoning",
        timestamp: content.time?.created ?? message.time.created,
        text: content.text,
      };
    }

    return toToolItem(id, content);
  });
}

function toToolItem(id: string, tool: SessionMessageAssistantTool): TranscriptItem {
  return {
    id,
    kind: "tool",
    timestamp: tool.time.created,
    name: tool.name,
    status: tool.state.status,
    input: stringifyInput(tool.state),
    output: stringifyOutput(tool.state),
  };
}

function stringifyInput(state: SessionMessageAssistantTool["state"]): string {
  if (state.status === "streaming") {
    return state.input;
  }

  return stringifyJsonValue(state.input);
}

function stringifyOutput(state: SessionMessageAssistantTool["state"]): string {
  if (state.status !== "completed" && state.status !== "error") {
    return "";
  }

  return toolContentToText(state);
}

function toolContentToText(
  state: SessionMessageToolStateCompleted | SessionMessageToolStateError,
): string {
  return (state.content ?? []).map(toolContentLabel).join("\n");
}

function toolContentLabel(content: ToolContent): string {
  if (content.type === "text") {
    return content.text;
  }

  return `${content.name ?? "file"} (${content.mime})`;
}

function fileAttachmentLabel(file: PromptFileAttachment): string {
  return file.name ?? file.mime;
}

function activity(id: string, timestamp: number, label: string, detail?: string): TranscriptItem {
  return {
    id,
    kind: "activity",
    timestamp,
    label,
    detail: detail?.trim() || undefined,
  };
}

function formatModel(model: ModelRef): string {
  return [model.providerID, model.id, model.variant].filter(Boolean).join("/");
}

function stringifyJsonValue(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? "";
  } catch {
    return String(value);
  }
}
