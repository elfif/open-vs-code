import type { PromptDocumentSegment, PromptSegment } from "./promptTypes";

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_PROMPT_DOCUMENT_BYTES = 30 * 1024 * 1024;

export type DocumentKind = "text" | "image" | "pdf" | "unsupported";

export interface StagedDocumentContent {
  readonly id: string;
  readonly documentKind: DocumentKind;
  readonly text?: string;
  readonly base64?: string;
}

export interface PromptFileAttachmentInput {
  readonly uri: string;
  readonly name?: string;
}

export interface PromptSkillAttachmentInput {
  readonly id: string;
}

export type PromptPayloadResult =
  | {
      readonly ok: true;
      readonly payload: {
        readonly text: string;
        readonly files: readonly PromptFileAttachmentInput[];
        readonly skills: readonly PromptSkillAttachmentInput[];
      };
      readonly referencedDocumentIDs: readonly string[];
    }
  | {
      readonly ok: false;
      readonly error: string;
    };

const SOURCE_CODE_EXTENSIONS = [
  // TypeScript / JavaScript
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "mts",
  "cts",
  "d.ts",

  // PHP / Laravel
  "php",
  "blade.php",
  "phtml",

  // Database & Query
  "sql",
  "pgsql",
  "psql",
  "prisma",
  "graphql",
  "gql",
  "ddl",
  "dml",
  "plsql",
  "pks",
  "pkb",
  "tsql",
  "cql",
  "cypher",
  "sparql",
  "dbml",

  // Markup, Styling & Templates
  "html",
  "htm",
  "css",
  "scss",
  "sass",
  "less",
  "styl",
  "pcss",
  "postcss",
  "vue",
  "svelte",
  "astro",
  "hbs",
  "handlebars",
  "ejs",
  "pug",
  "jade",
  "twig",
  "liquid",
  "njk",
  "erb",
  "jsp",
  "asp",
  "aspx",
  "cshtml",
  "razor",

  // General-Purpose Languages
  "py",
  "pyw",
  "pyi",
  "java",
  "kt",
  "kts",
  "scala",
  "sc",
  "groovy",
  "gradle",
  "cs",
  "csx",
  "vb",
  "fs",
  "fsx",
  "fsi",
  "go",
  "rs",
  "rb",
  "rake",
  "gemspec",
  "swift",
  "m",
  "mm",
  "dart",
  "lua",
  "pl",
  "pm",
  "r",
  "jl",
  "ex",
  "exs",
  "erl",
  "hrl",
  "clj",
  "cljs",
  "cljc",
  "edn",
  "hs",
  "lhs",
  "ml",
  "mli",
  "elm",
  "nim",
  "zig",
  "cr",
  "v",
  "d",
  "hx",
  "coffee",
  "purs",
  "res",
  "resi",
  "re",
  "rei",
  "rkt",
  "scm",
  "ss",
  "lisp",
  "lsp",
  "cl",
  "el",
  "vim",
  "tcl",
  "raku",
  "p6",

  // C / C++ Family
  "c",
  "h",
  "cpp",
  "cc",
  "cxx",
  "c++",
  "hpp",
  "hh",
  "hxx",
  "h++",
  "ipp",
  "tpp",
  "inl",
  "cu",
  "cuh",
  "ino",

  // Shell & Scripting
  "sh",
  "bash",
  "zsh",
  "fish",
  "ksh",
  "csh",
  "tcsh",
  "bat",
  "cmd",
  "ps1",
  "psm1",
  "psd1",
  "awk",
  "sed",
  "nu",

  // Systems, Low-Level & Hardware
  "asm",
  "s",
  "nasm",
  "wat",
  "vhd",
  "vhdl",
  "sv",
  "svh",
  "glsl",
  "vert",
  "frag",
  "hlsl",
  "wgsl",
  "metal",
  "sol",
  "vy",
  "move",
  "cairo",

  // Legacy / Enterprise
  "cob",
  "cbl",
  "cpy",
  "f",
  "f90",
  "f95",
  "for",
  "pas",
  "pp",
  "dpr",
  "ada",
  "adb",
  "ads",
  "pro",
  "prolog",
  "bas",
  "vbs",
  "abap",
  "apex",
  "cls",
  "trigger",
  "rpg",
  "rpgle",
  "sas",
  "vba",
  "frm",

  // Config, Data & Build
  "json",
  "jsonc",
  "json5",
  "yaml",
  "yml",
  "toml",
  "xml",
  "xsd",
  "xsl",
  "xslt",
  "ini",
  "cfg",
  "conf",
  "env",
  "properties",
  "tf",
  "tfvars",
  "hcl",
  "nix",
  "dhall",
  "proto",
  "thrift",
  "avsc",
  "cmake",
  "mk",
  "sbt",
  "bzl",
  "dockerfile",
  "dockerignore",
  "gitignore",
  "editorconfig",
  "eslintrc",
  "prettierrc",

  // Documentation & Notebooks
  "md",
  "mdx",
  "rst",
  "adoc",
  "asciidoc",
  "tex",
  "bib",
  "ipynb",
  "rmd",
  "qmd",
  "org",
];

