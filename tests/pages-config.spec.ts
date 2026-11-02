import { expect, test } from '@playwright/test';
import fs, { readFileSync } from 'node:fs';
// @ts-expect-error plain .mjs helper shared with the build
import { environmentFor, resolveVars } from '../scripts/pages-config.mjs';

const cfg = JSON.parse(readFileSync('wrangler.json', 'utf8'));

test.describe('wrangler.json (committed Pages config)', () => {
  test('parses, is a Pages config, and defines both environments with the five variables', () => {
    expect(cfg.name).toBe('phoenixworld-site');
    expect(cfg.pages_build_output_dir).toBe('dist');
    expect(Object.keys(cfg.env).sort()).toEqual(['preview', 'production']);
    for (const e of ['production', 'preview']) {
      const v = cfg.env[e].vars;
      expect(Object.keys(v).sort(), e).toEqual(['GATE_DISABLED', 'NODE_VERSION', 'NOINDEX', 'PUBLIC_FORMSPREE_ID', 'PUBLIC_PHOENIX_VOICE']);
      expect(v.GATE_DISABLED, e).toBe('true');
      expect(v.NOINDEX, e).toBe(e === 'production' ? 'false' : 'true'); // launched: Production lets search engines in, previews stay blocked
      expect(v.PUBLIC_PHOENIX_VOICE, e).toBe(e === 'production' ? 'false' : 'true'); // the voice greeting is on in previews only
      expect(v.NODE_VERSION, e).toBe('22');
      expect(v.PUBLIC_FORMSPREE_ID, e).toMatch(/^[a-z0-9]{6,}$/);
      expect(v.PUBLIC_FORMSPREE_ID, e).not.toBe('FORMSPREE_FORM_ID');
    }
  });
  test('holds nothing secret: no password/token/key names, no top-level vars', () => {
    expect(cfg.vars).toBeUndefined();
    const names = ['production', 'preview'].flatMap((e) => Object.keys(cfg.env[e].vars));
    expect(names.filter((n) => /PASSWORD|SECRET|TOKEN|KEY/i.test(n))).toEqual([]);
  });
  test('the build picks the environment from the branch: main -> production, anything else -> preview', () => {
    expect(environmentFor({})).toBe('production');
    expect(environmentFor({ CF_PAGES_BRANCH: 'main' })).toBe('production');
    expect(environmentFor({ CF_PAGES_BRANCH: 'change/founder-section' })).toBe('preview');
    expect(resolveVars({ CF_PAGES_BRANCH: 'x' }).vars.NOINDEX).toBe('true');
  });
  test('the built site uses the Formspree ID from the file, not the placeholder', () => {
    const js = fs.readdirSync('dist/_astro').filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(`dist/_astro/${f}`, 'utf8')).join('\n');
    expect(js).toContain(`"${cfg.env.production.vars.PUBLIC_FORMSPREE_ID}"`);
    expect(js).toContain('formspree.io/f/');
    expect(js).not.toContain('FORMSPREE_FORM_ID');
  });
});
