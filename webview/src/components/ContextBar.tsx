import { Loader2, Shrink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  CONTEXT_GRADIENT,
  contextFillPercent,
  contextGradientSize,
  contextLevel,
  contextPercent,
  formatContextLabel,
  formatContextTooltip,
  shouldHighlightCompact,
} from "@shared/contextBar";
import type { ContextUsage } from "@shared/protocol";

interface ContextBarProps {
  readonly usage: ContextUsage | null;
  readonly limit: number | null;
  readonly busy: boolean;
  readonly compacting: boolean;
  readonly onCompact: () => void;
}

const LEVEL_LABEL: Record<ReturnType<typeof contextLevel>, string> = {
  safe: "Context has room",
  warn: "Context is filling up",
  danger: "Context is nearly full",
};

export function ContextBar({ usage, limit, busy, compacting, onCompact }: ContextBarProps) {
  const percent = contextPercent(usage?.total ?? 0, limit);
  const fill = contextFillPercent(percent);
  const level = contextLevel(percent);
  const hasUsage = usage !== null && usage.total > 0;
  const compactDisabled = busy || compacting || !hasUsage;
  const compactWarning = shouldHighlightCompact(percent);

  return (
    <div className="mb-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            role="progressbar"
            aria-label="Session context usage"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent === null ? undefined : Math.round(percent)}
            tabIndex={0}
            className="h-1 w-full cursor-help overflow-hidden rounded-full bg-muted outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {percent !== null ? (
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{
                  width: `${fill}%`,
                  backgroundImage: CONTEXT_GRADIENT,
                  backgroundSize: contextGradientSize(fill),
                  backgroundPosition: "left center",
                }}
              />
            ) : null}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="whitespace-pre-line font-mono text-[11px]">
          {`${LEVEL_LABEL[level]}\n${formatContextTooltip(usage, limit)}`}
        </TooltipContent>
      </Tooltip>
      <div className="mt-1 flex items-center gap-2">
        <span className="min-w-0 truncate text-[11px] leading-4 text-muted-foreground">
          {!hasUsage
            ? "No context used yet"
            : usage.compacted
              ? `Compacted · ${formatContextLabel(usage.total, limit)}`
              : formatContextLabel(usage.total, limit)}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn(
            "ml-auto h-7 shrink-0 px-2 text-[11px]",
            compactWarning && "border-context-warn bg-context-warn/15 font-bold text-context-warn",
          )}
          disabled={compactDisabled}
          title={
            busy
              ? "Wait for the running prompt to finish"
              : compacting
                ? "Compacting this session"
                : compactWarning
                  ? "Context is nearly full - compact this session"
                  : "Compact this session's context"
          }
          onClick={onCompact}
        >
          {compacting ? <Loader2 className="animate-spin" /> : <Shrink />}
          {compacting ? "Compacting..." : "Compact"}
        </Button>
      </div>
    </div>
  );
}
