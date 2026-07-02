# Room experience redesign — implementation brief

Status: **specified, not built**. This brief is the working contract for the agent implementing it on this branch. Decisions behind it are logged in `docs/decisions.md` (2026-07-02). When the work ships, fold the outcome into `docs/roadmap.md` and delete this file in the same PR.

## Why

The live room (`app/v/[venueSlug]/page.tsx`) currently renders as a desktop-style dashboard: header + stat pills + a 2–3 column grid of profile cards, each carrying permanent Report/Block buttons. Two problems:

1. **The grid tells the wrong story.** A card grid is catalog language — browse, compare, evaluate. The product's promise is *"these people are physically in this room, right now"*, and the real context is a phone held one-handed in a bar. The multi-column grid only exists on desktop, a context we don't serve.
2. **The wait kills the night's start.** Early arrivals hit a static "You're in / the party starts soon" panel with nothing alive in it, and close the tab. That is the cold-start moment where we lose the room.

## Scope 1 — full-screen vertical feed (replaces the card grid)

One profile per viewport, vertical scroll with CSS scroll snap (stories-like, no autoplay, no swipe deck). Mobile-first: design at ~390 px width; on desktop, center a phone-width column rather than reflowing to a grid.

- **One person = full attention.** Photo near full-screen, first name + bio in a bottom gradient overlay (the current card already does the overlay — scale it up). The photo's job here is *recognition* ("that's the person by the bar"), not evaluation, so it must be big.
- **No swipe mechanics, no "pass".** Scrolling past someone is not a rejection and nothing is recorded. Users can scroll back up and return to a profile — in a real bar you look around, hesitate, come back. This is invariant 3 territory: there must never be a negative signal, stored or displayed.
- **One like gesture.** A single prominent like button per profile (optionally double-tap on the photo as a secondary gesture). Keep the existing optimistic `likedIds` behavior and the quiet "Liked" state — a like stays secret, the only feedback is your own.
- **Report/Block move behind a `⋯` overflow menu** in a corner of each profile view (and of each match card). One tap to open, so the actions stay immediately reachable (women-first), but they stop being two permanent buttons shouting on every profile. Reuse the existing `openReport` / `confirmBlock` flows unchanged.
- **Matches stay pinned.** Keep the active-matches row compact and always accessible (sticky top bar or equivalent): avatar + first name + unread badge, tapping opens `/chat/[matchId]`. Don't bury it under the feed.
- **Stable ordering, arrivals as the event.** `loadCandidates` currently replaces the whole list on every realtime presence event with no defined order, so the feed could reshuffle under the user's thumb. Order by `presence.checked_in_at` (add it to the select alongside the joined profile) so the order is stable across refetches, newest arrivals first at the top of the feed with a subtle "just arrived" cue (e.g. a `night-kicker`-style tag). Arrivals are the heartbeat of the app — they should be felt, not silently merged.
- **Room hint** ("Tap quietly") becomes a lightweight one-time overlay or slim banner consistent with the new layout; keep the `ROOM_HINT_DISMISS_KEY` localStorage behavior.

## Scope 2 — the wait becomes a room filling up (replaces the empty state)

Replace the static "You're in / starts soon" panel with a live waiting state:

- **Live room counter.** Show how many people are checked in *in the whole room* (visible presence, not just mutually compatible profiles) and let it tick up in realtime — the existing presence subscription already fires on every check-in. Watching the room fill proves the night is happening even before a compatible profile appears.
  - Implementation note: current RLS scopes `presence` SELECT to your own rows and the venues you are currently in (see `docs/decisions.md` 2026-06-19), so a plain `count` on active visible presence for the venue should already pass. Verify against the live DB; if it doesn't, add a `SECURITY DEFINER` counter helper following the `private.*` pattern, exposed as an RPC that returns only an integer.
- **Send them back to the night, honestly.** The copy's message: *put your phone away, enjoy your night, check back in a bit — the room is filling.* People at a bar check their phone every few minutes anyway; the empty state's job is to make that reflex pay off, not to hold attention. No spinner theatrics, no fake urgency.
- **Make the wait productive: profile polish CTA.** Early arrivals are exactly the users with time to improve their profile. Add a secondary CTA to `/profile?venue=<slug>` framed as "make your profile irresistible while the room fills". Better bios early = better matches later.
- The empty state keeps the Leave button, and transitions into the feed automatically when the first compatible profile arrives (the realtime subscription already re-runs `loadCandidates`).

## Explicitly out of scope

- **Web push / notifications.** Android-only push (permission asked at a value moment, never at check-in) and the iOS PWA question are a Phase 2 retention chantier — see `docs/decisions.md` 2026-07-02. Nothing in this PR asks for permissions or installs.
- **PWA install prompts of any kind.** Never during a night out.
- **Fake or seeded profiles to pad the room.** Never — it burns trust and the women-first invariant in one evening.
- **Changes to the app-store promo modal, chat, profile page, or any schema change beyond the (possible) presence counter helper.**

## Design language (match it, don't reinvent it)

The visual identity lives in `app/globals.css` as `night-*` component classes over a dark "night out" palette. New UI must reuse these tokens; if a new reusable style is needed, add it to the `@layer components` block in `globals.css` rather than inlining one-off styles.

- **Palette (CSS vars in `:root`):** ink `#070305`, wine `#2a0715`, rose `#ff3d81`, amber `#f6b35a`, violet `#8b5cf6`, muted `#bda7a5`. Foreground is warm off-white `#fff7ed`.
- **Feel:** dark glassmorphism (`night-panel`, `night-card` — translucent gradients, blur, deep shadows), warm glows in rose/amber (`night-card-hot`, `night-photo-ring`), amber uppercase kickers with wide tracking (`night-kicker`), heavy black headings (`font-black`, tight leading), gradient primary buttons amber→rose→violet (`night-button-primary`), subtle pills (`night-pill`).
- **Existing classes to reach for:** `night-shell` (page background with radial glows + grid texture), `night-content`, `night-panel`, `night-card`, `night-card-hot` (matches/highlights), `night-kicker`, `night-muted`, `night-button` + `-primary` / `-secondary` / `-danger`, `night-pill`, `night-input`, `night-photo-ring`.
- The full-screen feed should keep the `night-shell` atmosphere: photo with a bottom scrim gradient (as the current cards do), name in `font-black`, bio in muted warm tone, like button as `night-button-primary`.

## Copy and i18n

All new user-facing strings go through `lib/strings.ts` in **EN, FR and ES** (update the `RoomStrings` type). No hardcoded UI text in components. Tone: warm, direct, a little playful, never corporate; FR uses "tu".

## Invariants checklist (verify before opening the PR)

1. A like produces zero signal to its target; only a match reveals anything.
2. Scrolling past someone stores and shows nothing — no pass, no rejection.
3. Report and block are reachable in ≤ 2 taps from any profile or match.
4. Invisible mode and Leave keep working exactly as today (`goInvisible`, `leave`, `rejoin`).
5. No new query selects private columns; the counter (if added) exposes a number only.

## Working notes for the implementing agent

- Read the Next.js 16 guides in `node_modules/next/dist/docs/` before touching routing/data-fetching code (see `AGENTS.md` top rule).
- The page is a client component with realtime subscriptions; keep the existing bootstrap → heartbeat → subscriptions structure and re-skin the render path rather than rewriting the data layer.
- TypeScript strict, no `any`. Conventional commits. `npm run lint` and `npm run build` must pass.
- Agents open the PR into `main`; merging stays founder-gated.
