import { describe, expect, it } from "vitest";

import { parseCommandInvocation } from "../src/shared/promptCommands";
import type { CommandOption } from "../src/shared/protocol";

const commands: readonly CommandOption[] = [
  { name: "review", description: "Review changes" },
  { name: "foo/bar" },
];

describe("parseCommandInvocation", () => {
  it("parses a known command with arguments", () => {
    expect(parseCommandInvocation("/review src/App.tsx", commands)).toEqual({
      name: "review",
      args: "src/App.tsx",
    });
  });

  it("parses a known command without arguments", () => {
    expect(parseCommandInvocation("/review", commands)).toEqual({ name: "review", args: "" });
  });

  it("keeps multiline arguments after the command name", () => {
    expect(parseCommandInvocation("/review\nline one\nline two", commands)).toEqual({
      name: "review",
      args: "line one\nline two",
    });
  });

  it("supports command names containing slashes", () => {
    expect(parseCommandInvocation("/foo/bar baz", commands)).toEqual({
      name: "foo/bar",
      args: "baz",
    });
  });

  it("does not parse unknown commands", () => {
    expect(parseCommandInvocation("/missing args", commands)).toBeNull();
  });

  it("does not parse commands that are not at the start", () => {
    expect(parseCommandInvocation("please /review this", commands)).toBeNull();
  });
});
