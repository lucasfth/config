import type { WorkspaceEdit, TextEdit } from './workspace-edits.ts';
export interface LspAction { title: string; kind?: string; edit?: WorkspaceEdit; command?: { title: string; command: string; arguments?: unknown[] } }
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function textEdit(value: unknown): TextEdit {
  if (!object(value) || typeof value.newText !== 'string' || !object(value.range) || !object(value.range.start) || !object(value.range.end)) throw new Error('Unsupported LSP edit (snippet edits are not plain text).');
  const position = (input: Record<string, unknown>) => {
    if (typeof input.line !== 'number' || !Number.isInteger(input.line) || input.line < 0 || typeof input.character !== 'number' || !Number.isInteger(input.character) || input.character < 0) throw new Error('Invalid LSP text position.');
    return { line: input.line, character: input.character };
  };
  return { range: { start: position(value.range.start), end: position(value.range.end) }, newText: value.newText };
}
export function normalizeWorkspaceEdit(value: unknown): WorkspaceEdit | undefined {
  if (value == null) return undefined;
  if (!object(value)) throw new Error('Language server returned invalid WorkspaceEdit.');
  const changes: Record<string, TextEdit[]> = {};
  if (value.changes !== undefined) {
    if (!object(value.changes)) throw new Error('Invalid WorkspaceEdit changes.');
    for (const [uri, edits] of Object.entries(value.changes)) { if (!Array.isArray(edits)) throw new Error('Invalid text edit list.'); changes[uri] = edits.map(textEdit); }
  }
  if (value.documentChanges !== undefined) {
    if (!Array.isArray(value.documentChanges)) throw new Error('Invalid WorkspaceEdit documentChanges.');
    for (const change of value.documentChanges) {
      if (!object(change) || !object(change.textDocument) || typeof change.textDocument.uri !== 'string' || !Array.isArray(change.edits)) throw new Error('Resource creation/rename/deletion is not supported by this edit operation.');
      const uri = change.textDocument.uri;
      changes[uri] = [...changes[uri] ?? [], ...change.edits.map(textEdit)];
    }
  }
  return { changes };
}
export function normalizeActions(value: unknown): LspAction[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error('Language server returned invalid code actions.');
  return value.flatMap(item => {
    if (!object(item) || typeof item.title !== 'string' || item.disabled) return [];
    const action: LspAction = { title: item.title };
    if (typeof item.kind === 'string') action.kind = item.kind;
    if (item.edit !== undefined) action.edit = normalizeWorkspaceEdit(item.edit);
    if (typeof item.command === 'string') action.command = { title: item.title, command: item.command, ...(Array.isArray(item.arguments) ? { arguments: item.arguments } : {}) };
    else if (object(item.command) && typeof item.command.command === 'string') action.command = { title: typeof item.command.title === 'string' ? item.command.title : item.title, command: item.command.command, ...(Array.isArray(item.command.arguments) ? { arguments: item.command.arguments } : {}) };
    return [action];
  });
}
