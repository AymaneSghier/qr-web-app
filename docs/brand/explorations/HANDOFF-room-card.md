# Handoff — #69 room feed card (hero #1) build (2026-07-23)

You are picking up **issue #69** on branch `feature/room-feed-card-hero` (board
card already **In progress**). A prior session with Marwane explored execution
variants on a real Next surface and **froze the direction**. This file is that
decision record. Read it, then `docs/brand/explorations/HANDOFF.md` (the general
#38 rules, esp. *"locked = direction, not pixels"* and the screenshot recipe),
`docs/design.md` ("The system v2" + component rules), and issue #69.

**First: read the issue and check in with Marwane before building.** He wants to
be in the loop on the real build. Do NOT ship on your own.

## What was decided (with Marwane, this session)

The exploration lived at `app/room-hero-lab/page.tsx` (a scratch route, still in
the working tree — **run it and screenshot it to see the frozen target**:
`npm run dev` then screenshot `http://localhost:3000/room-hero-lab` with the
chromium recipe from HANDOFF.md). It rendered a `FullBleed` variant and a
`Framed` (card) variant. Decisions:

1. **Full-bleed is the direction. The "card frame" variant is rejected** — it was
   built only to compare against, and it reopened the locked "no card frame"
   rule. We keep the locked full-bleed. Frame is dead.
2. **Layout = the `FullBleed` function in the scratch route** ("round 2"). Port
   *that* composition:
   - **Header (top), on the photo:** wordmark `Amourette` (Fraunces italic,
     cream) + venue line (Jost, taupe) + a **live status** row `● 23 in the
     room` (red live-dot with a soft glow + Jost). The `⋯` per-profile menu top
     right. The room count lives **only here now** (moved up next to the venue).
   - **Bottom block, centered:** first name (Fraunces italic, ~52px), bio
     (Figtree, **centered**, `line-clamp-2`, expands on tap — reuse the existing
     feed expand behaviour), **one short centered champagne hairline**
     (`.hairline w-16`), then the **♥ pill** (red-present fill, Jost label
     "Tap").
3. **Count redundancy killed.** The old design had the count twice (kicker +
   near-heart). Now it appears once, in the header. No bottom count line, no
   bottom kicker.
4. **The ♥ is a labelled pill, not icon-only.** Marwane preferred A/C's pill over
   B's icon-only heart. "Tap" is placeholder terminology and may change (see the
   per-locale like-vocabulary decision in `decisions.md` — EN keeps Tap/Tapped).
5. **The ♥ is "red present": filled `red` at rest, blooms once on tap.** This is
   the v2 flip — replace the superseded `.heart-idle` (taupe outline) behaviour.
   `.heart-liked` / the `heart-bloom` keyframe in `app/globals.css` already
   encode the bloom; wire the resting state to filled red.
6. **The champagne hairline stays short and centered under the bio** (Marwane
   liked B's placement), not full-width, not under the name.

## Legibility — the constraint Marwane raised (must be solved)

His concern: on a full-bleed photo, cream text / champagne hairline / red dot can
become illegible **specifically over white or gold areas** of the photo. The
answer is two-layered, and text must **never sit on the raw photo**:

- **Guaranteed local scrims where text lives.** The header carries a strong
  velvet fade (top) + a subtle text-shadow; the bottom block sits on a scrim that
  fades to ~98% velvet. So even a white/gold photo becomes velvet exactly under
  the header and under the identity block. The scratch `FullBleed` already does
  this — keep it and tune it to hold on a bright photo.
- **A global "night grade" over every photo:** a light velvet/warm veil that
  crushes highlights and neutralises pure white and bright gold, pulling every
  photo into the same night. This is both a legibility guarantee (bright user
  selfies included) and a DA win ("the night is the set" — everyone in the same
  dimness). Implement it as a treatment applied to the room photo, not per-card.

Test it against a genuinely bright/white photo, not just the dark fixtures.

## States & motion to deliver (issue #69, not in the scratch mock)

The scratch mock is resting-state only. The real build must add:
- **States:** hover / focus (blush ring, per DA) / pressed (`scale(0.97)`) /
  loading / empty.
- **Motion:** fades 300–500ms, Expo.out `cubic-bezier(0.16, 1, 0.3, 1)`; the ♥
  bloom on tap; respect `prefers-reduced-motion`.

## Where it goes / how to build

- **Integration target:** the real feed is `app/v/[venueSlug]/page.tsx` (the
  per-profile `<section>` around line ~1270: `ProfilePhoto` + `feed-scrim` +
  name + bio + heart-button). Replace that card with the frozen layout. Consider
  extracting a `RoomFeedCard` component if it reads cleaner, but don't
  over-abstract (repo convention: three similar lines beat a premature
  abstraction).
- **Reuse the wired system:** tokens (`bg-velvet`, `text-cream`, `bg-red`, …),
  `.hairline`, `.wordmark`, `.feed-scrim`, fonts via the `--font-*` vars, shadcn
  primitives where they fit. Don't hard-code hexes that already exist as tokens.
- **Check `/styleguide` renders** after the heart-class change (it uses
  `.heart-idle` / `.heart-liked` at `app/styleguide/page.tsx:173`).
- **Next 16:** read `node_modules/next/dist/docs/` before any routing/data code.

## Fixtures / cleanup

- Fixtures added this session: `public/fixtures/room/{elena,julian,mika}.jpg`
  (Unsplash portraits — elena = warm mid-key female, julian = true near-black
  chiaroscuro male, mika = moody). Useful for the styleguide / a preview of the
  card. **Decide:** keep them (handy for `/styleguide` demo) or drop them if the
  real feed only ever shows Supabase photos. If kept, they're fine unoptimised.
- **Delete the scratch route `app/room-hero-lab/` before opening the PR** (it's
  throwaway). Keep this handoff file until the PR merges.

## Process

- **Log the final decision in `docs/decisions.md`** (dated 2026-07-23, with the
  *why*) at ship time: full-bleed confirmed over a card frame; count relocated to
  the header; legibility solved by guaranteed scrims + a global night grade; the
  ♥ flipped to red-present. This wasn't logged yet because the exact layout may
  shift a hair during the real build.
- **`/ship`** for the PR (lint + build gate; `Closes #69`). **Never merge** —
  founder-gated. Schema-touching? This isn't (pure UI), but if you add anything
  DB-side, that needs Aymane's eyes.

## Still open (Marwane's call during the build)

- Exact night-grade opacity/warmth (tune on a bright photo).
- Final name size / how much the photo "breathes" vs the bottom block.
- "Tap" wording (placeholder).