const PLAIN_TEXT_EXTENSIONS = ["txt", "csv", "tsv", "log"];

const SPECIAL_TEXT_FILENAMES = [
  "dockerfile",
  "makefile",
  "justfile",
  "rakefile",
  "gemfile",
  "jenkinsfile",
  "vagrantfile",
  "procfile",
];

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);
const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);
const TEXT_EXTENSIONS = new Set([...SOURCE_CODE_EXTENSIONS, ...PLAIN_TEXT_EXTENSIONS]);
const TEXT_MIME_TYPES = new Set([
  "application/json",
  "application/jsonc",
  "application/json5",
  "application/xml",
  "application/x-yaml",
  "application/yaml",
  "application/toml",
  "application/sql",
  "application/graphql",
  "application/x-sh",
  "application/x-httpd-php",
  "application/typescript",
  "application/javascript",
  "application/x-typescript",
  "application/x-javascript",
]);

const FENCE_LANGUAGES: ReadonlyArray<readonly [string, string]> = [
  ["d.ts", "typescript"],
  ["blade.php", "php"],
  ["ts", "typescript"],
  ["tsx", "typescriptreact"],
  ["js", "javascript"],
  ["mjs", "javascript"],
  ["cjs", "javascript"],
  ["jsx", "javascriptreact"],
  ["php", "php"],
  ["py", "python"],
  ["rb", "ruby"],
  ["go", "go"],
  ["rs", "rust"],
  ["java", "java"],
  ["kt", "kotlin"],
  ["swift", "swift"],
  ["sh", "bash"],
  ["bash", "bash"],
  ["zsh", "bash"],
  ["ps1", "powershell"],
  ["sql", "sql"],
  ["json", "json"],
  ["yaml", "yaml"],
  ["yml", "yaml"],
  ["toml", "toml"],
  ["xml", "xml"],
  ["html", "html"],
  ["css", "css"],
  ["scss", "scss"],
  ["md", "markdown"],
  ["mdx", "mdx"],
  ["graphql", "graphql"],
  ["gql", "graphql"],
  ["dockerfile", "dockerfile"],
];

const TEXT_EXTENSIONS_LIST = [...TEXT_EXTENSIONS];

export function normalizeFileName(name: string): string {
  return name.split(/[\\/]/).pop()?.trim().toLowerCase() ?? "";
}

export function matchesExtension(name: string, extension: string): boolean {
  const normalizedName = normalizeFileName(name);
  const normalizedExtension = extension.toLowerCase();

  return (
    normalizedName === normalizedExtension || normalizedName.endsWith(`.${normalizedExtension}`)
  );
}

