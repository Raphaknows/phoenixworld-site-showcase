import { expect, test } from '@playwright/test';
import { edge, gate, isPagesDev, noindexOn, passwordFrom, type GateEnv } from '../src/gate/gate';

const basic = (user: string, pass: string) => 'Basic ' + Buffer.from(`${user}:${pass}`, 'utf8').toString('base64');
const run = (env: GateEnv, authorization?: string) => {
  let reached = 0;
  const request = new Request('https://preview.example/', { headers: authorization ? { Authorization: authorization } : {} });
  const res = gate(
    { request, env, next: async () => { reached++; return new Response('<h1>site</h1>', { status: 200, headers: { 'Content-Type': 'text/html' } }); } },
    5, // no need to wait the real failure delay in tests
  );
  return { res, reached: () => reached };
};
const PW = 'correct-horse-battery';

test.describe('password gate (pure)', () => {
  test('fails closed: no password configured -> 503, site never reached', async () => {
    const { res, reached } = run({});
    const r = await res;
    expect(r.status).toBe(503);
    expect(r.headers.get('X-Robots-Tag')).toContain('noindex');
    expect(reached()).toBe(0);
    // even a request that "knows" some password gets nothing
    const r2 = await run({}, basic('x', 'anything')).res;
    expect(r2.status).toBe(503);
  });

  test('a secret saved with a trailing newline still matches; a whitespace-only secret fails closed', async () => {
    const ok = await run({ PREVIEW_PASSWORD: PW + '\n' }, basic('x', PW)).res;
    expect(ok.status).toBe(200);
    const blank = await run({ PREVIEW_PASSWORD: ' \n' }, basic('x', '')).res;
    expect(blank.status).toBe(503);
  });

  test('/version.txt is readable without credentials (and without a configured password); everything else is not', async () => {
    const mk = (path: string, env: GateEnv) =>
      gate({ request: new Request('https://preview.example' + path), env, next: async () => new Response('stamp', { status: 200 }) }, 5);
    expect((await mk('/version.txt', { PREVIEW_PASSWORD: PW })).status).toBe(200);
    expect((await mk('/version.txt', {})).status).toBe(200);
    expect((await mk('/version.txt/', { PREVIEW_PASSWORD: PW })).status).toBe(401);
    expect((await mk('/version.txt.bak', { PREVIEW_PASSWORD: PW })).status).toBe(401);
    expect((await mk('/', { PREVIEW_PASSWORD: PW })).status).toBe(401);
  });

  test('no credentials -> 401 with a Basic challenge and noindex; site not reached', async () => {
    const { res, reached } = run({ PREVIEW_PASSWORD: PW });
    const r = await res;
    expect(r.status).toBe(401);
    expect(r.headers.get('WWW-Authenticate')).toMatch(/^Basic realm="[^"]+"/);
    expect(r.headers.get('X-Robots-Tag')).toContain('noindex');
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(await r.text()).not.toContain('site');
    expect(reached()).toBe(0);
  });

  test('wrong password -> 401', async () => {
    for (const bad of [PW + 'x', PW.slice(0, -1), '', PW.toUpperCase(), ' ' + PW]) {
      const { res, reached } = run({ PREVIEW_PASSWORD: PW }, basic('me', bad));
      expect((await res).status, JSON.stringify(bad)).toBe(401);
      expect(reached()).toBe(0);
    }
  });

  test('right password -> site served, any username, noindex added', async () => {
    for (const user of ['me', '', 'someone@example.com']) {
      const { res, reached } = run({ PREVIEW_PASSWORD: PW }, basic(user, PW));
      const r = await res;
      expect(r.status).toBe(200);
      expect(await r.text()).toBe('<h1>site</h1>');
      expect(r.headers.get('X-Robots-Tag')).toContain('noindex');
      expect(r.headers.get('Content-Type')).toBe('text/html');
      expect(reached()).toBe(1);
    }
  });

  test('passwords with colons, spaces and unicode work', async () => {
    for (const pw of ['a:b:c', 'with space', 'pässwörd-日本', 'p=ss+w/rd']) {
      const r = await run({ PREVIEW_PASSWORD: pw }, basic('me', pw)).res;
      expect(r.status, pw).toBe(200);
    }
  });

  test('malformed or non-Basic headers -> 401', async () => {
    for (const h of ['Bearer abc', 'Basic', 'Basic !!!!', 'Basic ' + Buffer.from('nocolon').toString('base64'), 'Basic ' + Buffer.from([0xff, 0xfe, 0x3a, 0x41]).toString('base64')]) {
      const r = await run({ PREVIEW_PASSWORD: PW }, h).res;
      expect(r.status, h).toBe(401);
    }
  });

  test('scheme is case-insensitive', async () => {
    const r = await run({ PREVIEW_PASSWORD: PW }, basic('me', PW).replace('Basic', 'basic')).res;
    expect(r.status).toBe(200);
  });

  test('GATE_DISABLED=true lets everything through untouched (launch switch)', async () => {
    const { res, reached } = run({ GATE_DISABLED: 'true' });
    const r = await res;
    expect(r.status).toBe(200);
    expect(r.headers.get('X-Robots-Tag')).toBeNull();
    expect(reached()).toBe(1);
    // only the exact string "true" disables it
    expect((await run({ GATE_DISABLED: '1' }).res).status).toBe(503);
    expect((await run({ GATE_DISABLED: 'false', PREVIEW_PASSWORD: PW }).res).status).toBe(401);
  });

  test('passwordFrom', () => {
    expect(passwordFrom(basic('u', 'p:q'))).toBe('p:q');
    expect(passwordFrom(null)).toBeNull();
    expect(passwordFrom('')).toBeNull();
  });
});

