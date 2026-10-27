import type { ExtensionToWebview, WebviewToExtension } from "@shared/protocol";

interface VsCodeApi {
  postMessage(message: WebviewToExtension): void;
  getState<T = unknown>(): T | undefined;
  setState<T = unknown>(state: T): void;
}

declare global {
  function acquireVsCodeApi(): VsCodeApi;
}

export const vscode = acquireVsCodeApi();

export function postToExtension(message: WebviewToExtension): void {
  vscode.postMessage(message);
}

export function onExtensionMessage(handler: (message: ExtensionToWebview) => void): () => void {
  const listener = (event: MessageEvent<ExtensionToWebview>) => {
    handler(event.data);
  };

  window.addEventListener("message", listener);

  return () => {
    window.removeEventListener("message", listener);
  };
}
