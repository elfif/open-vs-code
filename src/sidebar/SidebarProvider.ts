import * as vscode from "vscode";

import {
  isPromptEmpty,
  isPromptSegment,
  type PromptContextSegment,
  type PromptDocumentSegment,
  type PromptSegment,
} from "../shared/promptContent";
import { buildPromptPayload, MAX_DOCUMENT_BYTES, formatBytes } from "../shared/promptDocuments";
import {
  SESSIONS_TAB_ID,
  type ExtensionToWebview,
  type LoadStatus,
  type PromptCatalog,
  type PromptFilePayload,
  type PromptSelection,
  type SessionListItem,
  type SessionTab,
  type TranscriptItem,
  type WebviewToExtension,
} from "../shared/protocol";
import { CredentialStore, type StoredCredential } from "../services/credentialStore";
import {
  createDocumentFromBytes,
  DocumentStore,
  type StagedDocument,
} from "../services/documentStore";
import { OpenCodeApi, normalizeServerUrl, toApiError } from "../services/openCodeApi";
import { PollingController } from "../services/pollingController";
import { groupSessionsByUpdateDate } from "../services/sessionGroups";

const SESSION_LIST_POLL_MS = 10_000;
const ACTIVE_TRANSCRIPT_POLL_MS = 2_000;
const IDLE_TRANSCRIPT_POLL_MS = 20_000;
const OPTIMISTIC_ACTIVE_MS = 5_000;
const REQUEST_TIMEOUT_MS = 10_000;
const PENDING_DOCUMENT_SESSION_ID = "__pending_documents__";
const READABLE_URI_SCHEMES = new Set(["file", "vscode-remote"]);

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
  private promptCatalog: PromptCatalog | null = null;
  private transcriptItems: TranscriptItem[] = [];
  private tabs: SessionTab[] = [sessionsTab()];
  private activeTabID = SESSIONS_TAB_ID;
  private activeSessionIds = new Set<string>();
  private activePromptSessionID: string | null = null;
  private activePromptAt = 0;
  private promptSubmitting = new Set<string>();
  private queue: Promise<void> = Promise.resolve();
  private webviewReady = false;
  private pendingContexts: PromptContextSegment[][] = [];
  private readonly documentStore = new DocumentStore();

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

    this.webviewReady = false;
    this.visible = webviewView.visible;

    const visibilitySubscription = webviewView.onDidChangeVisibility(() => {
      this.visible = webviewView.visible;
      this.applyPollingVisibility();
    });

    const messageSubscription = webviewView.webview.onDidReceiveMessage((message: unknown) => {
      void this.handleMessage(message);
    });

    webviewView.onDidDispose(() => {
      this.webviewReady = false;
      this.sessionPolling.dispose();
      this.transcriptPolling.dispose();
      this.documentStore.clearAll();
      visibilitySubscription.dispose();
      messageSubscription.dispose();
    });
  }

  public async addContext(segments: readonly PromptContextSegment[]): Promise<void> {
    if (segments.length === 0) {
      return;
    }

    await vscode.commands.executeCommand(`${SidebarProvider.viewType}.focus`);

    if (!this.webviewReady) {
      this.pendingContexts.push([...segments]);
      return;
    }

    if (!this.api) {
      void vscode.window.showWarningMessage("Connect to an OpenCode server before adding context.");
      return;
    }

    const sessionID = await this.ensureContextSession();

    if (!sessionID) {
      return;
    }

    if (segments.some((segment) => segment.kind === "document")) {
      this.documentStore.moveAll(PENDING_DOCUMENT_SESSION_ID, sessionID);
    }

    this.postMessage({ type: "insertContext", sessionID, segments });
  }

  public async addFiles(uris: readonly vscode.Uri[], preferredSessionID?: string): Promise<void> {
    if (uris.length === 0) {
      return;
    }

    await vscode.commands.executeCommand(`${SidebarProvider.viewType}.focus`);

    const { documents, errors } = await this.readUris(uris);

    if (errors.length > 0) {
      void vscode.window.showWarningMessage(errors.join("\n"));
    }

    if (documents.length === 0) {
      return;
    }

    if (!this.webviewReady) {
      for (const document of documents) {
        this.documentStore.add(PENDING_DOCUMENT_SESSION_ID, document);
      }

      this.pendingContexts.push(documents);
      return;
    }

    if (!this.api) {
      void vscode.window.showWarningMessage("Connect to an OpenCode server before adding files.");
      return;
    }

    const target =
      preferredSessionID &&
      preferredSessionID !== SESSIONS_TAB_ID &&
      this.tabs.some((tab) => tab.id === preferredSessionID)
        ? preferredSessionID
        : await this.ensureContextSession();

    if (!target) {
      return;
    }

    for (const document of documents) {
      this.documentStore.add(target, document);
    }

    this.postMessage({ type: "insertContext", sessionID: target, segments: documents });
  }

  private async ensureContextSession(): Promise<string | undefined> {
    if (this.activeTabID !== SESSIONS_TAB_ID) {
      return this.activeTabID;
    }

    return await this.createSession();
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (!isWebviewMessage(message)) {
      return;
    }

    switch (message.type) {
      case "ready":
        this.webviewReady = true;
        await this.initialize();
        await this.flushPendingContexts();
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
        await this.submitPrompt(message.sessionID, message.parts, message.selection);
        break;
      case "stageFiles":
        await this.handleStageFiles(message.requestID, message.sessionID, message.files);
        break;
      case "stageUris":
        await this.handleStageUris(message.requestID, message.sessionID, message.uris);
        break;
      case "pickFiles":
        await this.addFiles(await this.pickFileUris(), message.sessionID);
        break;
    }
  }

  private async pickFileUris(): Promise<vscode.Uri[]> {
    const selected = await vscode.window.showOpenDialog({
      title: "Add files to this OpenCode session",
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: true,
      openLabel: "Add to OpenCode",
    });

    return selected ?? [];
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

  private async flushPendingContexts(): Promise<void> {
    const pending = this.pendingContexts;
    this.pendingContexts = [];

    for (const segments of pending) {
      await this.addContext(segments);
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
    this.documentStore.clearSession(tabID);

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

  private async createSession(): Promise<string | undefined> {
    if (!this.api || this.creatingSession) {
      return undefined;
    }

    const directory = this.getWorkspaceDirectory();

    if (!directory) {
      this.postMessage({
        type: "sessionCreation",
        status: "error",
        error: "Open a workspace folder before creating an OpenCode session.",
      });
      return undefined;
    }

    this.creatingSession = true;
    this.postMessage({ type: "sessionCreation", status: "creating" });

    try {
      const sessionID = await this.enqueue(async () => {
        if (!this.api) {
          return undefined;
        }

        const session = await this.api.createSession(
          directory,
          AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        );
        this.sessions = [session, ...this.sessions.filter((item) => item.id !== session.id)];
        this.postMessage({
          type: "sessions",
          status: "ready",
          groups: groupSessionsByUpdateDate(this.sessions),
        });
        this.openTabForSession(session.title, session.id);
        await this.refreshSessions();
        return session.id;
      });

      this.postMessage({ type: "sessionCreation", status: "idle" });
      return sessionID;
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

  private async handleStageFiles(
    requestID: string,
    sessionID: string,
    files: readonly PromptFilePayload[],
  ): Promise<void> {
    if (sessionID === SESSIONS_TAB_ID || !this.tabs.some((tab) => tab.id === sessionID)) {
      this.postMessage({
        type: "documentError",
        requestID,
        sessionID,
        error: "That session is no longer open.",
      });
      return;
    }

    const segments: PromptDocumentSegment[] = [];
    const errors: string[] = [];

    for (const file of files) {
      try {
        const document = createDocumentFromBytes({
          name: file.name,
          mime: file.mime,
          base64: file.base64,
        });
        this.documentStore.add(sessionID, document);
        segments.push(document);
      } catch (error) {
        errors.push(errorMessage(error));
      }
    }

    if (segments.length > 0) {
      this.postMessage({ type: "documentsStaged", requestID, sessionID, segments });
    }

    if (errors.length > 0) {
      this.postMessage({ type: "documentError", requestID, sessionID, error: errors.join("\n") });
    }

    if (segments.length === 0 && errors.length === 0) {
      this.postMessage({
        type: "documentError",
        requestID,
        sessionID,
        error: "No files were added.",
      });
    }
  }

  private async handleStageUris(
    requestID: string,
    sessionID: string,
    uris: readonly string[],
  ): Promise<void> {
    if (sessionID === SESSIONS_TAB_ID || !this.tabs.some((tab) => tab.id === sessionID)) {
      this.postMessage({
        type: "documentError",
        requestID,
        sessionID,
        error: "That session is no longer open.",
      });
      return;
    }

    const parsed: vscode.Uri[] = [];
    const errors: string[] = [];

    for (const rawUri of uris) {
      try {
        const uri = vscode.Uri.parse(rawUri);

        if (!READABLE_URI_SCHEMES.has(uri.scheme)) {
          throw new Error(`${rawUri} is not a readable file URI.`);
        }

        parsed.push(uri);
      } catch (error) {
        errors.push(errorMessage(error));
      }
    }

    const result = await this.readUris(parsed);
    const documents = [...result.documents];
    const allErrors = [...errors, ...result.errors];

    if (documents.length > 0) {
      for (const document of documents) {
        this.documentStore.add(sessionID, document);
      }

      this.postMessage({ type: "documentsStaged", requestID, sessionID, segments: documents });
    }

    if (allErrors.length > 0) {
      this.postMessage({
        type: "documentError",
        requestID,
        sessionID,
        error: allErrors.join("\n"),
      });
    }

    if (documents.length === 0 && allErrors.length === 0) {
      this.postMessage({
        type: "documentError",
        requestID,
        sessionID,
        error: "No files were added.",
      });
    }
  }

  private async readUris(
    uris: readonly vscode.Uri[],
  ): Promise<{ documents: StagedDocument[]; errors: string[] }> {
    const documents: StagedDocument[] = [];
    const errors: string[] = [];

    for (const uri of uris) {
      try {
        if (!READABLE_URI_SCHEMES.has(uri.scheme)) {
          throw new Error(`${uri.toString()} is not a readable file URI.`);
        }

        const stat = await vscode.workspace.fs.stat(uri);

        if (stat.type !== vscode.FileType.File) {
          throw new Error(`${basename(uri)} is a folder.`);
        }

        if (stat.size > MAX_DOCUMENT_BYTES) {
          throw new Error(
            `${basename(uri)} exceeds the ${formatBytes(MAX_DOCUMENT_BYTES)} file size limit.`,
          );
        }

        const bytes = await vscode.workspace.fs.readFile(uri);
        documents.push(
          createDocumentFromBytes({
            name: basename(uri),
            base64: Buffer.from(bytes).toString("base64"),
            path: displayPath(uri),
          }),
        );
      } catch (error) {
        errors.push(errorMessage(error));
      }
    }

    return { documents, errors };
  }

  private async submitPrompt(
    sessionID: string,
    parts: readonly PromptSegment[],
    selection: PromptSelection,
  ): Promise<void> {
    if (!this.api || this.promptSubmitting.has(sessionID)) {
      return;
    }

    if (isPromptEmpty(parts)) {
      return;
    }

    const build = buildPromptPayload(parts, this.documentStore.getSessionMap(sessionID));

    if (!build.ok) {
      this.postMessage({ type: "promptStatus", sessionID, status: "error", error: build.error });
      return;
    }

    const { text, files, skills } = build.payload;

    this.promptSubmitting.add(sessionID);
    this.setOptimisticallyActive(sessionID);
    this.postMessage({ type: "promptStatus", sessionID, status: "submitting" });

    try {
      await this.enqueue(async () => {
        if (!this.api) {
          return;
        }

        await this.api.prompt(
          sessionID,
          text,
          files,
          skills,
          selection,
          AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        );
        this.setOptimisticallyActive(sessionID);
        this.postMessage({ type: "promptStatus", sessionID, status: "accepted" });
        this.documentStore.remove(sessionID, build.referencedDocumentIDs);

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

      await this.refreshPromptCatalog();
      await this.refreshActiveStatus();
      const sessionsRefreshed = await this.refreshSessions();

      if (!sessionsRefreshed || !this.api) {
        return;
      }

      await this.refreshTranscript();
    });
  }

  private async refreshPromptCatalog(): Promise<void> {
    if (!this.api) {
      return;
    }

    const directory = this.getWorkspaceDirectory();

    if (!directory) {
      this.promptCatalog = {
        agents: [],
        models: [],
        providers: [],
        skills: [],
        defaultModel: null,
      };
      this.postMessage({ type: "promptCatalog", status: "ready", catalog: this.promptCatalog });
      return;
    }

    this.postMessage({
      type: "promptCatalog",
      status: "loading",
      catalog: this.promptCatalog,
    });

    try {
      const catalog = await this.api.getPromptCatalog(
        directory,
        AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      );
      this.promptCatalog = catalog;
      this.postMessage({ type: "promptCatalog", status: "ready", catalog });
    } catch (error) {
      const apiError = toApiError(error);

      if (apiError.kind === "auth") {
        this.requireAuth(apiError.message);
        return;
      }

      this.postMessage({
        type: "promptCatalog",
        status: "error",
        catalog: this.promptCatalog,
        error: apiError.message,
      });
    }
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
    this.promptCatalog = null;
    this.tabs = [sessionsTab()];
    this.activeTabID = SESSIONS_TAB_ID;
    this.activeSessionIds.clear();
    this.activePromptSessionID = null;
    this.promptSubmitting.clear();
    this.documentStore.clearAll();
    this.pendingContexts = [];
    this.clearTranscript();
    this.sendTabs();
    this.postMessage({ type: "sessions", status: "idle", groups: [] });
    this.postMessage({ type: "sessionCreation", status: "idle" });
    this.postMessage({ type: "promptCatalog", status: "idle", catalog: null });
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
        "parts" in value &&
        "selection" in value &&
        typeof value.sessionID === "string" &&
        Array.isArray(value.parts) &&
        value.parts.every(isPromptSegment) &&
        isPromptSelection(value.selection)
      );
    case "stageFiles":
      return (
        "requestID" in value &&
        "sessionID" in value &&
        "files" in value &&
        typeof value.requestID === "string" &&
        typeof value.sessionID === "string" &&
        Array.isArray(value.files) &&
        value.files.every(isPromptFilePayload)
      );
    case "stageUris":
      return (
        "requestID" in value &&
        "sessionID" in value &&
        "uris" in value &&
        typeof value.requestID === "string" &&
        typeof value.sessionID === "string" &&
        Array.isArray(value.uris) &&
        value.uris.every((uri) => typeof uri === "string")
      );
    case "pickFiles":
      return "sessionID" in value && typeof value.sessionID === "string";
    case "activateTab":
    case "closeTab":
      return "tabID" in value && typeof value.tabID === "string";
    default:
      return false;
  }
}

function isPromptFilePayload(value: unknown): value is PromptFilePayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    "base64" in value &&
    "size" in value &&
    typeof value.name === "string" &&
    typeof value.base64 === "string" &&
    typeof value.size === "number" &&
    (!("mime" in value) || typeof value.mime === "string")
  );
}

function basename(uri: vscode.Uri): string {
  return uri.path.split("/").pop() || uri.fsPath.split(/[\\/]/).pop() || uri.toString();
}

function displayPath(uri: vscode.Uri): string {
  if (uri.scheme === "file") {
    return vscode.workspace.asRelativePath(uri, false);
  }

  return uri.toString();
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return String(error);
}

function isPromptSelection(value: unknown): value is PromptSelection {
  return (
    typeof value === "object" &&
    value !== null &&
    "agent" in value &&
    "model" in value &&
    typeof value.agent === "string" &&
    isPromptModel(value.model)
  );
}

function isPromptModel(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "providerID" in value &&
    "id" in value &&
    typeof value.providerID === "string" &&
    typeof value.id === "string" &&
    (!("variant" in value) || typeof value.variant === "string")
  );
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
