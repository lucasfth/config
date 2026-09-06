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
  // Inject vault context on every session start
  pi.on("context", async () => {
    const project = detectProject();
    if (!project) return;

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

  // Shared: create vault stub (idempotent — one per day)
  const createStub = () => {
    const project = detectProject();
    if (!project) return;

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

  const summaryScript = join(process.env.HOME ?? homedir(), ".omp/agent/hooks/post/save-to-vault.sh");
  const summarize = () => {
    if (!existsSync(summaryScript)) return;
    try {
      execSync(`bash "${summaryScript}"`, {
        cwd: process.env.INIT_CWD ?? process.cwd(),
        encoding: "utf-8",
        timeout: 60000,
        stdio: "pipe",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      pi.log?.(`[vault] summarize failed: ${message.slice(0, 200)}`);
    }
  };

  const summarizeAfterShutdown = () => {
    if (!existsSync(summaryScript)) return;
    try {
      const child = Bun.spawn(["bash", summaryScript], {
        cwd: process.env.INIT_CWD ?? process.cwd(),
        detached: true,
        stdout: "ignore",
        stderr: "ignore",
      });
      child.unref();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      pi.log?.(`[vault] summarize failed: ${message.slice(0, 200)}`);
    }
  };

  // On /new: create stub + summarize the session we're leaving behind
  pi.on("session_before_switch", async (event) => {
    if ((event as any).reason !== "new") return;
    createStub();
    summarize();
  });

  // On shutdown: create stub, then let the summary worker finish independently.
  pi.on("session_shutdown", async () => {
    createStub();
    summarizeAfterShutdown();
  });
}
