import assert from "node:assert/strict";
import test from "node:test";
import { applyTodoAction, restoreTodos, type Todo } from "./workflow.ts";


test("todo actions update and complete the selected item without losing others", () => {
  let todos: Todo[] = [];
  todos = applyTodoAction(todos, { action: "add", text: "Inspect API" });
  todos = applyTodoAction(todos, { action: "add", text: "Write tests" });
  todos = applyTodoAction(todos, { action: "done", id: todos[0].id });
  assert.deepEqual(todos.map(({ text, done }) => [text, done]), [["Inspect API", true], ["Write tests", false]]);
});

test("todo restore uses the latest valid state entry and ignores malformed entries", () => {
  const restored = restoreTodos([
    { type: "custom", customType: "workflow-todos", data: { todos: [{ id: "a", text: "old", done: false }] } },
    { type: "custom", customType: "workflow-todos", data: { todos: "invalid" } },
    { type: "custom", customType: "workflow-todos", data: { todos: [{ id: "b", text: "new", done: true }] } },
  ]);
  assert.deepEqual(restored, [{ id: "b", text: "new", done: true }]);
});
