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

## Task 7: Failure states, remove fake brain `[~]`
- **Inputs:** `useMarqAI.ts` (`getLocalResponse`, `SAFE_MODE_RESPONSES`), `ChatInterface.tsx`
- **Done:** canned fallback deleted; message-level error bubble with code, reason, and Retry; 503 `NOT_CONFIGURED` reaches the UI as an error with retry; corrupt `sessionStorage` no longer crashes boot
- **Remaining:** pre-flight blocking config panel when the server has no keys; retry backoff hint on 429; "no keys" copy must name the env vars in the UI
- **Verification so far:** injected 503 → bubble text `NOT_CONFIGURED · REQUEST FAILED / No provider keys are configured on the server. / RETRY`, retry button present (`count 1`)

## Task 8: Session persistence `[~]`
- **Inputs:** `useMarqAI.ts` (`sessionStorage` + unguarded `JSON.parse`)
- **Done:** corrupt/foreign JSON is discarded instead of crashing; write failures are swallowed
- **Remaining:** `src/lib/sessions.ts` with versioned `marq:v1:sessions`, session list in sidebar, 20-session cap, migration from `marq_history`
- **Verification so far:** guarded parse shipped; reload keeps history; session switching not implemented

## Task 9: Accessibility pass
- **Inputs:** all components, `index.css`
- **Outputs:** `aria-label` on mic/send/stop/clear/drawer, `aria-live="polite"` on the stream, visible `:focus-visible`, body copy off cyan, 12px floor with ≥70% opacity, `prefers-reduced-motion` block, status dot + word
- **Verification:** axe → 0 critical/serious; keyboard-only tab pass reaches every control with a visible ring; reduced-motion run shows no infinite animation.

## Task 10: Mobile layout, not amputation
- **Inputs:** `App.tsx` (`mobile-hide`), `index.css` media queries, `HolographicFace.tsx` (750px fixed)
- **Outputs:** telemetry drawer with labeled toggle, `clamp()` face sizing, compressed 375px header
- **Verification:** Playwright 375×667: `.hud-panel` reachable via drawer, composer inside viewport (currently `bottom: 650/667`), `scrollWidth === clientWidth`, header ≤ 25% of viewport.

## Task 11: Asset + motion budget `[!]`
- **Inputs:** `src/assets/hologram_face_processed.png` (823 KB), `App.css`, `react.svg`, `vite.svg`, `hero.png`, `public/icons.svg`, `index.css`
- **Outputs:** WebP/AVIF focal face ≤ 150 KB at identical dimensions, `@import` → `<link rel="preconnect">`, delete 5 unreferenced files, pause loops on `visibilitychange`
- **Verification:** build asset report: largest image ≤ 150 KB; Lighthouse mobile ≥ 85.
- **Blocker:** no image encoder on this machine (`magick`, `ffmpeg`, `cwebp` all absent). Needs approval to add `sharp` as a **dev** dependency, or you convert externally. I will not add it unasked.

## Task 12: CI + tests
- **Inputs:** `package.json`, `.github/workflows/`
- **Outputs:** Vitest + Testing Library config and the four test files from Task 5/8; workflow: install → typecheck → lint → build → secret grep → test
- **Verification:** workflow run green on a pushed branch; deliberately reintroduce a `VITE_` key in `src/lib` → CI fails on the grep gate.
