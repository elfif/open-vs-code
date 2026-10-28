import { describe, expect, it } from "vitest";

import {
  DEFAULT_FONT_SIZE_SETTING,
  FONT_SCALES,
  FONT_SCALE_CSS_VARIABLE,
  resolveFontScale,
} from "../src/shared/fontScale";

describe("resolveFontScale", () => {
  it("resolves each configured size", () => {
    expect(resolveFontScale("small")).toBe(0.9);
    expect(resolveFontScale("standard")).toBe(1);
    expect(resolveFontScale("large")).toBe(1.15);
  });

  it("falls back to the standard scale for unknown values", () => {
    expect(resolveFontScale("huge")).toBe(FONT_SCALES[DEFAULT_FONT_SIZE_SETTING]);
    expect(resolveFontScale(undefined)).toBe(1);
    expect(resolveFontScale(null)).toBe(1);
    expect(resolveFontScale(42)).toBe(1);
    expect(resolveFontScale({})).toBe(1);
  });

  it("keeps the default setting at standard", () => {
    expect(DEFAULT_FONT_SIZE_SETTING).toBe("standard");
    expect(FONT_SCALES[DEFAULT_FONT_SIZE_SETTING]).toBe(1);
  });

  it("exposes the CSS variable name the webview reads", () => {
    expect(FONT_SCALE_CSS_VARIABLE).toBe("--ovsc-scale");
  });
});
