import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { postToExtension } from "@/lib/vscode";
import type { SessionTab } from "@shared/protocol";

interface SessionTabsProps {
  readonly tabs: readonly SessionTab[];
  readonly activeTabID: string;
  readonly onCloseTab: (tabID: string) => void;
}

export function SessionTabs({ tabs, activeTabID, onCloseTab }: SessionTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="OpenCode views"
      className="flex min-h-8 shrink-0 items-stretch gap-1 overflow-x-auto border-b border-border bg-background px-1"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeTabID;

        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={active}
            className={`flex max-w-44 shrink-0 items-center gap-1 rounded-t-md border border-b-0 px-2 text-xs ${
              active
                ? "border-border bg-card text-foreground"
                : "border-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
          >
            <button
              type="button"
              className="min-w-0 flex-1 truncate py-1 text-left"
              onClick={() => postToExtension({ type: "activateTab", tabID: tab.id })}
              title={tab.title}
            >
              {tab.title}
            </button>
            {tab.closable ? (
              <Button
                variant="ghost"
                size="icon"
                className="size-5 shrink-0"
                aria-label={`Close ${tab.title}`}
                onClick={() => onCloseTab(tab.id)}
              >
                <X className="size-3" />
              </Button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
