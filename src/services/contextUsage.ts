import type { SessionMessageInfo, TokenUsageInfo } from "@opencode/client";

import type { ContextUsage } from "../shared/protocol";

export type CompactionOutcome = "completed" | "failed";

/**
 * Context occupancy of a session: the token total reported by the most recent
 * assistant turn. A completed compaction after that turn replaces it — but with
 * the **summary's own size**, never the compaction message's `tokens`, because
 * those report the summarisation call itself (it reads the whole history in order
 * to compress it) rather than what is left in context afterwards.
 */
export function computeContextUsage(messages: readonly SessionMessageInfo[]): ContextUsage | null {
  let assistant: { usage: ContextUsage; index: number } | null = null;
  let compaction: { usage: ContextUsage; index: number } | null = null;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (!assistant && message.type === "assistant") {
      const usage = toContextUsage(message.tokens);

      if (usage) {
        assistant = { usage, index };
      }

      continue;
    }

    if (!compaction && message.type === "compaction" && message.status === "completed") {
      compaction = { usage: summaryContextUsage(message.summary, message.tokens), index };
      break;
    }
  }

  if (compaction && (!assistant || compaction.index > assistant.index)) {
    return compaction.usage;
  }

  return assistant?.usage ?? null;
}

/**
 * What a compaction actually leaves in context: the summary itself. Falls back to
 * a characters/4 estimate when the message carries no output token count.
 */
export function summaryContextUsage(
  summary: string | undefined,
  tokens: TokenUsageInfo | undefined,
): ContextUsage {
  const summaryTokens = token(tokens?.output) || Math.ceil((summary ?? "").length / 4);

  return {
    total: summaryTokens,
    input: 0,
    output: summaryTokens,
    reasoning: 0,
    cacheRead: 0,
    cacheWrite: 0,
    compacted: true,
  };
}

export interface CompactionSizes {
  readonly fromTokens: number;
  readonly toTokens: number;
}

/**
 * Sizes shown on a compaction entry. `from` prefers the last measured assistant
 * turn before the compaction — the number the context bar was showing — and falls
 * back to the summarisation prompt itself when no such turn is in the page.
 */
export function compactionSizes(
  messages: readonly SessionMessageInfo[],
  index: number,
): CompactionSizes {
  const message = messages[index];
  const tokens = message.type === "compaction" && "tokens" in message ? message.tokens : undefined;
  const summary =
    message.type === "compaction" && "summary" in message ? message.summary : undefined;
  const toTokens = summaryContextUsage(summary, tokens).total;
  const fromTokens = lastAssistantTotalBefore(messages, index) ?? compactionPromptTokens(tokens);

  return { fromTokens: Math.max(fromTokens, 0), toTokens };
}

function lastAssistantTotalBefore(
  messages: readonly SessionMessageInfo[],
  index: number,
): number | null {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const message = messages[cursor];

    if (message.type !== "assistant") {
      continue;
    }

    const usage = toContextUsage(message.tokens);

    if (usage && usage.total > 0) {
      return usage.total;
    }
  }

  return null;
}

/** Everything the summarisation call was fed: fresh input plus cached context. */
function compactionPromptTokens(tokens: TokenUsageInfo | undefined): number {
  if (!tokens) {
    return 0;
  }

  return token(tokens.input) + token(tokens.cache?.read) + token(tokens.cache?.write);
}

/** Terminal status of the newest compaction message created at or after `sinceMs`. */
export function findCompactionAfter(
  messages: readonly SessionMessageInfo[],
  sinceMs: number,
): CompactionOutcome | null {
  let outcome: CompactionOutcome | null = null;

  for (const message of messages) {
    if (message.type !== "compaction" || message.time.created < sinceMs) {
      continue;
    }

    if (message.status === "completed") {
      outcome = "completed";
    } else if (message.status === "failed") {
      outcome = "failed";
    }
  }

  return outcome;
}

export function toContextUsage(tokens: TokenUsageInfo | undefined): ContextUsage | null {
  if (!tokens) {
    return null;
  }

  const input = token(tokens.input);
  const output = token(tokens.output);
  const reasoning = token(tokens.reasoning);
  const cacheRead = token(tokens.cache?.read);
  const cacheWrite = token(tokens.cache?.write);

  return {
    total: input + output + reasoning + cacheRead + cacheWrite,
    input,
    output,
    reasoning,
    cacheRead,
    cacheWrite,
    compacted: false,
  };
}

export function emptyContextUsage(): ContextUsage {
  return {
    total: 0,
    input: 0,
    output: 0,
    reasoning: 0,
    cacheRead: 0,
    cacheWrite: 0,
    compacted: false,
  };
}

function token(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}
