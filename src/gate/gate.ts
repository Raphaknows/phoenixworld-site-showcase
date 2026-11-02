// Private-preview password gate for Cloudflare Pages Functions (free tier, no Access needed).
// Fails closed: with no PREVIEW_PASSWORD the site answers 503 instead of going public.
// Currently kept OFF (GATE_DISABLED=true): the password prompt was dropped for the preview period, but the
// code stays in place so it can be switched back on. Search-engine blocking is a separate switch (NOINDEX).

export interface GateEnv {
  PREVIEW_PASSWORD?: string;
  GATE_DISABLED?: string;
  NOINDEX?: string;
}
export interface GateContext {
  request: Request;
  env: GateEnv;
  next(): Promise<Response>;
}

const REALM = 'Phoenix World (private preview)';
const NOINDEX = 'noindex, nofollow';
const enc = new TextEncoder();

/** Constant-time comparison: hash both sides, then compare the digests without early exit. */
async function sameSecret(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all(
    [a, b].map(async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))),
  );
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/** Password from an `Authorization: Basic base64(user:password)` header; the username is ignored. */
export function passwordFrom(header: string | null): string | null {
  const m = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(header ?? '');
  if (!m) return null;
  try {
    const bytes = Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0));
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const i = text.indexOf(':');
    return i < 0 ? null : text.slice(i + 1);
  } catch {
    return null;
  }
}

const PUBLIC_PATH = '/version.txt';

const deny = (status: number, body: string, extra: Record<string, string> = {}): Response =>
  new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': NOINDEX, 'Cache-Control': 'no-store', ...extra },
  });

export async function gate({ request, env, next }: GateContext, failDelayMs = 800): Promise<Response> {
  if (env.GATE_DISABLED === 'true') return next();
  if (new URL(request.url).pathname === PUBLIC_PATH) return next(); // the build stamp (a commit hash) is readable without the password
  const password = env.PREVIEW_PASSWORD?.trim(); // a pasted secret often carries a trailing newline
  if (!password) return deny(503, 'This site is private and its gate password is not configured.');

  const header = request.headers.get('Authorization');
  const given = passwordFrom(header);
  if (given === null || !(await sameSecret(given, password))) {
    if (header) await new Promise((r) => setTimeout(r, failDelayMs)); // slow down guessing
    return deny(401, 'Authentication required.', { 'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"` });
  }

  const res = await next();
  const out = new Response(res.body, res);
  out.headers.set('X-Robots-Tag', NOINDEX);
  return out;
}

/** Search engines are kept out unless NOINDEX is exactly "false" (launch). Unset or anything else = blocked. */
export const noindexOn = (env: GateEnv): boolean => env.NOINDEX !== 'false';

/** The *.pages.dev addresses (production and previews) are never for search engines; the real domain is phoenixworld.ai. */
export const isPagesDev = (request: Request): boolean => new URL(request.url).hostname.endsWith('.pages.dev');

/** The Pages entry point: the (optional) password gate, then X-Robots-Tag on every response while NOINDEX is on, and always on *.pages.dev. */
export async function edge(ctx: GateContext, failDelayMs?: number): Promise<Response> {
  const res = await gate(ctx, failDelayMs);
  if (!(noindexOn(ctx.env) || isPagesDev(ctx.request)) || res.headers.has('X-Robots-Tag')) return res;
  const out = new Response(res.body, res);
  out.headers.set('X-Robots-Tag', NOINDEX);
  return out;
}
