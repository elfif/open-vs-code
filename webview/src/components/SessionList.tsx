import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { postToExtension } from "@/lib/vscode";
import type { SessionGroup } from "@shared/protocol";

interface SessionListProps {
  readonly groups: readonly SessionGroup[];
  readonly loading: boolean;
  readonly error?: string;
  readonly hasWorkspace: boolean;
  readonly creating: boolean;
  readonly createError?: string;
}

export function SessionList({
  groups,
  loading,
  error,
  hasWorkspace,
  creating,
  createError,
}: SessionListProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-2 py-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Sessions
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={!hasWorkspace || creating}
          onClick={() => postToExtension({ type: "createSession" })}
        >
          <Plus className="size-3" />
          {creating ? "Creating..." : "New session"}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!hasWorkspace ? (
          <div className="p-4 text-xs text-muted-foreground">
            Open a workspace folder to see OpenCode sessions for this project.
          </div>
        ) : (
          <>
            {error ? (
              <div
                role="alert"
                className="m-2 rounded-md border border-destructive/40 p-2 text-xs text-destructive"
              >
                {error}
              </div>
            ) : null}

            {createError ? (
              <div
                role="alert"
                className="m-2 rounded-md border border-destructive/40 p-2 text-xs text-destructive"
              >
                {createError}
              </div>
            ) : null}

            {loading && groups.length === 0 ? (
              <div className="p-4 text-xs text-muted-foreground">Loading sessions...</div>
            ) : null}

            {groups.length === 0 && !loading ? (
              <div className="flex flex-col gap-2 p-4 text-xs text-muted-foreground">
                <span>No OpenCode sessions found for this workspace.</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={() => postToExtension({ type: "retry" })}
                >
                  Refresh
                </Button>
              </div>
            ) : null}

            {groups.map((group) => (
              <section key={group.label} className="flex flex-col gap-1 p-2">
                <h2 className="px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </h2>
                {group.sessions.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    className="w-full truncate rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    title={session.title}
                    onClick={() => postToExtension({ type: "openSession", sessionID: session.id })}
                  >
                    {session.title}
                  </button>
                ))}
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
