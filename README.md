# phoenixworld-site

Source of [phoenixworld.ai](https://phoenixworld.ai), the marketing site for Phoenix World, an automation and AI studio for freight and logistics. This repository is a **showcase copy** (single commit, no history). The story behind it is in [CASE_STUDY.md](CASE_STUDY.md).

## What it is

A static site with one interactive WebGL scene: a particle phoenix that moves between ashes, phoenix and lattice as you scroll. Around it: a cost calculator, a library of ten workflow blueprints, personal links (`#for-<company>`), and an audit request form.

## Stack

- Astro 6 (static output), TypeScript
- Three.js, loaded as one lazy client island after first paint, and only if WebGL exists
- Cloudflare Pages (Git deploys) with a small Pages Function for headers and an optional password gate
- Formspree for the form (client-side POST, honeypot)
- Playwright for tests

## Run it

Node 22.12 or newer.

```
npm install
cp .env.example .env     # set PUBLIC_FORMSPREE_ID to your own Formspree form ID
npm run dev
```

Build and preview: `npm run build && npm run preview`.

## Tests

```
npx playwright install chromium webkit
npm test
```

Playwright runs a Chromium project and a WebKit iPhone project. It builds the site, serves it on port 4321 (plus a flag-on build on 4322 for the voice tests) and runs the suite: calculator, blueprints, personal links, form (Formspree mocked), stage quality tiers and fallbacks, SEO, build stamp, deploy config per environment, and the gate (as logic and on the real Pages runtime through `wrangler pages dev`). `npm run launch:check` fails while any `[placeholder]` is on the built site.

## Configuration

`wrangler.json` holds the per-environment switches (`production` / `preview`), selected from the branch at build time by `scripts/pages-config.mjs`:

| Variable | Meaning |
|---|---|
| `GATE_DISABLED` | `true` turns the password gate off |
| `NOINDEX` | `false` lets search engines index (production only) |
| `PUBLIC_FORMSPREE_ID` | Formspree form ID (public by design) |
| `PUBLIC_PHOENIX_VOICE` | `true` includes the voice greeting (off in production) |
| `NODE_VERSION` | Node version for the build |

`PREVIEW_PASSWORD` is only needed if the gate is switched on, and then it is a Cloudflare secret, never a file.

## Voice greeting (preview builds only)

Behind the build flag `PUBLIC_PHOENIX_VOICE` (`"false"` in production, `"true"` in previews). Clicking or tapping the phoenix plays a short spoken greeting with captions; later taps emit a `phoenix:talk` event for a conversation layer that is not part of this repository. `?voicedebug=1` on a preview build shows an on-device diagnostic readout.

`public/audio/greeting-en.mp3` here is a **2-second silent placeholder**. The real recording is not included. The tests run against the placeholder.

## Stage quality tiers

The stage picks a particle density and only ever steps down: 13,000 particles, then 6,000, then 2,500. A software renderer or a small viewport starts lower; a frame-rate check after the intro steps down once more if needed. `?tier=0|1|2` forces a tier.

## Rights

This repository is shared for portfolio review. Code, design and brand assets © Phoenix World. All rights reserved — not licensed for reuse.
