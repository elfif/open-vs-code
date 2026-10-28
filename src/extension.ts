import * as vscode from "vscode";

import { getSelectedLineRange } from "./sidebar/selectionContext";
import { SidebarProvider } from "./sidebar/SidebarProvider";
import type { PromptSelectionSegment } from "./shared/promptContent";

export function activate(context: vscode.ExtensionContext): void {
  const provider = new SidebarProvider(context.extensionUri, context.secrets);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, provider, {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    }),
    vscode.commands.registerCommand("openVsCode.openPanel", async () => {
      await vscode.commands.executeCommand(`${SidebarProvider.viewType}.focus`);
    }),
    vscode.commands.registerCommand(
      "openVsCode.addFilesToSession",
      async (resource?: unknown, resources?: unknown) => {
        const uris = await resolveFileUris(resource, resources);

        if (uris.length === 0) {
          void vscode.window.showWarningMessage("Select a file to add to OpenCode.");
          return;
        }

        await provider.addFiles(uris);
      },
    ),
    vscode.commands.registerCommand("openVsCode.addSelectionToSession", async () => {
      const segments = resolveSelectionSegments();

      if (segments.length === 0) {
        void vscode.window.showWarningMessage(
          "Select code in a file before adding it to OpenCode.",
        );
        return;
      }

      await provider.addContext(segments);
    }),
  );
}

async function resolveFileUris(resource: unknown, resources: unknown): Promise<vscode.Uri[]> {
  const selectedResources = Array.isArray(resources) ? resources : [];
  const targetResources = selectedResources.length > 0 ? selectedResources : [resource];
  const fileUris = targetResources.filter(isFileUri);

  return fileUris.length > 0 ? fileUris : await readExplorerPathsFromClipboard();
}

function resolveSelectionSegments(): PromptSelectionSegment[] {
  const editor = vscode.window.activeTextEditor;

  if (!editor || editor.document.uri.scheme !== "file") {
    return [];
  }

  return editor.selections
    .filter((selection) => !selection.isEmpty)
    .map((selection): PromptSelectionSegment => ({
      kind: "selection",
      path: editor.document.uri.fsPath,
      ...getSelectedLineRange(selection.start, selection.end),
      code: editor.document.getText(selection),
      languageId: editor.document.languageId,
    }));
}

function isFileUri(value: unknown): value is vscode.Uri {
  return value instanceof vscode.Uri && value.scheme === "file";
}

async function readExplorerPathsFromClipboard(): Promise<vscode.Uri[]> {
  const previousClipboard = await vscode.env.clipboard.readText();

  try {
    await vscode.commands.executeCommand("copyFilePath");
    const copiedPaths = await vscode.env.clipboard.readText();

    return copiedPaths
      .split(/\r?\n/)
      .filter((path) => path.length > 0)
      .map((path) => vscode.Uri.file(path));
  } catch {
    return [];
  } finally {
    await vscode.env.clipboard.writeText(previousClipboard);
  }
}

export function deactivate(): void {
  // Extension cleanup is handled through context.subscriptions.
}
