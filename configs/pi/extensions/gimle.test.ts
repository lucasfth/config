import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { buildInteractionExpression, validateAppUrl, resolveGimleEndpoint } from './gimle.ts';

test('Gimle bridge refuses credentials and unexpected browser endpoints', async () => {
  assert.throws(() => validateAppUrl('https://accounts.google.com/signin'), /login|credential/i);
  assert.throws(() => validateAppUrl('https://user:secret@example.com'), /credential/i);
  assert.throws(() => resolveGimleEndpoint('http://example.com:9444'), /loopback|Gimle/i);
  assert.equal(resolveGimleEndpoint('http://127.0.0.1:9444'), 'http://127.0.0.1:9444');
  assert.throws(() => resolveGimleEndpoint('http://127.0.0.1:9333'), /loopback|Gimle/i);
});

function richEditor(attributes: Record<string, string> = {}) {
  let text = '';
  const element = {
    isContentEditable: true,
    getAttribute: (name: string) => attributes[name] ?? null,
    closest: () => null,
    focus() {},
  };
  const document = {
    querySelectorAll: () => [element],
    createRange: () => ({ selectNodeContents() {} }),
    execCommand: (command: string, _ui: boolean, value: string) => {
      assert.equal(command, 'insertText');
      text = value;
      return true;
    },
  };
  return { element, document, text: () => text };
}

test('rich-text typing inserts literal text without clicking or submitting', () => {
  const editor = richEditor();
  const value = 'hello "); throw Error("injected"); //';
  const expression = buildInteractionExpression('type', '[contenteditable="true"]', value);
  const result = runInNewContext(expression, {
    document: editor.document,
    window: { getSelection: () => ({ removeAllRanges() {}, addRange() {} }) },
  });
  assert.equal(result, 'ok');
  assert.equal(editor.text(), value);
});

test('rich-text credential fields are refused before insertion', () => {
  for (const label of ['password', 'OTP code', 'API token', 'email', 'username']) {
    const editor = richEditor({ 'aria-label': label });
    assert.throws(() => runInNewContext(buildInteractionExpression('type', '.editor', 'test'), { document: editor.document }), /Credential field/);
    assert.equal(editor.text(), '');
  }
});

test('rich editor failure is explicit; no fallback or implicit submission', () => {
  const editor = richEditor();
  editor.document.execCommand = () => false;
  assert.throws(() => runInNewContext(buildInteractionExpression('type', '.editor', 'test'), {
    document: editor.document,
    window: { getSelection: () => ({ removeAllRanges() {}, addRange() {} }) },
  }), /Rich-text insertion failed/);
});

test('CDP discovery refuses credential-bearing or alternate WebSocket addresses', async () => {
  const { validateGimleWebSocket } = await import('./gimle.ts');
  assert.equal(validateGimleWebSocket('ws://127.0.0.1:9444/devtools/browser/test'), 'ws://127.0.0.1:9444/devtools/browser/test');
  for (const url of ['ws://127.0.0.1:9333/devtools/browser/test', 'ws://example.com:9444/devtools/browser/test', 'ws://user:secret@127.0.0.1:9444/devtools/browser/test', 'ws://127.0.0.1:9444/other']) {
    assert.throws(() => validateGimleWebSocket(url), /endpoint/i);
  }
});

