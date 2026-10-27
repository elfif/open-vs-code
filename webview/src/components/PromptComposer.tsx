import { useLayoutEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { calculatePromptTextareaHeight } from "@/lib/promptHeight";

interface PromptComposerProps {
  readonly value: string;
  readonly submitting: boolean;
  readonly error?: string;
  readonly disabled: boolean;
  readonly panelHeight: number;
  readonly onChange: (value: string) => void;
  readonly onSubmit: () => void;
}

export function PromptComposer({
  value,
  submitting,
  error,
  disabled,
  panelHeight,
  onChange,
  onSubmit,
}: PromptComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSubmit = !disabled && !submitting && value.trim().length > 0;

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
