import { describe, expect, it } from "vitest";

import { extractSupportedUris, isSupportedDocumentUri, parseUriList } from "../src/shared/uriList";

describe("parseUriList", () => {
  it("splits on LF and CRLF and trims each entry", () => {
    expect(parseUriList("file:///a.txt\r\n  file:///b.txt  \nfile:///c.txt")).toEqual([
      "file:///a.txt",
      "file:///b.txt",
      "file:///c.txt",
    ]);
  });

  it("drops blank lines and comment lines", () => {
    expect(parseUriList("# generated\n\nfile:///a.txt\n\n")).toEqual(["file:///a.txt"]);
  });

  it("returns an empty list for empty input", () => {
    expect(parseUriList("")).toEqual([]);
    expect(parseUriList("   \n  \n")).toEqual([]);
  });
});

describe("isSupportedDocumentUri", () => {
  it("accepts local and remote file schemes", () => {
    expect(isSupportedDocumentUri("file:///tmp/a.txt")).toBe(true);
    expect(isSupportedDocumentUri("vscode-remote://wsl+ubuntu/tmp/a.txt")).toBe(true);
  });

  it("rejects other schemes and malformed values", () => {
    expect(isSupportedDocumentUri("https://example.com/a.png")).toBe(false);
    expect(isSupportedDocumentUri("mailto:someone@example.com")).toBe(false);
    expect(isSupportedDocumentUri("not a uri")).toBe(false);
    expect(isSupportedDocumentUri("")).toBe(false);
  });
});

describe("extractSupportedUris", () => {
  it("partitions supported and unsupported entries", () => {
    const result = extractSupportedUris(
      "file:///a.txt\nhttps://example.com\nvscode-remote://ssh+host/b.md",
    );

    expect(result.supported).toEqual(["file:///a.txt", "vscode-remote://ssh+host/b.md"]);
    expect(result.unsupported).toEqual(["https://example.com"]);
  });

  it("reports no unsupported entries for an empty list", () => {
    expect(extractSupportedUris("")).toEqual({ supported: [], unsupported: [] });
  });
});
