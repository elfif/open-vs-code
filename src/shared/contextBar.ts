import type { ContextUsage, PromptCatalog, PromptModel } from "./protocol";

export const CONTEXT_WARN_PERCENT = 50;
export const CONTEXT_DANGER_PERCENT = 75;
/** From this share of the window the Compact button is called out as a warning. */
export const CONTEXT_COMPACT_WARN_PERCENT = 80;

export type ContextLevel = "safe" | "warn" | "danger";

/**
 * Gradient sized to the *full* track. The fill element reveals only its share of
 * it, so the colour at the fill edge matches the thresholds below.
 */
export const CONTEXT_GRADIENT =
  "linear-gradient(to right, var(--color-context-safe) 0%, var(--color-context-safe) 47%, " +
  "var(--color-context-warn) 53%, var(--color-context-warn) 72%, " +
  "var(--color-context-danger) 78%, var(--color-context-danger) 100%)";

export function isUsableContextLimit(limit: number | null | undefined): limit is number {
  return typeof limit === "number" && Number.isFinite(limit) && limit > 0;
}

/** Real usage ratio, allowed to exceed 100 when the model shrank. Null without a limit. */
export function contextPercent(
  totalTokens: number,
  limit: number | null | undefined,
): number | null {
  if (!isUsableContextLimit(limit) || !Number.isFinite(totalTokens) || totalTokens < 0) {
    return null;
  }

  return (totalTokens / limit) * 100;
}

/** Width of the fill, clamped to the track. */
export function contextFillPercent(percent: number | null): number {
  if (percent === null || !Number.isFinite(percent)) {
    return 0;
  }

  return Math.min(100, Math.max(0, percent));
}

export function contextLevel(percent: number | null): ContextLevel {
  if (percent === null) {
    return "safe";
  }

  if (percent > CONTEXT_DANGER_PERCENT) {
    return "danger";
  }

  if (percent >= CONTEXT_WARN_PERCENT) {
    return "warn";
  }

  return "safe";
}

/** True once the Compact button should be called out as a warning. */
export function shouldHighlightCompact(percent: number | null): boolean {
  return percent !== null && percent >= CONTEXT_COMPACT_WARN_PERCENT;
}

/**
 * Scales the gradient so it spans the whole track even though the fill element is
 * only `fillPercent` of the track wide.
 */
export function contextGradientSize(fillPercent: number): string {
  if (fillPercent <= 0) {
    return "100% 100%";
  }

  return `${(100 / fillPercent) * 100}% 100%`;
}

export function formatTokenCount(tokens: number): string {
  const value = Math.max(0, Math.round(Number.isFinite(tokens) ? tokens : 0));

  if (value < 1_000) {
    return String(value);
  }

  if (value < 1_000_000) {
    return trimTrailingZero((value / 1_000).toFixed(1)) + "k";
  }

  return trimTrailingZero((value / 1_000_000).toFixed(2)) + "M";
}

export function formatContextPercent(percent: number): string {
  return `${Math.round(percent)}%`;
}

/** `", from 42.6k to 1.3k"` — empty when the original size is unknown. */
export function formatCompactionDelta(fromTokens: number, toTokens: number): string {
  if (!Number.isFinite(fromTokens) || fromTokens <= 0) {
    return "";
  }

  return `, from ${formatTokenCount(fromTokens)} to ${formatTokenCount(toTokens)}`;
}

export function formatContextLabel(totalTokens: number, limit: number | null | undefined): string {
  const used = formatTokenCount(totalTokens);

  if (!isUsableContextLimit(limit)) {
    return `${used} / n/a`;
  }

  const percent = contextPercent(totalTokens, limit);

  return percent === null
    ? `${used} / ${formatTokenCount(limit)}`
    : `${used} / ${formatTokenCount(limit)} (${formatContextPercent(percent)})`;
}

export function formatContextTooltip(
  usage: ContextUsage | null,
  limit: number | null | undefined,
): string {
  const maxLine = `Max context: ${isUsableContextLimit(limit) ? formatTokenCount(limit) : "unknown"}`;

  if (usage?.compacted) {
    return [
      "Compacted summary",
      `Summary: ${formatTokenCount(usage.total)}`,
      maxLine,
      "Measured again on the next turn",
    ].join("\n");
  }

  const lines = [
    `Input: ${formatTokenCount(usage?.input ?? 0)}`,
    `Output: ${formatTokenCount(usage?.output ?? 0)}`,
    `Reasoning: ${formatTokenCount(usage?.reasoning ?? 0)}`,
    `Cache read: ${formatTokenCount(usage?.cacheRead ?? 0)}`,
    `Cache write: ${formatTokenCount(usage?.cacheWrite ?? 0)}`,
    maxLine,
  ];

  if (usage) {
    lines.unshift(`Total: ${formatTokenCount(usage.total)}`);
  }

  return lines.join("\n");
}

/** Max context of the model currently selected in the toolbar. */
export function findContextLimit(
  catalog: PromptCatalog | null,
  model: PromptModel | null,
): number | null {
  if (!catalog || !model) {
    return null;
  }

  const option = catalog.models.find(
    (candidate) => candidate.providerID === model.providerID && candidate.id === model.id,
  );
  const limit = option?.contextLimit;

  return isUsableContextLimit(limit) ? limit : null;
}

function trimTrailingZero(value: string): string {
  return value.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}
