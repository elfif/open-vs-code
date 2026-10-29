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
import { PromptPicker } from "@/components/PromptPicker";
import {
  calculateTriggerMenuPosition,
  filterCommandOptions,
  filterSkillOptions,
  findTriggerQuery,
  type PickerOption,
  type TriggerMenuCaretRect,
  type TriggerMenuPosition,
  type TriggerQuery,
} from "@/lib/triggerPicker";
import type { CommandOption, SkillOption } from "@shared/protocol";

interface PickerMenuState {
  readonly query: TriggerQuery;
  readonly options: readonly PickerOption[];
  readonly activeIndex: number;
  readonly caretRect: TriggerMenuCaretRect;
}

interface PromptPickerPluginProps {
  readonly commands: readonly CommandOption[];
  readonly skills: readonly SkillOption[];
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly disabled: boolean;
}

export function PromptPickerPlugin({
  commands,
  skills,
  containerRef,
  disabled,
}: PromptPickerPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [menu, setMenu] = useState<PickerMenuState | null>(null);
  const [position, setPosition] = useState<TriggerMenuPosition | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<PickerMenuState | null>(null);
  const selectOptionRef = useRef<(option: PickerOption) => void>(() => undefined);

  const selectOption = useCallback(
    (option: PickerOption) => {
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

        const query = findTriggerQuery(
          node.getTextContent(),
          anchor.offset,
          option.kind === "command" ? "/" : "@",
          {
            startOnly: option.kind === "command",
          },
        );

        if (!query) {
          return;
        }

        selection.anchor.set(node.getKey(), query.start, "text");
        selection.focus.set(node.getKey(), query.end, "text");
        selection.insertNodes([
          $createContextBadgeNode(
            option.kind === "command"
              ? {
                  kind: "command",
                  name: option.id,
                  ...(option.description ? { description: option.description } : {}),
                }
              : { kind: "skill", id: option.id, name: option.label },
          ),
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
    selectOptionRef.current = selectOption;
  }, [selectOption]);

  useLayoutEffect(
    () =>
      editor.registerUpdateListener(({ editorState }) => {
        if (disabled) {
          setMenu(null);
          return;
        }

        let nextMenu: PickerMenuState | null = null;

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

          const text = node.getTextContent();
          const commandQuery = findTriggerQuery(text, anchor.offset, "/", { startOnly: true });

          if (commandQuery) {
            const caretRect = getCaretRect();

            if (!caretRect) {
              return;
            }

            nextMenu = {
              query: commandQuery,
              options: filterCommandOptions(commands, commandQuery.query),
              activeIndex: 0,
              caretRect,
            };
            return;
          }

          const skillQuery = findTriggerQuery(text, anchor.offset, "@");

          if (!skillQuery) {
            return;
          }

          const caretRect = getCaretRect();

          if (!caretRect) {
            return;
          }

          nextMenu = {
            query: skillQuery,
            options: filterSkillOptions(skills, skillQuery.query),
            activeIndex: 0,
            caretRect,
          };
        });

        setMenu(nextMenu);
      }),
    [commands, disabled, editor, skills],
  );

  useLayoutEffect(() => {
    if (!menu || !containerRef.current || !pickerRef.current) {
      setPosition(null);
      return;
    }

    const container = containerRef.current.getBoundingClientRect();
    const picker = pickerRef.current.getBoundingClientRect();
    const next = calculateTriggerMenuPosition(
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
          const option = current.options[current.activeIndex];

          if (option) {
            event.preventDefault();
            selectOptionRef.current(option);
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
    <PromptPicker
      ref={pickerRef}
      label={menu.query.trigger === "/" ? "Commands" : "Skills"}
      options={menu.options}
      activeIndex={menu.activeIndex}
      position={position}
      visible={position !== null}
      onSelect={selectOption}
      onHover={(index) => setMenu((state) => (state ? { ...state, activeIndex: index } : state))}
    />
  );
}

function getCaretRect(): TriggerMenuCaretRect | null {
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
