import { Button } from "@/components/ui/button";
import { postToExtension } from "@/lib/vscode";
import type { SessionGroup } from "@shared/protocol";

interface SessionListProps {
  readonly groups: readonly SessionGroup[];
  readonly loading: boolean;
  readonly error?: string;
  readonly hasWorkspace: boolean;
}

export function SessionList({ groups, loading, error, hasWorkspace }: SessionListProps) {
  if (!hasWorkspace) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        Open a workspace folder to see OpenCode sessions for this project.
      </div>
    );
  }

  if (loading && groups.length === 0) {
    return <div className="p-4 text-xs text-muted-foreground">Loading sessions...</div>;
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col gap-2 p-4 text-xs text-muted-foreground">
        <span>No OpenCode sessions found for this workspace.</span>
        <Button variant="outline" size="sm" onClick={() => postToExtension({ type: "retry" })}>
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-2">
      {error ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 p-2 text-xs text-destructive"
        >
          {error}
        </div>
      ) : null}

      {groups.map((group) => (
        <section key={group.label} className="flex flex-col gap-1">
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
    </div>
  );
}
