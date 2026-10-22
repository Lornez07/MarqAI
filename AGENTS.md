# Project Constitution — MarqAI

## Stack
- Language: TypeScript (strict, `tsconfig.app.json`)
- Framework: React 19 + Vite 8 (SPA, no router)
- Styling: hand-written CSS (`src/index.css`) + inline styles; Framer Motion for motion
- Database: none — `localStorage` (`marq:v1:sessions`) for session history
- Hosting/Deployment: Vercel; server logic in `api/` functions only
- AI Tools: OpenCode

## Conventions
- Naming: PascalCase components/hooks dirs, `useX` hooks, `lib/llm/*` for transport, camelCase vars
- File structure: `src/components` (presentational), `src/hooks` (state), `src/lib` (pure logic), `api/` (server only)
- Testing framework & requirements: Vitest + Testing Library. Required for SSE parsing, abort, provider failover, storage boot
- Error handling pattern: normalize to `{ message, code, retryable }`; surface errors in the UI with a retry; never present a fabricated answer as an AI response
- State management approach: local React state + `useReducer` in `useChat`; no state library

## Rules (AI must obey)
- Do not add new dependencies without asking
- Do not rewrite existing working code without justification
- Do not generate placeholder/fake data in production paths — telemetry must be measured or absent
- All generated code must include error handling
- API keys are server-only. Never introduce a `VITE_`-prefixed secret
- Never claim success without command output (`npm run build`, `npm run lint`, test run)
- Read `specs/001-hud-console/spec.md` before changing behavior; the out-of-scope list is binding

## Out of Scope (for this project)
- Accounts, auth, billing, multi-user
- Server-side rendering or a Next.js migration
- Redesigning the HUD visual language (palette, rings, holographic face concept)
- `FilePatchTool` and `/api/generate-patch` (no endpoint exists)

## Process
This project follows the Spec -> Plan -> Tasks -> Implement loop defined in the workspace AGENTS.md. No UI task starts until `design-anchor.md` exists and the Companion-vs-Console identity decision is recorded.
