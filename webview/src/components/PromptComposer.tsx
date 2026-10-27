import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface PromptComposerProps {
  readonly value: string;
  readonly submitting: boolean;
  readonly error?: string;
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
  readonly onSubmit: () => void;
}

export function PromptComposer({
  value,
  submitting,
  error,
  disabled,
  onChange,
  onSubmit,
}: PromptComposerProps) {
  const canSubmit = !disabled && !submitting && value.trim().length > 0;

  return (
    <div className="shrink-0 border-t border-border bg-background p-2">
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Send a prompt to this OpenCode session"
        disabled={disabled || submitting}
        aria-label="Prompt"
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
