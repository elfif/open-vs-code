import { describe, expect, it } from "vitest";

import {
  formatBadgeLabel,
  formatBadgePreview,
  isPromptEmpty,
  isPromptSegment,
  type PromptContextSegment,
} from "../src/shared/promptContent";

const selection: PromptContextSegment = {
  kind: "selection",
  path: "/workspace/src/App.tsx",
  startLine: 12,
  endLine: 14,
  code: "const first = true;\nconst second = false;",
  languageId: "typescriptreact",
};

const document: PromptContextSegment = {
  kind: "document",
  id: "doc_1",
  name: "notes.md",
  mime: "text/markdown",
  size: 2048,
  path: "docs/notes.md",
};

const skill: PromptContextSegment = {
  kind: "skill",
  id: "git-release",
  name: "Git Release",
};

describe("formatBadgeLabel", () => {
  it("shows filename and size for documents", () => {
    expect(formatBadgeLabel(document)).toBe("notes.md (2.0 KB)");
  });

  it("shows a single line or a line range for selections", () => {
    expect(formatBadgeLabel({ ...selection, endLine: 12 })).toBe("App.tsx - l12");
    expect(formatBadgeLabel(selection)).toBe("App.tsx - l12 - 14");
  });

  it("shows the skill id with a slash", () => {
    expect(formatBadgeLabel(skill)).toBe("/git-release");
  });
});

describe("formatBadgePreview", () => {
  it("shows document path, mime, and size", () => {
    expect(formatBadgePreview(document)).toBe("docs/notes.md\ntext/markdown • 2.0 KB");
  });

  it("shows the skill name and id", () => {
    expect(formatBadgePreview(skill)).toBe("Skill: Git Release\nID: git-release");
  });

  it("shows captured code and truncates it after twelve lines", () => {
    const code = Array.from({ length: 14 }, (_, index) => `line ${index + 1}`).join("\n");
    const preview = formatBadgePreview({ ...selection, code });

    expect(preview).toContain("/workspace/src/App.tsx (lines: 12 - 14)");
    expect(preview).toContain("line 1\nline 2");
    expect(preview).toContain("line 12\n… (+2 more lines)");
    expect(preview).not.toContain("line 13\n");
  });
});

describe("isPromptEmpty", () => {
  it("accepts badges without additional text", () => {
    expect(isPromptEmpty([document])).toBe(false);
    expect(isPromptEmpty([selection])).toBe(false);
    expect(isPromptEmpty([skill])).toBe(false);
  });

  it("rejects empty and whitespace-only text", () => {
    expect(isPromptEmpty([])).toBe(true);
    expect(isPromptEmpty([{ kind: "text", text: " \n\t" }])).toBe(true);
  });
});

describe("isPromptSegment", () => {
  it("accepts valid segments", () => {
    expect(isPromptSegment({ kind: "text", text: "hello" })).toBe(true);
    expect(isPromptSegment(document)).toBe(true);
    expect(isPromptSegment(selection)).toBe(true);
    expect(isPromptSegment(skill)).toBe(true);
  });

  it("rejects malformed segments", () => {
    expect(isPromptSegment(null)).toBe(false);
    expect(isPromptSegment({ kind: "document" })).toBe(false);
    expect(isPromptSegment({ ...selection, startLine: 0 })).toBe(false);
    expect(isPromptSegment({ ...selection, startLine: 15 })).toBe(false);
    expect(isPromptSegment({ kind: "skill", id: "", name: "Missing id" })).toBe(false);
    expect(isPromptSegment({ kind: "unknown" })).toBe(false);
  });
});
