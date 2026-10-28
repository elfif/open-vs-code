import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  KEY_DOWN_COMMAND,
} from "lexical";

import { $createContextBadgeNode } from "@/components/ContextBadgeNode";
import { SkillPicker } from "@/components/SkillPicker";
import {
  calculateSkillMenuPosition,
  filterSkillOptions,
  findSkillQuery,
  type SkillMenuCaretRect,
  type SkillMenuPosition,
  type SkillQuery,
} from "@/lib/skillTrigger";
import type { SkillOption } from "@shared/protocol";

interface SkillMenuState {
  readonly query: SkillQuery;
  readonly options: readonly SkillOption[];
  readonly activeIndex: number;
  readonly caretRect: SkillMenuCaretRect;
}

interface SkillPickerPluginProps {
  readonly skills: readonly SkillOption[];
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly disabled: boolean;
}

export function SkillPickerPlugin({ skills, containerRef, disabled }: SkillPickerPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [menu, setMenu] = useState<SkillMenuState | null>(null);
  const [position, setPosition] = useState<SkillMenuPosition | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<SkillMenuState | null>(null);
  const selectSkillRef = useRef<(skill: SkillOption) => void>(() => undefined);

  const selectSkill = useCallback(
    (skill: SkillOption) => {
      editor.update(() => {
        const selection = $getSelection();

        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          return;
        }

        const anchor = selection.anchor;
        const node = anchor.getNode();

        if (!$isTextNode(node)) {
          return;
        }

        const query = findSkillQuery(node.getTextContent(), anchor.offset);

        if (!query) {
          return;
        }

        selection.anchor.set(node.getKey(), query.start, "text");
        selection.focus.set(node.getKey(), query.end, "text");
        selection.insertNodes([
          $createContextBadgeNode({ kind: "skill", id: skill.id, name: skill.name }),
          $createTextNode(" "),
        ]);
      });

      setMenu(null);
      editor.focus();
    },
    [editor],
  );

  useEffect(() => {
    menuRef.current = menu;
  }, [menu]);

  useEffect(() => {
    selectSkillRef.current = selectSkill;
  }, [selectSkill]);

  useLayoutEffect(
    () =>
      editor.registerUpdateListener(({ editorState }) => {
        if (disabled) {
          setMenu(null);
          return;
        }

        let nextMenu: SkillMenuState | null = null;

        editorState.read(() => {
          const selection = $getSelection();

          if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
            return;
          }

          const anchor = selection.anchor;
          const node = anchor.getNode();

          if (!$isTextNode(node)) {
            return;
          }

          const query = findSkillQuery(node.getTextContent(), anchor.offset);

          if (!query) {
            return;
          }

          const caretRect = getCaretRect();

          if (!caretRect) {
            return;
          }

          nextMenu = {
            query,
            options: filterSkillOptions(skills, query.query),
            activeIndex: 0,
            caretRect,
          };
        });

        setMenu(nextMenu);
      }),
    [disabled, editor, skills],
  );

  useLayoutEffect(() => {
    if (!menu || !containerRef.current || !pickerRef.current) {
      setPosition(null);
      return;
    }

    const container = containerRef.current.getBoundingClientRect();
    const picker = pickerRef.current.getBoundingClientRect();
    const next = calculateSkillMenuPosition(
      menu.caretRect,
      { width: picker.width, height: picker.height },
      {
        left: container.left,
        top: container.top,
        width: container.width,
        height: container.height,
      },
    );

    setPosition((current) =>
      current && current.left === next.left && current.top === next.top ? current : next,
    );
  }, [containerRef, menu]);

  useEffect(() => {
    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event) => {
        const current = menuRef.current;

        if (!current || event.isComposing) {
          return false;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          setMenu(null);
          return true;
        }

        if (current.options.length === 0) {
          return false;
        }

        if (event.key === "ArrowDown") {
          event.preventDefault();
          setMenu((state) =>
            state
              ? {
                  ...state,
                  activeIndex: (state.activeIndex + 1) % state.options.length,
                }
              : state,
          );
          return true;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          setMenu((state) =>
            state
              ? {
                  ...state,
                  activeIndex:
                    (state.activeIndex - 1 + state.options.length) % state.options.length,
                }
              : state,
          );
          return true;
        }

        if (event.key === "Enter" || event.key === "Tab") {
          const skill = current.options[current.activeIndex];

          if (skill) {
            event.preventDefault();
            selectSkillRef.current(skill);
            return true;
          }
        }

        return false;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor]);

  useEffect(() => {
    if (!menu) {
      return;
    }

    const handleMouseDown = (event: MouseEvent) => {
      const container = containerRef.current;

      if (container !== null && event.target instanceof Node && !container.contains(event.target)) {
        setMenu(null);
      }
    };

    const handleBlur = () => {
      setMenu(null);
    };

    const handleViewportChange = () => {
      const caretRect = getCaretRect();

      if (caretRect) {
        setMenu((state) => (state ? { ...state, caretRect } : state));
      }
    };

    const root = editor.getRootElement();

    document.addEventListener("mousedown", handleMouseDown, true);
    root?.addEventListener("blur", handleBlur);
    root?.addEventListener("scroll", handleViewportChange);
    window.addEventListener("resize", handleViewportChange);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown, true);
      root?.removeEventListener("blur", handleBlur);
      root?.removeEventListener("scroll", handleViewportChange);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, [containerRef, editor, menu]);

  if (!menu) {
    return null;
  }

  return (
    <SkillPicker
      ref={pickerRef}
      options={menu.options}
      activeIndex={menu.activeIndex}
      position={position}
      visible={position !== null}
      onSelect={selectSkill}
      onHover={(index) => setMenu((state) => (state ? { ...state, activeIndex: index } : state))}
    />
  );
}

function getCaretRect(): SkillMenuCaretRect | null {
  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0).cloneRange();
  let rect = range.getBoundingClientRect();

  if (rect.height === 0 && rect.width === 0) {
    const element =
      range.startContainer instanceof Element
        ? range.startContainer
        : range.startContainer.parentElement;

    if (!element) {
      return null;
    }

    rect = element.getBoundingClientRect();
  }

  return { left: rect.left, top: rect.top, bottom: rect.bottom };
}
