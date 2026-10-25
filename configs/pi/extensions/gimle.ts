import type { ExtensionAPI, AgentToolResult } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { Session } from '../node_modules/pi-chrome-use/src/cdp/session.ts';

export function resolveGimleEndpoint(endpoint = 'http://127.0.0.1:9444'): string {
  if (endpoint !== 'http://127.0.0.1:9444') throw new Error('Only the dedicated Gimle loopback CDP endpoint is permitted.');
  return endpoint;
}

export function validateGimleWebSocket(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Unexpected Gimle CDP endpoint.'); }
  if (!['ws:', 'wss:'].includes(url.protocol) || url.hostname !== '127.0.0.1' || url.port !== '9444' || url.username || url.password || !url.pathname.startsWith('/devtools/browser/')) {
    throw new Error('Unexpected Gimle CDP endpoint.');
  }
  return url.href;
}

export function validateAppUrl(value: string): URL {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP(S) app URLs are permitted.');
  if (url.username || url.password) throw new Error('Credential-bearing browser URLs are forbidden.');
  if (url.hostname === 'accounts.google.com' || /(?:^|\.)login\.(?:microsoftonline|live)\.com$/.test(url.hostname)) throw new Error('Login/credential pages must be handled by Lucas, not the agent.');
  return url;
}

export function buildInteractionExpression(action: 'click' | 'type', selector: string, text = ''): string {
  // Only JSON-encoded data is interpolated, never caller-supplied JavaScript.
  const operation = action === 'click' ? `
    const anchor=e.closest?.('a');
    const target=anchor?.target||e.formTarget||e.target||e.form?.target||'';
    if((target&&target!=='_self')||anchor?.hasAttribute('download'))throw Error('Popup or download control refused');
    e.scrollIntoView({block:'center',inline:'center'});
    const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
    if(r.width<=0||r.height<=0||x<0||y<0||x>=innerWidth||y>=innerHeight||!e.contains(document.elementFromPoint(x,y)))throw Error('Control is not visible or is covered');
    return {x,y};
  ` : `
    if(e.isContentEditable){
      const selection=window.getSelection();
      if(!selection)throw Error('Rich-text selection unavailable');
      e.focus();
      const range=document.createRange();range.selectNodeContents(e);
      selection.removeAllRanges();selection.addRange(range);
      if(!document.execCommand('insertText',false,${JSON.stringify(text)}))throw Error('Rich-text insertion failed');
    }else{
      const proto=e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      const set=Object.getOwnPropertyDescriptor(proto,'value')?.set;
      if(!set)throw Error('Not a text input');
      set.call(e,${JSON.stringify(text)});
      e.dispatchEvent(new Event('input',{bubbles:true}));
      e.dispatchEvent(new Event('change',{bubbles:true}));
    }`;
  return `(()=>{
    const matches=document.querySelectorAll(${JSON.stringify(selector)});
    if(matches.length!==1)throw Error('Select exactly one control');
    const e=matches[0];
    const c=[e.type,e.name,e.id,e.autocomplete,e.getAttribute('aria-label'),e.placeholder,e.getAttribute('data-placeholder')].join(' ');
    if(/password|passwd|token|secret|credential|one-time|otp|username|email/i.test(c))throw Error('Credential field interaction forbidden');
    ${operation}
    return 'ok';
  })()`;
}

// Inspect credential controls for presence/visibility only, never their values.
export const browserPageStateExpression = `(()=>{
  const visible=selector=>Array.from(document.querySelectorAll(selector)).some(e=>e.getClientRects().length>0);
  const blocked=visible('input[type="password"],input[autocomplete="one-time-code"],input[name="otp"],iframe[src*="recaptcha"],iframe[src*="hcaptcha"]')
    || /(?:^|[\\s/_-])(login|signin|sign-in|two-factor|verification|challenge)(?:$|[\\s/_.-])/i.test(document.title+' '+location.pathname);
  return {origin:location.origin,ready:document.readyState==='complete',blocked};
})()`;

