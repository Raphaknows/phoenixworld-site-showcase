# Case study: phoenixworld.ai

## Problem
A studio that sells automation and AI to freight and logistics companies needs a site that *shows* the work instead of describing it. It also had to: run on free hosting with no paid add-ons, work on phones, score well on accessibility and SEO, stay private until launch, and then be indexable on the real domain only (never on preview URLs).

## Stack
- Astro 6 (static), TypeScript
- Three.js, as one lazy client island
- Cloudflare Pages (Git integration) plus a Pages Function for headers and an optional password gate
- Formspree for the audit form; Cloudflare Web Analytics injected at the edge
- Playwright (Chromium, plus a WebKit iPhone project during the voice work)

## Architecture
- Static pages. The WebGL stage loads after first paint and only when WebGL exists; otherwise the page runs in a no-WebGL state.
- The stage only ever steps down in quality (13,000, 6,000, then 2,500 particles), using a software-renderer check at start and a frame-rate check after the intro.
- All environment switches live in the committed `wrangler.json`, per environment, and the build picks the environment from the branch (`scripts/pages-config.mjs`).
- Edge middleware: a constant-time password gate that fails closed (kept in code, switched off), and `X-Robots-Tag: noindex` on every `*.pages.dev` host.
- Launch guards (`launch-check`, `launch-guard`) fail the build while any placeholder text is on the site.
- A voice greeting sits behind a build-time feature flag (off in production), so the production bundle contained none of its code, and a test enforced that.

## Testing approach
- Around 230 Playwright tests: content and DOM, calculator, blueprints, deep links, form, stage tiers and fallbacks, SEO, build stamp, per-environment config, and the gate.
- The gate is tested twice: as pure logic, and on the real Pages runtime (`wrangler pages dev`).
- The Formspree call is mocked in tests; a real submission was verified once, live, by hand.
- Where a guard mattered, I removed it on purpose to confirm the matching test failed (mutation check).
- After every merge to main: the full suite plus live checks against the deployed site and Lighthouse (accessibility, best practices and SEO at 100).
- A flaky test is investigated for its cause, never rerun until it passes.

## The three hardest bugs

### 1. Dashboard environment variables never reached the build
The password gate failed five times in a row. The password was set in the Cloudflare dashboard, but those variables never reached the deployed Pages build, so the site behaved as if they didn't exist.

Fix: stop depending on the dashboard for configuration. Everything lives in the committed `wrangler.json`, split into `production` and `preview`, chosen by branch at build time. A test checks both environments: the same variables in each, nothing secret, and the right value per environment (for example `NOINDEX` is `false` only in production).

Lesson: configuration you can't diff or test is configuration you can't trust. Secrets are the exception, and they stay in the dashboard as secrets.

### 2. Audio that played everywhere except an iPhone
The greeting was silent on a real iPhone while desktop browsers were fine. Several causes stacked up: `play()` was not called synchronously inside the user's tap, iOS silent mode muted web audio, and the audio element was created too late.

Fix: the tap itself calls `play()` before anything is awaited, `navigator.audioSession.type` is set to `playback`, and one audio element is created early with its source already set. I also added a debug readout (`?voicedebug=1`) that shows readiness, the result of `play()`, storage keys and events, so the problem could be diagnosed on the device itself instead of guessed at. A WebKit iPhone test project covers the tap path.

Result: confirmed on a real iPhone, where tap-triggered playback works.

Lesson: build the on-device diagnostic first, before guessing at causes.

### 3. The calculator submitted numbers the visitor never entered
An untouched calculator still showed its defaults (a $120,000 estimate), and the audit form sent them as if the visitor had typed them.

Fix: the form sends `calculator_estimate: "Not used"` unless the visitor actually interacted with the calculator, and the estimate summary line stays hidden until then. Both paths are tested: untouched (must send "Not used" and never contain the default figure) and used (must send the real estimate).

Lesson: a default is not an answer. Track whether the user acted, not just what the field contains.

## What I'd do differently
- Put environment configuration in the repository from day one, not after the dashboard approach failed.
- Add a diagnostic readout and a real-device check at the start of any feature that depends on browser policy (audio, permissions).
- Test the empty-input path of every form feature alongside the happy path.
- Keep a short decision log in the repo instead of leaving decisions in chat and memory.

## Results
Live at phoenixworld.ai. Lighthouse accessibility, best practices and SEO all score 100; performance is 66 on mobile and 67 on desktop, measured with a software WebGL renderer. A real form submission was verified end to end.
