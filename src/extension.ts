import * as vscode from "vscode";

import { SidebarProvider } from "./sidebar/SidebarProvider";

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
  );
}

export function deactivate(): void {
  // Extension cleanup is handled through context.subscriptions.
}
