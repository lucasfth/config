import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(root, '../..');
for (const filename of readdirSync(path.join(root, 'patches')).filter(name => name.endsWith('.patch')).sort()) {
  const patch = path.join(root, 'patches', filename);
  try {
    execFileSync('git', ['apply', '--check', '--directory=configs/pi', patch], { cwd: repository, stdio: 'pipe' });
    execFileSync('git', ['apply', '--directory=configs/pi', patch], { cwd: repository, stdio: 'inherit' });
  } catch (error) {
    try {
      execFileSync('git', ['apply', '--reverse', '--check', '--directory=configs/pi', patch], { cwd: repository, stdio: 'pipe' });
    } catch {
      throw new Error(`Pinned compatibility patch ${filename} no longer applies.`, { cause: error });
    }
  }
}
