import { useEffect, useReducer, useRef, useState } from "react";

import { AuthPanel } from "@/components/AuthPanel";
import { PromptComposer } from "@/components/PromptComposer";
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
  readonly creatingSession: boolean;
  readonly createSessionError?: string;
  readonly tabs: readonly SessionTab[];
  readonly activeTabID: string;
  readonly transcriptStatus: LoadStatus;
  readonly transcriptItems: readonly TranscriptItem[];
  readonly transcriptError?: string;
  readonly draftsBySession: Readonly<Record<string, string>>;
  readonly promptStatusBySession: Readonly<
    Record<string, { readonly status: "submitting" | "error"; readonly error?: string }>
  >;
}

const initialState: PanelState = {
  connectionStatus: "checking",
  authSubmitting: false,
  authSuccessVisible: false,
  workspaceDirectory: null,
  sessionStatus: "idle",
  sessionGroups: [],
  creatingSession: false,
  tabs: [{ id: SESSIONS_TAB_ID, title: "Sessions", closable: false }],
  activeTabID: SESSIONS_TAB_ID,
  transcriptStatus: "idle",
  transcriptItems: [],
  draftsBySession: {},
  promptStatusBySession: {},
};

type PanelAction =
  | ExtensionToWebview
  | { readonly type: "hideAuthSuccess" }
  | { readonly type: "updateDraft"; readonly sessionID: string; readonly value: string }
  | { readonly type: "clearDraft"; readonly sessionID: string };

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
    case "sessionCreation":
      return {
        ...state,
        creatingSession: action.status === "creating",
        createSessionError: action.status === "error" ? action.error : undefined,
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
    case "promptStatus": {
      if (action.status === "accepted") {
        const nextDrafts = { ...state.draftsBySession };
        delete nextDrafts[action.sessionID];
        const nextPromptStatus = { ...state.promptStatusBySession };
        delete nextPromptStatus[action.sessionID];

        return {
          ...state,
          draftsBySession: nextDrafts,
          promptStatusBySession: nextPromptStatus,
        };
      }

      return {
        ...state,
        promptStatusBySession: {
          ...state.promptStatusBySession,
          [action.sessionID]: {
            status: action.status,
            error: action.status === "error" ? action.error : undefined,
          },
        },
      };
    }
    case "updateDraft":
      return {
        ...state,
        draftsBySession: {
          ...state.draftsBySession,
          [action.sessionID]: action.value,
        },
      };
    case "clearDraft": {
      const nextDrafts = { ...state.draftsBySession };
      delete nextDrafts[action.sessionID];

      return { ...state, draftsBySession: nextDrafts };
    }
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const panelRef = useRef<HTMLElement | null>(null);
  const [panelHeight, setPanelHeight] = useState(0);

  useEffect(() => {
    const panel = panelRef.current;

    if (!panel) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (entry) {
        setPanelHeight(entry.contentRect.height);
      }
    });

    observer.observe(panel);

    return () => {
      observer.disconnect();
    };
  }, []);

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
  const activePromptStatus = activeSessionTab
    ? state.promptStatusBySession[state.activeTabID]
    : undefined;

  return (
    <main ref={panelRef} className="flex h-full min-h-0 flex-col bg-background text-foreground">
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
          <SessionTabs
            tabs={state.tabs}
            activeTabID={state.activeTabID}
            onCloseTab={(tabID) => {
              postToExtension({ type: "closeTab", tabID });
              dispatch({ type: "clearDraft", sessionID: tabID });
            }}
          />
          {state.authSuccessVisible ? (
            <div className="border-b border-border bg-accent px-3 py-2 text-xs text-accent-foreground">
              Connected to OpenCode.
            </div>
          ) : null}
          {activeSessionTab ? (
            <>
              <TranscriptView
                items={state.transcriptItems}
                loading={state.transcriptStatus === "loading"}
                error={state.transcriptError}
              />
              <PromptComposer
                value={state.draftsBySession[state.activeTabID] ?? ""}
                submitting={activePromptStatus?.status === "submitting"}
                error={activePromptStatus?.error}
                disabled={state.connectionStatus !== "connected"}
                panelHeight={panelHeight}
                onChange={(value) =>
                  dispatch({ type: "updateDraft", sessionID: state.activeTabID, value })
                }
                onSubmit={() =>
                  postToExtension({
                    type: "submitPrompt",
                    sessionID: state.activeTabID,
                    text: state.draftsBySession[state.activeTabID] ?? "",
                  })
                }
              />
            </>
          ) : (
            <SessionList
              groups={state.sessionGroups}
              loading={state.sessionStatus === "loading"}
              error={state.sessionError}
              hasWorkspace={state.workspaceDirectory !== null}
              creating={state.creatingSession}
              createError={state.createSessionError}
            />
          )}
        </>
      ) : null}
    </main>
  );
}
