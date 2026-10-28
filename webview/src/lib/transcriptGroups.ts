import type { TranscriptItem } from "@shared/protocol";

export type ToolTranscriptItem = Extract<TranscriptItem, { kind: "tool" }>;

export type TranscriptDisplayEntry =
  | {
      readonly kind: "item";
      readonly id: string;
      readonly item: TranscriptItem;
    }
  | {
      readonly kind: "tool-group";
      readonly id: string;
      readonly agent?: string;
      readonly items: readonly ToolTranscriptItem[];
    };

const MIN_TOOL_GROUP_SIZE = 2;

export function groupTranscriptToolCalls(
  items: readonly TranscriptItem[],
): readonly TranscriptDisplayEntry[] {
  const entries: TranscriptDisplayEntry[] = [];
  let toolRun: ToolTranscriptItem[] = [];
  let toolRunAgent: string | undefined;

  const flushToolRun = () => {
    if (toolRun.length >= MIN_TOOL_GROUP_SIZE) {
      entries.push({
        kind: "tool-group",
        id: `tool-group:${toolRun[0]!.id}`,
        ...(toolRunAgent === undefined ? {} : { agent: toolRunAgent }),
        items: toolRun,
      });
    } else if (toolRun.length === 1) {
      const [tool] = toolRun;
      entries.push({ kind: "item", id: tool!.id, item: tool! });
    }

    toolRun = [];
    toolRunAgent = undefined;
  };

  for (const item of items) {
    if (item.kind === "tool") {
      if (toolRun.length > 0 && item.agent !== toolRunAgent) {
        flushToolRun();
      }

      if (toolRun.length === 0) {
        toolRunAgent = item.agent;
      }

      toolRun.push(item);
      continue;
    }

    flushToolRun();
    entries.push({ kind: "item", id: item.id, item });
  }

  flushToolRun();

  return entries;
}