test('same-tab handoff selects one visible same-origin link without exposing its URL', async () => {
  const { buildFollowLinkExpression } = await import('./gimle.ts');
  const link = {
    tagName: 'A', href: 'https://nordicway.dk/kunde/dosinglesignon.php?token=private', target: '_blank',
    getAttribute: () => null, hasAttribute: () => false, scrollIntoView() {},
    getBoundingClientRect: () => ({ x: 20, y: 20, width: 100, height: 40 }),
    contains: (element: unknown) => element === link,
  };
  const document = { querySelectorAll: () => [link], elementFromPoint: () => link };
  const globals = { document, location: { href: 'https://nordicway.dk/kunde/', origin: 'https://nordicway.dk' }, URL, innerWidth: 800, innerHeight: 600 };
  const result = runInNewContext(buildFollowLinkExpression('a.cpanel'), globals);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { x: 70, y: 40 });
  assert.equal(link.target, '_self');
  for (const href of ['https://evil.invalid/', 'javascript:alert(1)', 'https://user:secret@nordicway.dk/']) {
    link.href = href;
    assert.throws(() => runInNewContext(buildFollowLinkExpression('a.cpanel'), globals), /same-origin HTTPS/);
  }
  link.href = 'https://nordicway.dk/kunde/dosinglesignon.php';
  document.querySelectorAll = () => [link, link];
  assert.throws(() => runInNewContext(buildFollowLinkExpression('a.cpanel'), globals), /exactly one/);
  document.querySelectorAll = () => [link];
  document.elementFromPoint = () => null as any;
  assert.throws(() => runInNewContext(buildFollowLinkExpression('a.cpanel'), globals), /visible|covered/);
});

test('handoff uses only the owned session, checks both origins and stops at login', async () => {
  const { followLink } = await import('./gimle.ts');
  const source = 'https://nordicway.dk', destination = 'https://cp08.nordicway.dk:2083';
  const calls: string[] = [];
  let clicked = false, blocked = false, actual = destination;
  const fake = { async _call(method: string, params: Record<string, unknown> = {}) {
    calls.push(method);
    if (method === 'Input.dispatchMouseEvent') { clicked = true; return {}; }
    if (String(params.expression).includes('Select exactly one')) return { result: { value: { x: 70, y: 40 } } };
    return { result: { value: { origin: clicked ? actual : source, ready: true, blocked } } };
  } };
  assert.equal(await followLink(fake, 'a.cpanel', source, destination), destination);
  assert.equal(calls.filter(m => m === 'Input.dispatchMouseEvent').length, 3);
  assert.ok(calls.every(m => m === 'Runtime.evaluate' || m === 'Input.dispatchMouseEvent'));
  for (const url of ['http://cp08.nordicway.dk:2083', destination + '/cpsess123/', destination + '/?token=secret']) {
    const before: number = calls.length;
    await assert.rejects(followLink(fake, 'a.cpanel', source, url), /HTTPS origin/);
    assert.equal(calls.length, before);
  }
  clicked = false; actual = 'https://evil.invalid';
  await assert.rejects(followLink(fake, 'a.cpanel', source, destination), /Unexpected app redirect/);
  clicked = false; blocked = true;
  const before: number = calls.length;
  await assert.rejects(followLink(fake, 'a.cpanel', source, destination), /Login or verification/);
  assert.deepEqual(calls.slice(before), ['Runtime.evaluate']);
  clicked = false; blocked = false; actual = destination;
  const loginAfterClick = { async _call(method: string, params: Record<string, unknown> = {}) {
    const result = await fake._call(method, params);
    if (clicked && method === 'Runtime.evaluate' && 'result' in result) result.result!.value = { origin: destination, ready: true, blocked: true } as any;
    return result;
  } };
  await assert.rejects(followLink(loginAfterClick, 'a.cpanel', source, destination), /Login or verification/);
});

test('page guard detects visible credentials without reading values; authenticated cpsess is an app', async () => {
  const { browserPageStateExpression } = await import('./gimle.ts');
  const document = {
    readyState: 'complete', title: 'cPanel',
    querySelectorAll: () => [] as unknown[],
    body: { innerText: 'Domains Zone Editor' },
  };
  const context = { document, location: { origin: 'https://cp08.nordicway.dk:2083', pathname: '/cpsess123/frontend/jupiter/index.html' } };
  assert.equal(runInNewContext(browserPageStateExpression, context).blocked, false);
  const field = { getClientRects: () => [1], get value() { throw Error('must never read credentials'); } };
  document.querySelectorAll = () => [field];
  assert.equal(runInNewContext(browserPageStateExpression, context).blocked, true);
  document.querySelectorAll = () => [];
  document.title = 'cPanel Login';
  assert.equal(runInNewContext(browserPageStateExpression, context).blocked, true);
});

