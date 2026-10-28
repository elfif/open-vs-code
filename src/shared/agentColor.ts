/**
 * Per-agent UI colors, mirroring the OpenCode TUI behavior: an agent's declared
 * `color` wins, otherwise a palette color is assigned by the agent's position in
 * the visible agent list (`palette[index % palette.length]`). The index is
 * positional — adding or removing agents shifts auto-assigned colors, so a
 * declared `color:` is the only way to pin one.
 */

/** Mid-tone categorical colors that stay visible on light and dark themes. */
export const AGENT_COLOR_PALETTE: readonly string[] = [
  "#4e79a7", // blue
  "#e15759", // red
  "#59a14f", // green
  "#f28e2c", // orange
  "#b07aa1", // mauve
  "#76b7b2", // teal
  "#edc948", // gold
  "#9c755f", // brown
  "#ff9da7", // rose
  "#8cd17d", // light green
  "#a0cbe8", // sky
  "#bab0ac", // gray
];

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export interface AgentColorSource {
  readonly id: string;
  readonly color?: string;
}

function colorAt(agents: readonly AgentColorSource[], index: number): string {
  const declared = agents[index]?.color;

  if (declared !== undefined && HEX_COLOR.test(declared)) {
    return declared;
  }

  return AGENT_COLOR_PALETTE[index % AGENT_COLOR_PALETTE.length];
}

/**
 * Resolve the UI color for `agentID` against the full visible agent list in
 * server order (subagents included), like the TUI's `agent.color()`.
 * Returns `undefined` when the agent is not in the list.
 */
export function resolveAgentColor(
  visibleAgents: readonly AgentColorSource[],
  agentID: string,
): string | undefined {
  const index = visibleAgents.findIndex((agent) => agent.id === agentID);

  return index === -1 ? undefined : colorAt(visibleAgents, index);
}

/**
 * Resolve colors for every agent in the visible list, keyed by agent id.
 * Used for transcript entries whose agent may not be user-selectable
 * (e.g. subagent answers).
 */
export function resolveAgentColors(
  visibleAgents: readonly AgentColorSource[],
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    visibleAgents.map((agent, index) => [agent.id, colorAt(visibleAgents, index)]),
  );
}
