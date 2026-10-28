import { extractSupportedUris } from "@shared/uriList";

/**
 * VS Code tree views (Explorer, Open Editors) attach a private payload alongside
 * `text/uri-list` when their rows are dragged.
 */
export const VSCODE_TREE_MIME_PREFIX = "application/vnd.code.tree.";

/**
 * The structural subset of `DataTransfer` this module needs, so the logic can be
 * exercised without a DOM.
 */
export interface TransferSource {
  readonly types: readonly string[];
  readonly files: { readonly length: number };
  getData(format: string): string;
}

/**
 * A DOM-free snapshot of a transfer. `DataTransfer.getData()` is only readable
 * during `dragstart` and `drop`, so callers must snapshot at a readable moment.
 */
export interface TransferSnapshot {
  readonly types: readonly string[];
  readonly fileCount: number;
  readonly uriList: string;
  readonly plainText: string;
}

export const EMPTY_TRANSFER: TransferSnapshot = {
  types: [],
  fileCount: 0,
  uriList: "",
  plainText: "",
};

export function snapshotTransfer(source: TransferSource | null): TransferSnapshot {
  if (!source) {
    return EMPTY_TRANSFER;
  }

  return {
    types: Array.from(source.types),
    fileCount: source.files.length,
    uriList: readFormat(source, "text/uri-list"),
    plainText: readFormat(source, "text/plain"),
  };
}

/**
 * Desktop file drags expose `Files`; VS Code tree drags expose `text/uri-list`
 * plus a private tree payload. Bare `text/plain` is deliberately excluded so a text
 * selection dragged inside the composer is never treated as a file drop.
 *
 * Compared case-insensitively: Chromium reports the real file kind as `Files` but
 * lowercases custom types written through `DataTransfer.setData()`.
 */
export function canAcceptDragTypes(types: readonly string[]): boolean {
  return types.some((type) => {
    const normalized = type.trim().toLowerCase();

    return (
      normalized === "files" ||
      normalized === "text/uri-list" ||
      normalized.startsWith(VSCODE_TREE_MIME_PREFIX)
    );
  });
}

export function canAcceptPaste(snapshot: TransferSnapshot): boolean {
  return snapshot.fileCount > 0 || resolveTransferUris(snapshot).length > 0;
}

/**
 * Resolves readable file locations, preferring `text/uri-list` and falling back to
 * `text/plain` because some sources only populate the latter.
 */
export function resolveTransferUris(snapshot: TransferSnapshot): readonly string[] {
  const fromUriList = extractSupportedUris(snapshot.uriList);

  if (fromUriList.supported.length > 0) {
    return fromUriList.supported;
  }

  return extractSupportedUris(snapshot.plainText).supported;
}

function readFormat(source: TransferSource, format: string): string {
  try {
    return source.getData(format);
  } catch {
    return "";
  }
}
