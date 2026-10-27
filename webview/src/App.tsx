import { useEffect, useReducer, useRef, useState } from "react";

import { AuthPanel } from "@/components/AuthPanel";
import { PromptComposer, type PendingContextInsert } from "@/components/PromptComposer";
import { SessionList } from "@/components/SessionList";
import { SessionTabs } from "@/components/SessionTabs";
import { TranscriptView } from "@/components/TranscriptView";
import {
  applyAgentSelection,
  applyModelSelection,
  applyVariantSelection,
  createPromptSelection,
  reconcilePromptSelection,
} from "@/lib/promptSelection";
import { onExtensionMessage, postToExtension } from "@/lib/vscode";
import type { PromptSegment } from "@shared/promptContent";
import {
  SESSIONS_TAB_ID,
  type ConnectionStatus,
  type ExtensionToWebview,
  type LoadStatus,
  type ModelOption,
  type PromptCatalog,
  type PromptSelection,
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
  readonly draftsBySession: Readonly<Record<string, readonly PromptSegment[]>>;
  readonly draftVersionsBySession: Readonly<Record<string, number>>;
  readonly pendingInsertsBySession: Readonly<Record<string, readonly PendingContextInsert[]>>;
  readonly promptCatalogStatus: LoadStatus;
  readonly promptCatalog: PromptCatalog | null;
  readonly promptCatalogError?: string;
  readonly selectionsBySession: Readonly<Record<string, PromptSelection>>;
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
  draftVersionsBySession: {},
  pendingInsertsBySession: {},
  promptCatalogStatus: "idle",
  promptCatalog: null,
  selectionsBySession: {},
  promptStatusBySession: {},
};

const EMPTY_PROMPT: readonly PromptSegment[] = [];
const EMPTY_INSERTS: readonly PendingContextInsert[] = [];

let nextContextInsertID = 1;

