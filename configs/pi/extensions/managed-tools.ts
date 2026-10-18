import type { ExtensionAPI, ExtensionFactory, ToolDefinition } from '@earendil-works/pi-coding-agent';

const packages = [
  '../node_modules/pi-subagents/index.js',
  '../node_modules/pi-intercom/index.ts',
  '../node_modules/pi-interactive-shell/index.ts',
  '../node_modules/pi-web-access/dist/index.js',
  '../node_modules/pi-btw/extensions/btw.ts',
  '../node_modules/pi-condense/index.ts',
];
const DIRECT_TOOLS = new Set(['subagent']);

/** Load existing implementations once, but advertise bulky capabilities only on discovery. */
export default async function managedTools(pi: ExtensionAPI): Promise<void> {
  const deferredNames = new Set<string>();
  const api = new Proxy(pi, {
    get(target, property) {
      if (property === 'registerTool') return (tool: ToolDefinition) => {
        if (!DIRECT_TOOLS.has(tool.name)) deferredNames.add(tool.name);
        target.registerTool({ ...tool, exposure: DIRECT_TOOLS.has(tool.name) ? 'direct' : 'deferred' });
      };
      if (property === 'setActiveTools') return (names: string[]) => target.setActiveTools(names.filter(name => !deferredNames.has(name)));
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  for (const filename of packages) {
    const loaded: unknown = await import(filename);
    if (!loaded || typeof loaded !== 'object' || !('default' in loaded) || typeof loaded.default !== 'function') throw new Error(`Managed extension has no factory: ${filename}`);
    // Each pinned package declares its default extension factory in its Pi manifest.
    const factory = loaded.default as ExtensionFactory;
    await factory(api);
  }
}
