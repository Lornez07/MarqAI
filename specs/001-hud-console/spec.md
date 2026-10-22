# Spec: MarqAI HUD Console

**Status:** Draft — awaiting human review
**Baseline:** commit `364175b`, working tree modified (`src/App.tsx`, `src/index.css`, new `FilePatchTool.tsx`)

## Problem Statement

MarqAI is a visually distinctive JARVIS-style chat interface built on a Vite + React SPA. Under the HUD it is a single-screen chat wrapper with four structural weaknesses:

1. **It does not build or lint.** `src/index.css:2` imports `./assets/raphael_palette.css`, which does not exist. `npm run build` fails with `[postcss] ENOENT`. `npm run lint` reports 16 problems (13 errors).
2. **Both API keys ship to the browser.** `VITE_GEMINI_API_KEY` and `VITE_OPENROUTER_API_KEY` are inlined at build time; a Gemini-format key is present in `dist/assets/*.js`. Anyone with the URL can spend the quota.
3. **The interface reports data that is not real.** `Uptime 04:12:12` is a literal, `NEURAL_LOAD` and temperature are `Math.random()`, and the UI claims `Encrypted` and `SECURE COMPANION LINK` while calls go to third-party APIs. The only truthful number on screen is the model name, and it is hardcoded.
4. **Mobile and accessibility are unaddressed.** 0 `aria-*`, `role`, or `alt` attributes exist in `src/`. Below 900px the entire telemetry sidebar is `display: none` rather than redesigned. No `prefers-reduced-motion` despite constant glitch/flicker/scan/parallax animation.

This spec hardens the existing product without redesigning it: keys move server-side, responses stream and can be cancelled, telemetry becomes true, and the HUD becomes usable and accessible on a phone.

## Decision Required Before Implementation

The current copy contradicts itself: `SYSTEM_PROMPT` in `useMarqAI.ts` instructs *"without the HUD roleplay"*, while the UI is entirely HUD roleplay. Two viable directions:

| Option | Consequence |
|---|---|
| **A — Companion** (keep current framing) | Copy leans into the HUD; the product must earn it with a real capability, not chrome. |
| **B — Console** (tool framing) | HUD becomes instrumentation for real session data; copy drops "companion" and "secure link". |

This spec is written to work under either option. **Open question:** which one ships in v1? It changes copy, the sidebar's information architecture, and `design-anchor.md`.

## Target User

The owner-operator: a developer using one browser tab as a persistent AI session console — asking architecture questions, pasting code, and wanting to know which model answered, how fast, and what it cost in quota.

Secondary: anyone who opens a shared link. They must not be able to extract a key, and they must be able to use the app on a phone.

## Core User Journey

A user opens MarqAI, sees a truthful connection state, sends a message, watches the answer stream in with a visible model label and latency, cancels it if it is wrong, and returns later to find the session still there — on desktop or at 375px.

## Success Metrics

| Metric | Target | How measured |
|---|---|---|
| Build | `npm run build` exits 0 | CI + local |
| Lint | `npm run lint` exits 0, 0 errors | CI + local |
| Secret exposure | 0 key-pattern matches in `dist/` | `Select-String` gate in CI |
| Time to first token | < 1.5 s p50 (network permitting) | `meta.firstTokenMs` logged per request |
| Cancel | Abort reaches provider, partial text kept and marked | Manual test, unit test on abort path |
| Mobile | No horizontal scroll at 375px; chat + telemetry reachable | Playwright at 375×667 |
| Accessibility | 0 axe critical/serious; all controls named; reduced-motion honored | axe run + manual tab-through |
| First paint weight | Focal face image ≤ 150 KB; no single asset > 300 KB | Build asset report |

## Features: Must-Have (v1)

### 1. Server-side provider proxy
Move both keys to server-only env vars; the browser never sees them.
**Acceptance:** Given a production build with no `VITE_*` key present, When `dist/assets/*.js` is scanned for `AIza`/`sk-or-`, Then zero matches. Given a request to the chat endpoint, Then the provider call originates server-side.

### 2. Green build and lint
Fix the missing stylesheet import (restore the file or inline the tokens), remove `any` from `useSpeech.ts` via a typed minimal interface + `SpeechRecognition` global declaration.
**Acceptance:** Given a clean clone with `.env.local`, When `npm run build && npm run lint` runs, Then both exit 0 with no errors.

### 3. Streaming responses with cancel
Token deltas arrive over SSE; the user can stop generation mid-flight.
**Acceptance:** Given a sent message, When the provider responds, Then text appends incrementally (≥ 3 visible updates before completion). Given a click on stop during generation, Then the request aborts within 500 ms and the partial message remains, marked `cancelled`.

