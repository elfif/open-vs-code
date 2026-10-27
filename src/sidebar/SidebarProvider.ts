import * as vscode from "vscode";

import {
  SESSIONS_TAB_ID,
  type ExtensionToWebview,
  type LoadStatus,
  type SessionListItem,
  type SessionTab,
  type TranscriptItem,
  type WebviewToExtension,
} from "../shared/protocol";
import { CredentialStore, type StoredCredential } from "../services/credentialStore";
import { OpenCodeApi, normalizeServerUrl, toApiError } from "../services/openCodeApi";
import { PollingController } from "../services/pollingController";
import { groupSessionsByUpdateDate } from "../services/sessionGroups";

const SESSION_LIST_POLL_MS = 10_000;
const ACTIVE_TRANSCRIPT_POLL_MS = 2_000;
const IDLE_TRANSCRIPT_POLL_MS = 20_000;
const OPTIMISTIC_ACTIVE_MS = 5_000;
const REQUEST_TIMEOUT_MS = 10_000;

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "openVsCode.sidebar";

  private readonly credentialStore: CredentialStore;
  private readonly sessionPolling: PollingController;
  private readonly transcriptPolling: PollingController;
  private api: OpenCodeApi | undefined;
  private credential: StoredCredential | undefined;
  private visible = false;
  private authSubmitting = false;
  private creatingSession = false;
  private sessions: SessionListItem[] = [];
  private transcriptItems: TranscriptItem[] = [];
  private tabs: SessionTab[] = [sessionsTab()];
  private activeTabID = SESSIONS_TAB_ID;
  private activeSessionIds = new Set<string>();
  private activePromptSessionID: string | null = null;
  private activePromptAt = 0;
  private promptSubmitting = new Set<string>();
  private queue: Promise<void> = Promise.resolve();

  public constructor(
    private readonly extensionUri: vscode.Uri,
    secrets: vscode.SecretStorage,
  ) {
    this.credentialStore = new CredentialStore(secrets);
    this.sessionPolling = new PollingController(SESSION_LIST_POLL_MS, () =>
      this.enqueue(async () => {
        await this.refreshSessions();
      }),
    );
    this.transcriptPolling = new PollingController(
      () => this.transcriptIntervalMs(),
      () =>
        this.enqueue(async () => {
          if (this.activeTabID === SESSIONS_TAB_ID) {
            return;
          }

          await this.refreshActiveStatus();
          await this.refreshTranscript();
        }),
    );
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "dist", "webview")],
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    this.visible = webviewView.visible;

    const visibilitySubscription = webviewView.onDidChangeVisibility(() => {
      this.visible = webviewView.visible;
      this.applyPollingVisibility();
    });

    const messageSubscription = webviewView.webview.onDidReceiveMessage((message: unknown) => {
      void this.handleMessage(message);
    });

    webviewView.onDidDispose(() => {
      this.sessionPolling.dispose();
      this.transcriptPolling.dispose();
      visibilitySubscription.dispose();
      messageSubscription.dispose();
    });
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (!isWebviewMessage(message)) {
      return;
    }

    switch (message.type) {
      case "ready":
        await this.initialize();
        break;
      case "authenticate":
        await this.authenticate(message.serverUrl, message.password);
        break;
      case "openSession":
        await this.openSession(message.sessionID);
        break;
      case "activateTab":
        await this.activateTab(message.tabID);
        break;
      case "closeTab":
        await this.closeTab(message.tabID);
        break;
      case "retry":
        await this.refreshAll();
        break;
      case "createSession":
        await this.createSession();
        break;
      case "submitPrompt":
        await this.submitPrompt(message.sessionID, message.text);
        break;
    }
  }

  private async initialize(): Promise<void> {
    this.postMessage({ type: "connection", status: "checking" });
    this.postMessage({ type: "workspace", directory: this.getWorkspaceDirectory() });

    const credential = await this.credentialStore.read();
    this.credential = credential;

    if (!credential) {
      this.requireAuth("Connect to an OpenCode server to continue.");
      return;
    }

    try {
      this.api = new OpenCodeApi(credential);
      await this.api.validateConnection(AbortSignal.timeout(REQUEST_TIMEOUT_MS));
      this.postMessage({
        type: "connection",
        status: "connected",
        serverUrl: credential.serverUrl,
      });
      await this.refreshAll();
      this.applyPollingVisibility();
    } catch (error) {
      this.requireAuth(toApiError(error).message);
    }
  }

  private async authenticate(rawServerUrl: string, password: string): Promise<void> {
    if (this.authSubmitting) {
      return;
    }

    this.authSubmitting = true;
    this.stopPolling();
    this.postMessage({ type: "authSubmitting", value: true });

    try {
      const serverUrl = normalizeServerUrl(rawServerUrl);
      const credential: StoredCredential = { serverUrl, password };
      const api = new OpenCodeApi(credential);

      await api.validateConnection(AbortSignal.timeout(REQUEST_TIMEOUT_MS));

      await this.credentialStore.store(credential);
      this.api = api;
      this.credential = credential;

      this.postMessage({ type: "authSubmitting", value: false });
      this.postMessage({ type: "connection", status: "connected", serverUrl });
      this.postMessage({ type: "authSuccess" });
      await this.refreshAll();
      this.applyPollingVisibility();
    } catch (error) {
      this.authSubmitting = false;
      this.postMessage({ type: "authSubmitting", value: false });
      this.requireAuth(toApiError(error).message, safeServerUrl(rawServerUrl));
    }
  }

  private async openSession(sessionID: string): Promise<void> {
    const session = this.sessions.find((candidate) => candidate.id === sessionID);
    this.openTabForSession(session?.title ?? "Session", sessionID);
    await this.refreshTranscript();
  }

  private async activateTab(tabID: string): Promise<void> {
    if (tabID === this.activeTabID || !this.tabs.some((tab) => tab.id === tabID)) {
      return;
    }

    this.activeTabID = tabID;
    this.sendTabs();

    if (tabID === SESSIONS_TAB_ID) {
      this.clearTranscript();
      return;
    }

    await this.refreshTranscript();
  }

  private async closeTab(tabID: string): Promise<void> {
    const tab = this.tabs.find((candidate) => candidate.id === tabID);

    if (!tab?.closable) {
      return;
    }

    const index = this.tabs.findIndex((candidate) => candidate.id === tabID);
    this.tabs = this.tabs.filter((candidate) => candidate.id !== tabID);

    if (this.activeTabID === tabID) {
      const fallback = this.tabs[Math.max(0, index - 1)] ?? sessionsTab();
      this.activeTabID = fallback.id;
    }

    this.sendTabs();

    if (this.activeTabID !== SESSIONS_TAB_ID) {
      await this.refreshTranscript();
    } else {
      this.clearTranscript();
    }
  }

  private async createSession(): Promise<void> {
    if (!this.api || this.creatingSession) {
      return;
    }

    const directory = this.getWorkspaceDirectory();

    if (!directory) {
      this.postMessage({
        type: "sessionCreation",
        status: "error",
        error: "Open a workspace folder before creating an OpenCode session.",
      });
      return;
    }

    this.creatingSession = true;
    this.postMessage({ type: "sessionCreation", status: "creating" });

    try {
      await this.enqueue(async () => {
        if (!this.api) {
          return;
        }

        const session = await this.api.createSession(
          directory,
          AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        );
        this.sessions = [session, ...this.sessions.filter((item) => item.id !== session.id)];
        this.openTabForSession(session.title, session.id);
        await this.refreshSessions();
      });

      this.postMessage({ type: "sessionCreation", status: "idle" });
    } catch (error) {
      const apiError = toApiError(error);

      if (apiError.kind === "auth") {
        this.requireAuth(apiError.message);
        return;
      }

      this.postMessage({
        type: "sessionCreation",
        status: "error",
        error: apiError.message,
      });
    } finally {
      this.creatingSession = false;
    }
  }

  private async submitPrompt(sessionID: string, rawText: string): Promise<void> {
    if (!this.api || this.promptSubmitting.has(sessionID)) {
      return;
    }

    const text = rawText.trim();

    if (!text) {
      return;
    }

    this.promptSubmitting.add(sessionID);
    this.setOptimisticallyActive(sessionID);
    this.postMessage({ type: "promptStatus", sessionID, status: "submitting" });

    try {
      await this.enqueue(async () => {
        if (!this.api) {
          return;
        }

        await this.api.prompt(sessionID, text, AbortSignal.timeout(REQUEST_TIMEOUT_MS));
        this.setOptimisticallyActive(sessionID);
        this.postMessage({ type: "promptStatus", sessionID, status: "accepted" });

        if (this.activeTabID === sessionID) {
          await this.refreshTranscript();
        }

        await this.refreshSessions();
      });
    } catch (error) {
      const apiError = toApiError(error);

      if (apiError.kind === "auth") {
        this.requireAuth(apiError.message);
        return;
      }

      this.clearOptimisticallyActive(sessionID);
      this.postMessage({
        type: "promptStatus",
        sessionID,
        status: "error",
        error: apiError.message,
      });
    } finally {
      this.promptSubmitting.delete(sessionID);
    }
  }

  private async refreshAll(): Promise<void> {
    await this.enqueue(async () => {
      if (!this.api) {
        return;
      }

      await this.refreshActiveStatus();
      const sessionsRefreshed = await this.refreshSessions();

      if (!sessionsRefreshed || !this.api) {
        return;
      }

      await this.refreshTranscript();
    });
  }

  private async refreshActiveStatus(): Promise<void> {
    if (!this.api || this.activeTabID === SESSIONS_TAB_ID) {
      return;
    }

    try {
      const activeSessionIds = await this.api.getActiveSessionIds(
        AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      );
      this.activeSessionIds = activeSessionIds;

      if (
        this.activePromptSessionID &&
        !activeSessionIds.has(this.activePromptSessionID) &&
        Date.now() - this.activePromptAt > OPTIMISTIC_ACTIVE_MS
      ) {
        this.activePromptSessionID = null;
      }
    } catch (error) {
      const apiError = toApiError(error);

      if (apiError.kind === "auth") {
        this.requireAuth(apiError.message);
      }
    }
  }

  private async refreshSessions(): Promise<boolean> {
    if (!this.api) {
      return false;
    }

    const directory = this.getWorkspaceDirectory();

    if (!directory) {
      this.sessions = [];
      this.postMessage({ type: "sessions", status: "ready", groups: [] });
      return true;
    }

    this.postMessage({
      type: "sessions",
      status: "loading",
      groups: groupSessionsByUpdateDate(this.sessions),
    });

    try {
      const sessions = await this.api.listSessions(
        directory,
        AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      );
      this.sessions = sessions;
      this.syncTabTitles(sessions);
      this.postMessage({
        type: "sessions",
        status: "ready",
        groups: groupSessionsByUpdateDate(sessions),
      });
      return true;
    } catch (error) {
      const apiError = toApiError(error);

      if (apiError.kind === "auth") {
        this.requireAuth(apiError.message);
        return false;
      }

      this.postMessage({
        type: "sessions",
        status: "error",
        groups: groupSessionsByUpdateDate(this.sessions),
        error: apiError.message,
      });
      return true;
    }
  }

  private async refreshTranscript(): Promise<void> {
    if (!this.api || this.activeTabID === SESSIONS_TAB_ID) {
      return;
    }

    const sessionID = this.activeTabID;
    this.postMessage({
      type: "transcript",
      sessionID,
      status: "loading",
      items: this.transcriptItems,
    });

    try {
      const items = await this.api.listMessages(sessionID, AbortSignal.timeout(REQUEST_TIMEOUT_MS));
      this.transcriptItems = items;
      this.postMessage({ type: "transcript", sessionID, status: "ready", items });
    } catch (error) {
      const apiError = toApiError(error);

      if (apiError.kind === "auth") {
        this.requireAuth(apiError.message);
        return;
      }

      this.postMessage({
        type: "transcript",
        sessionID,
        status: "error",
        items: this.transcriptItems,
        error: apiError.message,
      });
    }
  }

  private requireAuth(message: string, serverUrl?: string): void {
    this.stopPolling();
    this.api = undefined;
    this.sessions = [];
    this.tabs = [sessionsTab()];
    this.activeTabID = SESSIONS_TAB_ID;
    this.activeSessionIds.clear();
    this.activePromptSessionID = null;
    this.promptSubmitting.clear();
    this.clearTranscript();
    this.sendTabs();
    this.postMessage({ type: "sessions", status: "idle", groups: [] });
    this.postMessage({ type: "sessionCreation", status: "idle" });
    this.postMessage({
      type: "connection",
      status: "unauthenticated",
      serverUrl: serverUrl ?? this.credential?.serverUrl,
      error: message,
    });
  }

  private clearTranscript(): void {
    this.transcriptItems = [];
    this.postMessage({ type: "transcript", sessionID: null, status: "idle", items: [] });
  }

  private sendTabs(): void {
    this.postMessage({ type: "tabs", tabs: this.tabs, activeTabID: this.activeTabID });
  }

  private openTabForSession(title: string, sessionID: string): void {
    if (!this.tabs.some((tab) => tab.id === sessionID)) {
      this.tabs = [...this.tabs, { id: sessionID, title, closable: true }];
    }

    this.activeTabID = sessionID;
    this.sendTabs();
  }

  private syncTabTitles(sessions: readonly SessionListItem[]): void {
    let changed = false;

    this.tabs = this.tabs.map((tab) => {
      if (tab.id === SESSIONS_TAB_ID) {
        return tab;
      }

      const session = sessions.find((candidate) => candidate.id === tab.id);

      if (session && session.title !== tab.title) {
        changed = true;
        return { ...tab, title: session.title };
      }

      return tab;
    });

    if (changed) {
      this.sendTabs();
    }
  }

  private setOptimisticallyActive(sessionID: string): void {
    this.activePromptSessionID = sessionID;
    this.activePromptAt = Date.now();
  }

  private clearOptimisticallyActive(sessionID: string): void {
    if (this.activePromptSessionID === sessionID) {
      this.activePromptSessionID = null;
    }
  }

  private transcriptIntervalMs(): number {
    if (this.activeTabID === SESSIONS_TAB_ID) {
      return IDLE_TRANSCRIPT_POLL_MS;
    }

    if (this.activeSessionIds.has(this.activeTabID)) {
      return ACTIVE_TRANSCRIPT_POLL_MS;
    }

    if (this.promptSubmitting.has(this.activeTabID)) {
      return ACTIVE_TRANSCRIPT_POLL_MS;
    }

    if (
      this.activePromptSessionID === this.activeTabID &&
      Date.now() - this.activePromptAt < OPTIMISTIC_ACTIVE_MS
    ) {
      return ACTIVE_TRANSCRIPT_POLL_MS;
    }

    return IDLE_TRANSCRIPT_POLL_MS;
  }

  private applyPollingVisibility(): void {
    this.sessionPolling.setVisible(this.visible);
    this.transcriptPolling.setVisible(this.visible);
  }

  private stopPolling(): void {
    this.sessionPolling.setVisible(false);
    this.transcriptPolling.setVisible(false);
  }

  private getWorkspaceDirectory(): string | null {
    const folder = vscode.workspace.workspaceFolders?.[0];

    if (!folder || folder.uri.scheme !== "file") {
      return null;
    }

    return folder.uri.fsPath;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );

    return result;
  }

  private postMessage(message: ExtensionToWebview): void {
    void this.activeWebview?.postMessage(message);
  }

  private activeWebview: vscode.Webview | undefined;

  private getHtmlForWebview(webview: vscode.Webview): string {
    this.activeWebview = webview;

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview", "index.js"),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview", "index.css"),
    );
    const nonce = getNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${styleUri}" />
    <title>OpenCode</title>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
  </body>
</html>`;
  }
}

function sessionsTab(): SessionTab {
  return { id: SESSIONS_TAB_ID, title: "Sessions", closable: false };
}

function safeServerUrl(value: string): string | undefined {
  try {
    return normalizeServerUrl(value);
  } catch {
    return undefined;
  }
}

function isWebviewMessage(value: unknown): value is WebviewToExtension {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return false;
  }

  switch (value.type) {
    case "ready":
    case "retry":
    case "createSession":
      return true;
    case "authenticate":
      return (
        "serverUrl" in value &&
        "password" in value &&
        typeof value.serverUrl === "string" &&
        typeof value.password === "string"
      );
    case "openSession":
      return "sessionID" in value && typeof value.sessionID === "string";
    case "submitPrompt":
      return (
        "sessionID" in value &&
        "text" in value &&
        typeof value.sessionID === "string" &&
        typeof value.text === "string"
      );
    case "activateTab":
    case "closeTab":
      return "tabID" in value && typeof value.tabID === "string";
    default:
      return false;
  }
}

function getNonce(): string {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for (let i = 0; i < 32; i += 1) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }

  return text;
}

export type { LoadStatus };
