export interface SelectionPosition {
  readonly line: number;
  readonly character: number;
}

export interface SelectedLineRange {
  readonly startLine: number;
  readonly endLine: number;
}

export function getSelectedLineRange(
  start: SelectionPosition,
  end: SelectionPosition,
): SelectedLineRange {
  const reversed =
    end.line < start.line || (end.line === start.line && end.character < start.character);
  const first = reversed ? end : start;
  const last = reversed ? start : end;
  const endLine = last.character === 0 && last.line > first.line ? last.line - 1 : last.line;

  return { startLine: first.line + 1, endLine: endLine + 1 };
}
