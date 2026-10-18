import type { ExtensionAPI, AgentToolResult } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { Session } from '../node_modules/pi-chrome-use/src/cdp/session.ts';

export function resolveFreyrEndpoint(endpoint = 'http://127.0.0.1:9333'): string {
  if (endpoint !== 'http://127.0.0.1:9333') throw new Error('Only the dedicated Freyr loopback CDP endpoint is permitted.');
  return endpoint;
}

export function validateAppUrl(value: string): URL {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP(S) app URLs are permitted.');
  if (url.username || url.password) throw new Error('Credential-bearing browser URLs are forbidden.');
  if (url.hostname === 'accounts.google.com' || /(?:^|\.)login\.(?:microsoftonline|live)\.com$/.test(url.hostname)) throw new Error('Login/credential pages must be handled by Lucas, not the agent.');
  return url;
}

export default function freyrBrowser(pi: ExtensionAPI): void {
  let session: Session | undefined;
  const owned = new Map<string, { targetId: string; origin: string }>();
  const cleanup = () => { session?.close(); session = undefined; owned.clear(); };
  pi.on('session_shutdown', cleanup);
  pi.on('session_start', cleanup);
  pi.registerTool({
    name: 'freyr_browser', label: 'Freyr browser',
    exposure: 'deferred',
    description: 'Operate dedicated app tabs on Freyr through its existing loopback CDP tunnel. Actions: open, snapshot visible page text, screenshot, click CSS selector, type into a noncredential input, navigate within the app origin, close owned tab. No arbitrary page JavaScript, cookies, storage, unrelated tabs, browser/profile discovery, local fallback or service start.',
    promptGuidelines: ['Obtain approval before starting/reconnecting Freyr infrastructure.', 'Use the exact app URL and a dedicated tab. Stop on login/challenge pages. Lucas handles credentials and 2FA.'],
    parameters: Type.Object({
      action: Type.Union(['open','snapshot','screenshot','click','type','navigate','close'].map(action => Type.Literal(action))),
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
            if (params.action !== 'open') throw new Error('No Freyr connection; open the app explicitly.');
            const response = await fetch(`${resolveFreyrEndpoint()}/json/version`, { signal: AbortSignal.timeout(5000) });
            if (!response.ok) throw new Error(`Freyr CDP unavailable: HTTP ${response.status}`);
            const data = await response.json() as { webSocketDebuggerUrl?: string };
            const ws = new URL(data.webSocketDebuggerUrl ?? '');
            if (!['ws:','wss:'].includes(ws.protocol) || !['127.0.0.1','localhost'].includes(ws.hostname) || ws.port !== '9333') throw new Error('Unexpected Freyr CDP endpoint.');
            session = new Session();
            await session.connect({ wsUrl: ws.href, timeoutMs: 5000 });
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
          const location = await session._call('Runtime.evaluate',{expression:'location.href',returnByValue:true}) as {result:{value:string}};
          const current = validateAppUrl(location.result.value);
          if (current.origin !== tab.origin) throw new Error('Unexpected app redirect; stop and ask Lucas.');
          if (params.action === 'navigate') {
            if (!requested || requested.origin !== tab.origin) throw new Error('navigate requires a URL on the assigned app origin.');
            const loaded = session.waitFor('Page.loadEventFired', undefined, 15000);
            await session._call('Page.navigate',{url:requested.href});
            await loaded;
          }
          if (params.action === 'screenshot') {
            const image = await session._call('Page.captureScreenshot',{format:'png'}) as {data:string};
            return {content:[{type:'image',mimeType:'image/png',data:image.data}],details:undefined};
          }
          let expression = '({url:location.href,title:document.title,text:document.body?.innerText?.slice(0,30000)})';
          if (params.action === 'click' || params.action === 'type') {
            if (!params.selector) throw new Error('An element selector is required.');
            // Only data is interpolated; selectors/text cannot become JavaScript source.
            expression = `(()=>{const e=document.querySelector(${JSON.stringify(params.selector)});if(!e)throw Error('Element not found');const c=[e.type,e.name,e.id,e.autocomplete,e.getAttribute('aria-label'),e.placeholder].join(' ');if(/password|passwd|token|secret|credential|one-time|otp|username|email/i.test(c))throw Error('Credential field interaction forbidden');${params.action === 'click' ? 'e.click()' : `const set=Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value')?.set;if(!set)throw Error('Not a text input');set.call(e,${JSON.stringify(params.text ?? '')});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))`};return 'ok'})()`;
          }
          const result = await session._call('Runtime.evaluate',{expression,returnByValue:true}) as {result:{value?:unknown};exceptionDetails?:unknown};
          if (result.exceptionDetails) throw new Error('Page interaction refused or failed.');
          return {content:[{type:'text',text:JSON.stringify(result.result.value??null).slice(0,32000)}],details:undefined};
        };
        return await Promise.race([operation(),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{abort();reject(new Error('Freyr browser call timed out.'));},30000);})]);
      } finally { clearTimeout(timer);signal?.removeEventListener('abort',abort); }
    },
  });
}
