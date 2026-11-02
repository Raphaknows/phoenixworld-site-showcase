import { execSync } from 'node:child_process';

/** Commit this build was made from: Cloudflare provides it; locally fall back to git, then "dev". */
export const BUILD_ID: string =
  process.env.CF_PAGES_COMMIT_SHA ??
  (() => {
    try {
      return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      return 'dev';
    }
  })();
