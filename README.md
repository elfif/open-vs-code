# Open VS Code

Open VS Code is a VS Code extension that connects directly to an OpenCode V2 HTTP server and provides an OpenCode session browser and prompt composer in the sidebar.

## Features

- Dedicated OpenCode sidebar.
- Command Palette command: `Open OpenCode Panel`.
- Server URL and password authentication.
- Credentials stored in VS Code `SecretStorage`.
- One active OpenCode connection at a time.
- Session list filtered by the first workspace folder.
- Sessions grouped by last update date:
  - Today
  - Yesterday
  - Localized calendar date
- In-sidebar tabs:
  - Permanent Sessions tab
  - Closable session detail tabs
- Create a new OpenCode session from the Sessions view.
- Send plain-text prompts to existing sessions.
- Per-session prompt drafts.
- Transcript rendering:
  - User and assistant Markdown
  - Reasoning blocks
  - Tool call blocks
  - Activity/system messages
- Visible-only polling:
  - Session list every 10 seconds.
  - Active transcript every 2 seconds while OpenCode is actively handling the session.
  - Active transcript every 20 seconds when idle.
- Scroll position preservation during polling.

## Prerequisites

Start an OpenCode V2 server before using the extension. The extension does not start, discover, or manage the OpenCode server.

Default server URL:

```text
http://localhost:4096
```

The extension authenticates with OpenCode's Basic auth format:

```text
username: opencode
password: <your OpenCode server password>
```

## Setup

Install dependencies for the extension host and webview:

```bash
npm install
npm --prefix webview install
```

Build everything:

```bash
npm run build
```

Watch both the extension and webview during development:

```bash
npm run watch
```

Run checks:

```bash
npm run lint
npm run typecheck
npm test
```

Package the extension:

```bash
npm run package
```

## Run in VS Code

1. Open this folder in VS Code.
2. Press `F5`, or open Run and Debug and start `Run Extension`.
3. Open the OpenCode icon in the Activity Bar.
4. Enter the OpenCode server URL and password.
5. Select `Connect`.

You can also open the panel from the Command Palette:

```text
Open OpenCode Panel
```

## Behavior

### Authentication

When the panel opens:

1. The extension reads the saved credential from VS Code `SecretStorage`.
2. If no credential exists, the authentication form is shown.
3. If a saved credential fails validation, the authentication form is shown with the error.
4. If validation succeeds, the session list loads.

The password is never sent back to the webview after it is stored.

### Session list

The extension fetches the newest 50 sessions for the first workspace folder:

```text
GET /api/session?directory=<workspace fsPath>&order=desc&limit=50
```

No search or infinite loading is included in V1.

### Transcript

When a session is opened, the extension fetches the latest 50 messages and displays them chronologically with the newest message at the bottom.

No older-message pagination is included in V1.

### Session creation

The Sessions view includes a **New session** button. It creates a session in the first workspace folder using OpenCode's default agent, model, and permission settings.

The new session opens in a sidebar tab immediately after creation.

### Prompting

Each open session tab has a plain-text prompt composer.

- The Send button submits the trimmed prompt.
- Enter inserts a newline.
- Empty prompts cannot be submitted.
- Drafts are stored per open session tab.
- Closing a tab discards its draft.
- Failed submissions preserve the draft and show an inline error.
- Accepted submissions clear the draft and refresh the transcript.

Prompt submission returns as soon as OpenCode accepts the prompt. Assistant output continues asynchronously and is refreshed by polling.

### Polling

Polling runs only while the OpenCode sidebar is visible.

Intervals:

- Session list: every 10 seconds.
- Active transcript while the session is active: every 2 seconds.
- Active transcript while idle: every 20 seconds.

The extension uses OpenCode's active-session endpoint to decide whether the active session is currently being handled. After a prompt is accepted, it also treats the session as active briefly to avoid missing the transition into the running state.

Polling pauses when the sidebar is hidden and refreshes immediately when it becomes visible again.

Transient network or server failures keep existing content visible and show an inline error. Authentication failures return the panel to the authentication form.

## Project layout

```text
src/
  extension.ts                  Extension activation and command registration
  shared/
    protocol.ts                 Typed extension/webview messages
  services/
    credentialStore.ts          SecretStorage-backed credential persistence
    openCodeApi.ts              OpenCode V2 API wrapper and error classification
    pollingController.ts        Visible-only polling controller
    sessionGroups.ts            Date grouping for sessions
    transcript.ts               Transcript normalization
  sidebar/
    SidebarProvider.ts          Webview lifecycle, state, and polling orchestration

webview/
  src/
    components/
      AuthPanel.tsx             Authentication form
      PromptComposer.tsx      Plain-text prompt composer
      SessionTabs.tsx         In-sidebar tabs
      SessionList.tsx         Grouped session list and new-session action
      TranscriptView.tsx      Transcript renderer
      ui/                       shadcn/ui components
    lib/
      vscode.ts                 VS Code webview bridge
    App.tsx                     Sidebar state and screen routing
    index.css                   Tailwind and VS Code theme mapping

resources/
  icon.svg                      Activity Bar icon

dist/
  extension.js                  Bundled extension host output
  webview/                      Bundled webview output
```

## Excluded

- Starting or managing the OpenCode server.
- Tool configuration or manual tool invocation.
- OpenCode commands and shortcut handling.
- MCP selection or configuration.
- Model or agent selection.
- File attachments, mentions, and skills.
- Streaming/event subscriptions.
- Stop, cancel, revert, rename, or delete actions.
- Session search.
- Pagination or infinite loading.
- Background polling while hidden.
- Polling inactive session tabs.
- File Explorer context-menu integration.
