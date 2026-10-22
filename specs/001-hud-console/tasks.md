# Tasks: MarqAI HUD Console

Tasks are ordered by dependency. One at a time; verify before the next.

**Status key:** `[x]` done + verified · `[~]` partially done · `[ ]` not started · `[!]` blocked on a decision

---

## Task 0: Identity decision + design anchor `[x]`
- **Inputs:** `spec.md` (Option A/B), `src/index.css`, `HolographicFace.tsx`, `MarqHUD.tsx`
- **Outputs:** `design-anchor.md`
- **Decision:** Option B — Console. HUD is instrumentation; claims must be true.
- **Verification:** Anchor names palette, type, signature elements, motion budget, banned list, breakpoints, required states.

## Task 1: Green build `[x]`
- **Inputs:** `src/index.css`
- **Outputs:** removed `@import './assets/raphael_palette.css'` (file never existed; tokens already live in `:root`)
- **Verification:** `npm run build` → exit 0, `✓ built in 5.69s`, emits `dist/index.html` + assets.

## Task 2: Zero lint errors `[x]`
- **Inputs:** `useSpeech.ts`, `useHolographicAudio.ts`, `useMarqAI.ts`, `ChatInterface.tsx`, `SystemData.tsx`
- **Outputs:** typed Web Speech structural interfaces (no `any`), `errorMessage(unknown)` helper, typed `CodeBlockProps`, deterministic waveform constants replacing `Math.random()` during render, `synth` read inside callbacks (clears 3 exhaustive-deps warnings)
- **Verification:** `npm run lint` → exit 0, 0 problems (was 16: 13 errors, 3 warnings).

## Task 3: Remove dead UI surface `[x]`
- **Inputs:** `src/App.tsx`, `src/components/FilePatchTool.tsx` (untracked user work)
- **Outputs:** component archived to `scratch/FilePatchTool.tsx` (gitignored, recoverable), removed from the sidebar. It posted to `/api/generate-patch`, which does not exist, and rendered unstyled white inputs inside the HUD.
- **Verification:** production preview, `title: "MarqAI"`, 10 `.hud-panel` nodes, 0 console errors; white input boxes gone from the sidebar. `FilePatchTool` decision still open: rebuild against a real endpoint or delete permanently.

## Task 4: Server-side key proxy `[x]`
- **Inputs:** `.env.local` (`VITE_GEMINI_API_KEY`, `VITE_OPENROUTER_API_KEY`), `src/hooks/useMarqAI.ts`, `plan.md` §API
- **Outputs:** `api/chat.ts` (Node runtime, SSE, same-origin guard, validation, per-attempt connect timeout, 45s budget), `.env.example`, `vite.config.ts` dev adapter so `npm run dev` serves `/api/chat`, keys renamed to `GEMINI_API_KEY` / `OPENROUTER_API_KEY`, `@google/generative-ai` uninstalled
- **Verification:**
  - `npm run build` → **0** key-pattern matches in `dist/assets/*.js` (was 1); 0 `import.meta.env` references in `src/`
  - Harness (`scratch/proxy-harness.mjs`): `status 200`, `meta` → `delta` → `done` with real usage, including live failover (Gemini 503 → OpenRouter 404 → third model streamed)
  - Validation: empty `messages` → `400 INVALID_REQUEST`
  - **Deployed (2026-10-23):** `https://marq-ai.vercel.app/api/chat` → `200 text/event-stream`, `meta` → `delta` → `done`, `latencyMs 2866`, real token usage; production bundle `/assets/index-CHMosoAB.js` → **0** key matches; function logs show a valid Gemini key (503 high-demand, not auth failure) failing over to OpenRouter
  - Old deployment URLs still serve the revoked-key bundle; rotation makes them inert

## Task 5: Client streaming + cancel `[x]`
- **Inputs:** `plan.md` §Client seam, `src/hooks/useMarqAI.ts`
- **Outputs:** `src/lib/llm/types.ts`, `src/lib/llm/client.ts`, rewritten `useMarqAI`; `Message.status` (`streaming | done | cancelled | error`) + `meta`; stop control replaces send while generating
- **Verification (Playwright against `npm run dev`):** reply streamed token-by-token; send button became `Stop generating`; stopping kept 447 chars of partial text and rendered `STOPPED`; 0 console errors

