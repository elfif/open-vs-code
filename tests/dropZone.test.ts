import { describe, expect, it } from "vitest";

import {
  canAcceptDragTypes,
  canAcceptPaste,
  EMPTY_TRANSFER,
  resolveTransferUris,
  snapshotTransfer,
  type TransferSource,
} from "../webview/src/lib/dropZone";

function fakeTransfer(input: {
  types?: string[];
  fileCount?: number;
  uriList?: string;
  plainText?: string;
  throws?: boolean;
}): TransferSource {
  const formats: Record<string, string> = {
    "text/uri-list": input.uriList ?? "",
    "text/plain": input.plainText ?? "",
  };

  return {
    types: input.types ?? [],
    files: { length: input.fileCount ?? 0 },
    getData: (format: string) => {
      if (input.throws) {
        throw new Error("not readable");
      }

      return formats[format] ?? "";
    },
  };
}

describe("canAcceptDragTypes", () => {
  it("accepts desktop file drags", () => {
    expect(canAcceptDragTypes(["Files"])).toBe(true);
  });

  it("accepts VS Code tree drags by uri-list or private tree mime type", () => {
    expect(canAcceptDragTypes(["text/plain", "text/uri-list"])).toBe(true);
    expect(canAcceptDragTypes(["application/vnd.code.tree.explorer", "text/uri-list"])).toBe(true);
    expect(canAcceptDragTypes(["application/vnd.code.tree.openEditors"])).toBe(true);
  });

  it("rejects plain text so internal selection drags are left alone", () => {
    expect(canAcceptDragTypes(["text/plain"])).toBe(false);
    expect(canAcceptDragTypes(["text/html"])).toBe(false);
    expect(canAcceptDragTypes([])).toBe(false);
  });

  it("matches transfer types case-insensitively", () => {
    expect(canAcceptDragTypes(["files"])).toBe(true);
    expect(canAcceptDragTypes(["TEXT/URI-LIST"])).toBe(true);
    expect(canAcceptDragTypes(["APPLICATION/VND.CODE.TREE.EXPLORER"])).toBe(true);
    expect(canAcceptDragTypes([" Text/URI-List "])).toBe(true);
  });
});

describe("snapshotTransfer", () => {
  it("returns an empty snapshot for a missing transfer", () => {
    expect(snapshotTransfer(null)).toEqual(EMPTY_TRANSFER);
  });

  it("captures types, file count, uri-list, and plain text", () => {
    const snapshot = snapshotTransfer(
      fakeTransfer({
        types: ["Files", "text/uri-list", "text/plain"],
        fileCount: 2,
        uriList: "file:///tmp/a.txt",
        plainText: "a.txt",
      }),
    );

    expect(snapshot).toEqual({
      types: ["Files", "text/uri-list", "text/plain"],
      fileCount: 2,
      uriList: "file:///tmp/a.txt",
      plainText: "a.txt",
    });
  });

  it("degrades to empty strings when getData is unreadable", () => {
    const snapshot = snapshotTransfer(fakeTransfer({ types: ["Files"], throws: true }));

    expect(snapshot).toEqual({
      types: ["Files"],
      fileCount: 0,
      uriList: "",
      plainText: "",
    });
  });
});

describe("resolveTransferUris", () => {
  it("keeps readable schemes from the uri-list", () => {
    const snapshot = snapshotTransfer(
      fakeTransfer({
        uriList: "file:///tmp/a.txt\r\nvscode-remote://wsl+ubuntu/tmp/b.txt\r\n# comment",
      }),
    );

    expect(resolveTransferUris(snapshot)).toEqual([
      "file:///tmp/a.txt",
      "vscode-remote://wsl+ubuntu/tmp/b.txt",
    ]);
  });

  it("falls back to plain text when the uri-list has nothing readable", () => {
    const snapshot = snapshotTransfer(
      fakeTransfer({ uriList: "https://example.com/x.png", plainText: "file:///tmp/c.txt" }),
    );

    expect(resolveTransferUris(snapshot)).toEqual(["file:///tmp/c.txt"]);
  });

  it("drops unsupported locations entirely", () => {
    const snapshot = snapshotTransfer(
      fakeTransfer({ uriList: "https://example.com", plainText: "just words" }),
    );

    expect(resolveTransferUris(snapshot)).toEqual([]);
  });
});

describe("canAcceptPaste", () => {
  it("accepts clipboard files", () => {
    expect(canAcceptPaste(snapshotTransfer(fakeTransfer({ fileCount: 1 })))).toBe(true);
  });

  it("accepts a readable dropped uri without files", () => {
    expect(canAcceptPaste(snapshotTransfer(fakeTransfer({ uriList: "file:///tmp/a.txt" })))).toBe(
      true,
    );
  });

  it("rejects ordinary text so plain-text paste keeps working", () => {
    expect(canAcceptPaste(snapshotTransfer(fakeTransfer({ plainText: "hello" })))).toBe(false);
    expect(canAcceptPaste(EMPTY_TRANSFER)).toBe(false);
  });
});
