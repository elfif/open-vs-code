import { formatBytes } from "./promptDocuments";
import type {
  PromptContextSegment,
  PromptSegment,
  PromptSelectionSegment,
  PromptTextSegment,
} from "./promptTypes";

export type {
  PromptContextSegment,
  PromptDocumentSegment,
  PromptSegment,
  PromptSelectionSegment,
  PromptSkillSegment,
  PromptTextSegment,
} from "./promptTypes";

const PREVIEW_LINE_LIMIT = 12;

export function formatBadgeLabel(segment: PromptContextSegment): string {
  if (segment.kind === "skill") {
    return `/${segment.id}`;
  }

  if (segment.kind === "document") {
    return `${segment.name} (${formatBytes(segment.size)})`;
  }

  const filename = segment.path.split(/[\\/]/).pop() || segment.path;

  return segment.startLine === segment.endLine
    ? `${filename} - l${segment.startLine}`
    : `${filename} - l${segment.startLine} - ${segment.endLine}`;
}

export function formatBadgePreview(segment: PromptContextSegment): string {
  if (segment.kind === "skill") {
    return `Skill: ${segment.name}\nID: ${segment.id}`;
  }

  if (segment.kind === "document") {
    return `${segment.path || segment.name}\n${segment.mime} • ${formatBytes(segment.size)}`;
  }

  const lines = segment.code.split("\n");
  const visibleCode = lines.slice(0, PREVIEW_LINE_LIMIT).join("\n");
  const remainingLines = Math.max(0, lines.length - PREVIEW_LINE_LIMIT);
  const range =
    segment.startLine === segment.endLine
      ? `line: ${segment.startLine}`
      : `lines: ${segment.startLine} - ${segment.endLine}`;

  return `${segment.path} (${range})\n${visibleCode}${
    remainingLines > 0 ? `\n… (+${remainingLines} more lines)` : ""
  }`;
}

export function isPromptEmpty(segments: readonly PromptSegment[]): boolean {
  return segments.every((segment) => segment.kind === "text" && segment.text.trim().length === 0);
}

export function isPromptSegment(value: unknown): value is PromptSegment {
  if (typeof value !== "object" || value === null || !("kind" in value)) {
    return false;
  }

  switch (value.kind) {
    case "text":
      return "text" in value && typeof value.text === "string";
    case "document":
      return (
        "id" in value &&
        "name" in value &&
        "mime" in value &&
        "size" in value &&
        typeof value.id === "string" &&
        typeof value.name === "string" &&
        typeof value.mime === "string" &&
        typeof value.size === "number" &&
        (!("path" in value) || typeof value.path === "string")
      );
    case "skill":
      return (
        "id" in value &&
        "name" in value &&
        typeof value.id === "string" &&
        value.id.length > 0 &&
        typeof value.name === "string"
      );
    case "selection":
      return (
        "path" in value &&
        "startLine" in value &&
        "endLine" in value &&
        "code" in value &&
        "languageId" in value &&
        typeof value.path === "string" &&
        typeof value.startLine === "number" &&
        Number.isInteger(value.startLine) &&
        value.startLine >= 1 &&
        typeof value.endLine === "number" &&
        Number.isInteger(value.endLine) &&
        value.endLine >= value.startLine &&
        typeof value.code === "string" &&
        typeof value.languageId === "string"
      );
    default:
      return false;
  }
}

export function isPromptSelectionSegment(value: unknown): value is PromptSelectionSegment {
  return isPromptSegment(value) && value.kind === "selection";
}

export function isPromptTextSegment(value: unknown): value is PromptTextSegment {
  return isPromptSegment(value) && value.kind === "text";
}
