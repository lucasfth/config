import { chmod, lstat, mkdir, open } from 'node:fs/promises';
import path from 'node:path';

export async function privateEvaluationOutput(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077)) {
    throw new Error('Evaluation output directory must be private (0700), not a symlink');
  }
}

export async function writePrivateEvaluation(directory, name, content) {
  if (path.basename(name) !== name) throw new Error('Artifact must be a filename');
  await privateEvaluationOutput(directory);
  const file = path.join(directory, name);
  try {
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new Error('Unsafe existing artifact');
    await chmod(file, 0o600);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const handle = await open(file, 'w', 0o600);
  try { await handle.writeFile(content); } finally { await handle.close(); }
}
