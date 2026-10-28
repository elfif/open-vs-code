import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { X } from "lucide-react";
import { $getNodeByKey, type NodeKey } from "lexical";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  formatBadgeLabel,
  formatBadgePreview,
  type PromptContextSegment,
} from "@shared/promptContent";

export function ContextBadge({
  segment,
  nodeKey,
}: {
  readonly segment: PromptContextSegment;
  readonly nodeKey: NodeKey;
}) {
  const [editor] = useLexicalComposerContext();
  const label = formatBadgeLabel(segment);

  const remove = () => {
    editor.update(() => {
      $getNodeByKey(nodeKey)?.remove();
    });
    editor.focus();
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="secondary"
          tabIndex={0}
          contentEditable={false}
          className="mx-0.5 max-w-full cursor-default gap-1 align-baseline leading-4"
        >
          <span className="truncate">{label}</span>
          <button
            type="button"
            aria-label={`Remove ${label}`}
            className="-mr-1 rounded-sm p-0.5 hover:bg-background/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              remove();
            }}
          >
            <X aria-hidden="true" className="size-2.5" />
          </button>
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-[min(32rem,80vw)] p-2">
        <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all font-mono text-3xs">
          {formatBadgePreview(segment)}
        </pre>
      </TooltipContent>
    </Tooltip>
  );
}
