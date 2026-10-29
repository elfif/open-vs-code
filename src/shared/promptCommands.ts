import type { CommandOption } from "./protocol";

export interface CommandInvocation {
  readonly name: string;
  readonly args: string;
}

export function parseCommandInvocation(
  text: string,
  commands: readonly CommandOption[],
): CommandInvocation | null {
  const match = /^\/(\S+)(?:\s+([\s\S]*))?$/.exec(text.trim());

  if (!match) {
    return null;
  }

  const name = match[1];
  const args = match[2] ?? "";

  if (!commands.some((command) => command.name === name)) {
    return null;
  }

  return { name, args };
}
