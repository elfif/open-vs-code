import { ChevronsUpDown } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  groupModelsByProvider,
  selectedAgentColor,
  selectedModelOption,
} from "@/lib/promptSelection";
import type { ModelOption, PromptCatalog, PromptSelection } from "@shared/protocol";

const selectClassName =
  "h-8 min-w-0 rounded-md border border-input bg-input px-2 text-xs text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

interface PromptToolbarProps {
  readonly catalog: PromptCatalog;
  readonly selection: PromptSelection;
  readonly disabled: boolean;
  readonly onAgentChange: (agentID: string) => void;
  readonly onModelChange: (model: ModelOption) => void;
  readonly onVariantChange: (variant: string | undefined) => void;
}

export function PromptToolbar({
  catalog,
  selection,
  disabled,
  onAgentChange,
  onModelChange,
  onVariantChange,
}: PromptToolbarProps) {
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedModel = selectedModelOption(catalog, selection);
  const groups = groupModelsByProvider(catalog, query);
  const agentColor = selectedAgentColor(catalog, selection);
  const agentAccentStyle = agentColor ? { borderLeft: `4px solid ${agentColor}` } : undefined;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <select
        aria-label="Agent"
        className={`${selectClassName} max-w-32 flex-1`}
        style={agentAccentStyle}
        value={selection.agent}
        disabled={disabled}
        onChange={(event) => onAgentChange(event.target.value)}
      >
        {catalog.agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.name}
          </option>
        ))}
      </select>

      <Dialog
        open={modelPickerOpen}
        onOpenChange={(open) => {
          setModelPickerOpen(open);
          if (open) {
            setQuery("");
          }
        }}
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-w-0 max-w-48 flex-1 justify-between px-2"
          disabled={disabled}
          title={selectedModel?.name ?? selection.model.id}
          onClick={() => setModelPickerOpen(true)}
        >
          <span className="truncate">{selectedModel?.name ?? selection.model.id}</span>
          <ChevronsUpDown className="size-3 shrink-0 text-muted-foreground" />
        </Button>
        <DialogContent
          aria-describedby={undefined}
          className="flex max-h-[80vh] flex-col gap-2 overflow-hidden p-4 sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle className="text-sm">Select model</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            aria-label="Search models"
            placeholder="Search models or providers..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="min-h-0 overflow-y-auto">
            {groups.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                {catalog.models.length === 0 ? "No models available." : "No matching models."}
              </p>
            ) : (
              groups.map((group) => (
                <section key={group.id} className="mb-2 last:mb-0">
                  <h3 className="px-2 py-1 text-sm font-semibold text-foreground">{group.name}</h3>
                  <div className="ml-3 flex flex-col gap-px border-l border-border pl-1">
                    {group.models.map((model) => {
                      const isSelected =
                        selection.model.providerID === model.providerID &&
                        selection.model.id === model.id;

                      return (
                        <button
                          key={`${model.providerID}:${model.id}`}
                          type="button"
                          aria-current={isSelected ? "true" : undefined}
                          className={`rounded-md px-2 py-1 text-left text-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                            isSelected ? "bg-accent text-accent-foreground" : ""
                          }`}
                          style={isSelected ? agentAccentStyle : undefined}
                          onClick={() => {
                            onModelChange(model);
                            setModelPickerOpen(false);
                          }}
                        >
                          <span className="block truncate">{model.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {selectedModel && selectedModel.variants.length > 0 ? (
        <select
          aria-label="Model variant"
          className={`${selectClassName} max-w-32 flex-1`}
          value={selection.model.variant ?? ""}
          disabled={disabled}
          onChange={(event) => onVariantChange(event.target.value || undefined)}
        >
          <option value="">Default</option>
          {selectedModel.variants.map((variant) => (
            <option key={variant} value={variant}>
              {variant}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}
