import { execFile } from 'node:child_process';

export interface GitHubReference { kind: 'issue' | 'pr'; repo?: string; number: number; view: 'details' | 'diff'; fileIndex?: number }
export function parseGitHubReference(path: string): GitHubReference | undefined {
  const match = /^(issue|pr):\/\/(?:(?<repo>[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/)?(?<number>[1-9]\d*)(?:\/(?<view>diff)(?:\/(?<file>all|\d+))?)?$/.exec(path);
  if (!match) return undefined;
  const kind = match[1] as 'issue' | 'pr';
  if (kind === 'issue' && match.groups?.view) throw new Error('Only pull requests have /diff views.');
  return { kind, repo: match.groups?.repo, number: Number(match.groups?.number), view: match.groups?.view ? 'diff' : 'details', ...(match.groups?.file && match.groups.file !== 'all' ? { fileIndex: Number(match.groups.file) } : {}) };
}
export type GitHubCommand = (args: string[], cwd: string, signal?: AbortSignal) => Promise<string>;
export const runGitHub: GitHubCommand = (args, cwd, signal) => {
  const { promise, resolve, reject } = Promise.withResolvers<string>();
  execFile('gh', args, { cwd, signal, timeout: 30000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) reject(new Error(`GitHub read failed: ${stderr.trim() || error.message}`));
    else resolve(stdout);
  });
  return promise;
};
export async function readGitHubReference(path: string, cwd: string, signal?: AbortSignal, command: GitHubCommand = runGitHub): Promise<string> {
  const ref = parseGitHubReference(path);
  if (!ref) throw new Error('Invalid GitHub reference. Use issue://2, pr://2, or issue://owner/repo/2.');
  const repo = ref.repo ?? (await command(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], cwd, signal)).trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error('Cannot identify GitHub repository from current origin. Use owner/repo in the reference.');
  const route = `repos/${repo}/${ref.kind === 'pr' ? 'pulls' : 'issues'}/${ref.number}`;
  if (ref.view === 'diff') {
    if (ref.fileIndex !== undefined) {
      const files: unknown = JSON.parse(await command(['api', `${route}/files`, '--paginate', '--slurp'], cwd, signal));
      const flat = Array.isArray(files) ? files.flat() : [];
      const file: unknown = flat[ref.fileIndex];
      if (!file || typeof file !== 'object' || !('filename' in file)) throw new Error(`PR file index ${ref.fileIndex} not found.`);
      return JSON.stringify(file, null, 2);
    }
    return command(['api', route, '-H', 'Accept: application/vnd.github.diff'], cwd, signal);
  }
  const [details, comments] = await Promise.all([
    command(['api', route], cwd, signal),
    command(['api', `repos/${repo}/issues/${ref.number}/comments`, '--paginate', '--slurp'], cwd, signal),
  ]);
  return `GitHub ${ref.kind} ${repo}#${ref.number}\n\n${JSON.stringify(JSON.parse(details), null, 2)}\n\nComments:\n${JSON.stringify(JSON.parse(comments), null, 2)}`;
}