test('authorized cPanel handoff is usable; other redirects and credential pages stay blocked', async () => {
  const { requireAssignedApp } = await import('./gimle.ts');
  const tab = { origin: 'https://nordicway.dk', handoffOrigin: 'https://cp08.nordicway.dk:2083' };
  const state = { origin: tab.handoffOrigin, ready: true, blocked: false };
  for (const action of ['snapshot', 'screenshot', 'click', 'type']) {
    assert.doesNotThrow(() => requireAssignedApp(state, tab, action));
    assert.throws(() => requireAssignedApp({ ...state, origin: 'https://evil.invalid' }, tab, action), /Unexpected app redirect/);
    assert.throws(() => requireAssignedApp({ ...state, blocked: true }, tab, action), /Login or verification/);
  }
  assert.equal(tab.origin, 'https://nordicway.dk', 'handoff does not erase original ownership');
  const editor = richEditor();
  runInNewContext(buildInteractionExpression('type', '.dns-record', '192.0.2.1'), {
    document: editor.document, window: { getSelection: () => ({ removeAllRanges() {}, addRange() {} }) },
  });
  assert.equal(editor.text(), '192.0.2.1');
});

test('snapshots redact cPanel session path and all query/fragment secrets', async () => {
  const { browserSnapshotExpression } = await import('./gimle.ts');
  const result = runInNewContext(browserSnapshotExpression, {
    location: { origin: 'https://cp08.nordicway.dk:2083', pathname: '/cpsessSECRET/frontend/jupiter/index.html', search: '?token=SECRET', hash: '#SECRET' },
    document: { title: 'cPanel', body: { innerText: 'Zone Editor' } },
  });
  assert.equal(result.url, 'https://cp08.nordicway.dk:2083/[session]/frontend/jupiter/index.html');
  assert.doesNotMatch(JSON.stringify(result), /SECRET/);
});

test('link refusal reports a fixed diagnostic and never echoes page exception secrets', async () => {
  const { followLink } = await import('./gimle.ts');
  const calls: string[] = [];
  for (const [description, expected] of [
    ['Error: Select exactly one link\n private token=SECRET', /exactly one/],
    ['Error: Expected a same-origin HTTPS link\n token=SECRET', /same-origin HTTPS/],
    ['Error: Link is not visible or is covered\n token=SECRET', /visible or is covered/],
    ['Error: arbitrary SECRET', /refused or failed/],
  ] as const) {
    const fake = { async _call(method: string, params: Record<string, unknown> = {}) {
      calls.push(method);
      if (String(params.expression).includes('Select exactly one')) return { exceptionDetails: { exception: { description } } };
      return { result: { value: { origin: 'https://nordicway.dk', ready: true, blocked: false } } };
    } };
    await assert.rejects(followLink(fake, 'a.cpanel', 'https://nordicway.dk', 'https://cp08.nordicway.dk:2083'), (error: Error) => {
      assert.match(error.message, expected); assert.doesNotMatch(error.message, /SECRET|token=/); return true;
    });
  }
  assert.ok(calls.every(method => method === 'Runtime.evaluate'));
});

