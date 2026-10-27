import { describe, expect, it } from "vitest";

import { getSelectedLineRange } from "../src/sidebar/selectionContext";

describe("getSelectedLineRange", () => {
  it("returns one-based inclusive line numbers", () => {
    expect(getSelectedLineRange({ line: 2, character: 4 }, { line: 5, character: 8 })).toEqual({
      startLine: 3,
      endLine: 6,
    });
  });

  it("supports single-line and reversed selections", () => {
    expect(getSelectedLineRange({ line: 4, character: 8 }, { line: 4, character: 2 })).toEqual({
      startLine: 5,
      endLine: 5,
    });
    expect(getSelectedLineRange({ line: 8, character: 2 }, { line: 6, character: 1 })).toEqual({
      startLine: 7,
      endLine: 9,
    });
  });

  it("excludes an ending line when the selection ends at column zero", () => {
    expect(getSelectedLineRange({ line: 2, character: 1 }, { line: 5, character: 0 })).toEqual({
      startLine: 3,
      endLine: 5,
    });
    expect(getSelectedLineRange({ line: 5, character: 0 }, { line: 2, character: 1 })).toEqual({
      startLine: 3,
      endLine: 5,
    });
  });
});
