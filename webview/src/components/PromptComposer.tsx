import { useLayoutEffect, useRef } from "react";

import { PromptToolbar } from "@/components/PromptToolbar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { calculatePromptTextareaHeight } from "@/lib/promptHeight";
import { postToExtension } from "@/lib/vscode";
import type { LoadStatus, ModelOption, PromptCatalog, PromptSelection } from "@shared/protocol";

interface PromptComposerProps {
  readonly value: string;
  readonly submitting: boolean;
  readonly error?: string;
  readonly disabled: boolean;
  readonly panelHeight: number;
  readonly catalog: PromptCatalog | null;
  readonly catalogStatus: LoadStatus;
  readonly catalogError?: string;
  readonly selection: PromptSelection | null;
  readonly onChange: (value: string) => void;
  readonly onAgentChange: (agentID: string) => void;
  readonly onModelChange: (model: ModelOption) => void;
  readonly onVariantChange: (variant: string | undefined) => void;
  readonly onSubmit: () => void;
}

export function PromptComposer({
  value,
  submitting,
  error,
  disabled,
  panelHeight,
  catalog,
  catalogStatus,
  catalogError,
  selection,
  onChange,
  onAgentChange,
  onModelChange,
  onVariantChange,
  onSubmit,
}: PromptComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSubmit = !disabled && !submitting && selection !== null && value.trim().length > 0;

  useLayoutEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    const styles = window.getComputedStyle(textarea);
    const lineHeight =
      Number.parseFloat(styles.lineHeight) || Number.parseFloat(styles.fontSize) * 1.5;
    const chromeHeight =
      Number.parseFloat(styles.paddingTop) +
      Number.parseFloat(styles.paddingBottom) +
      Number.parseFloat(styles.borderTopWidth) +
      Number.parseFloat(styles.borderBottomWidth);

    textarea.style.height = "auto";

    const { height, capped } = calculatePromptTextareaHeight({
      contentHeight: textarea.scrollHeight,
      lineHeight,
      chromeHeight,
      panelHeight,
    });

    textarea.style.height = `${height}px`;
    textarea.style.overflowY = capped ? "auto" : "hidden";
  }, [value, panelHeight]);

  return (
    <div className="shrink-0 border-t border-border bg-background p-2">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Send a prompt to this OpenCode session"
        disabled={disabled || submitting}
        aria-label="Prompt"
        rows={4}
      />
      {catalog && selection ? (
        <PromptToolbar
          catalog={catalog}
          selection={selection}
          disabled={disabled || submitting || catalogStatus === "loading"}
          onAgentChange={onAgentChange}
          onModelChange={onModelChange}
          onVariantChange={onVariantChange}
        />
      ) : null}
      {catalogStatus === "loading" && !catalog ? (
        <p className="mt-2 text-xs text-muted-foreground">Loading agents and models...</p>
      ) : null}
      {catalogStatus === "ready" && !selection ? (
        <p className="mt-2 text-xs text-muted-foreground">
          No selectable agents or models are available.
        </p>
      ) : null}
      {catalogError ? (
        <div role="alert" className="mt-2 flex items-center gap-2 text-xs text-destructive">
          <span className="min-w-0 flex-1">{catalogError}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => postToExtension({ type: "retry" })}
          >
            Retry
          </Button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="mt-2 flex justify-end">
        <Button size="sm" disabled={!canSubmit} onClick={onSubmit}>
          {submitting ? "Sending..." : "Send"}
        </Button>
      </div>
    </div>
  );
}
