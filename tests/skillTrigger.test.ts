import { describe, expect, it } from "vitest";

import {
  calculateSkillMenuPosition,
  filterSkillOptions,
  findSkillQuery,
} from "../webview/src/lib/skillTrigger";
import type { SkillOption } from "../src/shared/protocol";

const skills: readonly SkillOption[] = [
  { id: "git-release", name: "Git Release" },
  { id: "review", name: "Code Review" },
  { id: "hidden", name: "Internal Tool" },
];

describe("findSkillQuery", () => {
  it("finds a slash at the start of the text", () => {
    expect(findSkillQuery("/rel", 4)).toEqual({ start: 0, end: 4, query: "rel" });
  });

  it("finds a slash after whitespace", () => {
    expect(findSkillQuery("hello /git", 10)).toEqual({ start: 6, end: 10, query: "git" });
  });

  it("does not trigger before the slash", () => {
    expect(findSkillQuery("/rel", 0)).toBeNull();
  });

  it("does not trigger inside a word", () => {
    expect(findSkillQuery("hello/rel", 9)).toBeNull();
  });

  it("does not trigger after a slash in a path", () => {
    expect(findSkillQuery("https://example.com/path", 24)).toBeNull();
  });

  it("does not trigger once the query contains whitespace", () => {
    expect(findSkillQuery("/release now", 12)).toBeNull();
  });
});

describe("filterSkillOptions", () => {
  it("returns all skills for an empty query", () => {
    expect(filterSkillOptions(skills, "")).toEqual(skills);
  });

  it("matches names and ids case-insensitively", () => {
    expect(filterSkillOptions(skills, "GIT")).toEqual([skills[0]]);
    expect(filterSkillOptions(skills, "review")).toEqual([skills[1]]);
  });

  it("returns no options when nothing matches", () => {
    expect(filterSkillOptions(skills, "missing")).toEqual([]);
  });
});

describe("calculateSkillMenuPosition", () => {
  const container = { left: 100, top: 200, width: 300, height: 400 };

  it("places the menu below the caret when there is room", () => {
    expect(
      calculateSkillMenuPosition(
        { left: 150, top: 250, bottom: 265 },
        { width: 256, height: 120 },
        container,
      ),
    ).toEqual({ left: 44, top: 69 });
  });

  it("flips the menu above the caret when below would overflow", () => {
    expect(
      calculateSkillMenuPosition(
        { left: 150, top: 585, bottom: 600 },
        { width: 256, height: 120 },
        container,
      ),
    ).toEqual({ left: 44, top: 261 });
  });

  it("clamps horizontal overflow to the container", () => {
    expect(
      calculateSkillMenuPosition(
        { left: 380, top: 250, bottom: 265 },
        { width: 256, height: 120 },
        container,
      ),
    ).toEqual({ left: 44, top: 69 });
  });
});
