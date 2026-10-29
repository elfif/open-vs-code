import { useEffect, useRef } from "react";

import type { PickerOption, TriggerMenuPosition } from "@/lib/triggerPicker";

interface PromptPickerProps {
  readonly label: string;
  readonly options: readonly PickerOption[];
  readonly activeIndex: number;
  readonly position: TriggerMenuPosition | null;
  readonly visible: boolean;
  readonly onSelect: (option: PickerOption) => void;
  readonly onHover: (index: number) => void;
}

export function PromptPicker({
  label,
  options,
  activeIndex,
  position,
  visible,
  onSelect,
  onHover,
  ...props
}: PromptPickerProps & React.RefAttributes<HTMLDivElement>) {
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    optionRefs.current = optionRefs.current.slice(0, options.length);
    optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, options.length]);

  return (
    <div
      {...props}
      role="listbox"
      aria-label={label}
      className="absolute z-20 max-h-56 w-72 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        visibility: visible ? "visible" : "hidden",
      }}
    >
      {options.length === 0 ? (
        <div role="status" className="px-2 py-1.5 text-xs text-muted-foreground">
          No matching {label.toLowerCase()}.
        </div>
      ) : (
        options.map((option, index) => (
          <button
            key={`${option.kind}:${option.id}`}
            ref={(element) => {
              optionRefs.current[index] = element;
            }}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            className={`block w-full rounded-sm px-2 py-1.5 text-left focus:outline-none ${
              index === activeIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"
            }`}
            onMouseDown={(event) => {
              event.preventDefault();
              onSelect(option);
            }}
            onMouseEnter={() => onHover(index)}
          >
            <span className="block truncate text-xs">{option.label}</span>
            {option.description ? (
              <span className="block truncate text-2xs text-muted-foreground">
                {option.description}
              </span>
            ) : null}
          </button>
        ))
      )}
    </div>
  );
}