test.describe('NOINDEX switch (independent of the gate)', () => {
  const page = (env: GateEnv, path = '/') =>
    edge({ request: new Request('https://preview.example' + path), env, next: async () => new Response('site', { status: 200 }) }, 5);

  test('gate off: every response still carries noindex, nofollow while NOINDEX is on or unset', async () => {
    for (const env of [{ GATE_DISABLED: 'true', NOINDEX: 'true' }, { GATE_DISABLED: 'true' }, { GATE_DISABLED: 'true', NOINDEX: 'False' }]) {
      const r = await page(env);
      expect(r.status).toBe(200);
      expect(r.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    }
    expect((await page({ GATE_DISABLED: 'true', NOINDEX: 'true' }, '/version.txt')).headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });
  test('NOINDEX=false (launch) removes the header; the gate flag does not change that', async () => {
    const r = await page({ GATE_DISABLED: 'true', NOINDEX: 'false' });
    expect(r.status).toBe(200);
    expect(r.headers.get('X-Robots-Tag')).toBeNull();
    expect(noindexOn({ NOINDEX: 'false' })).toBe(false);
    expect(noindexOn({})).toBe(true);
  });
  test('gate on: denials keep noindex even when NOINDEX=false', async () => {
    const r = await page({ PREVIEW_PASSWORD: 'pw', NOINDEX: 'false' });
    expect(r.status).toBe(401);
    expect(r.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });
});

test.describe('*.pages.dev is never indexed; the real domain is unaffected (NOINDEX=false, i.e. launched)', () => {
  const at = (host: string, path = '/') =>
    edge({ request: new Request(`https://${host}${path}`), env: { GATE_DISABLED: 'true', NOINDEX: 'false' }, next: async () => new Response('site', { status: 200 }) }, 5);

  test('production and preview pages.dev hosts get X-Robots-Tag: noindex, on pages and static files, with no redirect', async () => {
    for (const host of ['phoenixworld-site.pages.dev', 'change-x.phoenixworld-site.pages.dev', 'a1b2c3d4.phoenixworld-site.pages.dev']) {
      for (const path of ['/', '/privacy/', '/robots.txt', '/version.txt']) {
        const r = await at(host, path);
        expect(r.status, host + path).toBe(200);
        expect(r.headers.get('X-Robots-Tag'), host + path).toBe('noindex, nofollow');
        expect(r.headers.get('Location'), host + path).toBeNull();
      }
    }
  });
  test('phoenixworld.ai and www send no X-Robots-Tag', async () => {
    for (const host of ['phoenixworld.ai', 'www.phoenixworld.ai']) {
      for (const path of ['/', '/privacy/', '/robots.txt']) {
        expect((await at(host, path)).headers.get('X-Robots-Tag'), host + path).toBeNull();
      }
    }
  });
  test('only real *.pages.dev hosts match', () => {
    const is = (host: string) => isPagesDev(new Request(`https://${host}/`));
    expect(is('x.pages.dev')).toBe(true);
    expect(is('phoenixworld.ai')).toBe(false);
    expect(is('www.phoenixworld.ai')).toBe(false);
    expect(is('pages.dev.phoenixworld.ai')).toBe(false);
    expect(is('notpages.dev')).toBe(false);
    expect(is('phoenixworld.ai.evil.com')).toBe(false);
  });
});
