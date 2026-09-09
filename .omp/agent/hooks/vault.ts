import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

const VAULT = join(homedir(), "vault");
const PROJECTS = join(VAULT, "projects");

function detectProject(): { org: string; repo: string; branch: string } | null {
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: process.env.INIT_CWD ?? process.cwd(),
      encoding: "utf-8",
      timeout: 3000,
    }).trim();

    const remote = execSync("git remote get-url origin", {
      cwd: process.env.INIT_CWD ?? process.cwd(),
      encoding: "utf-8",
      timeout: 3000,
    }).trim();

    const match = remote.match(/[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (!match) return null;

    return { org: match[1], repo: match[2], branch };
  } catch {
    const cwd = process.env.INIT_CWD ?? process.cwd();
    return { org: "_local", repo: basename(cwd), branch: "main" };
  }
}
// Tech docs to inject on every session start.
// Always: 030-Coding-Style. Stack-specific: keyed by org/repo.
const TECH_DOCS: Record<string, string[]> = {
  "lucasfth/config":    ["tech/032-Nix-Darwin-Patterns.md"],
  "EcoRayDev/ecoray-web": ["tech/031-Nuxt-Vue-Patterns.md"],
};

function readTechDocs(project: { org: string; repo: string }): string | null {
  const key = `${project.org}/${project.repo}`;
  const paths = ["tech/030-Coding-Style.md", ...(TECH_DOCS[key] ?? [])];
  const parts: string[] = [];

  for (const p of paths) {
    const full = join(VAULT, p);
    if (!existsSync(full)) continue;
    const content = readFileSync(full, "utf-8");
    // Strip YAML frontmatter
    const body = content.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
    const name = basename(p, ".md");
    parts.push(`## ${name}\n\n${body}`);
  }

  return parts.length > 0 ? parts.join("\n\n---\n\n") : null;
}

function readRecentNotes(project: { org: string; repo: string; branch: string }): string | null {
  const dir = join(PROJECTS, project.org, project.repo, project.branch);
  if (!existsSync(dir)) return null;

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .slice(-5); // last 5 sessions

  if (files.length === 0) return null;

  const parts = files.map((f) => {
    const content = readFileSync(join(dir, f), "utf-8");
    const body = content.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
    return `### ${f.replace(".md", "")}\n\n${body}`;
  });

  return `## Prior sessions (from vault)\n\nProject: ${project.org}/${project.repo}  \nBranch: ${project.branch}\n\n${parts.join("\n\n---\n\n")}`;
}

export default function vaultHook(pi: HookAPI): void {
  // Session start: ensure today's vault stub exists, then inject context
  pi.on("context", async () => {
    const project = detectProject();
    if (!project) return;
    createStub(project);
    const sections: string[] = [];

    const tech = readTechDocs(project);
    if (tech) sections.push(tech);

    const notes = readRecentNotes(project);
    if (notes) sections.push(notes);

    if (sections.length === 0) return;

    return {
      messages: [{ role: "user" as const, content: sections.join("\n\n---\n\n") }],
    };
  });

  // Create vault stub (idempotent — one per day)
  const createStub = (project: { org: string; repo: string; branch: string }) => {
    const timestamp = new Date().toISOString();
    const dateStr = timestamp.slice(0, 10);
    const dir = join(PROJECTS, project.org, project.repo, project.branch);
    const file = join(dir, `${dateStr}.md`);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    if (!existsSync(file)) {
      const header = [
        "---",
        `project: ${project.org}/${project.repo}`,
        `branch: ${project.branch}`,
        `date: ${timestamp}`,
        `tags: [${project.org}/${project.repo}, ${project.branch}]`,
        "---",
        "",
        `# ${project.org}/${project.repo} — ${project.branch} — ${dateStr}`,
        "",
      ].join("\n");
      writeFileSync(file, header, "utf-8");
    }
    pi.log?.(`Vault stub: ${file}`);
  };

}
