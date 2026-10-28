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
  - `src/extension.ts` — activation; registers `openVsCode.openPanel`, the Explorer command `openVsCode.addFilesToSession`, the editor command `openVsCode.addSelectionToSession`, and the `openVsCode.sidebar` WebviewView provider.
  - `src/sidebar/SidebarProvider.ts` — the orchestrator: webview lifecycle, auth, session list/tabs, prompt submission, polling schedules, optimistic "active" window after prompt submit.
  - `src/services/openCodeApi.ts` — wrapper around `@opencode/client` (OpenCode V2). Basic auth: username `opencode`, password = user-provided server password. Error classification lives here.
  - `src/services/credentialStore.ts` — credentials in VS Code `SecretStorage` (one server at a time).
  - `src/services/pollingController.ts` — visible-only dynamic polling (pauses when webview hidden).
  - `src/services/sessionGroups.ts` — group sessions by last update: Today / Yesterday / localized date.
  - `src/services/transcript.ts` — normalize OpenCode messages into read-only transcript items.
  - `src/services/documentStore.ts` — per-session staged document payloads, validation, move/remove/cleanup.
  - `src/sidebar/selectionContext.ts` — pure editor-selection to one-based line-range conversion (unit-tested).
  - `src/shared/promptTypes.ts` — prompt segment union types shared by extension and webview.
  - `src/shared/promptContent.ts` — badge labels/previews and prompt segment validation.
  - `src/shared/promptDocuments.ts` — document classification, size formatting, and final prompt payload construction (unit-tested).
  - `src/shared/uriList.ts` — URI-list parsing and supported URI filtering for Explorer drops/pastes (unit-tested).
  - `src/shared/protocol.ts` — **single source of truth** for all extension<->webview messages and shared types. Change here first.
- **Webview** (`webview/`, React 19 + Lexical + Vite + Tailwind CSS v4 + shadcn/ui, built to `dist/webview/`):
  - `webview/src/App.tsx` — root component, reducer (open tabs, per-tab prompt drafts, connection status), `ResizeObserver` on `<main>` tracks panel height.
  - `webview/src/components/` — `AuthPanel`, `SessionList`, `SessionTabs`, `TranscriptView`, `PromptComposer`, `PromptToolbar`, `SkillPicker`, `SkillPickerPlugin`, and the Lexical `ContextBadgeNode`/`ContextBadge` pair.
  - `webview/src/components/ui/` — shadcn primitives (generated; see `webview/components.json`).
  - `webview/src/lib/promptHeight.ts` — pure composer auto-size math (unit-tested).
  - `webview/src/lib/promptSelection.ts` — pure agent/model/variant initialization, transitions, and provider grouping (unit-tested).
  - `webview/src/lib/skillTrigger.ts` — pure slash-query detection, skill filtering, and skill-menu placement math (unit-tested).
  - `webview/src/lib/dropZone.ts` — DOM-free `DataTransfer` snapshotting, drag/paste acceptance rules, and URI resolution for drops (unit-tested).
  - `webview/src/lib/fileTransfer.ts` — browser `File` to base64 helper for staging.
  - `webview/src/lib/vscode.ts` — `acquireVsCodeApi()` wrapper and postMessage helper.

## Key behaviors (do not regress)

