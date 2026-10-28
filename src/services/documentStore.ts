import { randomUUID } from "node:crypto";

import {
  classifyDocument,
  inferMime,
  MAX_DOCUMENT_BYTES,
  type DocumentKind,
  type StagedDocumentContent,
} from "../shared/promptDocuments";
import type { PromptDocumentSegment } from "../shared/promptTypes";

export interface StagedDocument extends PromptDocumentSegment, StagedDocumentContent {
  readonly documentKind: DocumentKind;
}

export interface CreateDocumentInput {
  readonly name: string;
  readonly base64: string;
  readonly mime?: string;
  readonly path?: string;
}

const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function createDocumentFromBytes(input: CreateDocumentInput): StagedDocument {
  const name = input.name.trim() || "file";
  const base64 = input.base64.trim();

  if (!BASE64_PATTERN.test(base64)) {
    throw new Error(`${name} is not valid base64 data.`);
  }

  const bytes = Buffer.from(base64, "base64");
  const size = bytes.length;

  if (size > MAX_DOCUMENT_BYTES) {
    throw new Error(`${name} exceeds the 10 MB file size limit.`);
  }

  const kind = classifyDocument(name, input.mime);

  if (kind === "unsupported") {
    throw new Error(`${name} is not supported. Use text, PDF, PNG, JPEG, or WebP.`);
  }

  if (kind !== "text" && size === 0) {
    throw new Error(`${name} is empty.`);
  }

  let text: string | undefined;

  if (kind === "text") {
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error(`${name} is not valid UTF-8 text.`);
    }
  }

  return {
    id: randomUUID(),
    kind: "document",
    name,
    mime: input.mime?.trim() || inferMime(name, kind),
    size,
    ...(input.path?.trim() ? { path: input.path.trim() } : {}),
    documentKind: kind,
    ...(text === undefined ? {} : { text }),
    ...(kind === "text" ? {} : { base64 }),
  };
}

export class DocumentStore {
  private readonly sessions = new Map<string, Map<string, StagedDocument>>();

  public add(sessionID: string, document: StagedDocument): void {
    const documents = this.sessions.get(sessionID) ?? new Map<string, StagedDocument>();
    documents.set(document.id, document);
    this.sessions.set(sessionID, documents);
  }

  public get(sessionID: string, documentID: string): StagedDocument | undefined {
    return this.sessions.get(sessionID)?.get(documentID);
  }

  public getSessionMap(sessionID: string): ReadonlyMap<string, StagedDocument> {
    return this.sessions.get(sessionID) ?? new Map();
  }

  public remove(sessionID: string, documentIDs: readonly string[]): void {
    const documents = this.sessions.get(sessionID);

    if (!documents) {
      return;
    }

    for (const documentID of documentIDs) {
      documents.delete(documentID);
    }

    if (documents.size === 0) {
      this.sessions.delete(sessionID);
    }
  }

  public moveAll(fromSessionID: string, toSessionID: string): void {
    const source = this.sessions.get(fromSessionID);

    if (!source || source.size === 0) {
      return;
    }

    const target = this.sessions.get(toSessionID) ?? new Map<string, StagedDocument>();

    for (const [id, document] of source) {
      target.set(id, document);
    }

    this.sessions.set(toSessionID, target);
    this.sessions.delete(fromSessionID);
  }

  public clearSession(sessionID: string): void {
    this.sessions.delete(sessionID);
  }

  public clearAll(): void {
    this.sessions.clear();
  }
}
