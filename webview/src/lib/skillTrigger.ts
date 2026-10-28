import type { SkillOption } from "@shared/protocol";

export interface SkillQuery {
  readonly start: number;
  readonly end: number;
  readonly query: string;
}

export interface SkillMenuCaretRect {
  readonly left: number;
  readonly top: number;
  readonly bottom: number;
}

export interface SkillMenuSize {
  readonly width: number;
  readonly height: number;
}

export interface SkillMenuContainerRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface SkillMenuPosition {
  readonly left: number;
  readonly top: number;
}

export function findSkillQuery(text: string, caret: number): SkillQuery | null {
  if (caret <= 0 || caret > text.length) {
    return null;
  }

  const start = text.lastIndexOf("/", caret - 1);

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

  return { start, end: caret, query };
}

export function filterSkillOptions(
  skills: readonly SkillOption[],
  query: string,
): readonly SkillOption[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  if (!normalizedQuery) {
    return skills;
  }

  return skills.filter(
    (skill) =>
      skill.name.toLocaleLowerCase().includes(normalizedQuery) ||
      skill.id.toLocaleLowerCase().includes(normalizedQuery),
  );
}

export function calculateSkillMenuPosition(
  caret: SkillMenuCaretRect,
  menu: SkillMenuSize,
  container: SkillMenuContainerRect,
  gap = 4,
): SkillMenuPosition {
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