### 4. Truthful telemetry
Replace fabricated values with measured ones: responding model, provider, latency, token usage, request count for the session, last error reason.
**Acceptance:** Given 3 completed requests, When the sidebar is read, Then request count is 3, and each message exposes its model + latency. Given no network, Then the panel shows an explicit offline state — no random CPU/temperature/uptime values remain in `src/`.

### 5. Explicit failure states
Delete `getLocalResponse()` and the `SAFE_MODE_RESPONSES` pseudo-answers. Failures surface as a message-level error with retry, not as an AI utterance. A missing server key shows a configuration notice, not a chat message.
**Acceptance:** Given a 429 from every provider, When the send completes, Then the message shows an error state with a retry control and the reason. Given no keys configured, Then a config notice renders with setup steps.

### 6. Accessible HUD
Named icon buttons, visible focus rings, body text ≥ 4.5:1 contrast, status conveyed by text and icon (not color alone), `prefers-reduced-motion: reduce` disables glitch/flicker/scan/parallax/auto-rotation, and live regions announce streaming state.
**Acceptance:** Given keyboard-only navigation, When tabbing the whole app, Then every control is reachable with a visible focus indicator. Given reduced-motion, Then no infinite animation runs. Given a screen reader, Then mic/send/stop/clear have accessible names.

### 7. Mobile layout, not mobile amputation
At ≤ 900px, telemetry collapses into a toggleable drawer instead of disappearing; the face scales with `clamp()`/`vw` instead of a fixed 750px box; the header does not consume a third of the viewport.
**Acceptance:** Given 375×667, When the app loads, Then no horizontal overflow exists, the composer is visible without scrolling, and telemetry opens from a labeled control.

### 8. Asset and motion budget
Convert `hologram_face_processed.png` (804 KB) to WebP/AVIF with explicit dimensions and preload; delete unused `hero.png`, `react.svg`, `vite.svg`, `icons.svg`, `App.css` boilerplate; gate idle animations so they run only while generating or while the tab is visible; replace the CSS `@import` of Google Fonts with preconnected `<link>` tags.
**Acceptance:** Given a production build, When assets are inspected, Then the focal face image is ≤ 150 KB with `width`/`height` set, and no unreferenced asset ships. Given an idle app, Then no continuous transform animation consumes frames in the background tab.

### 9. Persistent sessions
Replace fragile `sessionStorage` read (unvalidated `JSON.parse`) with versioned `localStorage` persistence, a session list in the sidebar, and a guarded parse.
**Acceptance:** Given a reload after 3 messages, Then the conversation is intact. Given corrupted stored JSON, Then the app boots to an empty session instead of crashing. Given 2+ sessions, Then the sidebar lists them by derived title and switch works.

## Features: Out of Scope (NOT v1)

- Accounts, auth, multi-user tenancy, or usage billing
- `FilePatchTool` / `/api/generate-patch` — **delete for v1**; it targets an endpoint that does not exist
- Any visual redesign of the HUD language (palette, rings, face concept stay)
- New providers beyond Gemini + OpenRouter
- Message editing, branching, export, search
- File/image upload and vision input
- Voice improvements beyond keeping existing behavior working (wake word, continuous conversation)
- Tests beyond the unit/CI scope in `plan.md`
- Light theme

## Edge Cases & Error States

- **No server keys configured** → blocking config notice with the exact env var names, no chat input.
- **Primary provider down** → failover badge naming the provider that answered; no silent degradation.
- **All providers rate-limited (429)** → error state + retry after a surfaced cooldown; retain the user's text in the composer.
- **Abort mid-stream** → partial text preserved, marked `cancelled`, retry offered.
- **Network drop mid-stream** → same as abort but labeled as a connection error.
- **Corrupted persisted state** → discard and start clean; never crash on boot.
- **Browser lacks SpeechRecognition** → voice button disabled with tooltip; chat unaffected. (Currently the app warns only to the console.)
- **Very long conversation** → history window (last 10 turns) retained, oldest dropped, and the truncation stated in telemetry.
- **Tab backgrounded mid-stream** → stream continues, no animation frames burned.
- **Reduced motion + streaming** → state changes still announced via live region, no pulsing.

## Non-Goals for the HUD Metaphor

The interface must stop asserting things that are false. Specifically, `Encrypted`, `SECURE COMPANION LINK`, `SYSTEM REBOOT INITIATED`, uptime, CPU load, and temperature either become real measurements or are reworded/removed. Decorative motion is acceptable; decorative **claims** are not.
