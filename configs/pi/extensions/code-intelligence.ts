import { readFile, stat } from "node:fs/promises";
import { createHash } from 'node:crypto';
import path from "node:path";
import type { ExtensionAPI, ExtensionFactory, ToolDefinition, ToolResultEvent, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { LspExtensionState } from "../node_modules/pi-lsp-adapter/src/state.js";
import { Type } from "typebox";
import { applyWorkspaceEdit, type WorkspaceEdit, type TextEdit } from "./workspace-edits.ts";
import { normalizeWorkspaceEdit, normalizeActions } from './lsp-values.ts';
type Position = { line: number; character: number };
type Range = { start: Position; end: Position };
type Action = { title: string; kind?: string; edit?: WorkspaceEdit; command?: { title: string; command: string; arguments?: unknown[] } };
type RuntimeManager = {
  rename(file: string, line: number, character: number, name: string): Promise<{ result: unknown }>;
  codeActions(file: string, range: Range, context: { diagnostics: unknown[]; only?: string[] }): Promise<{ result: unknown }>
  diagnostics(file: string): Promise<{ diagnostics: Array<{ severity?: number; range: Range; message: string; source?: string; code?: string | number }> }>;
  warmupFile(file: string): Promise<boolean>;
};
const registryKey = Symbol.for('huginn.pi-lsp-state-by-session');
const ActionKeyParams = Type.Object({ filePath: Type.String(), startLine: Type.Integer({ minimum: 1 }), startColumn: Type.Integer({ minimum: 1 }), endLine: Type.Integer({ minimum: 1 }), endColumn: Type.Integer({ minimum: 1 }), only: Type.Optional(Type.Array(Type.String())) });
const RenameParams = Type.Object({ filePath: Type.String(), line: Type.Integer({ minimum: 1 }), column: Type.Integer({ minimum: 1 }), newName: Type.String({ minLength: 1 }) });
const ApplyActionParams = Type.Object({ filePath: Type.String(), startLine: Type.Integer({ minimum: 1 }), startColumn: Type.Integer({ minimum: 1 }), endLine: Type.Integer({ minimum: 1 }), endColumn: Type.Integer({ minimum: 1 }), index: Type.Integer({ minimum: 0 }) });
type PendingActionSet = { actions: Action[]; fingerprints: Map<string, string> };
const pendingActions = new Map<string, PendingActionSet>();

export default async function codeIntelligence(pi: ExtensionAPI): Promise<void> {
  // Loaded here rather than through Pi package discovery so the adapter and refactor tools share one runtime manager.
  const adapterEntry = "../node_modules/pi-lsp-adapter/src/index.ts";
  const loaded: unknown = await import(adapterEntry);
  if (!loaded || typeof loaded !== "object" || !("default" in loaded) || typeof loaded.default !== "function") throw new Error("pi-lsp-adapter extension entrypoint is unavailable.");
  const wrapped = new Proxy(pi, {
    get(target, property) {
      if (property === "registerTool") return (tool: ToolDefinition) => target.registerTool({ ...tool, exposure: "deferred" });
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  await (loaded.default as ExtensionFactory)(wrapped);
  pi.on('session_start', () => pendingActions.clear());
  pi.on('session_shutdown', () => pendingActions.clear());
  const requireState = (ctx: ExtensionContext): LspExtensionState & { runtimeManager: RuntimeManager } => {
    const states = (globalThis as typeof globalThis & { [key: symbol]: unknown })[registryKey];
    const state = states instanceof Map ? states.get(ctx.sessionManager.getSessionId()) : undefined;
    if (!state || typeof state !== "object" || !("runtimeManager" in state)) throw new Error("LSP runtime is not initialized for this workspace.");
    return state as LspExtensionState & { runtimeManager: RuntimeManager };
  };

  pi.registerTool({ name: "lsp_rename", label: "LSP Rename", description: "Rename a symbol using the language server and safely apply its multi-file WorkspaceEdit within the project.", promptSnippet: "Rename symbols semantically across project files.", promptGuidelines: ["Use lsp_rename instead of textual replacement for symbol renames."], parameters: RenameParams, exposure: "deferred", async execute(_id, args, _signal, _update, ctx) {
    const state = requireState(ctx);
    const { result } = await state.runtimeManager.rename(args.filePath, args.line - 1, args.column - 1, args.newName);
    const workspaceEdit = normalizeWorkspaceEdit(result);
    if (!workspaceEdit) throw new Error("Language server returned no supported rename edit.");
    const files = await applyWorkspaceEdit(state.cwd, workspaceEdit);
    return { content: [{ type: "text", text: `Renamed symbol in ${files.length} file(s):\n${files.map(file => `- ${file}`).join("\n")}` }], details: { files } };
  } });

  pi.registerTool({ name: "lsp_code_actions", label: "LSP Code Actions", description: "List available code actions for a source range. Use the returned zero-based index with lsp_apply_code_action.", promptSnippet: "List applicable language-server quick fixes and refactorings.", parameters: ActionKeyParams, exposure: "deferred", async execute(_id, args, _signal, _update, ctx) {
    const state = requireState(ctx);
    const range = toRange(args.startLine, args.startColumn, args.endLine, args.endColumn);
    const diagnostics = (await state.runtimeManager.diagnostics(args.filePath)).diagnostics;
    const { result } = await state.runtimeManager.codeActions(args.filePath, range, { diagnostics, ...(args.only ? { only: args.only } : {}) });
    const actions = normalizeActions(result);
    const fingerprints = await fingerprintWorkspaceEdit(state.cwd, actions);
    pendingActions.set(actionKey(ctx.sessionManager.getSessionId(), args.filePath, range), { actions, fingerprints });
    return { content: [{ type: "text", text: actions.length ? actions.map((action, index) => `${index}. ${action.title}${action.kind ? ` [${action.kind}]` : ""}`).join("\n") : "No code actions available." }], details: { actions: actions.map(({ title, kind }) => ({ title, kind })) } };
  } });

  pi.registerTool({ name: "lsp_apply_code_action", label: "Apply LSP Code Action", description: "Apply a previously listed zero-based code action. Resource operations and stale edits are refused.", parameters: ApplyActionParams, exposure: "deferred", async execute(_id, args, _signal, _update, ctx) {
    const state = requireState(ctx);
    const range = toRange(args.startLine, args.startColumn, args.endLine, args.endColumn);
    const key = actionKey(ctx.sessionManager.getSessionId(), args.filePath, range);
    const pending = pendingActions.get(key);
    const action = pending?.actions[args.index];
    if (!pending || !action) throw new Error("Code action is missing or stale; list actions again.");
    if (!action.edit) throw new Error(action.command ? `Code action requires unsupported command execution: ${action.command.command}.` : "Code action has no WorkspaceEdit.");
    const workspaceEdit = normalizeWorkspaceEdit(action.edit);
    if (!workspaceEdit) throw new Error("Code action returned an unsupported WorkspaceEdit.");
    if (!await fingerprintsMatch(pending.fingerprints)) throw new Error("Code action is stale because a target file changed; list actions again.");
    const files = await applyWorkspaceEdit(ctx.cwd, workspaceEdit);
    pendingActions.delete(key);
    return { content: [{ type: "text", text: `Applied “${action.title}” to ${files.length} file(s).` }], details: { files, title: action.title } };
  } });

  pi.on("tool_result", async (event, ctx) => {
    if (event.isError || !["write", "edit"].includes(event.toolName)) return;
    const file = event.input.path;
    if (typeof file !== "string") return;
    try {
      const state = requireState(ctx);
      await state.runtimeManager.warmupFile?.(file);
      const result = await state.runtimeManager.diagnostics(file);
      if (!result.diagnostics.length) return;
      const summaries = result.diagnostics.slice(0, 30).map(diagnostic => {
        const severity = diagnostic.severity === 1 ? "error" : diagnostic.severity === 2 ? "warning" : diagnostic.severity === 3 ? "info" : "hint";
        return `${severity} ${diagnostic.range.start.line + 1}:${diagnostic.range.start.character + 1} ${diagnostic.message}${diagnostic.source ? ` (${diagnostic.source})` : ""}`;
      });
      return { content: [...event.content, { type: "text", text: `\nLSP diagnostics after ${event.toolName}:\n${summaries.join("\n")}${result.diagnostics.length > summaries.length ? `\n…and ${result.diagnostics.length - summaries.length} more` : ""}` }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/no LSP filetype|no configured LSP server|not installed|No LSP server/i.test(message)) return;
      return { content: [...event.content, { type: "text", text: `\nLSP diagnostics unavailable after ${event.toolName}: ${message}` }] };
    }
  });
}
async function fingerprintWorkspaceEdit(root: string, actions: Action[]): Promise<Map<string, string>> {
  const fingerprints = new Map<string, string>();
  for (const action of actions) {
    if (!action.edit) continue;
    const uris = [...Object.keys(action.edit.changes ?? {}), ...(action.edit.documentChanges ?? []).flatMap(change => "textDocument" in change ? [change.textDocument.uri] : [])];
    for (const uri of uris) {
      const filename = path.resolve(decodeURIComponent(new URL(uri).pathname));
      const relative = path.relative(root, filename);
      if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`Code action targets a file outside project: ${filename}`);
      const [contents, metadata] = await Promise.all([readFile(filename), stat(filename)]);
      fingerprints.set(filename, `${metadata.dev}:${metadata.ino}:${metadata.size}:${metadata.mtimeMs}:${createHash('sha256').update(contents).digest('hex')}`);
    }
  }
  return fingerprints;
}

async function fingerprintsMatch(fingerprints: Map<string, string>): Promise<boolean> {
  for (const [filename, expected] of fingerprints) {
    try {
      const [contents, metadata] = await Promise.all([readFile(filename), stat(filename)]);
      if (`${metadata.dev}:${metadata.ino}:${metadata.size}:${metadata.mtimeMs}:${createHash('sha256').update(contents).digest('hex')}` !== expected) return false;
    } catch { return false; }
  }
  return true;
}



function toRange(startLine: number, startColumn: number, endLine: number, endColumn: number): Range {
  return { start: { line: startLine - 1, character: startColumn - 1 }, end: { line: endLine - 1, character: endColumn - 1 } };
}
function actionKey(cwd: string, file: string, range: Range): string { return `${cwd}\0${file}\0${range.start.line}:${range.start.character}:${range.end.line}:${range.end.character}`; }
