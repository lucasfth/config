// Agent names describe work; saved /model roles own model and thinking defaults.
export const subagentRoles = {
  task: 'task',
  scout: 'task',
  reviewer: 'task',
  'security-reviewer': 'task',
  sonic: 'smol',
  smol: 'smol',
  vision: 'vision',
  designer: 'designer',
  tiny: 'tiny',
  slow: 'slow',
};

export function applySubagentRoles(subagents = {}, roles) {
  const agentOverrides = { ...subagents.agentOverrides };
  for (const [agent, roleName] of Object.entries(subagentRoles)) {
    const role = roles[roleName];
    if (!role) continue;
    agentOverrides[agent] = {
      ...agentOverrides[agent], model: `${role.provider}/${role.modelId}`, thinking: role.thinkingLevel,
    };
  }
  const task = roles.task;
  return {
    ...subagents,
    ...(task ? { defaultModel: `${task.provider}/${task.modelId}`, defaultThinking: task.thinkingLevel } : {}),
    agentOverrides,
  };
}