test('snapshot identifies visible controls with exact structural selectors, never hrefs or input values', async () => {
  const { browserSnapshotExpression } = await import('./gimle.ts');
  const root: any = { tagName: 'HTML', parentElement: null };
  const body: any = { tagName: 'BODY', parentElement: root, children: [], innerText: 'Log på cPanel' };
  root.children = [body];
  const link: any = {
    tagName: 'A', innerText: 'Log på cPanel', parentElement: body,
    getClientRects: () => [1], getAttribute: () => null,
    get href() { throw Error('must not read href'); },
    get value() { throw Error('must not read input value'); },
  };
  body.children = [link];
  const hidden = { tagName: 'A', innerText: 'hidden', getClientRects: () => [] };
  const credential = { tagName: 'INPUT', type: 'password', getClientRects: () => [1], getAttribute: () => null };
  const result = runInNewContext(browserSnapshotExpression, {
    location: { origin: 'https://nordicway.dk', pathname: '/kunde/clientarea.php' },
    document: { title: 'Kundeside', body, querySelectorAll: () => [link, hidden, credential] },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result.controls)), [{ selector: 'html > body:nth-child(1) > a:nth-child(1)', role: 'a', text: 'Log på cPanel' }]);
  assert.doesNotMatch(JSON.stringify(result), /href|cpsess|token|hidden|password/);
});

test('click validates a unique visible noncredential target, then uses native mouse input', async () => {
  const { nativeClick } = await import('./gimle.ts');
  const element: any = {
    type: 'button', name: '', id: '', autocomplete: '', placeholder: '',
    getAttribute: () => null, scrollIntoView() {},
    getBoundingClientRect: () => ({ x: 10, y: 20, width: 80, height: 30 }),
    contains: (candidate: unknown) => candidate === element,
    click() { throw Error('DOM click must not be used'); },
  };
  const document = { querySelectorAll: () => [element], elementFromPoint: () => element };
  const context = { document, innerWidth: 800, innerHeight: 600 };
  assert.deepEqual(JSON.parse(JSON.stringify(runInNewContext(buildInteractionExpression('click', '.button'), context))), { x: 50, y: 35 });
  element.type = 'password';
  assert.throws(() => runInNewContext(buildInteractionExpression('click', '.button'), context), /Credential/);
  element.type = 'button';
  document.querySelectorAll = () => [element, element];
  assert.throws(() => runInNewContext(buildInteractionExpression('click', '.button'), context), /exactly one/);
  document.querySelectorAll = () => [element];
  document.elementFromPoint = () => null as any;
  assert.throws(() => runInNewContext(buildInteractionExpression('click', '.button'), context), /covered/);
  const events: Record<string, unknown>[] = [];
  const fake = { async _call(method: string, params: Record<string, unknown> = {}) {
    if (method === 'Runtime.evaluate') return { result: { value: { x: 50, y: 35 } } };
    assert.equal(method, 'Input.dispatchMouseEvent'); events.push(params); return {};
  } };
  await nativeClick(fake, '.button');
  assert.deepEqual(events.map(event => event.type), ['mouseMoved', 'mousePressed', 'mouseReleased']);
  assert.equal(events[1].button, 'left');
  const refused = { async _call(method: string) {
    assert.equal(method, 'Runtime.evaluate'); return { exceptionDetails: { text: 'private token' } };
  } };
  await assert.rejects(nativeClick(refused, '.button'), /refused/);
});

test('ordinary clicks refuse popup/download controls before sending mouse input', async () => {
  const { nativeClick } = await import('./gimle.ts');
  const anchor = { target: '_blank', hasAttribute: (name: string) => name === 'download' && download };
  let download = false;
  const element = { getAttribute: () => null, closest: () => anchor, type: '', name: '', id: '', autocomplete: '', placeholder: '' };
  const context = { document: { querySelectorAll: () => [element] } };
  for (const [target, isDownload] of [['_blank', false], ['', true]] as const) {
    anchor.target = target; download = isDownload;
    assert.throws(() => runInNewContext(buildInteractionExpression('click', '.link'), context), /Popup or download/);
    const fake = { async _call(method: string, params: Record<string, unknown> = {}) {
      assert.equal(method, 'Runtime.evaluate', 'must not send mouse input');
      try { return { result: { value: runInNewContext(String(params.expression), context) } }; }
      catch { return { exceptionDetails: {} }; }
    } };
    await assert.rejects(nativeClick(fake, '.link'), /refused/);
  }
});
