import { expect, test } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const fixture = (html: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'dist-'));
  writeFileSync(join(dir, 'index.html'), html);
  return dir;
};
/** A throwaway wrangler.json with the given Production and Preview vars; the guard reads it through PAGES_CONFIG. */
const config = (production: Record<string, string>, preview: Record<string, string> = production) => {
  const file = join(mkdtempSync(join(tmpdir(), 'cfg-')), 'wrangler.json');
  writeFileSync(file, JSON.stringify({ env: { production: { vars: production }, preview: { vars: preview } } }));
  return file;
};
const run = (dir: string, pagesConfig: string, env: Record<string, string> = {}) =>
  spawnSync('node', ['scripts/launch-guard.mjs', dir], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '', PAGES_CONFIG: pagesConfig, ...env } });
const DIRTY = '<h1>Ship in [TIMELINE]</h1><p>[X] business days</p><img alt="[PHOTO]">';
const CLEAN = '<h1>Ship in 10 business days</h1>';

test.describe('build-time placeholder enforcement (reads wrangler.json)', () => {
  test('Production with NOINDEX=false (the launch) and placeholders FAILS and names each placeholder', () => {
    const r = run(fixture(DIRTY), config({ NOINDEX: 'false' }));
    expect(r.status).toBe(1);
    for (const t of ['[TIMELINE]', '[X]', '[PHOTO]']) expect(r.stderr).toContain(t);
    expect(r.stderr).toContain('index.html');
    expect(run(fixture(DIRTY), config({ NOINDEX: 'false' }), { CF_PAGES_BRANCH: 'main' }).status).toBe(1);
  });
  test('Production at launch with a clean site passes', () => {
    expect(run(fixture(CLEAN), config({ NOINDEX: 'false' }), { CF_PAGES_BRANCH: 'main' }).status).toBe(0);
  });
  test('preview builds are unaffected, even with placeholders and NOINDEX=false in the Preview section', () => {
    expect(run(fixture(DIRTY), config({ NOINDEX: 'true' }, { NOINDEX: 'false' }), { CF_PAGES_BRANCH: 'feature-x' }).status).toBe(0);
    expect(run(fixture(DIRTY), config({ NOINDEX: 'false' }), { CF_PAGES_BRANCH: 'feature-x' }).status).toBe(0); // preview has no NOINDEX=false
  });
  test('while NOINDEX is anything but "false" (or missing, or no config file) no build is ever blocked', () => {
    for (const cfg of [config({ NOINDEX: 'true' }), config({}), config({ NOINDEX: 'False' }), config({ NOINDEX: 'true', GATE_DISABLED: 'true' }), '/nonexistent/wrangler.json']) {
      expect(run(fixture(DIRTY), cfg, { CF_PAGES_BRANCH: 'main' }).status, cfg).toBe(0);
    }
  });
  test('dashboard-style env vars do not override the file (NOINDEX=false in the environment is ignored)', () => {
    expect(run(fixture(DIRTY), config({ NOINDEX: 'true' }), { NOINDEX: 'false', CF_PAGES_BRANCH: 'main' }).status).toBe(0);
  });
});
