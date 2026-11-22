import { Type } from 'typebox';
import type { BeforeAgentStartEvent, ExtensionAPI } from '@earendil-works/pi-coding-agent';

export default function contextPolicy(pi: ExtensionAPI): void {
  let skills: BeforeAgentStartEvent['systemPromptOptions']['skills'] = [];
  pi.on('before_agent_start', event => {
    skills = event.systemPromptOptions.skills.filter(skill => !skill.disableModelInvocation);
    if (!skills.length) return;
    event.systemPromptOptions.sections.skills = [
      'Before a matching task, call skill_lookup with the exact skill name and read the returned file. Resolve references relative to the skill directory.',
      ...skills.map(({ name, description }) => {
        const cue = description.replace(/\s+/g, ' ').trim();
        return `${name}: ${cue.length > 180 ? cue.slice(0, 179) + '…' : cue}`;
      }),
    ].join('\n');
  });
  pi.registerTool({
    name: 'skill_lookup', label: 'Skill lookup', exposure: 'direct',
    description: 'Get the full routing description and exact file path of an installed skill by name. Read the returned file before using the skill.',
    parameters: Type.Object({ name: Type.String({ minLength: 1, maxLength: 128 }) }),
    async execute(_id, { name }) {
      const skill = skills.find(item => item.name === name);
      const text = skill ? `${skill.name}: ${skill.description}\n${skill.filePath}` : 'No matching model-invocable skill. Use an exact name from the skills index.';
      return { content: [{ type: 'text', text }], details: undefined };
    },
  });
}
