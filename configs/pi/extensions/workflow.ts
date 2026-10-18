import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Type } from "typebox";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ThinkingLevel } from '@earendil-works/pi-agent-core';

export type Todo = { id: string; text: string; done: boolean };
type TodoAction = { action: "add"; text: string } | { action: "done"; id: string } | { action: "remove"; id: string };
type TodoEntry = { type: string; customType?: string; data?: unknown };
const TODO_ENTRY = "workflow-todos";

const PLAN_PROMPT = 'Plan the requested work. Preserve the complete task and produce an actionable plan. Do not implement changes.';
const COMMIT_PROMPT = 'Propose a conventional commit message for the completed changes. Do not run git or create the commit.';
const THINKING_LEVELS: readonly string[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
type SavedRole = { provider: string; modelId: string; thinkingLevel: ThinkingLevel };
type RoleWorkflowApi = Pick<ExtensionAPI, 'registerCommand' | 'setModel' | 'setThinkingLevel' | 'getThinkingLevel' | 'sendUserMessage'>;
type RoleWorkflowContext = Parameters<Parameters<ExtensionAPI['registerCommand']>[1]['handler']>[1];
type PendingRestore = { model: NonNullable<RoleWorkflowContext['model']>; thinkingLevel: ThinkingLevel };

function readWorkflowRole(name: string): SavedRole | undefined {
  const dir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".local", "share", "huginn-pi", "agent");
  try {
    const roles = JSON.parse(readFileSync(join(dir, "roles.json"), "utf8")) as Record<string, unknown>;
    const value = roles[name];
    if (value && typeof value === "object" && "provider" in value && typeof value.provider === "string" && "modelId" in value && typeof value.modelId === "string") {
      const level = 'thinkingLevel' in value && typeof value.thinkingLevel === 'string' && THINKING_LEVELS.includes(value.thinkingLevel) ? value.thinkingLevel as ThinkingLevel : 'medium';
      return { provider: value.provider, modelId: value.modelId, thinkingLevel: level };
    }
  } catch { /* Missing or malformed profile means role unavailable. */ }
  return undefined;
}

function registerRoleWorkflow(api: RoleWorkflowApi, name: "plan" | "commit", prompt: string, pendingRestore: { value?: PendingRestore }): void {
  api.registerCommand(name, {
    description: name === "plan" ? "Ask the configured plan role to plan the requested work" : "Propose a conventional commit message; does not run git",
    handler: async (args, ctx) => {
      if (!ctx.isIdle() || pendingRestore.value) { ctx.ui.notify(`/${name}: wait for the current turn to finish.`, 'warning'); return; }
      const role = readWorkflowRole(name);
      if (!role) { ctx.ui.notify(`/${name}: saved ${name} role is unavailable in runtime roles.json.`, "error"); return; }
      const model = ctx.modelRegistry.find(role.provider, role.modelId);
      if (!model) { ctx.ui.notify(`/${name}: configured model ${role.provider}/${role.modelId} is unavailable.`, "error"); return; }
      if (!ctx.model || !ctx.modelRegistry.hasConfiguredAuth(model)) { ctx.ui.notify(`/${name}: role requires an authenticated model and an active session model.`, "error"); return; }
      const previous: PendingRestore = { model: ctx.model, thinkingLevel: api.getThinkingLevel() };
      if (!(await api.setModel(model))) { ctx.ui.notify(`/${name}: authentication is not configured for ${role.provider}.`, "error"); return; }
      api.setThinkingLevel(role.thinkingLevel);
      pendingRestore.value = previous;
      try { api.sendUserMessage(args.trim() ? `${prompt}\n\n${args.trim()}` : prompt); }
      catch (error) { pendingRestore.value = undefined; await api.setModel(previous.model); api.setThinkingLevel(previous.thinkingLevel); throw error; }
    },
  });
}

export function applyTodoAction(todos: Todo[], action: TodoAction): Todo[] {
  if (action.action === "add") {
    const text = action.text.trim();
    if (!text) return todos;
    return [...todos, { id: randomUUID(), text, done: false }];
  }
  if (action.action === "remove") return todos.filter((todo) => todo.id !== action.id);
  return todos.map((todo) => todo.id === action.id ? { ...todo, done: true } : todo);
}

export function restoreTodos(entries: readonly TodoEntry[]): Todo[] {
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index];
    if (entry.type !== "custom" || entry.customType !== TODO_ENTRY || typeof entry.data !== "object" || entry.data === null || !("todos" in entry.data)) continue;
    const todos = entry.data.todos;
    if (!Array.isArray(todos)) continue;
    return todos.filter((todo): todo is Todo => typeof todo === "object" && todo !== null &&
      "id" in todo && typeof todo.id === "string" && "text" in todo && typeof todo.text === "string" && "done" in todo && typeof todo.done === "boolean");
  }
  return [];
}

function renderTodos(todos: readonly Todo[]): string[] | undefined {
  if (todos.length === 0) return undefined;
  return ["Todos", ...todos.map((todo) => `${todo.done ? "✓" : "○"} ${todo.text}  (${todo.id})`)];
}