type PanelAction =
  | ExtensionToWebview
  | { readonly type: "hideAuthSuccess" }
  | {
      readonly type: "updateDraft";
      readonly sessionID: string;
      readonly value: readonly PromptSegment[];
    }
  | {
      readonly type: "insertsConsumed";
      readonly sessionID: string;
      readonly insertIDs: readonly number[];
    }
  | { readonly type: "selectAgent"; readonly sessionID: string; readonly agentID: string }
  | { readonly type: "selectModel"; readonly sessionID: string; readonly model: ModelOption }
  | {
      readonly type: "selectVariant";
      readonly sessionID: string;
      readonly variant: string | undefined;
    }
  | { readonly type: "clearSession"; readonly sessionID: string };

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
    case "sessions": {
      const nextState = {
        ...state,
        sessionStatus: action.status,
        sessionGroups: action.groups,
        sessionError: action.error,
      };

      return { ...nextState, selectionsBySession: initializeSelections(nextState) };
    }
    case "sessionCreation":
      return {
        ...state,
        creatingSession: action.status === "creating",
        createSessionError: action.status === "error" ? action.error : undefined,
      };
    case "tabs": {
      const nextState = { ...state, tabs: action.tabs, activeTabID: action.activeTabID };
      return { ...nextState, selectionsBySession: initializeSelections(nextState) };
    }
    case "transcript":
      return {
        ...state,
        transcriptStatus: action.status,
        transcriptItems: action.items,
        transcriptError: action.error,
      };
    case "promptCatalog": {
      const nextState = {
        ...state,
        promptCatalogStatus: action.status,
        promptCatalog: action.catalog,
        promptCatalogError: action.error,
        selectionsBySession:
          action.status === "idle"
            ? {}
            : action.status === "ready" && action.catalog
              ? reconcileSelections(action.catalog, state.selectionsBySession)
              : state.selectionsBySession,
      };

      return { ...nextState, selectionsBySession: initializeSelections(nextState) };
    }
    case "promptStatus": {
      if (action.status === "accepted") {
        const nextDrafts = { ...state.draftsBySession };
        delete nextDrafts[action.sessionID];
        const nextPromptStatus = { ...state.promptStatusBySession };
        delete nextPromptStatus[action.sessionID];

        return {
          ...state,
          draftsBySession: nextDrafts,
          draftVersionsBySession: {
            ...state.draftVersionsBySession,
            [action.sessionID]: (state.draftVersionsBySession[action.sessionID] ?? 0) + 1,
          },
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
    case "insertContext":
      return {
        ...state,
        pendingInsertsBySession: {
          ...state.pendingInsertsBySession,
          [action.sessionID]: [
            ...(state.pendingInsertsBySession[action.sessionID] ?? []),
            { id: nextContextInsertID++, segments: action.segments },
          ],
        },
      };
    case "updateDraft":
      return {
        ...state,
        draftsBySession: {
          ...state.draftsBySession,
          [action.sessionID]: action.value,
        },
      };
    case "insertsConsumed": {
      const consumed = new Set(action.insertIDs);
      return {
        ...state,
        pendingInsertsBySession: {
          ...state.pendingInsertsBySession,
          [action.sessionID]: (state.pendingInsertsBySession[action.sessionID] ?? []).filter(
            (pending) => !consumed.has(pending.id),
          ),
        },
      };
    }
    case "selectAgent": {
      const selection = state.selectionsBySession[action.sessionID];

      if (!selection || !state.promptCatalog) {
        return state;
      }

      return {
        ...state,
        selectionsBySession: {
          ...state.selectionsBySession,
          [action.sessionID]: applyAgentSelection(state.promptCatalog, selection, action.agentID),
        },
      };
    }
    case "selectModel": {
      const selection = state.selectionsBySession[action.sessionID];

      if (!selection) {
        return state;
      }

      return {
        ...state,
        selectionsBySession: {
          ...state.selectionsBySession,
          [action.sessionID]: applyModelSelection(selection, action.model),
        },
      };
    }
    case "selectVariant": {
      const selection = state.selectionsBySession[action.sessionID];

      if (!selection) {
        return state;
      }

      return {
        ...state,
        selectionsBySession: {
          ...state.selectionsBySession,
          [action.sessionID]: applyVariantSelection(selection, action.variant),
        },
      };
    }
    case "clearSession": {
      const nextDrafts = { ...state.draftsBySession };
      const nextDraftVersions = { ...state.draftVersionsBySession };
      const nextPendingInserts = { ...state.pendingInsertsBySession };
      const nextSelections = { ...state.selectionsBySession };
      delete nextDrafts[action.sessionID];
      delete nextDraftVersions[action.sessionID];
      delete nextPendingInserts[action.sessionID];
      delete nextSelections[action.sessionID];

      return {
        ...state,
        draftsBySession: nextDrafts,
        draftVersionsBySession: nextDraftVersions,
        pendingInsertsBySession: nextPendingInserts,
        selectionsBySession: nextSelections,
      };
    }
  }
}

function reconcileSelections(
  catalog: PromptCatalog,
  selections: Readonly<Record<string, PromptSelection>>,
): Readonly<Record<string, PromptSelection>> {
  return Object.fromEntries(
    Object.entries(selections).flatMap(([sessionID, selection]) => {
      const reconciled = reconcilePromptSelection(catalog, selection);
      return reconciled ? [[sessionID, reconciled]] : [];
    }),
  );
}

function initializeSelections(state: PanelState): Readonly<Record<string, PromptSelection>> {
  if (!state.promptCatalog) {
    return state.selectionsBySession;
  }

  const selections = { ...state.selectionsBySession };

  for (const tab of state.tabs) {
    if (tab.id === SESSIONS_TAB_ID || selections[tab.id]) {
      continue;
    }

    const session = state.sessionGroups
      .flatMap((group) => group.sessions)
      .find((candidate) => candidate.id === tab.id);
    const selection = createPromptSelection(state.promptCatalog, session);

    if (selection) {
      selections[tab.id] = selection;
    }
  }

  return selections;
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
  const activeSelection = activeSessionTab
    ? (state.selectionsBySession[state.activeTabID] ?? null)
    : null;

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
              dispatch({ type: "clearSession", sessionID: tabID });
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
                key={`${state.activeTabID}:${state.draftVersionsBySession[state.activeTabID] ?? 0}`}
                value={state.draftsBySession[state.activeTabID] ?? EMPTY_PROMPT}
                pendingInserts={state.pendingInsertsBySession[state.activeTabID] ?? EMPTY_INSERTS}
                submitting={activePromptStatus?.status === "submitting"}
                error={activePromptStatus?.error}
                disabled={state.connectionStatus !== "connected"}
                panelHeight={panelHeight}
                catalog={state.promptCatalog}
                catalogStatus={state.promptCatalogStatus}
                catalogError={state.promptCatalogError}
                selection={activeSelection}
                onChange={(value) =>
                  dispatch({ type: "updateDraft", sessionID: state.activeTabID, value })
                }
                onInsertsConsumed={(insertIDs) =>
                  dispatch({ type: "insertsConsumed", sessionID: state.activeTabID, insertIDs })
                }
                onAgentChange={(agentID) =>
                  dispatch({ type: "selectAgent", sessionID: state.activeTabID, agentID })
                }
                onModelChange={(model) =>
                  dispatch({ type: "selectModel", sessionID: state.activeTabID, model })
                }
                onVariantChange={(variant) =>
                  dispatch({ type: "selectVariant", sessionID: state.activeTabID, variant })
                }
                onSubmit={() => {
                  if (!activeSelection) {
                    return;
                  }

                  postToExtension({
                    type: "submitPrompt",
                    sessionID: state.activeTabID,
                    parts: state.draftsBySession[state.activeTabID] ?? EMPTY_PROMPT,
                    selection: activeSelection,
                  });
                }}
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
