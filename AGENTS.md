# AGENTS.md — open-vs-code

VS Code extension (`open-vs-code`) that integrates with an already-running **OpenCode V2 HTTP server** through a React sidebar (`WebviewView`). All OpenCode API access and credentials live in the **extension host**; the webview only receives typed UI data.

## Quick start

```bash
npm install && npm --prefix webview install   # two separate npm trees (root + webview/)
npm run build                               # webview (Vite) then extension (esbuild)
npm run lint && npm run typecheck && npm test
npm run package                             # -> open-vs-code-0.0.1.vsix
```

Reinstall a built VSIX during development:

```bash
code --install-extension open-vs-code-0.0.1.vsix --force
# then run "Developer: Reload Window" in VS Code
```

Dev watch mode: `npm run watch` (concurrently runs esbuild --watch + Vite watch).

## Architecture

Two build targets, one shared protocol:

- **Extension host** (`src/`, bundled by `esbuild.mjs` -> `dist/extension.js`, CommonJS, `@opencode/client` external-free):
  - `src/extension.ts` — activation; registers `openVsCode.openPanel` command and the `openVsCode.sidebar` WebviewView provider.
  - `src/sidebar/SidebarProvider.ts` — the orchestrator: webview lifecycle, auth, session list/tabs, prompt submission, polling schedules, optimistic "active" window after prompt submit.
  - `src/services/openCodeApi.ts` — wrapper around `@opencode/client` (OpenCode V2). Basic auth: username `opencode`, password = user-provided server password. Error classification lives here.
  - `src/services/credentialStore.ts` — credentials in VS Code `SecretStorage` (one server at a time).
  - `src/services/pollingController.ts` — visible-only dynamic polling (pauses when webview hidden).
  - `src/services/sessionGroups.ts` — group sessions by last update: Today / Yesterday / localized date.
  - `src/services/transcript.ts` — normalize OpenCode messages into read-only transcript items.
  - `src/shared/protocol.ts` — **single source of truth** for all extension<->webview messages and shared types. Change here first.
- **Webview** (`webview/`, React 19 + Vite + Tailwind CSS v4 + shadcn/ui, built to `dist/webview/`):
  - `webview/src/App.tsx` — root component, reducer (open tabs, per-tab prompt drafts, connection status), `ResizeObserver` on `<main>` tracks panel height.
  - `webview/src/components/` — `AuthPanel`, `SessionList`, `SessionTabs`, `TranscriptView`, `PromptComposer`, `PromptToolbar`.
  - `webview/src/components/ui/` — shadcn primitives (generated; see `webview/components.json`).
  - `webview/src/lib/promptHeight.ts` — pure composer auto-size math (unit-tested).
  - `webview/src/lib/promptSelection.ts` — pure agent/model/variant initialization, transitions, and provider grouping (unit-tested).
  - `webview/src/lib/vscode.ts` — `acquireVsCodeApi()` wrapper and postMessage helper.

## Key behaviors (do not regress)

- Command palette entry: **"Open OpenCode Panel"**; sidebar container "OpenCode" in the activity bar.
- Session list filters by the **first VS Code workspace folder** (`location.directory`).
- New sessions: `session.create` with **only** `location.directory`. Before each prompt, call `session.switchAgent` and `session.switchModel` with the toolbar selection (including an optional model variant), then `session.prompt` with **only** `sessionID` and trimmed `text`. Plain text only.
- Prompt toolbar selections are kept per open session tab. Agent defaults may change the model and variant; changing models resets the variant; the variant selector is hidden for models without variants.
- Polling: session list every **10s**; active transcript every **2s** while session is actively handled (OpenCode `session.active` + short optimistic window after submit), **20s** when idle.
- Prompt composer sizing: empty = 4 rows; grows to content + 2 empty rows; no scrollbar until 40% of panel height; then fixed with vertical scroll. Min wins if the cap is smaller than the minimum; no cap when panel height is unknown (≤0).
- Prompt drafts are kept per open session tab in webview state.
- Explicitly **out of scope**: tool controls, MCP selection, attachments, mentions, skills, starting/discovering/managing the OpenCode server from the extension.

## OpenCode server

- Must already be running; default URL `http://localhost:4096`.
- API spec: `https://opencode.ai/v2/openapi.json` (fetch with `webfetch` when you need endpoint details — do not guess).
- Auth: HTTP Basic, username `opencode`, password from the auth form (stored in SecretStorage).

## Testing

- Vitest, node environment, tests in `tests/*.test.ts` only (`vitest.config.ts`). No DOM/React component tests — logic is extracted into pure modules (`promptHeight`, `sessionGroups`, `transcript`, `pollingController`) precisely so it can be tested without a DOM.
- Run: `npm test`.

## Conventions

- TypeScript strict everywhere; keep extension/webview types in `src/shared/protocol.ts` (webview imports it via relative path configured in Vite/tsconfig).
- Formatting: Prettier (`npm run format`); lint: ESLint flat config incl. react-hooks rules. CI-equivalent check: `lint && typecheck && format:check && test`.
- Commits follow Conventional Commits (`feat:`, `fix:`, `chore:` ...).
- shadcn/ui primitives: regenerate/extend via the shadcn CLI in `webview/` rather than hand-rolling new base components.
- Tailwind v4 is CSS-first (`webview/src/index.css` `@theme`); do not add a `tailwind.config.js`.

## Gotchas

- Two `package.json` / lockfiles: root (extension) and `webview/`. Install/build both; root `npm run build` handles the ordering.
- `dist/` is generated (extension + webview bundles); never edit it.
- The VSIX at repo root is a build artifact; regenerate with `npm run package` after changes.
- Webview cannot use `window.fetch` against the OpenCode server (CORS/secret isolation) — always route through the extension host via the protocol.
- `vitest.config.ts` warns about ESM-in-CJS config loader; harmless.

## Current state (as of last session)

Implemented and tested: auth flow, session list with grouping, closable in-sidebar session tabs with read-only transcripts, session creation, prompt submission, dynamic polling, prompt auto-grow, and the per-session agent/model/variant prompt toolbar. The model picker is a searchable dialog grouped by provider. Prompt submission switches the session agent and model before sending the prompt.
