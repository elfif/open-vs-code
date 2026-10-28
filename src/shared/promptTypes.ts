export interface PromptTextSegment {
  readonly kind: "text";
  readonly text: string;
}

export interface PromptSelectionSegment {
  readonly kind: "selection";
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly code: string;
  readonly languageId: string;
}

export interface PromptDocumentSegment {
  readonly kind: "document";
  readonly id: string;
  readonly name: string;
  readonly mime: string;
  readonly size: number;
  readonly path?: string;
}

export type PromptSegment = PromptTextSegment | PromptSelectionSegment | PromptDocumentSegment;

export type PromptContextSegment = Exclude<PromptSegment, PromptTextSegment>;
