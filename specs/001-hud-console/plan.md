# Plan: MarqAI HUD Console

Companion to `spec.md`. No implementation starts until this plan is approved and the identity decision (Option A vs B) is made.

## Architecture

### Current shape
```
index.html → main.tsx → App.tsx (293 lines: layout + inline styles + all wiring)
                            ├── useMarqAI (219 lines: transport + persona + telemetry + session)
                            ├── useSpeech, useHolographicAudio
                            └── 6 presentational components, 0 tests
Provider keys ──► VITE_* ──► inlined into client bundle ──► direct calls to Google / OpenRouter
```

### Target shape
```
Browser
  App (layout only)
   ├── Header        (identity, connection badge, session actions)
   ├── MessageList   (streaming, error, cancelled, reduced-motion states)
   ├── Composer      (input, mic, send/stop, retry)
   └── Sidebar       (sessions, telemetry drawer on mobile)
  Hooks
   ├── useChat      (message state machine, abort, persistence)
   ├── useTelemetry (real counters only)
   ├── useSpeech    (typed, existing behavior)
   └── useHolographicAudio (unchanged, gated on user gesture)
  lib/llm/client.ts  ──fetch──► /api/chat (SSE)
                                   │
Server (Vercel function)           ▼
  key-guard → provider chain (Gemini → OpenRouter) → SSE passthrough
  keys read from server env only, never serialized to the client
```

**Boundaries:** the client knows nothing about provider URLs or keys; it speaks one SSE contract. Provider failover, timeouts, and backoff live in the function. This makes the chain testable with `fetch` mocked at one seam instead of three.

### Module split (replaces `useMarqAI.ts`)
| Module | Responsibility | Approx. size |
|---|---|---|
| `src/lib/llm/types.ts` | `ChatMessage`, `ChatMeta`, `StreamEvent` | 40 lines |
| `src/lib/llm/client.ts` | SSE parse, abort, error normalization | 90 lines |
| `src/hooks/useChat.ts` | message state machine + persistence | 120 lines |
| `src/hooks/useTelemetry.ts` | model, latency, tokens, request count, last error | 40 lines |
| `src/lib/sessions.ts` | versioned storage, guarded parse, title derivation | 70 lines |
| `api/chat.ts` | auth-free proxy, provider chain, SSE writer | 160 lines |

`App.tsx` should end under 120 lines, with layout in `App.css` classes rather than fresh inline style objects per render.

## Data Model

```ts
type Provider = 'gemini' | 'openrouter';

type MessageStatus = 'streaming' | 'done' | 'error' | 'cancelled';

interface Message {
  id: string;               // crypto.randomUUID()
  role: 'user' | 'assistant';
  text: string;             // accumulates during streaming
  status: MessageStatus;
  createdAt: number;
  meta?: {
    model: string;          // e.g. "gemini-flash-latest"
    provider: Provider;
    latencyMs?: number;
    firstTokenMs?: number;
    promptTokens?: number;
    completionTokens?: number;
  };
  error?: { message: string; retryable: boolean };
}

interface Session {
  id: string;
  title: string;            // derived from first user message, 60 chars
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  requestCount: number;
}
```

**Storage:** `localStorage` key `marq:v1:sessions` holding `{ version: 1, activeId, sessions[] }`. Max 20 sessions, oldest evicted by `updatedAt`. Parse wrapped in `try/catch` + shape validation; any failure discards state and boots empty. Migrate the existing `sessionStorage.marq_history` once, then delete the key.

**Why `localStorage` over IndexedDB:** payloads are small text (a few hundred KB worst case), the read is synchronous at boot, and there is no binary data in v1. Revisit only if attachments land.

**History window:** last 10 turns sent to the provider, computed server-side from the posted array so client and server cannot disagree about truncation.

## API / Interface Design

### `POST /api/chat`
Request:
```json
{ "messages": [{ "role": "user", "content": "..." }], "sessionId": "uuid" }
```
Validation: ≤ 30 messages, ≤ 8k chars each, roles restricted, `sessionId` present. Reject with `400 { error, code }` on violation.

Response: `200 text/event-stream`
```
event: meta      data: {"model":"gemini-flash-latest","provider":"gemini"}
event: delta     data: {"text":"partial "}
event: done      data: {"latencyMs":1180,"firstTokenMs":420,"promptTokens":812,"completionTokens":240}
event: error     data: {"message":"rate limited","code":"RATE_LIMITED","retryable":true}
```
Rules:
- One `meta` event before the first `delta`, one terminal `done` **or** `error` event. Never both.
- `Cache-Control: no-store`, `X-Accel-Buffering: no`.
- Client abort closes the upstream reader (verify with an abort test).
- Provider chain order: Gemini → OpenRouter free models → `error`. Each attempt gets an 8 s connect timeout and 45 s total; a 429 moves to the next model immediately, a 5xx retries once with 500 ms backoff.
- No keys in the response body, headers, or logs. Error messages are mapped: upstream detail goes to server logs, user-facing text stays generic plus a code.

