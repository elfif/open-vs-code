import { describe, expect, it } from "vitest";

import type { PromptCatalog, PromptSelection, SessionListItem } from "../src/shared/protocol";
import {
  applyAgentSelection,
  applyModelSelection,
  applyVariantSelection,
  createPromptSelection,
  groupModelsByProvider,
  reconcilePromptSelection,
  selectedAgentColor,
  selectedModelOption,
} from "../webview/src/lib/promptSelection";

const catalog: PromptCatalog = {
  agents: [
    {
      id: "build",
      name: "Build",
      model: { providerID: "openai", id: "gpt-5", variant: "high" },
    },
    { id: "plan", name: "Plan" },
  ],
  models: [
    {
      id: "gpt-5",
      providerID: "openai",
      name: "GPT-5",
      variants: ["low", "high"],
    },
    {
      id: "claude-sonnet",
      providerID: "anthropic",
      name: "Claude Sonnet",
      variants: [],
    },
  ],
  providers: [
    { id: "openai", name: "OpenAI" },
    { id: "anthropic", name: "Anthropic" },
  ],
  defaultModel: { providerID: "anthropic", id: "claude-sonnet" },
};

const selection: PromptSelection = {
  agent: "plan",
  model: { providerID: "anthropic", id: "claude-sonnet" },
};

describe("prompt selection", () => {
  it("initializes from session settings", () => {
    const session: SessionListItem = {
      id: "ses_1",
      title: "Session",
      updatedAt: 1,
      agent: "plan",
      model: { providerID: "openai", id: "gpt-5", variant: "low" },
    };

    expect(createPromptSelection(catalog, session)).toEqual({
      agent: "plan",
      model: { providerID: "openai", id: "gpt-5", variant: "low" },
    });
  });

  it("uses the initial agent default model before the server default", () => {
    expect(createPromptSelection(catalog)).toEqual({
      agent: "build",
      model: { providerID: "openai", id: "gpt-5", variant: "high" },
    });
  });

  it("drops a saved variant that the selected model does not offer", () => {
    const session: SessionListItem = {
      id: "ses_1",
      title: "Session",
      updatedAt: 1,
      agent: "plan",
      model: { providerID: "openai", id: "gpt-5", variant: "invalid" },
    };

    expect(createPromptSelection(catalog, session)?.model).toEqual({
      providerID: "openai",
      id: "gpt-5",
    });
  });

  it("applies an agent default model and variant", () => {
    expect(applyAgentSelection(catalog, selection, "build")).toEqual({
      agent: "build",
      model: { providerID: "openai", id: "gpt-5", variant: "high" },
    });
  });

  it("preserves the model when the next agent has no default", () => {
    const withVariant = applyVariantSelection(
      { agent: "build", model: { providerID: "openai", id: "gpt-5" } },
      "low",
    );

    expect(applyAgentSelection(catalog, withVariant, "plan")).toEqual({
      agent: "plan",
      model: { providerID: "openai", id: "gpt-5", variant: "low" },
    });
  });

  it("resets the variant when changing models", () => {
    const withVariant = applyVariantSelection(selection, "high");
    const changed = applyModelSelection(withVariant, catalog.models[0]!);

    expect(changed.model).toEqual({ providerID: "openai", id: "gpt-5" });
    expect(selectedModelOption(catalog, changed)?.variants).toEqual(["low", "high"]);
  });

  it("reconciles removed agents, models, and variants after a catalog refresh", () => {
    expect(
      reconcilePromptSelection(catalog, {
        agent: "removed",
        model: { providerID: "removed", id: "removed" },
      }),
    ).toEqual(createPromptSelection(catalog));

    expect(
      reconcilePromptSelection(catalog, {
        agent: "plan",
        model: { providerID: "removed", id: "removed" },
      }),
    ).toEqual({ agent: "plan", model: catalog.defaultModel });

    expect(
      reconcilePromptSelection(catalog, {
        agent: "plan",
        model: { providerID: "openai", id: "gpt-5", variant: "removed" },
      }),
    ).toEqual({ agent: "plan", model: { providerID: "openai", id: "gpt-5" } });
  });
});

describe("model grouping", () => {
  it("groups all models by provider name", () => {
    expect(groupModelsByProvider(catalog, "")).toEqual([
      { id: "anthropic", name: "Anthropic", models: [catalog.models[1]] },
      { id: "openai", name: "OpenAI", models: [catalog.models[0]] },
    ]);
  });

  it("searches model and provider names without returning empty groups", () => {
    expect(groupModelsByProvider(catalog, "openai")).toEqual([
      { id: "openai", name: "OpenAI", models: [catalog.models[0]] },
    ]);
    expect(groupModelsByProvider(catalog, "missing")).toEqual([]);
  });
});

describe("selectedAgentColor", () => {
  const coloredCatalog: PromptCatalog = {
    ...catalog,
    agents: [
      { ...catalog.agents[0], color: "#4e79a7" },
      { ...catalog.agents[1], color: "#e15759" },
    ],
  };

  it("returns the color of the selected agent", () => {
    expect(selectedAgentColor(coloredCatalog, selection)).toBe("#e15759");
  });

  it("returns undefined when the selected agent has no color", () => {
    expect(selectedAgentColor(catalog, selection)).toBeUndefined();
  });

  it("returns undefined without a catalog or selection", () => {
    expect(selectedAgentColor(null, selection)).toBeUndefined();
    expect(selectedAgentColor(catalog, null)).toBeUndefined();
  });
});
