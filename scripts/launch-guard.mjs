// Runs at the end of `npm run build`. The real launch is the moment search engines are let in
// (NOINDEX=false in the Production section of wrangler.json); a build in that state must not contain any
// [placeholder] text. Preview builds, and any build while NOINDEX is on, are not checked.
import { fileURLToPath } from 'node:url';
import { resolveVars } from './pages-config.mjs';
import { report, scanDist } from './launch-check.mjs';

/**
 * True when this build is the live site with indexing allowed: Production, and NOINDEX is "false" in wrangler.json.
 * Same rule as noindexOn() in src/gate/gate.ts. Preview builds are never enforced.
 */
export function enforces(env = process.env) {
  const { environment, vars } = resolveVars(env);
  return environment === 'production' && vars.NOINDEX === 'false';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = process.argv[2] ?? 'dist';
  if (enforces()) {
    const found = scanDist(dist);
    if (found.length) {
      console.error(
        `\nBUILD FAILED: NOINDEX=false would open the site to search engines, but ${found.length} placeholder(s) are still on it:\n\n${report(found)}\n\n` +
          'Fill them in, or set Production NOINDEX to \"true\" in wrangler.json to keep the site out of search engines.\n',
      );
      process.exit(1);
    }
    console.log('launch-guard: indexing is on and no placeholders found.');
  }
}
