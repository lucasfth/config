import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { applyTextEdits, applyWorkspaceEdit } from "./workspace-edits.ts";

test("WorkspaceEdit applies UTF-16 ranges and rejects overlap or out-of-bounds positions", () => {
  assert.equal(applyTextEdits("const π = 'old';\n", [{ range: { start: { line: 0, character: 11 }, end: { line: 0, character: 14 } }, newText: "new" }]), "const π = 'new';\n");
  assert.throws(() => applyTextEdits("abc", [
    { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 2 } }, newText: "x" },
    { range: { start: { line: 0, character: 1 }, end: { line: 0, character: 3 } }, newText: "y" },
  ]), /overlapping/i);
  assert.throws(() => applyTextEdits("abc", [{ range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } }, newText: "x" }]), /bounds/i);
});

test('WorkspaceEdit preserves CRLF and UTF-16 offsets on later lines',()=>{
  const before="first\r\nconst emoji = '😀';\r\nconst name = 'old';\r\n";
  const after=applyTextEdits(before,[{range:{start:{line:2,character:14},end:{line:2,character:17}},newText:'new'}]);
  assert.equal(after,"first\r\nconst emoji = '😀';\r\nconst name = 'new';\r\n");
});

test("WorkspaceEdit prepares all files before commit and refuses outside or resource edits", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pi-lsp-edits-"));
  try {
    const first = path.join(root, "a.ts");
    const second = path.join(root, "nested", "b.ts");
    await mkdir(path.dirname(second));
    await writeFile(first, "old\n");
    await writeFile(second, "old\n");
    const uri = (filename: string) => new URL(`file://${filename}`).href;
    await assert.rejects(applyWorkspaceEdit(root, { changes: {
      [uri(first)]: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } }, newText: "new" }],
      [uri(second)]: [{ range: { start: { line: 8, character: 0 }, end: { line: 8, character: 0 } }, newText: "x" }],
    } }), /bounds/i);
    assert.equal(await readFile(first, "utf8"), "old\n");
    await assert.rejects(applyWorkspaceEdit(root, { documentChanges: [{ kind: "delete" }] }), /destructive/i);
    await assert.rejects(applyWorkspaceEdit(root, { changes: {
      [uri(path.join(root, "..", "secret.ts"))]: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: "x" }],
    } }), /outside project/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});