export function buildFollowLinkExpression(selector: string): string {
  return `(()=>{
    const matches=document.querySelectorAll(${JSON.stringify(selector)});
    if(matches.length!==1)throw Error('Select exactly one link');
    const e=matches[0],u=new URL(e.href,location.href);
    if(e.tagName!=='A'||u.protocol!=='https:'||u.origin!==location.origin||u.username||u.password)throw Error('Expected a same-origin HTTPS link');
    const c=[e.id,e.getAttribute('aria-label'),e.getAttribute('name')].join(' ');
    if(/password|passwd|secret|credential|one-time|otp|username|email/i.test(c))throw Error('Credential field interaction forbidden');
    if(e.hasAttribute('download'))throw Error('Download links cannot be followed');
    e.scrollIntoView({block:'center',inline:'center'});
    const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
    if(r.width<=0||r.height<=0||x<0||y<0||x>=innerWidth||y>=innerHeight||!e.contains(document.elementFromPoint(x,y)))throw Error('Link is not visible or is covered');
    e.target='_self';
    return {x,y};
  })()`;
}

type LinkSession = { _call(method: string, params?: Record<string, unknown>): Promise<unknown> };
type PageState = {origin:string;ready:boolean;blocked:boolean};

async function pageState(session: LinkSession): Promise<PageState> {
  const result = await session._call('Runtime.evaluate', {expression:browserPageStateExpression,returnByValue:true}) as {result?:{value?:PageState};exceptionDetails?:unknown};
  const state = result.result?.value;
  if (result.exceptionDetails || !state || typeof state.origin !== 'string' || typeof state.blocked !== 'boolean' || typeof state.ready !== 'boolean') throw new Error('Cannot verify browser page state.');
  return state;
}

function requireApp(state: PageState, origin: string): void {
  if (state.origin !== origin) throw new Error('Unexpected app redirect; stop and ask Lucas.');
  if (state.blocked) throw new Error('Login or verification required; Lucas must handle it through Screen Sharing.');
}

type OwnedApp = { origin: string; handoffOrigin?: string };

export function requireAssignedApp(state: PageState, tab: OwnedApp, action: string): void {
  const allowed = state.origin === tab.origin || (action !== 'follow_link' && state.origin === tab.handoffOrigin);
  if (!allowed) throw new Error('Unexpected app redirect; stop and ask Lucas.');
  if (state.blocked) throw new Error('Login or verification required; Lucas must handle it through Screen Sharing.');
}

export const browserSnapshotExpression = `(()=>{
  const controls=[];
  for(const e of Array.from(document.querySelectorAll?.('a,button,input,textarea,select,[role="button"],[role="link"],[contenteditable="true"]')??[])){
    if(!e.getClientRects().length)continue;
    const c=[e.type,e.name,e.id,e.autocomplete,e.getAttribute('aria-label'),e.placeholder].join(' ');
    if(/password|passwd|token|secret|credential|one-time|otp|username|email/i.test(c))continue;
    const path=[];let node=e;
    while(node?.parentElement){
      const parent=node.parentElement;
      path.unshift(node.tagName.toLowerCase()+':nth-child('+(Array.from(parent.children).indexOf(node)+1)+')');
      node=parent;
    }
    if(!node?.tagName)continue;
    path.unshift(node.tagName.toLowerCase());
    const text=e.tagName==='INPUT'||e.tagName==='TEXTAREA'?'':(e.innerText??'').trim().slice(0,100);
    controls.push({selector:path.join(' > '),role:e.tagName.toLowerCase(),text});
    if(controls.length>=160)break;
  }
  return {url:location.origin+location.pathname.replace(/\\/cpsess[^/]+/g,'/[session]'),
    title:document.title,text:document.body?.innerText?.slice(0,24000),controls};
})()`;

async function dispatchClick(session: LinkSession, point: {x:number;y:number}, signal?: AbortSignal): Promise<void> {
  for (const type of ['mouseMoved','mousePressed','mouseReleased']) {
    signal?.throwIfAborted();
    await session._call('Input.dispatchMouseEvent', {type,...point,...(type==='mouseMoved'?{}:{button:'left',clickCount:1})});
  }
}

