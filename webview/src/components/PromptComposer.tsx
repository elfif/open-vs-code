import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Paperclip } from "lucide-react";
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
import { SkillPickerPlugin } from "@/components/SkillPickerPlugin";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  canAcceptDragTypes,
  canAcceptPaste,
  resolveTransferUris,
  snapshotTransfer,
} from "@/lib/dropZone";
import { calculatePromptTextareaHeight } from "@/lib/promptHeight";
import { postToExtension } from "@/lib/vscode";
import {
  isPromptEmpty,
  type PromptContextSegment,
  type PromptSegment,
} from "@shared/promptContent";
import type {
  LoadStatus,
  ModelOption,
  PromptCatalog,
  PromptSelection,
  SkillOption,
} from "@shared/protocol";

const DRAG_HINT =
  "VS Code blocks drag events over webviews while a drag is in progress, so a plain drop is routed to the editor instead of this panel. Hold Shift while dropping to deliver the files here.";

const EMPTY_SKILLS: readonly SkillOption[] = [];

export interface PendingContextInsert {
  readonly id: number;
  readonly segments: readonly PromptContextSegment[];
}

interface PromptComposerProps {
  readonly value: readonly PromptSegment[];
  readonly pendingInserts: readonly PendingContextInsert[];
  readonly submitting: boolean;
  readonly staging: boolean;
  readonly error?: string;
  readonly documentError?: string;
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
  readonly onPickFiles: () => void;
  readonly onFiles: (files: readonly File[]) => void;
  readonly onUris: (uris: readonly string[]) => void;
  readonly onDocumentError: (error: string) => void;
}

