export function parseUriList(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

export function isSupportedDocumentUri(value: string): boolean {
  try {
    const uri = new URL(value);

    return uri.protocol === "file:" || uri.protocol === "vscode-remote:";
  } catch {
    return false;
  }
}

export function extractSupportedUris(raw: string): {
  readonly supported: readonly string[];
  readonly unsupported: readonly string[];
} {
  const parsed = parseUriList(raw);

  return {
    supported: parsed.filter(isSupportedDocumentUri),
    unsupported: parsed.filter((value) => !isSupportedDocumentUri(value)),
  };
}