function syncTodos(ctx: ExtensionContext): Todo[] {
  const restored = restoreTodos(ctx.sessionManager.getEntries());
  ctx.ui.setWidget("workflow-todos", renderTodos(restored));
  return restored;
}

function saveTodos(pi: ExtensionAPI, ctx: ExtensionContext, todos: Todo[]): void {
  pi.appendEntry(TODO_ENTRY, { todos });
  ctx.ui.setWidget("workflow-todos", renderTodos(todos));
}

export default function workflowExtension(pi: ExtensionAPI): void {
  let todos: Todo[] = [];
  pi.on("session_start", (_event, ctx) => { todos = syncTodos(ctx); });
  pi.on("session_shutdown", (_event, ctx) => { ctx.ui.setWidget("workflow-todos", undefined); });
  pi.registerTool({
    name: "todo",
    label: "Todo",
    description: "Add, complete, or remove a small session-persistent todo item.",
    parameters: Type.Object({
      action: Type.Union([Type.Literal("add"), Type.Literal("done"), Type.Literal("remove")]),
      text: Type.Optional(Type.String()),
      id: Type.Optional(Type.String()),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      if (params.action === "add") {
        if (!params.text?.trim()) return { content: [{ type: "text", text: "Adding a todo requires non-empty text." }], details: {}, isError: true };
        todos = applyTodoAction(todos, { action: "add", text: params.text });
      } else {
        if (!params.id || !todos.some((todo) => todo.id === params.id)) return { content: [{ type: "text", text: "Todo id was not found in this session." }], details: {}, isError: true };
        todos = applyTodoAction(todos, { action: params.action, id: params.id });
      }
      saveTodos(pi, ctx, todos);
      return { content: [{ type: "text", text: todos.length ? todos.map((todo) => `${todo.done ? "[x]" : "[ ]"} ${todo.id}: ${todo.text}`).join("\n") : "No todos." }], details: {} };
    },
  });
  pi.registerTool({
    name: "ask_user",
    label: "Ask user",
    description: "Ask the user a question in the native Pi UI and return their answer.",
    parameters: Type.Object({ question: Type.String(), options: Type.Optional(Type.Array(Type.String())) }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const answer = params.options?.length
        ? await ctx.ui.select(params.question, [...params.options, "Other…"])
        : await ctx.ui.input(params.question);
      if (answer === undefined) return { content: [{ type: "text", text: "User cancelled the question." }], details: {} };
      if (params.options?.length && answer === "Other…") {
        const custom = await ctx.ui.input(params.question);
        if (custom === undefined) return { content: [{ type: "text", text: "User cancelled the question." }], details: {} };
        return { content: [{ type: "text", text: custom }], details: {} };
      }
      return { content: [{ type: "text", text: answer }], details: {} };
    },
  });
  pi.registerCommand("todo", {
    description: "Manage session todos: /todo add <text>, /todo done <id>, /todo remove <id>, /todo list",
    handler: async (args, ctx) => {
      todos = syncTodos(ctx);
      const [action, ...rest] = args.trim().split(/\s+/);
      const value = rest.join(" ");
      if (!action || action === "list") {
        ctx.ui.notify(todos.length ? todos.map((todo) => `${todo.done ? "✓" : "○"} ${todo.id}: ${todo.text}`).join("\n") : "No todos.", "info");
        return;
      }
      if (action === "add" && value) todos = applyTodoAction(todos, { action: "add", text: value });
      else if ((action === "done" || action === "remove") && todos.some((todo) => todo.id === value)) todos = applyTodoAction(todos, { action, id: value });
      else {
        ctx.ui.notify("Usage: /todo add <text> | done <id> | remove <id> | list (id must match an existing todo)", "warning");
        return;
      }
      saveTodos(pi, ctx, todos);
    },
  });
  const pendingRestore: { value?: PendingRestore } = {};
  pi.on("agent_settled", async () => {
    const previous = pendingRestore.value;
    if (!previous) return;
    pendingRestore.value = undefined;
    await pi.setModel(previous.model);
    pi.setThinkingLevel(previous.thinkingLevel);
  });
  registerRoleWorkflow(pi, "plan", PLAN_PROMPT, pendingRestore);
  registerRoleWorkflow(pi, "commit", COMMIT_PROMPT, pendingRestore);
  pi.registerCommand("queue", {
    description: "Queue a message for the next assistant turn (or /queue followup <text>).",
    handler: async (args, ctx) => {
      const match = args.trim().match(/^followup\s+([\s\S]+)$/i);
      const message = match?.[1] ?? args.trim();
      if (!message) {
        ctx.ui.notify("Usage: /queue <message> | /queue followup <message>", "warning");
        return;
      }
      pi.sendUserMessage(message, { deliverAs: match ? "followUp" : "steer" });
    },
  });
  pi.registerCommand("reload-plugins", {
    description: "Reload extensions and other Pi resources.",
    handler: async (_args, ctx) => {
      await ctx.reload();
      ctx.ui.notify("Pi extensions reloaded.", "info");
    },
  });
}