- Command palette entry: **"Open OpenCode Panel"**; sidebar container "OpenCode" in the activity bar.
- Session list filters by the **first VS Code workspace folder** (`location.directory`).
- New sessions: `session.create` with **only** `location.directory`. Before each prompt, call `session.switchAgent` and `session.switchModel` with the toolbar selection (including an optional model variant), then `session.prompt` with `sessionID`, trimmed `text`, and optional `files[]` for native image/PDF attachments.
- **OpenCode: Add to Session** is available in the file Explorer context menu (including multi-select) and editor selection context menu; `Ctrl+Alt+O` (`Cmd+Alt+O` on macOS) invokes it. With the Sessions tab active it creates a session, otherwise it inserts into the active session at the last composer caret (or the end).
- The Explorer and editor use separate command IDs (`addFilesToSession` and `addSelectionToSession`) because VS Code passes the editor document URI to every `editor/context` command. Do not infer the invocation source from the first argument or the active editor alone.
- File handling is unified across Explorer context menu, Explorer drag/copy, desktop drag/drop, and clipboard files. All supported files are staged in the extension host and inserted as content-backed `document` badges.
- **VS Code blocks drag events over webviews while a drag is in progress** (`WebviewWindowDragMonitor` sets `pointer-events: none` on the webview element for every non-Shift `dragover`, from `src/vs/workbench/contrib/webview/browser/webviewWindowDragMonitor.ts`). A plain drop is therefore routed to the editor, not the panel. **Holding `Shift` while dragging is required for any drag — desktop or Explorer — to reach the webview.** This is not fixable from the extension; the composer shows a persistent "hold Shift" hint plus a **"Add files"** button (`webviewToExtension: pickFiles` -> `vscode.window.showOpenDialog`) as the friction-free path.
- Composer drag handling listens on the **document capture phase** for `dragenter`/`dragover`/`dragleave`/`drop`/`dragend` and treats the whole composer (not just the contentEditable) as the drop zone. Accepts `Files`, `text/uri-list`, and `application/vnd.code.tree.*`; deliberately excludes bare `text/plain` so internal text-selection drags are untouched.
- Explorer drops carry **no `dataTransfer.files`** — only `text/uri-list` (plus a private tree payload), so URI resolution must happen on `drop`, never during `dragover`. `resolveTransferUris` prefers `text/uri-list` and falls back to `text/plain`.
- Text/source documents are injected into the prompt as fenced `### File content` blocks. Images and PDFs are sent as native OpenCode `files[]` data-URI attachments and represented in prompt text by `### Attached file` markers.
- Supported document types are text/source files, PDF, PNG, JPEG, and WebP. Office documents, `.wasm`, `.mat`, folders, and invalid UTF-8 text are rejected with composer or VS Code warnings.
- Document size limits: **10 MB per file** and **30 MB total per submitted prompt**.
- Selection badges display `{filename} - l{from} - {to}` (only `l{from}` for one line), preserve the exact code selected at insertion time, show a code-preview tooltip, and serialize as a `### File content` Markdown block. The extension host serializes webview `PromptSegment[]` and staged document payloads before calling `session.prompt`.
- Prompt toolbar selections are kept per open session tab. Agent defaults may change the model and variant; changing models resets the variant; the variant selector is hidden for models without variants.
- Typing `/` at the start of the prompt or after whitespace opens a caret-positioned skill picker populated from `skill.list`. The picker shows only skill names, filters incrementally by name or ID, and supports Arrow keys, Enter/Tab, Escape, and mouse selection. Selecting a skill replaces the slash query with an inline `/skill-id` badge and a trailing space.
- Skill badges serialize as ordinary `/skill-id` text in the submitted prompt and are also sent as native OpenCode `skills[]` attachments, deduplicated by skill ID.
- Polling: session list every **10s**; active transcript every **2s** while session is actively handled (OpenCode `session.active` + short optimistic window after submit), **20s** when idle.
- Prompt composer sizing: empty = 4 rows; grows to content + 2 empty rows; no scrollbar until 40% of panel height; then fixed with vertical scroll. Min wins if the cap is smaller than the minimum; no cap when panel height is unknown (≤0).
- Prompt drafts (including inline context badges) are kept per open session tab in webview state.
- Explicitly **out of scope**: tool controls, MCP selection, @-mentions, starting/discovering/managing the OpenCode server from the extension.

## OpenCode server

- Must already be running; default URL `http://localhost:4096`.
- API spec: `https://opencode.ai/v2/openapi.json` (fetch with `webfetch` when you need endpoint details — do not guess).
- Auth: HTTP Basic, username `opencode`, password from the auth form (stored in SecretStorage).

## Testing

- Vitest, node environment, tests in `tests/*.test.ts` only (`vitest.config.ts`). No DOM/React component tests — logic is extracted into pure modules (`promptContent`, `promptDocuments`, `uriList`, `selectionContext`, `promptHeight`, `promptSelection`, `skillTrigger`, `sessionGroups`, `transcript`, `pollingController`, `documentStore`) precisely so it can be tested without a DOM.
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

Implemented and tested: auth flow, session list with grouping, closable in-sidebar session tabs with read-only transcripts, session creation, prompt submission, dynamic polling, prompt auto-grow, the per-session agent/model/variant prompt toolbar, and slash-triggered skill selection. The model picker is a searchable dialog grouped by provider. The skill picker lists registered skills by name at the caret, filters as the user types, and inserts removable `/skill-id` badges. Prompt submission switches the session agent and model before sending the prompt. Explorer files, Explorer drag/copy, desktop drag/drop, clipboard files, and exact editor selections can be inserted as inline Lexical badges with preview tooltips. Supported text/source files are injected as fenced prompt content; supported images and PDFs are staged in the extension host and submitted as native OpenCode file attachments.
