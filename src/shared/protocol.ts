export const SESSIONS_TAB_ID = "sessions";

export type ConnectionStatus = "checking" | "unauthenticated" | "connected";

export interface SessionListItem {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: number;
}

export interface SessionGroup {
  readonly label: string;
  readonly sessions: readonly SessionListItem[];
}

export interface SessionTab {
  readonly id: string;
  readonly title: string;
  readonly closable: boolean;
}

export type TranscriptItem =
  | {
      readonly id: string;
      readonly kind: "user";
      readonly timestamp: number;
      readonly text: string;
      readonly attachments: readonly string[];
    }
  | {
      readonly id: string;
      readonly kind: "assistant";
      readonly timestamp: number;
      readonly text: string;
      readonly agent: string;
      readonly model: string;
      readonly error?: string;
    }
  | {
      readonly id: string;
      readonly kind: "reasoning";
      readonly timestamp: number;
      readonly text: string;
    }
  | {
      readonly id: string;
      readonly kind: "tool";
      readonly timestamp: number;
      readonly name: string;
      readonly status: string;
      readonly input: string;
      readonly output: string;
    }
  | {
      readonly id: string;
      readonly kind: "activity";
      readonly timestamp: number;
      readonly label: string;
      readonly detail?: string;
    };

export type LoadStatus = "idle" | "loading" | "ready" | "error";

export type WebviewToExtension =
  | { readonly type: "ready" }
  | { readonly type: "authenticate"; readonly serverUrl: string; readonly password: string }
  | { readonly type: "openSession"; readonly sessionID: string }
  | { readonly type: "activateTab"; readonly tabID: string }
  | { readonly type: "closeTab"; readonly tabID: string }
  | { readonly type: "retry" }
  | { readonly type: "createSession" }
  | { readonly type: "submitPrompt"; readonly sessionID: string; readonly text: string };

export type ExtensionToWebview =
  | {
      readonly type: "connection";
      readonly status: ConnectionStatus;
      readonly serverUrl?: string;
      readonly error?: string;
    }
  | { readonly type: "authSubmitting"; readonly value: boolean }
  | { readonly type: "authSuccess" }
  | { readonly type: "workspace"; readonly directory: string | null }
  | {
      readonly type: "sessions";
      readonly status: LoadStatus;
      readonly groups: readonly SessionGroup[];
      readonly error?: string;
    }
  | {
      readonly type: "tabs";
      readonly tabs: readonly SessionTab[];
      readonly activeTabID: string;
    }
  | {
      readonly type: "transcript";
      readonly sessionID: string | null;
      readonly status: LoadStatus;
      readonly items: readonly TranscriptItem[];
      readonly error?: string;
    }
  | {
      readonly type: "sessionCreation";
      readonly status: "idle" | "creating" | "error";
      readonly error?: string;
    }
  | {
      readonly type: "promptStatus";
      readonly sessionID: string;
      readonly status: "submitting" | "accepted" | "error";
      readonly error?: string;
    };
