import { describe, expect, it } from "vitest";

import {
  calculatePromptTextareaHeight,
  PROMPT_EXTRA_ROWS,
  PROMPT_MAX_PANEL_RATIO,
  PROMPT_MIN_ROWS,
} from "../webview/src/lib/promptHeight";

const LINE_HEIGHT = 20;
const CHROME_HEIGHT = 18;

function chromeOnlyContent(): number {
  return CHROME_HEIGHT;
}

describe("calculatePromptTextareaHeight", () => {
  it("uses the 4-row minimum when the input is empty", () => {
    const { height, capped } = calculatePromptTextareaHeight({
      contentHeight: chromeOnlyContent(),
      lineHeight: LINE_HEIGHT,
      chromeHeight: CHROME_HEIGHT,
      panelHeight: 1000,
    });

    expect(height).toBe(CHROME_HEIGHT + PROMPT_MIN_ROWS * LINE_HEIGHT);
    expect(capped).toBe(false);
  });

  it("keeps two extra empty rows for short content", () => {
    const contentHeight = CHROME_HEIGHT + 3 * LINE_HEIGHT;
    const { height, capped } = calculatePromptTextareaHeight({
      contentHeight,
      lineHeight: LINE_HEIGHT,
      chromeHeight: CHROME_HEIGHT,
      panelHeight: 1000,
    });

    expect(height).toBe(contentHeight + PROMPT_EXTRA_ROWS * LINE_HEIGHT);
    expect(capped).toBe(false);
  });

  it("caps growth at 40% of the panel height", () => {
    const panelHeight = 1000;
    const { height, capped } = calculatePromptTextareaHeight({
      contentHeight: CHROME_HEIGHT + 50 * LINE_HEIGHT,
      lineHeight: LINE_HEIGHT,
      chromeHeight: CHROME_HEIGHT,
      panelHeight,
    });

    expect(height).toBe(panelHeight * PROMPT_MAX_PANEL_RATIO);
    expect(capped).toBe(true);
  });

  it("follows the panel when it is resized", () => {
    const contentHeight = CHROME_HEIGHT + 50 * LINE_HEIGHT;

    const small = calculatePromptTextareaHeight({
      contentHeight,
      lineHeight: LINE_HEIGHT,
      chromeHeight: CHROME_HEIGHT,
      panelHeight: 1000,
    });

    const large = calculatePromptTextareaHeight({
      contentHeight,
      lineHeight: LINE_HEIGHT,
      chromeHeight: CHROME_HEIGHT,
      panelHeight: 2000,
    });

    expect(small.height).toBe(400);
    expect(large.height).toBe(800);
    expect(large.capped).toBe(true);
  });

  it("never shrinks below the minimum even when the cap is smaller", () => {
    const minHeight = CHROME_HEIGHT + PROMPT_MIN_ROWS * LINE_HEIGHT;
    const { height } = calculatePromptTextareaHeight({
      contentHeight: CHROME_HEIGHT + 50 * LINE_HEIGHT,
      lineHeight: LINE_HEIGHT,
      chromeHeight: CHROME_HEIGHT,
      panelHeight: 100,
    });

    expect(height).toBe(minHeight);
  });

  it("skips the cap when the panel height is unknown", () => {
    const contentHeight = CHROME_HEIGHT + 50 * LINE_HEIGHT;
    const { height, capped } = calculatePromptTextareaHeight({
      contentHeight,
      lineHeight: LINE_HEIGHT,
      chromeHeight: CHROME_HEIGHT,
      panelHeight: 0,
    });

    expect(height).toBe(contentHeight + PROMPT_EXTRA_ROWS * LINE_HEIGHT);
    expect(capped).toBe(false);
  });
});
