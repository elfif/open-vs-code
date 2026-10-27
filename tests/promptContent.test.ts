import { describe, expect, it } from "vitest";

import {
  formatBadgeLabel,
  formatBadgePreview,
  isPromptEmpty,
  isPromptSegment,
  serializePrompt,
  type PromptContextSegment,
} from "../src/shared/promptContent";

const file: PromptContextSegment = { kind: "file", path: "/workspace/src/App.tsx" };
const selection: PromptContextSegment = {
  kind: "selection",
  path: "/workspace/src/App.tsx",
  startLine: 12,
  endLine: 14,
  code: "const first = true;\nconst second = false;",
  languageId: "typescriptreact",
};

describe("formatBadgeLabel", () => {
  it("shows only the filename for file context", () => {
    expect(formatBadgeLabel(file)).toBe("App.tsx");
    expect(formatBadgeLabel({ kind: "file", path: "C:\\workspace\\App.tsx" })).toBe("App.tsx");
  });

  it("shows a single line or a line range for selections", () => {
    expect(formatBadgeLabel({ ...selection, endLine: 12 })).toBe("App.tsx - l12");
    expect(formatBadgeLabel(selection)).toBe("App.tsx - l12 - 14");
  });
});

describe("formatBadgePreview", () => {
  it("shows the full path for files", () => {
    expect(formatBadgePreview(file)).toBe(file.path);
  });

  it("shows captured code and truncates it after twelve lines", () => {
    const code = Array.from({ length: 14 }, (_, index) => `line ${index + 1}`).join("\n");
    const preview = formatBadgePreview({ ...selection, code });

    expect(preview).toContain("/workspace/src/App.tsx (lines 12 - 14)");
    expect(preview).toContain("line 1\nline 2");
    expect(preview).toContain("line 12\n… (+2 more lines)");
    expect(preview).not.toContain("line 13\n");
  });
});

describe("serializePrompt", () => {
  it("places full file paths inline", () => {
    expect(
      serializePrompt([
        { kind: "text", text: "Review " },
        file,
        { kind: "text", text: " please." },
      ]),
    ).toBe("Review /workspace/src/App.tsx please.");
  });

  it("expands a selection with its range and language", () => {
    expect(serializePrompt([selection])).toBe(`### File content
file: /workspace/src/App.tsx (lines: 12 - 14)
selected content:
\`\`\`typescriptreact
const first = true;
const second = false;
\`\`\``);
  });

  it("uses a single line number for one-line selections", () => {
    expect(serializePrompt([{ ...selection, endLine: 12, code: "const first = true;" }])).toContain(
      "file: /workspace/src/App.tsx (lines: 12)",
    );
  });

  it("pads selection blocks with blank lines in a sentence", () => {
    expect(
      serializePrompt([
        { kind: "text", text: "Before" },
        selection,
        { kind: "text", text: "After" },
      ]),
    ).toBe(`Before

### File content
file: /workspace/src/App.tsx (lines: 12 - 14)
selected content:
\`\`\`typescriptreact
const first = true;
const second = false;
\`\`\`

After`);
  });

  it("separates consecutive selection blocks", () => {
    const serialized = serializePrompt([selection, { ...selection, startLine: 20, endLine: 20 }]);
    expect(serialized).toContain("```\n\n### File content");
    expect(serialized).toContain("(lines: 20)");
  });

  it("extends fences when the captured code contains backticks", () => {
    const serialized = serializePrompt([
      { ...selection, code: "const markdown = ````;\n```", languageId: "typescript" },
    ]);

    expect(serialized).toContain("`````typescript\nconst markdown = ````;\n```\n`````");
  });

  it("trims the final prompt", () => {
    expect(serializePrompt([{ kind: "text", text: "  hello\n" }])).toBe("hello");
  });
});

describe("isPromptEmpty", () => {
  it("accepts badges without additional text", () => {
    expect(isPromptEmpty([file])).toBe(false);
    expect(isPromptEmpty([selection])).toBe(false);
  });

  it("rejects empty and whitespace-only text", () => {
    expect(isPromptEmpty([])).toBe(true);
    expect(isPromptEmpty([{ kind: "text", text: " \n\t" }])).toBe(true);
  });
});

describe("isPromptSegment", () => {
  it("accepts valid segments", () => {
    expect(isPromptSegment({ kind: "text", text: "hello" })).toBe(true);
    expect(isPromptSegment(file)).toBe(true);
    expect(isPromptSegment(selection)).toBe(true);
  });

  it("rejects malformed segments", () => {
    expect(isPromptSegment(null)).toBe(false);
    expect(isPromptSegment({ kind: "file" })).toBe(false);
    expect(isPromptSegment({ ...selection, startLine: 0 })).toBe(false);
    expect(isPromptSegment({ ...selection, startLine: 15 })).toBe(false);
    expect(isPromptSegment({ kind: "unknown" })).toBe(false);
  });
});
