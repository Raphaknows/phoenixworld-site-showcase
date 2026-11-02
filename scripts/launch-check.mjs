// Launch gate: fails (exit 1) while any "[...]" placeholder is still visible on a built page.
// Run after `npm run build`:  npm run launch:check
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const KNOWN = ['TIMELINE', 'X', 'PHOTO', 'CONTACT EMAIL', 'RETENTION PERIOD'];
const ATTRS = ['alt', 'title', 'aria-label', 'placeholder', 'content', 'value'];
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'");

/** Placeholders a visitor can read in one HTML document: visible text plus readable attributes. */
export function findPlaceholders(html) {
  const body = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  const text = body.replace(/<[^>]*>/g, ' ');
  const attrs = [...body.matchAll(new RegExp(`\\b(?:${ATTRS.join('|')})="([^"]*)"`, 'gi'))].map((m) => m[1]).join('\n');
  const hits = new Set();
  for (const m of decode(text + '\n' + attrs).matchAll(/\[[^\][\n]{1,80}\]/g)) hits.add(m[0]);
  return [...hits];
}

/**
 * Known placeholder tokens baked into scripts (e.g. the form's error message). A token right after an
 * identifier, `]` or `)` is array indexing in bundled code (`z[X]`), not a placeholder in a string.
 */
export function findScriptPlaceholders(js) {
  return KNOWN.map((k) => `[${k}]`).filter((t) => new RegExp(`(?<![\\w$\\])])${t.replace(/[[\]]/g, '\\$&')}`).test(js));
}

const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

/** Every placeholder in a built site, as [relative file, token] pairs. */
export function scanDist(dist) {
  const found = [];
  for (const file of walk(dist)) {
    const rel = relative(dist, file);
    if (file.endsWith('.html')) for (const t of findPlaceholders(readFileSync(file, 'utf8'))) found.push([rel, t]);
    else if (file.endsWith('.js')) for (const t of findScriptPlaceholders(readFileSync(file, 'utf8'))) found.push([rel, t]);
  }
  return found;
}

/** Message naming each placeholder and where it is (not just a count). */
export function report(found) {
  const byToken = new Map();
  for (const [f, t] of found) byToken.set(t, [...(byToken.get(t) ?? []), f]);
  return [...byToken].map(([t, files]) => `  ${t.padEnd(44)} ${files.join(', ')}`).join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const found = scanDist(process.argv[2] ?? 'dist');
  if (found.length) {
    console.error(`LAUNCH BLOCKED: ${found.length} placeholder(s) still on the built site:\n\n${report(found)}`);
    process.exit(1);
  }
  console.log('Launch check passed: no [placeholder] text in the built site.');
}