export function PromptComposer({
  value,
  pendingInserts,
  submitting,
  staging,
  error,
  documentError,
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
  onPickFiles,
  onFiles,
  onUris,
  onDocumentError,
}: PromptComposerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorWrapRef = useRef<HTMLDivElement>(null);
  const editableRef = useRef<HTMLDivElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const locked = disabled || submitting || staging;
  const lockedRef = useRef(locked);
  const onFilesRef = useRef(onFiles);
  const onUrisRef = useRef(onUris);
  const onDocumentErrorRef = useRef(onDocumentError);

  useEffect(() => {
    lockedRef.current = locked;
    onFilesRef.current = onFiles;
    onUrisRef.current = onUris;
    onDocumentErrorRef.current = onDocumentError;
  }, [locked, onFiles, onUris, onDocumentError]);

  useEffect(() => {
    const editable = editableRef.current;
    const doc = editable ? editable.ownerDocument : document;
    const handlers: TransferHandlers = { onFilesRef, onUrisRef, onDocumentErrorRef };

    const isInsideComposer = (target: EventTarget | null): boolean => {
      const container = containerRef.current;

      return container !== null && target instanceof Node && container.contains(target);
    };

    const acceptsDrag = (event: DragEvent): boolean =>
      event.dataTransfer !== null && canAcceptDragTypes(Array.from(event.dataTransfer.types));

    const handleDragEnter = (event: DragEvent) => {
      if (lockedRef.current || !isInsideComposer(event.target) || !acceptsDrag(event)) {
        return;
      }

      setDragActive(true);
    };

    const handleDragOver = (event: DragEvent) => {
      if (lockedRef.current || !isInsideComposer(event.target) || !acceptsDrag(event)) {
        return;
      }

      event.preventDefault();

      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }

      setDragActive(true);
    };

    const handleDragLeave = (event: DragEvent) => {
      if (!isInsideComposer(event.target)) {
        return;
      }

      const next = event.relatedTarget;

      if (next instanceof Node && isInsideComposer(next)) {
        return;
      }

      setDragActive(false);
    };

    const handleDrop = (event: DragEvent) => {
      if (!isInsideComposer(event.target)) {
        return;
      }

      setDragActive(false);

      if (lockedRef.current || !acceptsDrag(event)) {
        return;
      }

      event.preventDefault();
      processTransfer(event.dataTransfer, true, handlers);
    };

    const handleDragEnd = () => {
      setDragActive(false);
    };

    const handlePaste = (event: ClipboardEvent) => {
      if (lockedRef.current || !canAcceptPaste(snapshotTransfer(event.clipboardData))) {
        return;
      }

      event.preventDefault();
      processTransfer(event.clipboardData, false, handlers);
    };

    // Capture phase on the whole document: VS Code retargets and re-dispatches drag
    // events into the webview, so listening only on the contentEditable element
    // misses drops that land on the composer chrome or the editor's own padding.
    const capture: AddEventListenerOptions = { capture: true, passive: false };

    doc.addEventListener("dragenter", handleDragEnter, capture);
    doc.addEventListener("dragover", handleDragOver, capture);
    doc.addEventListener("dragleave", handleDragLeave, capture);
    doc.addEventListener("drop", handleDrop, capture);
    doc.addEventListener("dragend", handleDragEnd, capture);
    editable?.addEventListener("paste", handlePaste);

    return () => {
      doc.removeEventListener("dragenter", handleDragEnter, capture);
      doc.removeEventListener("dragover", handleDragOver, capture);
      doc.removeEventListener("dragleave", handleDragLeave, capture);
      doc.removeEventListener("drop", handleDrop, capture);
      doc.removeEventListener("dragend", handleDragEnd, capture);
      editable?.removeEventListener("paste", handlePaste);
    };
  }, []);

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

  const canSubmit =
    !disabled && !submitting && !staging && selection !== null && !isPromptEmpty(value);

  return (
    <div ref={containerRef} className="shrink-0 border-t border-border bg-background p-2">
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
          <div ref={editorWrapRef} className="relative">
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
                  Send a prompt or type / for skills
                </div>
              }
              ErrorBoundary={LexicalErrorBoundary}
            />
            <HistoryPlugin />
            <EditablePlugin editable={!disabled && !submitting} />
            <DraftPlugin onChange={onChange} />
            <InsertContextPlugin pendingInserts={pendingInserts} onConsumed={onInsertsConsumed} />
            <SkillPickerPlugin
              skills={catalog?.skills ?? EMPTY_SKILLS}
              containerRef={editorWrapRef}
              disabled={locked}
            />
            {dragActive && !locked ? (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md border-2 border-dashed border-ring bg-background/85 px-3 text-center text-xs text-muted-foreground">
                Drop files to add to this prompt
              </div>
            ) : null}
          </div>
        </LexicalComposer>
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
        {staging ? <p className="mt-1 text-xs text-muted-foreground">Adding files...</p> : null}
        {documentError ? (
          <p role="alert" className="mt-1 whitespace-pre-line text-xs text-destructive">
            {documentError}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <div className="mt-2 flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex min-w-0 cursor-help items-center text-[11px] leading-4 text-muted-foreground">
                <span className="truncate">
                  Drop files · hold{" "}
                  <kbd className="rounded border border-border bg-muted px-1 font-sans text-[10px]">
                    Shift
                  </kbd>
                </span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">{DRAG_HINT}</TooltipContent>
          </Tooltip>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={locked}
              onClick={onPickFiles}
            >
              <Paperclip />
              Add files
            </Button>
            <Button type="button" size="sm" disabled={!canSubmit} onClick={onSubmit}>
              {submitting ? "Sending..." : "Send"}
            </Button>
          </div>
        </div>
      </TooltipProvider>
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

interface TransferHandlers {
  readonly onFilesRef: RefObject<(files: readonly File[]) => void>;
  readonly onUrisRef: RefObject<(uris: readonly string[]) => void>;
  readonly onDocumentErrorRef: RefObject<(error: string) => void>;
}

function processTransfer(
  dataTransfer: DataTransfer | null,
  isDrop: boolean,
  handlers: TransferHandlers,
): void {
  if (!dataTransfer) {
    return;
  }

  const { files, errors } = collectFiles(dataTransfer);

  if (errors.length > 0) {
    handlers.onDocumentErrorRef.current(errors.join("\n"));
  }

  if (files.length > 0) {
    handlers.onFilesRef.current(files);
    return;
  }

  const uris = resolveTransferUris(snapshotTransfer(dataTransfer));

  if (uris.length > 0) {
    handlers.onUrisRef.current(uris);
    return;
  }

  if (isDrop) {
    handlers.onDocumentErrorRef.current(
      'No supported file was detected in this drop. Use "Add files" to pick it instead.',
    );
  }
}

function getDirectoryEntry(
  item: DataTransferItem,
): { isDirectory?: boolean; name?: string } | null {
  try {
    return item.webkitGetAsEntry?.() ?? null;
  } catch {
    return null;
  }
}

function collectFiles(dataTransfer: DataTransfer): { files: File[]; errors: string[] } {
  const files: File[] = [];
  const errors: string[] = [];
  const items = Array.from(dataTransfer.items ?? []);

  if (items.length === 0) {
    files.push(...Array.from(dataTransfer.files));
    return { files, errors };
  }

  for (const item of items) {
    if (item.kind !== "file") {
      continue;
    }

    const entry = getDirectoryEntry(item);

    if (entry?.isDirectory) {
      errors.push(`${entry.name ?? "Folder"} is a folder.`);
      continue;
    }

    try {
      const file = item.getAsFile();

      if (file) {
        files.push(file);
      }
    } catch {
      // Ignore items that cannot be read as files.
    }
  }

  return { files, errors };
}