## Task 6: Real telemetry `[x]`
- **Inputs:** `SystemData.tsx`, `App.tsx`, `useMarqAI.ts`
- **Outputs:** fake CPU/temp generator deleted; `Uptime 04:12:12`, `v3.5.Companion`, `NEURAL_LOAD`, `CORE_THERMAL`, `Encrypted`, `SECURE COMPANION LINK` removed. Panel now shows `REQUESTS`, `LAST_LATENCY` (`--` when unknown), `LINK: STABLE/DEGRADED`, model id; header shows requests + model; `shortModel()` truncates ids with full id in `title`
- **Verification:** after one completed request `REQUESTS 1`, `LAST_LATENCY 16407MS`, `MODEL nemotron-3-ultra-550b-a55b`; grep for the removed strings → 0 matches; `Math.random` no longer in render
- **Known gap:** token usage is captured from providers but not surfaced yet

## Task 7: Failure states, remove fake brain `[x]`
- **Inputs:** `useMarqAI.ts` (`getLocalResponse`, `SAFE_MODE_RESPONSES`), `ChatInterface.tsx`
- **Done:** canned fallback deleted; message-level error bubble with code, reason, and Retry; 503 `NOT_CONFIGURED` reaches the UI as an error with retry; corrupt `sessionStorage` no longer crashes boot
- **Also done:** `GET /api/chat` reports which providers are configured (presence only); `ConfigNotice` blocks the relay and names `GEMINI_API_KEY` / `OPENROUTER_API_KEY` before the first message; composer + send disabled while unconfigured; 429 shows a rate-limit hint and a Retry countdown when the provider sends `Retry-After` (server forwards it as `retryAfterMs`)
- **Verification:** mocked `GET` → `NO PROVIDER KEYS`, input `disabled`, placeholder `Chat disabled — no provider keys`, axe 0 violations. Mocked 429 SSE frame → hint text, button `RETRY IN 5S` disabled → `RETRY IN 3S` after 2.2s. Client test asserts `NOT_CONFIGURED` is not retryable (bug found by the test).

## Task 8: Session persistence `[x]`
- **Inputs:** `useMarqAI.ts` (`sessionStorage` + unguarded `JSON.parse`)
- **Done:** corrupt/foreign JSON is discarded instead of crashing; write failures are swallowed
- **Also done:** `src/lib/sessions.ts` (versioned `marq:v1:sessions`, 20-session cap, title from first user message, newest-first order), `SessionList` in the sidebar/drawer with `aria-current`, New session button, migration from legacy `marq_history`; storage moved to `localStorage` so history survives a closed tab
- **Verification:** reload restored 3 messages and the session title; New → 2 sessions, 1 bubble; switching back restored the original 3 bubbles; `localStorage` holds exactly `marq:v1:sessions`. Tests: 9 session-store cases + 3 hook boot cases.

## Task 9: Accessibility pass `[x]`
- **Inputs:** all components, `index.css`
- **Outputs:** `aria-label` on mic/send/stop/clear/drawer, `aria-live="polite"` on the stream, visible `:focus-visible`, body copy off cyan, 12px floor with ≥70% opacity, `prefers-reduced-motion` block, status dot + word
- **Verification:** axe → 0 critical/serious; keyboard-only tab pass reaches every control with a visible ring; reduced-motion run shows no infinite animation.
- **Result:** axe-core 4.10.2 → 0 violations at 1440 and 375 (was 2 moderate landmark errors). Focus rings measured on voice/clear/reset/input (`solid 2px rgb(34,211,238)`). Under emulated `prefers-reduced-motion: reduce`: `.scanner-overlay`/`.data-stream-layer` animation `none`, 12 animated transforms unchanged over 1 s (`MotionConfig reducedMotion="user"`). Body copy moved to `--marq-text`; decorative layers now `aria-hidden`.

