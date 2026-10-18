import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

/** Keep every skill discoverable; full instruction files remain on-demand reads. */
export default function contextPolicy(pi: ExtensionAPI): void {
  pi.on('before_agent_start', event => {
    const skills = event.systemPromptOptions.skills.filter(skill => !skill.disableModelInvocation);
    if (!skills.length) return;
    event.systemPromptOptions.skills = [];
    event.systemPromptOptions.sections.skills = 'Read the matching skill file before its task. Resolve relative references against that skill directory.\n' + skills.map(skill => {
      const description = skill.description.replace(/\s+/g, ' ').trim();
      const brief = description.length > 180 ? description.slice(0, 179) + '…' : description;
      return `${skill.name}: ${brief}\n  ${skill.filePath}`;
    }).join('\n');
  });
}
