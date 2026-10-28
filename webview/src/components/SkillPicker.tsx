import { useEffect, useRef } from "react";

import type { SkillOption } from "@shared/protocol";
import type { SkillMenuPosition } from "@/lib/skillTrigger";

interface SkillPickerProps {
  readonly options: readonly SkillOption[];
  readonly activeIndex: number;
  readonly position: SkillMenuPosition | null;
  readonly visible: boolean;
  readonly onSelect: (skill: SkillOption) => void;
  readonly onHover: (index: number) => void;
}

export function SkillPicker({
  options,
  activeIndex,
  position,
  visible,
  onSelect,
  onHover,
  ...props
}: SkillPickerProps & React.RefAttributes<HTMLDivElement>) {
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    optionRefs.current = optionRefs.current.slice(0, options.length);
    optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, options.length]);

  return (
    <div
      {...props}
      role="listbox"
      aria-label="Skills"
      className="absolute z-20 max-h-56 w-64 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        visibility: visible ? "visible" : "hidden",
      }}
    >
      {options.length === 0 ? (
        <div role="status" className="px-2 py-1.5 text-xs text-muted-foreground">
          No matching skills.
        </div>
      ) : (
        options.map((skill, index) => (
          <button
            key={skill.id}
            ref={(element) => {
              optionRefs.current[index] = element;
            }}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            className={`block w-full truncate rounded-sm px-2 py-1.5 text-left text-xs focus:outline-none ${
              index === activeIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"
            }`}
            onMouseDown={(event) => {
              event.preventDefault();
              onSelect(skill);
            }}
            onMouseEnter={() => onHover(index)}
          >
            {skill.name}
          </button>
        ))
      )}
    </div>
  );
}
