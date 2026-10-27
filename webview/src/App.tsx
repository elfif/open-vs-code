import { useEffect, useReducer } from "react";

import { AuthPanel } from "@/components/AuthPanel";
import { SessionList } from "@/components/SessionList";
import { SessionTabs } from "@/components/SessionTabs";
import { TranscriptView } from "@/components/TranscriptView";
import { onExtensionMessage, postToExtension } from "@/lib/vscode";
import {
  SESSIONS_TAB_ID,
  type ConnectionStatus,
  type ExtensionToWebview,
  type LoadStatus,
  type SessionGroup,
  type SessionTab,
  type TranscriptItem,
} from "@shared/protocol";

interface PanelState {
  readonly connectionStatus: ConnectionStatus;
  readonly serverUrl?: string;
  readonly authError?: string;
  readonly authSubmitting: boolean;
  readonly authSuccessVisible: boolean;
  readonly workspaceDirectory: string | null;
  readonly sessionStatus: LoadStatus;
  readonly sessionGroups: readonly SessionGroup[];
  readonly sessionError?: string;
  readonly tabs: readonly SessionTab[];
  readonly activeTabID: string;
  readonly transcriptStatus: LoadStatus;
  readonly transcriptItems: readonly TranscriptItem[];
  readonly transcriptError?: string;
}

const initialState: PanelState = {
  connectionStatus: "checking",
  authSubmitting: false,
  authSuccessVisible: false,
  workspaceDirectory: null,
  sessionStatus: "idle",
  sessionGroups: [],
  tabs: [{ id: SESSIONS_TAB_ID, title: "Sessions", closable: false }],
  activeTabID: SESSIONS_TAB_ID,
  transcriptStatus: "idle",
  transcriptItems: [],
};

type PanelAction = ExtensionToWebview | { readonly type: "hideAuthSuccess" };

function reducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case "connection":
      return {
        ...state,
        connectionStatus: action.status,
        serverUrl: action.serverUrl ?? state.serverUrl,
        authError: action.status === "unauthenticated" ? action.error : undefined,
        authSuccessVisible: action.status === "connected" ? state.authSuccessVisible : false,
      };
    case "authSubmitting":
      return { ...state, authSubmitting: action.value };
    case "authSuccess":
      return { ...state, authSuccessVisible: true };
    case "hideAuthSuccess":
      return { ...state, authSuccessVisible: false };
    case "workspace":
      return { ...state, workspaceDirectory: action.directory };
    case "sessions":
      return {
        ...state,
        sessionStatus: action.status,
        sessionGroups: action.groups,
        sessionError: action.error,
      };
    case "tabs":
      return { ...state, tabs: action.tabs, activeTabID: action.activeTabID };
    case "transcript":
      return {
        ...state,
        transcriptStatus: action.status,
        transcriptItems: action.items,
        transcriptError: action.error,
      };
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    const unsubscribe = onExtensionMessage((message) => {
      dispatch(message);
    });

    postToExtension({ type: "ready" });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!state.authSuccessVisible) {
      return;
    }

    const timer = window.setTimeout(() => dispatch({ type: "hideAuthSuccess" }), 2500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [state.authSuccessVisible]);

  const activeSessionTab = state.activeTabID !== SESSIONS_TAB_ID;

  return (
    <main className="flex h-full min-h-0 flex-col bg-background text-foreground">
      {state.connectionStatus === "checking" ? (
        <div className="p-4 text-xs text-muted-foreground">Checking OpenCode connection...</div>
      ) : null}

      {state.connectionStatus === "unauthenticated" ? (
        <AuthPanel
          key={`${state.serverUrl ?? "none"}:${state.authError ?? "none"}`}
          serverUrl={state.serverUrl}
          error={state.authError}
          submitting={state.authSubmitting}
        />
      ) : null}

      {state.connectionStatus === "connected" ? (
        <>
          <SessionTabs tabs={state.tabs} activeTabID={state.activeTabID} />
          {state.authSuccessVisible ? (
            <div className="border-b border-border bg-accent px-3 py-2 text-xs text-accent-foreground">
              Connected to OpenCode.
            </div>
          ) : null}
          {activeSessionTab ? (
            <TranscriptView
              items={state.transcriptItems}
              loading={state.transcriptStatus === "loading"}
              error={state.transcriptError}
            />
          ) : (
            <SessionList
              groups={state.sessionGroups}
              loading={state.sessionStatus === "loading"}
              error={state.sessionError}
              hasWorkspace={state.workspaceDirectory !== null}
            />
          )}
        </>
      ) : null}
    </main>
  );
}