export function classifyDocument(name: string, mime?: string): DocumentKind {
  const normalizedName = normalizeFileName(name);
  const normalizedMime = mime?.trim().toLowerCase();

  if (normalizedMime === "application/pdf" || matchesExtension(normalizedName, "pdf")) {
    return "pdf";
  }

  if (
    (normalizedMime !== undefined && IMAGE_MIME_TYPES.has(normalizedMime)) ||
    IMAGE_EXTENSIONS.has(lastExtension(normalizedName))
  ) {
    return "image";
  }

  if (
    SPECIAL_TEXT_FILENAMES.includes(normalizedName) ||
    TEXT_EXTENSIONS_LIST.some((extension) => matchesExtension(normalizedName, extension))
  ) {
    return "text";
  }

  if (
    normalizedMime?.startsWith("text/") ||
    (normalizedMime && TEXT_MIME_TYPES.has(normalizedMime))
  ) {
    return "text";
  }

  return "unsupported";
}

export function inferMime(name: string, kind: DocumentKind): string {
  const normalizedName = normalizeFileName(name);

  if (kind === "pdf") {
    return "application/pdf";
  }

  if (kind === "image") {
    if (matchesExtension(normalizedName, "jpg") || matchesExtension(normalizedName, "jpeg")) {
      return "image/jpeg";
    }

    if (matchesExtension(normalizedName, "webp")) {
      return "image/webp";
    }

    return "image/png";
  }

  if (matchesExtension(normalizedName, "json")) {
    return "application/json";
  }

  if (matchesExtension(normalizedName, "yaml") || matchesExtension(normalizedName, "yml")) {
    return "application/yaml";
  }

  if (matchesExtension(normalizedName, "xml")) {
    return "application/xml";
  }

  if (matchesExtension(normalizedName, "toml")) {
    return "application/toml";
  }

  return "text/plain";
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "0 B";
  }

  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value < 100 ? 1 : 0)} ${units[unitIndex]}`;
}

export function collectDocumentIDs(parts: readonly PromptSegment[]): string[] {
  const ids = new Set<string>();

  for (const part of parts) {
    if (part.kind === "document") {
      ids.add(part.id);
    }
  }

  return [...ids];
}

export function collectSkillIDs(parts: readonly PromptSegment[]): string[] {
  const ids = new Set<string>();

  for (const part of parts) {
    if (part.kind === "skill") {
      ids.add(part.id);
    }
  }

  return [...ids];
}

export function buildPromptPayload(
  parts: readonly PromptSegment[],
  documents: ReadonlyMap<string, StagedDocumentContent>,
): PromptPayloadResult {
  const totalSize = totalDocumentSize(parts);

  if (totalSize > MAX_PROMPT_DOCUMENT_BYTES) {
    return {
      ok: false,
      error: `Attached files exceed the ${formatBytes(MAX_PROMPT_DOCUMENT_BYTES)} prompt limit.`,
    };
  }

  const files: PromptFileAttachmentInput[] = [];
  const skills: PromptSkillAttachmentInput[] = [];
  const seenFileIDs = new Set<string>();
  const seenSkillIDs = new Set<string>();
  let output = "";
  let previousWasBlock = false;

  for (const segment of parts) {
    if (segment.kind === "text") {
      if (segment.text.length === 0) {
        continue;
      }

      appendContent(segment.text, false);
      continue;
    }

    if (segment.kind === "selection") {
      appendContent(formatSelection(segment), true);
      continue;
    }

    if (segment.kind === "command") {
      appendContent(`/${segment.name}`, false);
      continue;
    }

    if (segment.kind === "skill") {
      if (!seenSkillIDs.has(segment.id)) {
        seenSkillIDs.add(segment.id);
        skills.push({ id: segment.id });
      }

      appendContent(`@${segment.id}`, false);
      continue;
    }

    const content = formatDocumentSegment(segment, documents);

    if (content === null) {
      return {
        ok: false,
        error: `Attached file "${segment.name}" is no longer available. Re-add it before sending.`,
      };
    }

    if (!seenFileIDs.has(segment.id)) {
      const staged = documents.get(segment.id);

      if (staged?.documentKind === "image" || staged?.documentKind === "pdf") {
        seenFileIDs.add(segment.id);
        files.push({
          uri: `data:${segment.mime};base64,${staged.base64}`,
          name: segment.name,
        });
      }
    }

    appendContent(content, true);
  }

  function appendContent(content: string, isBlock: boolean): void {
    if (output.length > 0 && content.length > 0 && (isBlock || previousWasBlock)) {
      const trailingNewlines = output.match(/\n*$/)?.[0].length ?? 0;
      const leadingNewlines = content.match(/^\n*/)?.[0].length ?? 0;
      output += "\n".repeat(Math.max(0, 2 - trailingNewlines - leadingNewlines));
    }

    output += content;
    previousWasBlock = isBlock;
  }

  return {
    ok: true,
    payload: {
      text: output.trim(),
      files,
      skills,
    },
    referencedDocumentIDs: collectDocumentIDs(parts),
  };
}

function totalDocumentSize(parts: readonly PromptSegment[]): number {
  const seen = new Set<string>();
  let total = 0;

  for (const segment of parts) {
    if (segment.kind === "document" && !seen.has(segment.id)) {
      seen.add(segment.id);
      total += segment.size;
    }
  }

  return total;
}

function formatDocumentSegment(
  segment: PromptDocumentSegment,
  documents: ReadonlyMap<string, StagedDocumentContent>,
): string | null {
  const staged = documents.get(segment.id);

  if (!staged) {
    return null;
  }

  if (staged.documentKind === "text") {
    if (typeof staged.text !== "string") {
      return null;
    }

    return formatTextDocumentBlock(segment, staged.text);
  }

  if (staged.documentKind !== "image" && staged.documentKind !== "pdf") {
    return null;
  }

  if (!staged.base64) {
    return null;
  }

  return formatAttachedFileBlock(segment);
}

function formatTextDocumentBlock(segment: PromptDocumentSegment, content: string): string {
  const fence = createFence(content);
  const language = fenceLanguage(segment.name, segment.mime);
  const contentEnding = content.endsWith("\n") ? "" : "\n";

  return `### File content\nfile: ${segment.path || segment.name}\n${fence}${language}\n${content}${contentEnding}${fence}`;
}

