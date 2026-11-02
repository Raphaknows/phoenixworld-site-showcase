import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { resolveVars } from './scripts/pages-config.mjs';

// Build-time PUBLIC_* values come from the committed wrangler.json, not from the dashboard.
for (const [key, value] of Object.entries(resolveVars().vars)) if (key.startsWith('PUBLIC_')) process.env[key] = String(value);

export default defineConfig({
  site: 'https://phoenixworld.ai',
  integrations: [sitemap()],
});
