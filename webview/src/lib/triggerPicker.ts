import type { CommandOption, SkillOption } from "@shared/protocol";

export type TriggerKind = "command" | "skill";
export type TriggerCharacter = "/" | "@";

export interface TriggerQuery {
  readonly start: number;
  readonly end: number;
  readonly query: string;
  readonly trigger: TriggerCharacter;
}

export interface TriggerMenuCaretRect {
  readonly left: number;
  readonly top: number;
  readonly bottom: number;
}

export interface TriggerMenuSize {
  readonly width: number;
  readonly height: number;
}

export interface TriggerMenuContainerRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface TriggerMenuPosition {
  readonly left: number;
  readonly top: number;
}

export interface PickerOption {
  readonly kind: TriggerKind;
  readonly id: string;
  readonly label: string;
  readonly description?: string;
}

export function findTriggerQuery(
  text: string,
  caret: number,
  trigger: TriggerCharacter,
  options: { readonly startOnly?: boolean } = {},
): TriggerQuery | null {
  if (caret <= 0 || caret > text.length) {
    return null;
  }

  if (options.startOnly) {
    if (text[0] !== trigger) {
      return null;
    }

    const query = text.slice(1, caret);

    if (/\s/.test(query)) {
      return null;
    }

    return { start: 0, end: caret, query, trigger };
  }

  const start = text.lastIndexOf(trigger, caret - 1);

  if (start < 0) {
    return null;
  }

  const query = text.slice(start + 1, caret);

  if (/\s/.test(query)) {
    return null;
  }

  const before = start > 0 ? text[start - 1] : "";

  if (before && !/\s/.test(before)) {
    return null;
  }

  return { start, end: caret, query, trigger };
}

export function filterCommandOptions(
  commands: readonly CommandOption[],
  query: string,
): readonly PickerOption[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  const filtered = normalizedQuery
    ? commands.filter((command) => command.name.toLocaleLowerCase().includes(normalizedQuery))
    : commands;

  return filtered.map((command) => ({
    kind: "command",
    id: command.name,
    label: `/${command.name}`,
    ...(command.description ? { description: command.description } : {}),
  }));
}

export function filterSkillOptions(
  skills: readonly SkillOption[],
  query: string,
): readonly PickerOption[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  const filtered = normalizedQuery
    ? skills.filter(
        (skill) =>
          skill.name.toLocaleLowerCase().includes(normalizedQuery) ||
          skill.id.toLocaleLowerCase().includes(normalizedQuery),
      )
    : skills;

  return filtered.map((skill) => ({
    kind: "skill",
    id: skill.id,
    label: skill.name,
  }));
}

export function calculateTriggerMenuPosition(
  caret: TriggerMenuCaretRect,
  menu: TriggerMenuSize,
  container: TriggerMenuContainerRect,
  gap = 4,
): TriggerMenuPosition {
  const left = clamp(caret.left - container.left, 0, Math.max(0, container.width - menu.width));

  const below = caret.bottom - container.top + gap;
  const above = caret.top - container.top - menu.height - gap;
  const top =
    below + menu.height <= container.height
      ? below
      : clamp(above, 0, Math.max(0, container.height - menu.height));

  return { left, top };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
