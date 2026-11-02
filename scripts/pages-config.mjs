// Reads the committed Cloudflare Pages config (wrangler.json): the one place the site's switches live.
// Nothing secret goes in it. Cloudflare uses its "vars" at runtime; the build reads it here.
import { existsSync, readFileSync } from 'node:fs';

/** "production" for the production branch (and local builds), "preview" for every other branch Cloudflare builds. */
export function environmentFor(env = process.env) {
  const branch = env.CF_PAGES_BRANCH; // set by Cloudflare Pages; unset for local builds
  return !branch || branch === (env.PRODUCTION_BRANCH ?? 'main') ? 'production' : 'preview';
}

export function readPagesConfig(path = process.env.PAGES_CONFIG ?? 'wrangler.json') {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
}

/** The vars for this build's environment, straight from the file (dashboard values do not override them). */
export function resolveVars(env = process.env) {
  const environment = environmentFor(env);
  return { environment, vars: readPagesConfig(env.PAGES_CONFIG).env?.[environment]?.vars ?? {} };
}
