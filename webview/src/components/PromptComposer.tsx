import { useLayoutEffect, useRef } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $setSelection,
  type RangeSelection,
} from "lexical";

import {
  $createContextBadgeNode,
  $isContextBadgeNode,
  ContextBadgeNode,
} from "@/components/ContextBadgeNode";
import { PromptToolbar } from "@/components/PromptToolbar";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { calculatePromptTextareaHeight } from "@/lib/promptHeight";
import { postToExtension } from "@/lib/vscode";
import {
  isPromptEmpty,
  type PromptContextSegment,
  type PromptSegment,
} from "@shared/promptContent";
import type { LoadStatus, ModelOption, PromptCatalog, PromptSelection } from "@shared/protocol";

export interface PendingContextInsert {
  readonly id: number;
  readonly segments: readonly PromptContextSegment[];
}

interface PromptComposerProps {
  readonly value: readonly PromptSegment[];
  readonly pendingInserts: readonly PendingContextInsert[];
  readonly submitting: boolean;
  readonly error?: string;
  readonly disabled: boolean;
  readonly panelHeight: number;
  readonly catalog: PromptCatalog | null;
  readonly catalogStatus: LoadStatus;
  readonly catalogError?: string;
  readonly selection: PromptSelection | null;
  readonly onChange: (value: readonly PromptSegment[]) => void;
  readonly onInsertsConsumed: (insertIDs: readonly number[]) => void;
  readonly onAgentChange: (agentID: string) => void;
  readonly onModelChange: (model: ModelOption) => void;
  readonly onVariantChange: (variant: string | undefined) => void;
  readonly onSubmit: () => void;
}

export function PromptComposer({
  value,
  pendingInserts,
  submitting,
  error,
  disabled,
  panelHeight,
  catalog,
  catalogStatus,
  catalogError,
  selection,
  onChange,
  onInsertsConsumed,
  onAgentChange,
  onModelChange,
  onVariantChange,
  onSubmit,
}: PromptComposerProps) {
  const editableRef = useRef<HTMLDivElement>(null);
  const canSubmit = !disabled && !submitting && selection !== null && !isPromptEmpty(value);

  useLayoutEffect(() => {
    const editable = editableRef.current;

    if (!editable) {
      return;
    }

    const styles = window.getComputedStyle(editable);
    const lineHeight =
      Number.parseFloat(styles.lineHeight) || Number.parseFloat(styles.fontSize) * 1.5;
    const chromeHeight =
      Number.parseFloat(styles.paddingTop) +
      Number.parseFloat(styles.paddingBottom) +
      Number.parseFloat(styles.borderTopWidth) +
      Number.parseFloat(styles.borderBottomWidth);

    editable.style.height = "auto";

    const { height, capped } = calculatePromptTextareaHeight({
      contentHeight: editable.scrollHeight,
      lineHeight,
      chromeHeight,
      panelHeight,
    });

    editable.style.height = `${height}px`;
    editable.style.overflowY = capped ? "auto" : "hidden";
  }, [value, panelHeight]);

  return (
    <div className="shrink-0 border-t border-border bg-background p-2">
      <TooltipProvider delayDuration={300}>
        <LexicalComposer
          initialConfig={{
            namespace: "OpenCodePrompt",
            nodes: [ContextBadgeNode],
            editorState: () => initializeEditor(value),
            onError: (editorError) => {
              throw editorError;
            },
          }}
        >
          <div className="relative">
            <PlainTextPlugin
              contentEditable={
                <ContentEditable
                  ref={editableRef}
                  aria-label="Prompt"
                  aria-multiline="true"
                  className="w-full resize-none whitespace-pre-wrap break-words rounded-md border border-input bg-input px-3 py-2 text-xs leading-5 text-foreground shadow-sm transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                />
              }
              placeholder={
                <div className="pointer-events-none absolute left-3 top-2 text-xs leading-5 text-muted-foreground">
                  Send a prompt to this OpenCode session
                </div>
              }
              ErrorBoundary={LexicalErrorBoundary}
            />
            <HistoryPlugin />
            <EditablePlugin editable={!disabled && !submitting} />
            <DraftPlugin onChange={onChange} />
            <InsertContextPlugin pendingInserts={pendingInserts} onConsumed={onInsertsConsumed} />
          </div>
        </LexicalComposer>
      </TooltipProvider>
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

function EditablePlugin({ editable }: { readonly editable: boolean }) {
  const [editor] = useLexicalComposerContext();

  useLayoutEffect(() => {
    editor.setEditable(editable);
  }, [editable, editor]);

  return null;
}

function DraftPlugin({
  onChange,
}: {
  readonly onChange: (value: readonly PromptSegment[]) => void;
}) {
  const [editor] = useLexicalComposerContext();

  useLayoutEffect(
    () =>
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          onChange(readPromptSegments());
        });
      }),
    [editor, onChange],
  );

  return null;
}

function InsertContextPlugin({
  pendingInserts,
  onConsumed,
}: {
  readonly pendingInserts: readonly PendingContextInsert[];
  readonly onConsumed: (insertIDs: readonly number[]) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const lastCaret = useRef<RangeSelection | null>(null);
  const consumedInsertIDs = useRef(new Set<number>());

  useLayoutEffect(
    () =>
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          const selection = $getSelection();

          if ($isRangeSelection(selection) && selection.isCollapsed()) {
            lastCaret.current = selection.clone();
          }
        });
      }),
    [editor],
  );

  useLayoutEffect(() => {
    const inserts = pendingInserts.filter((pending) => !consumedInsertIDs.current.has(pending.id));

    if (inserts.length === 0) {
      return;
    }

    for (const pending of inserts) {
      consumedInsertIDs.current.add(pending.id);
    }

    editor.update(() => {
      if (lastCaret.current) {
        $setSelection(lastCaret.current.clone());
      } else {
        $getRoot().selectEnd();
      }

      for (const pending of inserts) {
        for (const segment of pending.segments) {
          const selection = $getSelection();

          if ($isRangeSelection(selection)) {
            selection.insertNodes([$createContextBadgeNode(segment), $createTextNode(" ")]);
          }
        }
      }
    });
    onConsumed(inserts.map((pending) => pending.id));
    editor.focus();
  }, [editor, onConsumed, pendingInserts]);

  return null;
}

function initializeEditor(segments: readonly PromptSegment[]): void {
  const root = $getRoot();
  let paragraph = $createParagraphNode();
  root.append(paragraph);

  for (const segment of segments) {
    if (segment.kind !== "text") {
      paragraph.append($createContextBadgeNode(segment));
      continue;
    }

    const lines = segment.text.split("\n");

    lines.forEach((line, index) => {
      if (index > 0) {
        paragraph = $createParagraphNode();
        root.append(paragraph);
      }

      if (line.length > 0) {
        paragraph.append($createTextNode(line));
      }
    });
  }

  root.selectEnd();
}

function readPromptSegments(): PromptSegment[] {
  const segments: PromptSegment[] = [];
  let text = "";
  const blocks = $getRoot().getChildren();

  const flushText = () => {
    if (text.length > 0) {
      segments.push({ kind: "text", text });
      text = "";
    }
  };

  blocks.forEach((block, blockIndex) => {
    if (blockIndex > 0) {
      text += "\n";
    }

    const children = $isElementNode(block) ? block.getChildren() : [block];

    for (const child of children) {
      if ($isContextBadgeNode(child)) {
        flushText();
        segments.push({ ...child.getSegment() });
      } else {
        text += child.getTextContent();
      }
    }
  });

  flushText();
  return segments;
}
