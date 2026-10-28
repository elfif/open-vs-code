import { useEffect, useRef, type CSSProperties } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Badge } from "@/components/ui/badge";
import { groupTranscriptToolCalls, type ToolTranscriptItem } from "@/lib/transcriptGroups";
import { formatCompactionDelta } from "@shared/contextBar";
import type { TranscriptItem } from "@shared/protocol";

interface TranscriptViewProps {
  readonly items: readonly TranscriptItem[];
  readonly loading: boolean;
  readonly error?: string;
  readonly agentColors: Readonly<Record<string, string>>;
}

export function TranscriptView({ items, loading, error, agentColors }: TranscriptViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    const element = containerRef.current;

    if (!element) {
      return;
    }

    const handleScroll = () => {
      const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
      stickToBottom.current = distanceFromBottom < 24;
    };

    element.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      element.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    const element = containerRef.current;

    if (element && stickToBottom.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [items, loading]);

  if (loading && items.length === 0) {
    return <div className="p-4 text-xs text-muted-foreground">Loading session...</div>;
  }

  return (
    <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto p-3">
      {error ? (
        <div
          role="alert"
          className="mb-3 rounded-md border border-destructive/40 p-2 text-xs text-destructive"
        >
          {error}
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="text-xs text-muted-foreground">No messages in this session.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {groupTranscriptToolCalls(items).map((entry) =>
            entry.kind === "tool-group" ? (
              <ToolCallGroup key={entry.id} entry={entry} agentColors={agentColors} />
            ) : (
              <TranscriptEntry key={entry.id} item={entry.item} agentColors={agentColors} />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function TranscriptEntry({
  item,
  agentColors,
}: {
  readonly item: TranscriptItem;
  readonly agentColors: Readonly<Record<string, string>>;
}) {
  const accent = agentAccent(agentColors, "agent" in item ? item.agent : undefined);

  if (item.kind === "user") {
    return (
      <article className="rounded-md border border-border bg-card p-2" style={accent}>
        <div className="mb-1 flex items-center justify-between gap-2">
          <Badge variant="secondary">User</Badge>
          <Timestamp value={item.timestamp} />
        </div>
        <Markdown>{item.text}</Markdown>
        {item.attachments.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {item.attachments.map((attachment, index) => (
              <Badge key={`${attachment}-${index}`} variant="outline">
                {attachment}
              </Badge>
            ))}
          </div>
        ) : null}
      </article>
    );
  }

  if (item.kind === "assistant") {
    return (
      <article className="rounded-md border border-border bg-card p-2" style={accent}>
        <div className="mb-1 flex items-center justify-between gap-2">
          <Badge>{item.agent}</Badge>
          <Timestamp value={item.timestamp} />
        </div>
        <div className="mb-2 truncate text-[10px] text-muted-foreground">{item.model}</div>
        <Markdown>{item.text}</Markdown>
        {item.error ? (
          <div className="mt-2 rounded-md border border-destructive/40 p-2 text-xs text-destructive">
            {item.error}
          </div>
        ) : null}
      </article>
    );
  }

  if (item.kind === "reasoning") {
    return (
      <details className="rounded-md border border-border bg-muted/30 p-2 text-xs" style={accent}>
        <summary className="cursor-pointer font-medium text-muted-foreground">Reasoning</summary>
        <Markdown>{item.text}</Markdown>
      </details>
    );
  }

  if (item.kind === "tool") {
    return <ToolCallEntry item={item} agentColors={agentColors} />;
  }

  if (item.kind === "compaction") {
    return (
      <details className="rounded-md border border-border bg-muted/30 p-2 text-xs">
        <summary className="flex cursor-pointer items-center justify-between gap-2">
          <span className="truncate font-medium text-muted-foreground">
            {`Compaction ${item.status} (${item.reason})${formatCompactionDelta(
              item.fromTokens,
              item.toTokens,
            )}`}
          </span>
          <Timestamp value={item.timestamp} />
        </summary>
        {item.summary ? (
          <div className="mt-2">
            <Markdown>{item.summary}</Markdown>
          </div>
        ) : null}
        {item.error ? (
          <div className="mt-2 rounded-md border border-destructive/40 p-2 text-xs text-destructive">
            {item.error}
          </div>
        ) : null}
      </details>
    );
  }

  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-2 text-xs text-muted-foreground">
      <div className="flex items-center justify-between gap-2">
        <span>{item.label}</span>
        <Timestamp value={item.timestamp} />
      </div>
      {item.detail ? (
        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words text-[10px]">
          {item.detail}
        </pre>
      ) : null}
    </div>
  );
}

function ToolCallGroup({
  entry,
  agentColors,
}: {
  readonly entry: {
    readonly agent?: string;
    readonly items: readonly ToolTranscriptItem[];
  };
  readonly agentColors: Readonly<Record<string, string>>;
}) {
  const accent = agentAccent(agentColors, entry.agent);

  return (
    <details className="rounded-md border border-border bg-muted/30 p-2 text-xs" style={accent}>
      <summary className="cursor-pointer font-medium text-muted-foreground">
        {`${entry.items.length} tool calls`}
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        {entry.items.map((item) => (
          <ToolCallEntry key={item.id} item={item} agentColors={agentColors} />
        ))}
      </div>
    </details>
  );
}

function ToolCallEntry({
  item,
  agentColors,
}: {
  readonly item: ToolTranscriptItem;
  readonly agentColors: Readonly<Record<string, string>>;
}) {
  const accent = agentAccent(agentColors, item.agent);

  return (
    <details className="rounded-md border border-border bg-muted/30 p-2 text-xs" style={accent}>
      <summary className="flex cursor-pointer items-center justify-between gap-2">
        <span className="truncate font-medium">Tool: {item.name}</span>
        <Badge variant="outline">{item.status}</Badge>
      </summary>
      {item.input ? (
        <div className="mt-2">
          <div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">
            Input
          </div>
          <pre className="overflow-x-auto rounded-md bg-input p-2 text-[10px]">{item.input}</pre>
        </div>
      ) : null}
      {item.output ? (
        <div className="mt-2">
          <div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">
            Output
          </div>
          <pre className="overflow-x-auto rounded-md bg-input p-2 text-[10px]">{item.output}</pre>
        </div>
      ) : null}
    </details>
  );
}

function agentAccent(
  agentColors: Readonly<Record<string, string>>,
  agent: string | undefined,
): CSSProperties | undefined {
  if (!agent) {
    return undefined;
  }

  const color = agentColors[agent];

  return color ? { borderLeft: `4px solid ${color}` } : undefined;
}

function Markdown({ children }: { readonly children: string }) {
  return (
    <div className="markdown text-xs">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}

function Timestamp({ value }: { readonly value: number }) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return (
    <span className="shrink-0 text-[10px] text-muted-foreground">
      {new Date(value).toLocaleTimeString()}
    </span>
  );
}
