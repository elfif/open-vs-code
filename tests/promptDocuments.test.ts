import { describe, expect, it } from "vitest";

import {
  buildPromptPayload,
  classifyDocument,
  formatBytes,
  MAX_PROMPT_DOCUMENT_BYTES,
  type StagedDocumentContent,
} from "../src/shared/promptDocuments";
import type { PromptSegment } from "../src/shared/promptTypes";

const selection: PromptSegment = {
  kind: "selection",
  path: "/workspace/src/App.tsx",
  startLine: 12,
  endLine: 14,
  code: "const first = true;\nconst second = false;",
  languageId: "typescriptreact",
};

describe("classifyDocument", () => {
  it("classifies source code and compound extensions", () => {
    expect(classifyDocument("App.tsx")).toBe("text");
    expect(classifyDocument("index.d.ts")).toBe("text");
    expect(classifyDocument("view.blade.php")).toBe("text");
    expect(classifyDocument("Dockerfile")).toBe("text");
    expect(classifyDocument(".gitignore")).toBe("text");
    expect(classifyDocument("Makefile")).toBe("text");
  });

  it("classifies images and PDFs", () => {
    expect(classifyDocument("photo.png")).toBe("image");
    expect(classifyDocument("photo.jpg")).toBe("image");
    expect(classifyDocument("photo.webp", "image/webp")).toBe("image");
    expect(classifyDocument("report.pdf", "application/pdf")).toBe("pdf");
  });

  it("rejects binary formats that are not prompt-safe", () => {
    expect(classifyDocument("module.wasm")).toBe("unsupported");
    expect(classifyDocument("data.mat")).toBe("unsupported");
    expect(classifyDocument("doc.docx")).toBe("unsupported");
  });
});

describe("formatBytes", () => {
  it("formats common file sizes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(10 * 1024 * 1024)).toBe("10.0 MB");
  });
});

describe("buildPromptPayload", () => {
  it("keeps plain text unchanged", () => {
    const result = buildPromptPayload([{ kind: "text", text: "  hello\n" }], new Map());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.text).toBe("hello");
      expect(result.payload.files).toEqual([]);
    }
  });

  it("serializes selections", () => {
    const result = buildPromptPayload([selection], new Map());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.text).toBe(`### File content
file: /workspace/src/App.tsx (lines: 12 - 14)
selected content:
\`\`\`typescriptreact
const first = true;
const second = false;
\`\`\``);
    }
  });

  it("injects text documents as fenced file content", () => {
    const documents = new Map<string, StagedDocumentContent>([
      [
        "doc_1",
        {
          id: "doc_1",
          documentKind: "text",
          text: "hello\n",
        },
      ],
    ]);

    const result = buildPromptPayload(
      [
        { kind: "text", text: "Review" },
        {
          kind: "document",
          id: "doc_1",
          name: "notes.txt",
          mime: "text/plain",
          size: 6,
          path: "docs/notes.txt",
        },
      ],
      documents,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.text).toBe(`Review

### File content
file: docs/notes.txt
\`\`\`text
hello
\`\`\``);
    }
  });

  it("uses a dynamic fence for text documents containing backticks", () => {
    const documents = new Map<string, StagedDocumentContent>([
      [
        "doc_1",
        {
          id: "doc_1",
          documentKind: "text",
          text: "const markdown = ````;\n```",
        },
      ],
    ]);

    const result = buildPromptPayload(
      [
        {
          kind: "document",
          id: "doc_1",
          name: "sample.ts",
          mime: "text/plain",
          size: 26,
        },
      ],
      documents,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.text).toContain("`````typescript\nconst markdown = ````;\n```\n`````");
    }
  });

  it("adds native file attachments for images and PDFs", () => {
    const documents = new Map<string, StagedDocumentContent>([
      [
        "img_1",
        {
          id: "img_1",
          documentKind: "image",
          base64: "aW1hZ2U=",
        },
      ],
    ]);

    const result = buildPromptPayload(
      [
        {
          kind: "document",
          id: "img_1",
          name: "diagram.png",
          mime: "image/png",
          size: 6,
        },
      ],
      documents,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.text).toBe(`### Attached file
file: diagram.png
mime: image/png`);
      expect(result.payload.files).toEqual([
        { uri: "data:image/png;base64,aW1hZ2U=", name: "diagram.png" },
      ]);
    }
  });

  it("deduplicates native file attachments by document id", () => {
    const documents = new Map<string, StagedDocumentContent>([
      [
        "img_1",
        {
          id: "img_1",
          documentKind: "image",
          base64: "aW1hZ2U=",
        },
      ],
    ]);
    const segment: PromptSegment = {
      kind: "document",
      id: "img_1",
      name: "diagram.png",
      mime: "image/png",
      size: 6,
    };

    const result = buildPromptPayload([segment, segment], documents);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.files).toHaveLength(1);
      expect(result.payload.text.match(/### Attached file/g)).toHaveLength(2);
    }
  });

  it("returns an error when a referenced document is missing", () => {
    const result = buildPromptPayload(
      [
        {
          kind: "document",
          id: "missing",
          name: "gone.txt",
          mime: "text/plain",
          size: 1,
        },
      ],
      new Map(),
    );

    expect(result).toEqual({
      ok: false,
      error: 'Attached file "gone.txt" is no longer available. Re-add it before sending.',
    });
  });

  it("enforces the aggregate prompt document size limit", () => {
    const bigSize = Math.floor(MAX_PROMPT_DOCUMENT_BYTES / 2) + 1;
    const documents = new Map<string, StagedDocumentContent>([
      ["a", { id: "a", documentKind: "text", text: "a" }],
      ["b", { id: "b", documentKind: "text", text: "b" }],
    ]);

    const result = buildPromptPayload(
      [
        { kind: "document", id: "a", name: "a.txt", mime: "text/plain", size: bigSize },
        { kind: "document", id: "b", name: "b.txt", mime: "text/plain", size: bigSize },
      ],
      documents,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("prompt limit");
    }
  });
});
