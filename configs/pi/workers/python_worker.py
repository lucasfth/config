import ast
import contextlib
import io
import json
import os
import sys
import traceback
import reprlib

PROTOCOL_OUT = os.fdopen(3, "w", buffering=1, encoding="utf-8")


def send(message):
    PROTOCOL_OUT.write(json.dumps(message, ensure_ascii=False, separators=(",", ":")) + "\n")
    PROTOCOL_OUT.flush()


def receive():
    line = sys.stdin.readline()
    if not line:
        raise EOFError("eval host closed the worker input")
    return json.loads(line)


class ToolNamespace:
    def __getattr__(self, name):
        def call(**kwargs):
            call_id = str(id(kwargs))
            send({"type": "tool_call", "id": call_id, "name": name, "args": kwargs})
            while True:
                message = receive()
                if message.get("type") == "tool_result" and message.get("id") == call_id:
                    outcome = message.get("outcome", {})
                    result = outcome.get("result", {})
                    if outcome.get("isError"):
                        raise RuntimeError(result.get("content", "Tool call failed"))
                    return result
                if message.get("type") == "shutdown":
                    raise EOFError("eval worker is shutting down")
                raise RuntimeError("unexpected message while waiting for tool result")
        return call


tools = ToolNamespace()
GLOBAL_SCOPE = {"__name__": "__pi_eval__", "tools": tools}

class BoundedCapture(io.StringIO):
    def write(self, value):
        remaining = max(0, 48000 - self.tell())
        super().write(value[:remaining])
        return len(value)


def run_cell(code):
    stdout = BoundedCapture()
    stderr = BoundedCapture()
    result = None
    try:
        tree = ast.parse(code, mode="exec")
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            if tree.body and isinstance(tree.body[-1], ast.Expr):
                last = ast.Expression(tree.body.pop().value)
                if tree.body:
                    exec(compile(ast.Module(body=tree.body, type_ignores=[]), "<pi-eval>", "exec"), GLOBAL_SCOPE, GLOBAL_SCOPE)
                result = eval(compile(last, "<pi-eval>", "eval"), GLOBAL_SCOPE, GLOBAL_SCOPE)
            else:
                exec(compile(tree, "<pi-eval>", "exec"), GLOBAL_SCOPE, GLOBAL_SCOPE)
    except BaseException:
        error = traceback.format_exc()
        send({"type": "eval_result", "id": CURRENT_ID, "ok": False, "error": error, "stdout": stdout.getvalue(), "stderr": stderr.getvalue()})
        return
    try:
        rendered = reprlib.repr(result) if result is not None else ""
    except BaseException:
        rendered = "<result repr raised an exception>"
    send({"type": "eval_result", "id": CURRENT_ID, "ok": True, "result": rendered, "stdout": stdout.getvalue(), "stderr": stderr.getvalue()})


CURRENT_ID = None
for line in sys.stdin:
    try:
        message = json.loads(line)
    except Exception as error:
        send({"type": "protocol_error", "error": str(error)})
        continue
    if message.get("type") == "shutdown":
        break
    if message.get("type") != "eval":
        send({"type": "protocol_error", "error": "unexpected worker message"})
        continue
    CURRENT_ID = message["id"]
    run_cell(message["code"])
    CURRENT_ID = None
