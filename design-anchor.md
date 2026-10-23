# Design Anchor — MarqAI

**Decision:** Option B — **Console**. The HUD is instrumentation for a real session, not roleplay. The visual language stays; the claims become true.

> Derived from the shipped UI (`src/index.css`, `HolographicFace.tsx`, `MarqHUD.tsx`, commit `364175b`). This file exists so hardening work does not drift the look and so decorative chrome is not mistaken for product truth.

## Identity

One sentence: *A developer's AI session console, styled like a decommissioned spacecraft terminal that still works.*

Voice: clipped, factual, lowercase in prose, uppercase in labels. It reports. It does not boast. Never "secure", "encrypted", "companion", "classified" unless the claim is literally true.

## Palette

| Role | Token | Value | Usage |
|---|---|---|---|
| Background | `--marq-bg` | `#030712` | Page, behind all layers |
| Surface | `--marq-surface` | `rgba(15, 23, 42, 0.8)` | Panels, bubbles |
| Accent (interactive) | `--marq-accent` | `#22d3ee` | Borders, active icons, values, focus rings |
| Accent glow | `--marq-accent-glow` | `rgba(34, 211, 238, 0.3)` | Panel inner shadow, hover bloom |
| Warning | `--marq-warn` | `#ef4444` | Errors, destructive, thermal alarm |
| Success | `#10b981` | — | Only for a *measured* healthy state |
| Text primary | `--marq-text` | `#e2e8f0` | Assistant body copy |
| Text soft | `--marq-text-soft` | `#94a3b8` | Secondary prose, timestamps |
| Glass border | `--glass-border` | `rgba(34, 211, 238, 0.15)` | Panel hairlines |

**Contrast rules (non-negotiable):**
- Body copy is `--marq-text` on `--marq-bg`/surface. **Cyan is not a body-text color.** Cyan on navy fails at paragraph length.
- Any text under 12px must be at least 70% opacity and `--marq-text-soft` minimum; no 10%-opacity labels.
- Status is never color-only: pair the dot with a word (`IDLE`, `STREAMING`, `OFFLINE`).

## Typography

| Role | Stack | Size | Treatment |
|---|---|---|---|
| Wordmark | Space Grotesk | 1.5rem desktop / 1.25rem mobile | weight 700, tracking `2px` |
| Panel labels | JetBrains Mono | 0.7–0.75rem | uppercase, tracking `1px`, accent |
| Data values | JetBrains Mono | 0.8–0.9rem | no uppercase |
| Assistant prose | Space Grotesk | 1rem | line-height 1.6, `--marq-text` |
| Code | JetBrains Mono | 0.85rem | line-height 1.6, Tokyo Night Dark |
| Micro-labels | JetBrains Mono | 0.6rem minimum | uppercase, 70%+ opacity |

No third family. No Inter. Uppercase never exceeds 24 characters on mobile (it wraps badly).

## Signature Elements (do not remove)

1. **Holographic face parallax** — three depth layers, spring `{ stiffness: 40, damping: 25 }`, foreground rotation ±15°/±25°, midground ±8°/±12°, background ±2°/±4°. This is the product's single memorable interaction.
2. **Concentric rotating rings** (`MarqHUD`) — 300px, dashed outer 20s, notched middle 10s counter-rotation.
3. **Hex-clipped bubbles** — `clip-path: polygon(0 0, 95% 0, 100% 15%, 100% 100%, 5% 100%, 0 85%)`. Sharp by design; no border-radius on bubbles.
4. **Scanline field** — one 2px scanner sweep + the 4px repeating grid, both at ≤10% opacity.
5. **Corner-tick panels** — 1px accent hairline on the top edge, inset glow.

## Motion Budget

| Rule | Value |
|---|---|
| Concurrent infinite animations, idle | ≤ 2 content loops (rings only). Ambient layers (`scanner-overlay`, `data-stream-layer`) are CSS-only, paused when hidden/reduced, and exempt |
| Concurrent infinite animations, streaming | ≤ 4 (rings + waveform + cursor) |
| Strobe | **Banned.** No `0.1s` flicker loops |
| Title glitch | Once on mount, ≤ 400ms. Not infinite |
| Parallax | `pointer: fine` only; disabled under 900px |
| Reduced motion | All transforms/animations off; state changes remain visible via text + live region |
| Backgrounded tab | All loops paused (`document.visibilityState`) |

## Required States (every state-changing surface)

| State | Treatment |
|---|---|
| Boot | ≤ 1.2s. If providers are unverified, boot proceeds — never fake a 2s "initialization" |
| Empty | Prompt suggestions as text buttons, not fake messages |
| Streaming | Text appends; stop control replaces send; `STREAMING` badge with model name |
| Error | Inline, message-level: reason + retry. Never rendered as an assistant utterance |
| Cancelled | Partial text retained, muted border, "stopped" + retry |
| Offline / no key | Blocking panel naming the env vars. Chat input disabled |
| Long content | Code blocks scroll horizontally; no page-level horizontal scroll |

## Banned List (specific to MarqAI)

- Fabricated telemetry: random CPU %, temperature, uptime, token counts, "encrypted"
- Cyan body text; text below 12px at reduced opacity
- `flicker` animations, infinite glitch, any strobe
- Fixed pixel layout boxes (750px face, 300px rings) inside responsive containers — scale with `clamp()`
- Unlabeled icon-only buttons; hover-only affordances
- "Secure link", "encrypted", "classified", "companion" as decoration
- Gradient backgrounds beyond the existing radial glow
- Emoji in UI; emoji in assistant copy only if the user's message used them
- A second accent hue (purple, magenta, teal-green) — warn red and success green only as status

## Layout & Breakpoints

| Range | Behavior |
|---|---|
| ≥ 1440 | Chat `1fr` + sidebar `320px`; face `min(750px, 100%, 78vh)`; shell max 1600px centered |
| 901–1439 | Same structure, sidebar `320px`; face still height-driven so it fills the panel |
| ≤ 900 | Sidebar collapses to a drawer; header stacks; chat full width; face capped by panel height |
| ≤ 480 | Single column; header compresses to wordmark + status + drawer toggle; composer pinned; face behind chat at reduced opacity |
| 375 | No horizontal overflow. Composer visible without scroll. 44×44px minimum targets |

## Asset Conventions

- Images: WebP, explicit `width`/`height`, `loading="lazy"` except the focal face
- Focal face: ≤ 150 KB, preloaded, identical pixel dimensions to the current 804 KB source (crop must not shift)
- Fonts: `<link rel="preconnect">` + `<link rel="stylesheet">`, never `@import` in CSS
- Decorative SVGs: `aria-hidden="true"`; icon buttons: `aria-label` required

## Copy Rules

- Labels describe a value that exists: `MODEL`, `LATENCY`, `REQUESTS`, `CONTEXT`, `STATUS`
- Numbers show units and are measured or absent (`--` when unknown)
- Error copy is a cause plus an action: "Rate limited — retry in 20s", not "SYSTEM FAILURE"
- No hype vocabulary (elevate, unlock, seamless)
