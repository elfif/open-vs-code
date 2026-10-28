import { describe, expect, it } from "vitest";

import {
  AGENT_COLOR_PALETTE,
  resolveAgentColor,
  resolveAgentColors,
} from "../src/shared/agentColor";

describe("resolveAgentColor", () => {
  it("prefers a declared hex color", () => {
    const agents = [{ id: "build" }, { id: "reviewer", color: "#ff6b6b" }];

    expect(resolveAgentColor(agents, "reviewer")).toBe("#ff6b6b");
  });

  it("accepts 3-digit hex colors", () => {
    expect(resolveAgentColor([{ id: "a", color: "#abc" }], "a")).toBe("#abc");
  });

  it("assigns palette colors by position in the visible list", () => {
    const agents = [{ id: "a" }, { id: "b" }, { id: "c" }];

    expect(resolveAgentColor(agents, "a")).toBe(AGENT_COLOR_PALETTE[0]);
    expect(resolveAgentColor(agents, "b")).toBe(AGENT_COLOR_PALETTE[1]);
    expect(resolveAgentColor(agents, "c")).toBe(AGENT_COLOR_PALETTE[2]);
  });

  it("cycles the palette when there are more agents than colors", () => {
    const agents = Array.from({ length: AGENT_COLOR_PALETTE.length + 3 }, (_, index) => ({
      id: `agent-${index}`,
    }));

    expect(resolveAgentColor(agents, `agent-${AGENT_COLOR_PALETTE.length}`)).toBe(
      AGENT_COLOR_PALETTE[0],
    );
    expect(resolveAgentColor(agents, `agent-${AGENT_COLOR_PALETTE.length + 2}`)).toBe(
      AGENT_COLOR_PALETTE[2],
    );
  });

  it("counts subagents in the position index (TUI parity)", () => {
    const agents = [{ id: "general" }, { id: "build" }];

    expect(resolveAgentColor(agents, "build")).toBe(AGENT_COLOR_PALETTE[1]);
  });

  it("falls back to the palette when the declared color is not valid hex", () => {
    const agents = [
      { id: "a", color: "rebeccapurple" },
      { id: "b", color: "#12345" },
    ];

    expect(resolveAgentColor(agents, "a")).toBe(AGENT_COLOR_PALETTE[0]);
    expect(resolveAgentColor(agents, "b")).toBe(AGENT_COLOR_PALETTE[1]);
  });

  it("returns undefined for unknown agents", () => {
    expect(resolveAgentColor([{ id: "a" }], "missing")).toBeUndefined();
  });
});

describe("resolveAgentColors", () => {
  it("maps every visible agent to its resolved color, subagents included", () => {
    const agents = [{ id: "build" }, { id: "task", color: "#ff0000" }, { id: "plan" }];

    expect(resolveAgentColors(agents)).toEqual({
      build: AGENT_COLOR_PALETTE[0],
      task: "#ff0000",
      plan: AGENT_COLOR_PALETTE[2],
    });
  });

  it("agrees with resolveAgentColor for every agent in the list", () => {
    const agents = [{ id: "a" }, { id: "b", color: "#abc123" }, { id: "c", color: "bogus" }];
    const colors = resolveAgentColors(agents);

    for (const agent of agents) {
      expect(colors[agent.id]).toBe(resolveAgentColor(agents, agent.id));
    }
  });
});
