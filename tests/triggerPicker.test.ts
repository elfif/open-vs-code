import { describe, expect, it } from "vitest";

import {
  calculateTriggerMenuPosition,
  filterCommandOptions,
  filterSkillOptions,
  findTriggerQuery,
} from "../webview/src/lib/triggerPicker";
import type { CommandOption, SkillOption } from "../src/shared/protocol";

const commands: readonly CommandOption[] = [
  { name: "init", description: "Initialize a project" },
  { name: "review", description: "Review changes" },
  { name: "hidden" },
];

const skills: readonly SkillOption[] = [
  { id: "git-release", name: "Git Release" },
  { id: "review", name: "Code Review" },
  { id: "hidden", name: "Internal Tool" },
];

describe("findTriggerQuery", () => {
  it("finds a command at the start of the text", () => {
    expect(findTriggerQuery("/rel", 4, "/", { startOnly: true })).toEqual({
      start: 0,
      end: 4,
      query: "rel",
      trigger: "/",
    });
  });

  it("keeps slashes inside a command name", () => {
    expect(findTriggerQuery("/foo/bar", 8, "/", { startOnly: true })).toEqual({
      start: 0,
      end: 8,
      query: "foo/bar",
      trigger: "/",
    });
  });

  it("does not find a command after whitespace", () => {
    expect(findTriggerQuery("hello /git", 10, "/", { startOnly: true })).toBeNull();
  });

  it("does not find a command once the query contains whitespace", () => {
    expect(findTriggerQuery("/release now", 12, "/", { startOnly: true })).toBeNull();
  });

  it("finds a skill after whitespace", () => {
    expect(findTriggerQuery("hello /git @rel", 15, "@")).toEqual({
      start: 11,
      end: 15,
      query: "rel",
      trigger: "@",
    });
  });

  it("does not trigger a skill inside a word", () => {
    expect(findTriggerQuery("hello@rel", 9, "@")).toBeNull();
  });

  it("does not trigger a skill in an email-like address", () => {
    expect(findTriggerQuery("user@example.com/path", 21, "@")).toBeNull();
  });
});

describe("filterCommandOptions", () => {
  it("returns all commands for an empty query", () => {
    expect(filterCommandOptions(commands, "")).toEqual([
      { kind: "command", id: "init", label: "/init", description: "Initialize a project" },
      { kind: "command", id: "review", label: "/review", description: "Review changes" },
      { kind: "command", id: "hidden", label: "/hidden" },
    ]);
  });

  it("matches command names case-insensitively", () => {
    expect(filterCommandOptions(commands, "REV")).toEqual([
      { kind: "command", id: "review", label: "/review", description: "Review changes" },
    ]);
  });

  it("returns no options when nothing matches", () => {
    expect(filterCommandOptions(commands, "missing")).toEqual([]);
  });
});

describe("filterSkillOptions", () => {
  it("returns all skills for an empty query", () => {
    expect(filterSkillOptions(skills, "")).toEqual([
      { kind: "skill", id: "git-release", label: "Git Release" },
      { kind: "skill", id: "review", label: "Code Review" },
      { kind: "skill", id: "hidden", label: "Internal Tool" },
    ]);
  });

  it("matches names and ids case-insensitively", () => {
    expect(filterSkillOptions(skills, "GIT")).toEqual([
      { kind: "skill", id: "git-release", label: "Git Release" },
    ]);
    expect(filterSkillOptions(skills, "review")).toEqual([
      { kind: "skill", id: "review", label: "Code Review" },
    ]);
  });

  it("returns no options when nothing matches", () => {
    expect(filterSkillOptions(skills, "missing")).toEqual([]);
  });
});

describe("calculateTriggerMenuPosition", () => {
  const container = { left: 100, top: 200, width: 300, height: 400 };

  it("places the menu below the caret when there is room", () => {
    expect(
      calculateTriggerMenuPosition(
        { left: 150, top: 250, bottom: 265 },
        { width: 256, height: 120 },
        container,
      ),
    ).toEqual({ left: 44, top: 69 });
  });

  it("flips the menu above the caret when below would overflow", () => {
    expect(
      calculateTriggerMenuPosition(
        { left: 150, top: 585, bottom: 600 },
        { width: 256, height: 120 },
        container,
      ),
    ).toEqual({ left: 44, top: 261 });
  });

  it("clamps horizontal overflow to the container", () => {
    expect(
      calculateTriggerMenuPosition(
        { left: 380, top: 250, bottom: 265 },
        { width: 256, height: 120 },
        container,
      ),
    ).toEqual({ left: 44, top: 69 });
  });
});