## Task 10: Mobile layout, not amputation `[x]`
- **Inputs:** `App.tsx` (`mobile-hide`), `index.css` media queries, `HolographicFace.tsx` (750px fixed)
- **Outputs:** telemetry drawer with labeled toggle, `clamp()` face sizing, compressed 375px header
- **Verification:** Playwright 375×667: `.hud-panel` reachable via drawer, composer inside viewport (currently `bottom: 650/667`), `scrollWidth === clientWidth`, header ≤ 25% of viewport.
- **Result:** 375×667 measured — header 114 px (17 %), composer bottom 650/667, `scrollWidth 375 === clientWidth 375`, face `min(750px, 100%, 78vh)`. `Telemetry` toggle (`aria-expanded`/`aria-controls`) opens a labelled drawer (`visibility/transform`), Escape and backdrop close it, axe 0 violations with drawer open. Root overflow cause was grid `min-width: auto`; fixed with `min-width: 0` on the grid + children.

## Task 11: Asset + motion budget `[x]`
- **Inputs:** `src/assets/hologram_face_processed.png` (823 KB), `App.css`, `react.svg`, `vite.svg`, `hero.png`, `public/icons.svg`, `index.css`
- **Outputs:** WebP focal face ≤ 150 KB at identical dimensions, no third-party render-blocking CSS, dead files removed, loops paused when hidden
- **Result:** `hologram_face_processed.png` (823.4 KB) → `/hologram_face.webp` **144.5 KB at 1024×1024** (sharp q62, dev dependency only). Moved to `public/` and preloaded from `index.html` (`rel=preload`, `fetchpriority=high`) so the LCP image is not discovered late. Google Fonts `@import`/stylesheet replaced with self-hosted variable WOFF2 (Space Grotesk 22.3 KB + JetBrains Mono 31.4 KB, `font-display: swap`); `document.fonts.check()` confirms both load. Deleted `App.css`, `hero.png`, `hologram_face.png`, `react.svg`, `vite.svg`, `public/icons.svg` (0 references); roboto/`Inter` never used. `html[data-page-hidden='true']` pauses scanline, data-stream, flicker, avatar and neural loops; boot shortened 700 → 300 ms (anchor limit 1.2 s).
- **Verification:** `npm run verify` green; Lighthouse 12 (mobile, `vite preview`): **performance 89**, accessibility 100, best-practices 100, SEO 100, LCP 3.5 s, FCP 2.1 s, TBT 30 ms, CLS 0.004, 0 console errors. Before the image/font work the same setup scored 83–87 with a 404 console error.

## Task 12: CI + tests `[x]`
- **Inputs:** `package.json`, `.github/workflows/`
- **Outputs:** Vitest + Testing Library config and the four test files from Task 5/8; workflow: install → typecheck → lint → test → build → secret grep
- **Result:** `vitest.config.ts` (jsdom, `src/**` + `api/**`), `src/lib/llm/client.test.ts` (SSE split frames, error frame + cooldown, HTTP→`ChatError` mapping, abort), `api/chat.test.ts` (Gemini 503 → OpenRouter stream failover, 503 `NOT_CONFIGURED`, invalid body, all-providers-fail 429 + `Retry-After`, GET config), `src/lib/sessions.test.ts` (boot, restore, corrupt JSON, unknown version, legacy migration, 20-cap, titles), `src/hooks/useMarqAI.test.tsx` (storage boot, fresh state, unconfigured probe). **23 tests / 4 files pass.** `npm run verify` = typecheck → lint → test → build → secrets. Workflow `.github/workflows/ci.yml` runs the same chain.
- **Verification:** `npm run verify` exit 0. Reintroducing `VITE_GEMINI_API_KEY` in `src/lib` → `Secret check failed: src\lib\__secret_probe.ts: VITE_-prefixed secret`, exit 1; removing it → exit 0. Workflow run itself is **not yet green on GitHub** — nothing is pushed; pushing needs your go-ahead.
