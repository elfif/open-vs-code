export const PROMPT_MIN_ROWS = 4;
export const PROMPT_EXTRA_ROWS = 2;
export const PROMPT_MAX_PANEL_RATIO = 0.4;

export interface PromptTextareaHeightInput {
  readonly contentHeight: number;
  readonly lineHeight: number;
  readonly chromeHeight: number;
  readonly panelHeight: number;
}

export interface PromptTextareaHeightResult {
  readonly height: number;
  readonly capped: boolean;
}

export function calculatePromptTextareaHeight({
  contentHeight,
  lineHeight,
  chromeHeight,
  panelHeight,
}: PromptTextareaHeightInput): PromptTextareaHeightResult {
  const minHeight = chromeHeight + PROMPT_MIN_ROWS * lineHeight;
  const desiredHeight = Math.max(minHeight, contentHeight + PROMPT_EXTRA_ROWS * lineHeight);

  if (panelHeight <= 0) {
    return { height: desiredHeight, capped: false };
  }

  const maxHeight = panelHeight * PROMPT_MAX_PANEL_RATIO;
  const height = Math.max(minHeight, Math.min(desiredHeight, maxHeight));

  return {
    height,
    capped: height >= maxHeight - 0.5,
  };
}
