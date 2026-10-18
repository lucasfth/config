import { open, realpath } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import type ts from 'typescript';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

const MAX_BYTES = 262144;
const MAX_SYMBOLS = 200;
const EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
type SymbolRange = { name: string; kind: string; startLine: number; endLine: number };
type Outline = { path: string; symbols: SymbolRange[]; truncated: boolean; parseDiagnostics: number };

function inside(root: string, filename: string): boolean {
  const rel = relative(root, filename);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

export async function outlineSource(root: string, filename: string, options: { limit?: number; signal?: AbortSignal } = {}): Promise<Outline> {
  options.signal?.throwIfAborted();
  const limit = options.limit ?? MAX_SYMBOLS;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SYMBOLS) throw new Error('Symbol limit must be 1..200.');
  if (!filename || filename.includes('\0') || isAbsolute(filename)) throw new Error('Path must be workspace-relative.');
  if (!EXTENSIONS.has(extname(filename).toLowerCase())) throw new Error('source_outline supports JS/TS files only. Use read or LSP for other languages.');
  const workspace = await realpath(root);
  const absolute = resolve(workspace, filename);
  if (!inside(workspace, absolute)) throw new Error('Path must stay inside the workspace.');
  // Resolve the parent first so an escaped symlink is rejected even if the target file is missing.
  if (!inside(workspace, await realpath(resolve(absolute, '..')))) throw new Error('Path must stay inside the workspace.');
  const actual = await realpath(absolute);
  if (!inside(workspace, actual)) throw new Error('Path must stay inside the workspace.');
  const handle = await open(actual, 'r');
  let source: string;
  try {
    if (!(await handle.stat()).isFile()) throw new Error('Path must be a regular file.');
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    let bytes = 0;
    while (bytes < buffer.length) {
      options.signal?.throwIfAborted();
      const chunk = await handle.read(buffer, bytes, buffer.length - bytes, null);
      if (chunk.bytesRead === 0) break;
      bytes += chunk.bytesRead;
    }
    if (bytes > MAX_BYTES) throw new Error(`Source exceeds the ${MAX_BYTES}-byte outline limit.`);
    source = buffer.subarray(0, bytes).toString('utf8');
  } finally { await handle.close(); }
  options.signal?.throwIfAborted();
  let parser: typeof ts;
  try { parser = (await import('typescript')).default; }
  catch (error) { throw new Error('TypeScript parser unavailable. Run npm ci in configs/pi (without --omit=dev) to enable source_outline; other tools remain available.', { cause: error }); }
  const file = parser.createSourceFile(filename, source, parser.ScriptTarget.Latest, true);
  const symbols: SymbolRange[] = [];
  let truncated = false;
  const add = (node: ts.Node, name: string, kind: string) => {
    if (symbols.length >= limit) { truncated = true; return; }
    symbols.push({ name: name.slice(0, 200), kind, startLine: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
      endLine: file.getLineAndCharacterOfPosition(Math.max(node.getStart(file), node.end - 1)).line + 1 });
  };
  const visit = (node: ts.Node, parent = ''): void => {
    options.signal?.throwIfAborted();
    if (truncated) return;
    let name = '', kind = '';
    if (parser.isFunctionDeclaration(node)) { name = node.name?.text ?? 'default'; kind = 'function'; }
    else if (parser.isClassDeclaration(node)) { name = node.name?.text ?? 'default'; kind = 'class'; }
    else if (parser.isInterfaceDeclaration(node)) { name = node.name.text; kind = 'interface'; }
    else if (parser.isTypeAliasDeclaration(node)) { name = node.name.text; kind = 'type'; }
    else if (parser.isEnumDeclaration(node)) { name = node.name.text; kind = 'enum'; }
    else if (parser.isModuleDeclaration(node)) { name = node.name.getText(file); kind = 'namespace'; }
    else if (parser.isVariableDeclaration(node) && parser.isIdentifier(node.name)) {
      name = node.name.text;
      kind = node.initializer && (parser.isArrowFunction(node.initializer) || parser.isFunctionExpression(node.initializer)) ? 'function' : 'variable';
    } else if (parser.isMethodDeclaration(node) || parser.isMethodSignature(node)) { name = node.name.getText(file); kind = 'method'; }
    else if (parser.isPropertyDeclaration(node) || parser.isPropertySignature(node)) { name = node.name.getText(file); kind = 'property'; }
    else if (parser.isGetAccessorDeclaration(node) || parser.isSetAccessorDeclaration(node)) { name = node.name.getText(file); kind = parser.isGetAccessorDeclaration(node) ? 'getter' : 'setter'; }
    else if (parser.isConstructorDeclaration(node)) { name = 'constructor'; kind = 'constructor'; }
    const qualified = name ? (parent ? `${parent}.${name}` : name) : parent;
    if (name) add(node, qualified, kind);
    parser.forEachChild(node, child => visit(child, qualified));
  };
  visit(file);
  // Report syntax uncertainty, never imply type-checking or reference resolution.
  const parseDiagnostics = (file as ts.SourceFile & { parseDiagnostics?: readonly unknown[] }).parseDiagnostics?.length ?? 0;
  return { path: relative(workspace, absolute), symbols, truncated, parseDiagnostics };
}

export default function sourceOutline(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'source_outline', label: 'Source outline', exposure: 'deferred', defaultActive: false,
    description: 'Local AST outline of one JS/TS file: named declarations and members with line ranges. No model call, index, or reference tracing. Use find for filenames, grep for text, LSP for references, and anchored read before edits. Optional TypeScript parser required.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    parameters: Type.Object({ path: Type.String({ minLength: 1, maxLength: 1000 }), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_SYMBOLS })) }),
    async execute(_id, params, signal, _update, ctx) {
      const result = await outlineSource(ctx.cwd, params.path, { limit: params.limit, signal });
      const lines = result.symbols.map(item => `${result.path}:${item.startLine}-${item.endLine} · ${item.kind} ${item.name}`);
      return { content: [{ type: 'text', text: [lines.join('\n') || `No named declarations in ${result.path}.`,
        result.truncated ? `Truncated at ${result.symbols.length} symbols; use a targeted read for the rest.` : '',
        result.parseDiagnostics ? `${result.parseDiagnostics} syntax diagnostic(s); ranges may be incomplete.` : '',
        'Discovery only. For exact source and edit anchors, use anchored read with path, offset: startLine, limit: endLine-startLine+1.'].filter(Boolean).join('\n\n') }],
        details: result };
    },
  });
}
