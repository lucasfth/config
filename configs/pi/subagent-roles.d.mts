export const subagentRoles: Readonly<Record<string, string>>;
export function applySubagentRoles(
  subagents: Record<string, unknown> | undefined,
  roles: Record<string, { provider: string; modelId: string; thinkingLevel: string }>,
): Record<string, unknown>;