### Client seam
```ts
streamChat(
  messages: { role: 'user' | 'assistant'; content: string }[],
  opts: { signal: AbortSignal; onMeta; onDelta; onDone; onError }
): Promise<void>
```
Single place that owns `fetch`, `ReadableStream` decoding, and error mapping. Everything else is pure state.

## Dependencies

**Remove:** `@google/generative-ai` (deprecated, and no longer needed in the browser), `highlight.js` direct dependency if `rehype-highlight` already bundles it (verify before removing).

**Add:** `@google/genai` (server-side only), `@vercel/node` types for the function. Nothing else.

**Avoid adding** `zod`, a state library, or a UI kit: one request shape and one reducer do not justify the bundle weight. Hand-rolled validation for a 10-line schema is cheaper and reviewable.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Key rotates and is pasted into a client file again | Re-exposure | CI grep gate on `dist/` + `.env.example` documenting server-only vars; a lint rule denying `import.meta.env.VITE_` outside `lib/` |
| Streaming breaks behind a host that buffers | No visible streaming in prod | `X-Accel-Buffering: no`; verify on the deployed URL, not just `vite dev`; fallback to non-streaming if `delta` count stays 0 |
| Free-tier rate limits make the app feel broken | Users blame the app | Surface provider + retryable code; cooldown copy; never fake an answer |
| Abort leaves a hung upstream connection | Cost, leaked sockets | Explicit `reader.cancel()` + abort test asserting the fetch signal fired |
| Fixing motion/accessibility flattens the identity | Product loses what made it good | Anchor locks which effects are signature (face parallax, rings) vs incidental (flicker strobe); only incidental ones are gated |
| WebP conversion degrades the focal face | Visual regression | Keep PNG as source, ship WebP with `sizes`/`width`/`height`, compare screenshots at 1440 and 375 |
| 804 KB image is referenced by parallax layers expecting exact crop | Layout break | Convert at identical dimensions; verify layer alignment in a before/after screenshot |
| Session persistence schema drift | Data loss on future edits | `version` field + discard-and-reboot policy; never partially migrate |
| Scope creep into a redesign | Never ships | Spec's out-of-scope list is binding; the design anchor decides visual questions |

## Design Anchor Gate

The workspace contract requires `design-anchor.md` before UI work, and none exists for MarqAI (the root one covers Portfolio v2). **Blocking:** the anchor cannot be written until Option A/B is chosen, because it must state whether the HUD is roleplay or instrumentation.

The anchor must capture what already works — `#22d3ee` cyan on `#030712`, Space Grotesk + JetBrains Mono, sharp clipped chat bubbles, scanline overlays — and add an explicit banned list for this project: no fabricated telemetry, no strobe, no cyan body text, no 750px fixed elements, no unlabeled icon buttons.

## Stack Justification

- **Keep Vite SPA.** No routing, no SSR, no SEO need. Migrating to Next.js would buy a server runtime this app needs exactly one endpoint of — and cost a rewrite mid-hardening.
- **Vercel functions for the proxy.** The project already deploys to Vercel (`marqai.vercel.app` in the CORS header), so `/api/chat` is zero new infrastructure. Prefer the Node runtime over Edge for predictable streaming and easier local testing with `vercel dev`; revisit if cold starts dominate.
- **SSE over WebSockets.** One-directional token flow, works over plain HTTP, no connection state to manage.
- **`localStorage` over IndexedDB.** Small text payloads, synchronous boot read, no migration machinery needed.
- **No test framework beyond Vitest + Testing Library.** Two seams matter: the SSE client and the provider chain. Full component coverage would cost more than it catches for a single-view app.

## Verification Strategy

1. `npm run build`, `npm run lint`, `tsc --noEmit` — all exit 0.
2. CI workflow on push: install, build, lint, secret grep, Vitest.
3. Unit tests: SSE chunk splitting across boundaries, abort, error mapping, provider failover with mocked `fetch`, corrupted-storage boot, title derivation.
4. Manual/Playwright: 1440×900 and 375×667 screenshots per UI task, compared against the anchor; axe scan; keyboard-only pass.
5. Live check on the deployed URL for streaming, cancel, and rate-limit copy — dev server behavior is not evidence.
