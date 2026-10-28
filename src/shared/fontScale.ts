/**
 * Font size preference for the sidebar panel, mapped to a CSS scale factor applied
 * to the webview root font size (`--ovsc-scale`). All panel sizes are rem-based,
 * so the whole panel (text, spacing, controls) scales together.
 */
export type FontSizeSetting = "small" | "standard" | "large";

export const FONT_SCALE_CSS_VARIABLE = "--ovsc-scale";

export const FONT_SCALES: Readonly<Record<FontSizeSetting, number>> = {
  small: 0.9,
  standard: 1,
  large: 1.15,
};

export const DEFAULT_FONT_SIZE_SETTING: FontSizeSetting = "standard";

export function resolveFontScale(value: unknown): number {
  if (typeof value === "string" && value in FONT_SCALES) {
    return FONT_SCALES[value as FontSizeSetting];
  }

  return FONT_SCALES[DEFAULT_FONT_SIZE_SETTING];
}