function formatAttachedFileBlock(segment: PromptDocumentSegment): string {
  return `### Attached file\nfile: ${segment.path || segment.name}\nmime: ${segment.mime}`;
}

function createFence(content: string): string {
  const longestBacktickRun = (content.match(/`+/g) ?? []).reduce(
    (longest, run) => Math.max(longest, run.length),
    0,
  );

  return "`".repeat(Math.max(3, longestBacktickRun + 1));
}

function fenceLanguage(name: string, mime: string): string {
  const normalizedName = normalizeFileName(name);

  for (const [extension, language] of FENCE_LANGUAGES) {
    if (matchesExtension(normalizedName, extension)) {
      return language;
    }
  }

  if (mime.startsWith("text/")) {
    const subtype = mime.slice("text/".length).replace(/[^a-z0-9_-]/g, "");
    return subtype === "plain" || !subtype ? "text" : subtype;
  }

  return "text";
}

function lastExtension(name: string): string {
  const dot = name.lastIndexOf(".");

  return dot >= 0 ? name.slice(dot + 1) : "";
}

function formatSelection(segment: Extract<PromptSegment, { kind: "selection" }>): string {
  const range =
    segment.startLine === segment.endLine
      ? `${segment.startLine}`
      : `${segment.startLine} - ${segment.endLine}`;
  const fence = createFence(segment.code);
  const codeEnding = segment.code.endsWith("\n") ? "" : "\n";

  return `### File content\nfile: ${segment.path} (lines: ${range})\nselected content:\n${fence}${segment.languageId}\n${segment.code}${codeEnding}${fence}`;
}
