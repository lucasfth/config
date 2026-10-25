"""Trusted local server transports. Created only from server-derived configuration.

No loopback impersonation, shared implementer credential or guest-selected identity.
Each worker is private to one request; normal backend path/ACL checks still apply.
"""
import asyncio
from concurrent.futures import ThreadPoolExecutor
from threading import BoundedSemaphore
from pathlib import Path
import hashlib
import importlib

from broker import Adapter
from adapters import muninn_ops, company_ops, MUNINN_DESCRIBE, COMPANY_DESCRIBE

HERE = Path(__file__).resolve().parent
_EXECUTOR = ThreadPoolExecutor(max_workers=4, thread_name_prefix='read-code')
_ASYNC_ADMISSION = BoundedSemaphore(4)


async def run_off_loop(function, *args):
    # Acquire before submission: never build an unbounded executor waiting queue.
    # Release on actual work completion, not when a disconnected client cancels await.
    if not _ASYNC_ADMISSION.acquire(blocking=False):
        return {'ok': False, 'error': 'capacity_exceeded', 'incomplete': True,
                'stale': False, 'warning_kinds': []}
    try:
        future = _EXECUTOR.submit(function, *args)
    except BaseException:
        _ASYNC_ADMISSION.release()
        raise
    future.add_done_callback(lambda _: _ASYNC_ADMISSION.release())
    return await asyncio.wrap_future(future)


READ_CODE_SCHEMA = {
    'name': 'read_code',
    'description': 'Run bounded read-only JavaScript orchestration. No host filesystem, network, shell or credentials. Trusted evidence and completeness warnings are returned separately from guest_output. Muninn: ' + MUNINN_DESCRIBE,
    'inputSchema': {'type': 'object', 'properties': {'code': {'type': 'string', 'maxLength': 20000}},
                    'required': ['code'], 'additionalProperties': False},
}


def bound_adapter(kind, server_dir, kwargs, env=None):
    if kind not in ('MuninnLocal', 'CompanyLocal'):
        raise ValueError('invalid local transport')
    return Adapter('muninn' if kind == 'MuninnLocal' else 'company-library',
                   make_ops=muninn_ops if kind == 'MuninnLocal' else company_ops,
                   transport_spec={'paths': [str(HERE), str(Path(server_dir).resolve())],
                                   'module': 'server_transports', 'factory': kind,
                                   'kwargs': kwargs, 'env': env or {}})


class MuninnLocal:
    def __init__(self):
        self.server = importlib.import_module('server')

    def call(self, name, arguments, timeout):
        if name not in {'vault_read', 'vault_search', 'vault_list', 'vault_links', 'vault_synthesis_status'}:
            raise PermissionError('operation not allowed')
        result = self.server.execute_tool(name, arguments)
        if isinstance(result, dict) and 'error' in result:
            raise ValueError('backend read failed')
        return result


class CompanyLocal:
    def __init__(self, principal, roots, index_db, lock_path, retry_file, proposals_dir, workspace_root):
        service = importlib.import_module('service')
        # The principal is captured by _who(ctx) in the server, never from guest arguments.
        self.principal = service.Principal(principal['name'], frozenset(principal['read']), frozenset())
        index = service.SearchIndex(Path(index_db), {k: Path(v) for k, v in roots.items()})
        self.library = service.Library(roots=roots, index=index, lock_path=lock_path,
                                      retry_queue=service.RetryQueue(Path(retry_file)),
                                      proposals_dir=proposals_dir, workspace_root=workspace_root)

    def call(self, name, arguments, timeout):
        a, p, lib = arguments, self.principal, self.library
        if name == 'search':
            return lib.search(p, a['query'], a.get('root'), a.get('limit', 10))
        if name == 'list':
            return lib.list(p, a['root'], a.get('prefix', ''))
        if name == 'read':
            content = lib.read(p, a['root'], a['path'])
            start, end = a.get('start_line', 1), a.get('end_line', 500)
            if start < 1 or end < start or end - start >= 500:
                raise ValueError('invalid line range')
            lines = content.splitlines()
            return {'path': f"{a['root']}/{a['path']}", 'content': '\n'.join(lines[start-1:end]),
                    'start_line': start, 'end_line': min(end, len(lines)),
                    'sha256': hashlib.sha256(content.encode('utf-8')).hexdigest()}
        raise PermissionError('operation not allowed')
