export type PromptSegment =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "file"; readonly path: string }
  | {
      readonly kind: "selection";
      readonly path: string;
      readonly startLine: number;
      readonly endLine: number;
      readonly code: string;
      readonly languageId: string;
    };

export type PromptContextSegment = Exclude<PromptSegment, { readonly kind: "text" }>;

const PREVIEW_LINE_LIMIT = 12;

export function formatBadgeLabel(segment: PromptContextSegment): string {
  const filename = segment.path.split(/[\\/]/).pop() || segment.path;

  if (segment.kind === "file") {
    return filename;
  }

  return segment.startLine === segment.endLine
    ? `${filename} - l${segment.startLine}`
    : `${filename} - l${segment.startLine} - ${segment.endLine}`;
}

export function formatBadgePreview(segment: PromptContextSegment): string {
  if (segment.kind === "file") {
    return segment.path;
  }

  const lines = segment.code.split("\n");
  const visibleCode = lines.slice(0, PREVIEW_LINE_LIMIT).join("\n");
  const remainingLines = Math.max(0, lines.length - PREVIEW_LINE_LIMIT);
  const range =
    segment.startLine === segment.endLine
      ? `line ${segment.startLine}`
      : `lines ${segment.startLine} - ${segment.endLine}`;

  return `${segment.path} (${range})\n${visibleCode}${
    remainingLines > 0 ? `\n… (+${remainingLines} more lines)` : ""
  }`;
}

export function serializePrompt(segments: readonly PromptSegment[]): string {
  let output = "";
  let previousWasBlock = false;

  for (const segment of segments) {
    if (segment.kind === "text" && segment.text.length === 0) {
      continue;
    }

    const content =
      segment.kind === "selection"
        ? formatSelection(segment)
        : segment.kind === "file"
          ? segment.path
          : segment.text;
    const isBlock = segment.kind === "selection";

    if (output.length > 0 && content.length > 0 && (isBlock || previousWasBlock)) {
      const trailingNewlines = output.match(/\n*$/)?.[0].length ?? 0;
      const leadingNewlines = content.match(/^\n*/)?.[0].length ?? 0;
      output += "\n".repeat(Math.max(0, 2 - trailingNewlines - leadingNewlines));
    }

    output += content;
    previousWasBlock = isBlock;
  }

  return output.trim();
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
    case "file":
      return "path" in value && typeof value.path === "string";
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

function formatSelection(segment: Extract<PromptSegment, { readonly kind: "selection" }>): string {
  const range =
    segment.startLine === segment.endLine
      ? `${segment.startLine}`
      : `${segment.startLine} - ${segment.endLine}`;
  const longestBacktickRun = (segment.code.match(/`+/g) ?? []).reduce(
    (longest, run) => Math.max(longest, run.length),
    0,
  );
  const fence = "`".repeat(Math.max(3, longestBacktickRun + 1));
  const codeEnding = segment.code.endsWith("\n") ? "" : "\n";

  return `### File content\nfile: ${segment.path} (lines: ${range})\nselected content:\n${fence}${segment.languageId}\n${segment.code}${codeEnding}${fence}`;
}