export async function nativeClick(session: LinkSession, selector: string, signal?: AbortSignal): Promise<void> {
  const result = await session._call('Runtime.evaluate', {expression:buildInteractionExpression('click',selector),returnByValue:true}) as {result?:{value?:{x:number;y:number}};exceptionDetails?:unknown};
  const point = result.result?.value;
  if (result.exceptionDetails || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error('Click refused or failed; no mouse event sent.');
  await dispatchClick(session, point, signal);
}

export async function followLink(session: LinkSession, selector: string, sourceOrigin: string, expectedOrigin: string, signal?: AbortSignal, onDestination?: () => void): Promise<string> {
  const destination = validateAppUrl(expectedOrigin), source = validateAppUrl(sourceOrigin);
  for (const url of [destination,source]) {
    if (url.protocol !== 'https:' || url.href !== url.origin + '/') throw new Error('Expected an HTTPS origin without a path, query or fragment.');
  }
  requireApp(await pageState(session), source.origin);
  const evaluated = await session._call('Runtime.evaluate', {expression:buildFollowLinkExpression(selector),returnByValue:true}) as {result?:{value?:{x:number;y:number}};exceptionDetails?:{exception?:{description?:string}}};
  const point = evaluated.result?.value;
  if (evaluated.exceptionDetails) {
    // Whitelist fixed messages only; page exception text may include SSO secrets.
    const fixed = ['Select exactly one link','Expected a same-origin HTTPS link','Credential field interaction forbidden','Download links cannot be followed','Link is not visible or is covered'];
    const first = evaluated.exceptionDetails.exception?.description?.split('\n')[0];
    const reason = fixed.find(message => first === `Error: ${message}`);
    throw new Error(reason ? `${reason}; no click sent.` : 'Link selection refused or failed; no click sent.');
  }
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error('Link selection refused or failed; no click sent.');
  await dispatchClick(session, point, signal);
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    let state: PageState;
    try { state = await pageState(session); } catch (error) {
      // A navigation can briefly replace the execution context. No click retry.
      if (!/Execution context was destroyed|Cannot find context/i.test(String(error))) throw error;
      await new Promise(resolve => setTimeout(resolve, 100));
      continue;
    }
    if (state.origin !== source.origin && state.origin !== destination.origin) throw new Error('Unexpected app redirect; stop and ask Lucas.');
    if (state.origin === destination.origin) onDestination?.();
    if (state.blocked) throw new Error('Login or verification required; Lucas must handle it through Screen Sharing.');
    if (state.origin === destination.origin && state.ready) return destination.origin;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Link handoff did not reach the expected origin; no other window was inspected.');
}

export default function lokiBrowser(pi: ExtensionAPI): void {
  let session: Session | undefined;
  const owned = new Map<string, { targetId: string; origin: string; handoffOrigin?: string }>();
  const cleanup = () => { session?.close(); session = undefined; owned.clear(); };
  pi.on('session_shutdown', cleanup);
  pi.on('session_start', cleanup);
  pi.registerTool({
    name: 'loki_browser', label: 'Loki browser (Gimle)',
    exposure: 'deferred',
    description: 'Operate dedicated app tabs on Gimle through its existing loopback CDP tunnel. Actions: open, snapshot, screenshot, click CSS selector, follow_link (single same-origin HTTPS anchor in the owned tab; url is the expected HTTPS destination origin), type noncredential text, same-origin navigate, close. Stops at login/challenge pages. No arbitrary JavaScript, credentials, cookies, storage, unrelated tabs, popup adoption or service start.',
    promptGuidelines: ['Obtain approval before starting/reconnecting Gimle infrastructure.', 'Use the exact app URL and a dedicated tab. Stop on login/challenge pages. Lucas handles credentials and 2FA.'],
    parameters: Type.Object({
      action: Type.Union(['open','snapshot','screenshot','click','follow_link','type','navigate','close'].map(action => Type.Literal(action))),
      name: Type.String({ minLength: 1, maxLength: 80 }),
      url: Type.Optional(Type.String()), selector: Type.Optional(Type.String({ maxLength: 1000 })), text: Type.Optional(Type.String({ maxLength: 10000 })),
    }),
    async execute(_id, params, signal): Promise<AgentToolResult<undefined>> {
      let timer: NodeJS.Timeout | undefined;
      const abort = () => session?.close();
      signal?.addEventListener('abort', abort, { once: true });
      try {
        if (signal?.aborted) throw new Error('Browser call aborted.');
        const operation = async (): Promise<AgentToolResult<undefined>> => {
          if (params.action === 'open' && !params.url) throw new Error('open requires an app URL.');
          const requested = params.url ? validateAppUrl(params.url) : undefined;
          if (!session?.isConnected()) {
            if (params.action !== 'open') throw new Error('No Gimle connection; open the app explicitly.');
            const response = await fetch(`${resolveGimleEndpoint()}/json/version`, { signal: AbortSignal.timeout(5000) });
            if (!response.ok) throw new Error(`Gimle CDP unavailable: HTTP ${response.status}`);
            const data = await response.json() as { webSocketDebuggerUrl?: string };
            const wsUrl = validateGimleWebSocket(data.webSocketDebuggerUrl ?? '');
            session = new Session();
            await session.connect({ wsUrl, timeoutMs: 5000 });
          }
          if (params.action === 'open') {
            if (owned.has(params.name)) throw new Error('Tab name already exists; close it first.');
            const created = await session._call('Target.createTarget', {url:'about:blank'}) as {targetId:string};
            owned.set(params.name,{targetId:created.targetId,origin:requested!.origin});
            await session.use(created.targetId);
            await session._call('Page.enable');
            const loaded = session.waitFor('Page.loadEventFired', undefined, 15000);
            await session._call('Page.navigate',{url:requested!.href});
            await loaded;
          }
          const tab = owned.get(params.name);
          if (!tab) throw new Error('Unknown tab; unrelated browser tabs are never inspected.');
          if (params.action === 'close') {
            await session._call('Target.closeTarget',{targetId:tab.targetId}); owned.delete(params.name);
            return {content:[{type:'text',text:`Closed ${params.name}`}],details:undefined};
          }
          await session.use(tab.targetId);
          const state = await pageState(session);
          requireAssignedApp(state, tab, params.action);
          if (params.action === 'follow_link') {
            if (!params.selector || !params.url) throw new Error('follow_link requires a unique link selector and expected HTTPS origin in url.');
            await followLink(session, params.selector, tab.origin, params.url, signal, () => { tab.handoffOrigin = requested!.origin; });
            return {content:[{type:'text',text:`Link handoff reached ${tab.handoffOrigin}. Take a snapshot to inspect the app.`}],details:undefined};
          }
          if (params.action === 'navigate') {
            if (!requested || requested.origin !== state.origin) throw new Error('navigate requires a URL on the current assigned app origin.');
            const loaded = session.waitFor('Page.loadEventFired', undefined, 15000);
            await session._call('Page.navigate',{url:requested.href});
            await loaded;
            requireAssignedApp(await pageState(session), tab, params.action);
          }
          if (params.action === 'screenshot') {
            const image = await session._call('Page.captureScreenshot',{format:'png'}) as {data:string};
            return {content:[{type:'image',mimeType:'image/png',data:image.data}],details:undefined};
          }
          if (params.action === 'click') {
            if (!params.selector) throw new Error('An element selector is required.');
            await nativeClick(session, params.selector, signal);
            return {content:[{type:'text',text:'Click sent. Take a fresh snapshot before selecting the next control.'}],details:undefined};
          }
          // cPanel paths and SSO queries can contain session secrets. Never echo them.
          let expression = browserSnapshotExpression;
          if (params.action === 'type') {
            if (!params.selector) throw new Error('An element selector is required.');
            // Only data is interpolated; selectors/text cannot become JavaScript source.
            expression = buildInteractionExpression(params.action, params.selector, params.text ?? '');
          }
          const result = await session._call('Runtime.evaluate',{expression,returnByValue:true}) as {result:{value?:unknown};exceptionDetails?:unknown};
          if (result.exceptionDetails) throw new Error('Page interaction refused or failed.');
          return {content:[{type:'text',text:JSON.stringify(result.result.value??null).slice(0,32000)}],details:undefined};
        };
        return await Promise.race([operation(),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{abort();reject(new Error('Gimle browser call timed out.'));},30000);})]);
      } finally { clearTimeout(timer);signal?.removeEventListener('abort',abort); }
    },
  });
}
