import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/** Import one literal credential only; never source/execute the secrets file. */
export async function loadMuninnCredential({ homeDir = os.homedir(), env = process.env } = {}) {
  if (env.MUNINN_MCP_TOKEN?.trim()) return false;
  const filename = path.join(homeDir, 'config/nix_secrets');
  let file;
  try {
    file = await fs.open(filename, 'r');
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw new Error('Unable to open the canonical Muninn credential file');
  }
  try {
    const info = await file.stat();
    if (!info.isFile() || info.uid !== process.getuid?.() || info.mode & 0o022 || info.size > 1_048_576) {
      throw new Error('Unsafe credential file permissions; require current-user ownership and no group/other writes');
    }
    const content = await file.readFile('utf8');
    let token;
    for (const line of content.split(/\r?\n/u)) {
      const match = line.match(/^\s*(?:export\s+)?MUNINN_MCP_TOKEN\s*=\s*(?:'([^'\r\n]*)'|"([^"$`\\\r\n]*)"|([A-Za-z0-9_./+=:-]+))\s*(?:#.*)?$/u);
      if (match) token = match[1] ?? match[2] ?? match[3];
    }
    if (!token?.trim()) return false;
    env.MUNINN_MCP_TOKEN = token;
    return true;
  } finally {
    await file.close();
  }
}
