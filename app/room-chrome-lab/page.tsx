"use client";

// SCRATCH ROUTE — room-screen chrome exploration for #83. Self-contained (no
// auth, no Supabase): it renders the real full-bleed RoomFeedCard surface with
// the real CSS classes and mock data, so header/menu/matches-strip variants can
// be compared on the true surface before locking pixels. Deleted before merge,
// exactly like the card's room-hero-lab.

import { useState } from "react";

// A bright, white/gold-topped synthetic photo to stress-test on-photo header
// legibility (the real risk: cream micro-label over a light top third). The
// night grade + top scrim must keep it readable.
const BRIGHT_PHOTO =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1100"><defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="#fdf6e3"/><stop offset="0.5" stop-color="#e9c46a"/><stop offset="1" stop-color="#b08968"/></linearGradient></defs><rect width="800" height="1100" fill="url(#g)"/><circle cx="400" cy="430" r="230" fill="#f2d3b6"/><rect x="150" y="40" width="500" height="120" rx="16" fill="#ffffff" opacity="0.85"/></svg>`
  );

type Candidate = {
  first_name: string;
  photo_url: string;
  bio: string | null;
  justArrived: boolean;
};

const CANDIDATES: Candidate[] = [
  {
    first_name: "Camille",
    photo_url: "/test-profiles/portrait-1.svg",
    bio: "Architecte le jour, DJ house le week-end. Je cherche quelqu'un qui sait perdre à la belote.",
    justArrived: true,
  },
  {
    first_name: "Sofia",
    photo_url: "/test-profiles/portrait-2.svg",
    bio: "Trop de livres, pas assez d'étagères.",
    justArrived: false,
  },
  {
    first_name: "Léa",
    photo_url: "/test-profiles/portrait-3.svg",
    bio: "Je fais le meilleur negroni de l'arrondissement et je ne l'ai jamais prouvé à personne. Peut-être ce soir. On verra si tu tiens la conversation assez longtemps pour mériter le deuxième verre, parce que le premier est offert d'office mais le deuxième se gagne.",
    justArrived: false,
  },
  {
    first_name: "Inès",
    photo_url: BRIGHT_PHOTO,
    bio: "Photo trop lumineuse exprès — test du scrim.",
    justArrived: true,
  },
  {
    first_name: "Jade",
    photo_url: "/test-profiles/portrait-5.svg",
    bio: null,
    justArrived: false,
  },
];

const SHORT_VENUE = "Le Perchoir";
const LONG_VENUE = "The Absolutely Enormous Rooftop Bar & Cocktail Lounge";

const VARIANTS = [
  { key: "A", label: "A · Wordmark-led" },
  { key: "B", label: "B · Slim bar" },
  { key: "C", label: "C · Venue-led" },
] as const;
type VariantKey = (typeof VARIANTS)[number]["key"];

export default function RoomChromeLab() {
  const [variant, setVariant] = useState<VariantKey>("A");
  const [idx, setIdx] = useState(0);
  const [showMatch, setShowMatch] = useState(false);
  const [longVenue, setLongVenue] = useState(false);

  const candidate = CANDIDATES[idx];
  const venue = longVenue ? LONG_VENUE : SHORT_VENUE;
  const count = 12;

  return (
    <main className="night-shell flex h-dvh min-h-0 flex-col text-cream">
      {/* The phone column. The full-bleed card fills it; all chrome floats on
          top as overlays, so the photo is ALWAYS full-screen (this is the fix
          for "matches strip pushes the photo down"). */}
      <div className="night-content relative mx-auto min-h-0 w-full max-w-md flex-1 overflow-hidden sm:border-x sm:border-champagne/10">
        <CardSurface candidate={candidate} />

        {variant === "A" && (
          <ChromeA venue={venue} count={count} showMatch={showMatch} name={candidate.first_name} />
        )}
        {variant === "B" && (
          <ChromeB venue={venue} count={count} showMatch={showMatch} name={candidate.first_name} />
        )}
        {variant === "C" && (
          <ChromeC venue={venue} count={count} showMatch={showMatch} name={candidate.first_name} />
        )}
      </div>

      <LabControls
        variant={variant}
        setVariant={setVariant}
        showMatch={showMatch}
        setShowMatch={setShowMatch}
        longVenue={longVenue}
        setLongVenue={setLongVenue}
        onPrev={() => setIdx((i) => (i - 1 + CANDIDATES.length) % CANDIDATES.length)}
        onNext={() => setIdx((i) => (i + 1) % CANDIDATES.length)}
        candidateName={candidate.first_name}
      />
    </main>
  );
}

// ── The real full-bleed card surface, minus the on-photo header (chrome owns
//    that per variant). Faithful port of RoomFeedCard's layered night treatment
//    + identity block + heart. ────────────────────────────────────────────────
function CardSurface({ candidate }: { candidate: Candidate }) {
  const c = candidate;
  const [liked, setLiked] = useState(false);
  return (
    <section className="absolute inset-0 h-full w-full overflow-hidden bg-bordeaux">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={c.photo_url}
        alt={c.first_name}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="room-grade pointer-events-none absolute inset-0" />
      <div className="room-key pointer-events-none absolute inset-0" />
      <div className="room-vignette pointer-events-none absolute inset-0" />
      <div className="room-grain pointer-events-none absolute inset-0" />
      <div className="room-top-scrim pointer-events-none absolute inset-x-0 top-0 h-40" />
      <div className="room-identity-scrim pointer-events-none absolute inset-0" />

      <div className="room-card-enter absolute inset-x-6 bottom-11 text-center">
        {c.justArrived && (
          <p className="night-kicker mb-3 text-[10px]">Just arrived</p>
        )}
        <h2
          className="wordmark text-[3.25rem] leading-[0.96] text-cream"
          style={{ textShadow: "0 1px 22px rgba(18,10,15,.7)" }}
        >
          {c.first_name}
        </h2>
        {c.bio && (
          <p
            className="mx-auto mt-3 line-clamp-2 max-w-[250px] font-body text-sm font-light leading-relaxed text-taupe"
            style={{ textShadow: "0 1px 16px rgba(18,10,15,.6)" }}
          >
            {c.bio}
          </p>
        )}
        <hr className="hairline mx-auto my-5 w-16" />
        <button
          onClick={() => setLiked((v) => !v)}
          className={`heart-button px-8 py-[15px] text-xs ${liked ? "heart-liked cursor-default" : "heart-idle"}`}
        >
          <span aria-hidden className="text-base leading-none">
            {liked ? "♥" : "♡"}
          </span>
          {liked ? "Liked" : "Like"}
        </button>
      </div>
    </section>
  );
}

// ── Shared chrome pieces ─────────────────────────────────────────────────────

// The live line, reworked from "Tonight at <venue>". The venue name is its own
// token (truncated), the live count a separate micro-label with the red dot.
function LiveLine({
  venue,
  count,
  showVenue = true,
}: {
  venue: string;
  count: number;
  showVenue?: boolean;
}) {
  return (
    <div
      className="flex min-w-0 items-center gap-2"
      style={{ textShadow: "0 1px 18px rgba(18,10,15,.95)" }}
    >
      <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-red shadow-[0_0_10px_rgba(204,20,54,.85)]" />
      <span className="min-w-0 truncate font-label text-[10px] uppercase tracking-[0.24em] text-taupe">
        {showVenue ? (
          <>
            <span className="text-cream">{venue}</span>
            <span className="px-1.5 text-champagne/50">·</span>
          </>
        ) : null}
        {count} here now
      </span>
    </div>
  );
}

// Consolidated room menu — closes on ANY outside tap (the #83 bug: today's menu
// backdrop sits BEHIND the sticky bar, so tapping the bar doesn't close it).
// Here the backdrop is a full-screen z-40 layer under the z-50 panel.
function RoomMenu({ includeEditProfile = false }: { includeEditProfile?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Room options"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-champagne/25 bg-velvet/60 text-lg leading-none text-cream backdrop-blur"
      >
        ⋯
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="night-panel absolute right-0 z-50 mt-2 grid w-52 gap-2 p-2">
            {includeEditProfile && (
              <button className="night-button night-button-secondary px-4 py-3 text-xs">
                Edit my profile
              </button>
            )}
            <button className="night-button night-button-secondary px-4 py-3 text-xs">
              Language
            </button>
            <button className="night-button night-button-secondary px-4 py-3 text-xs">
              Go invisible
            </button>
            <button className="night-button night-button-secondary px-4 py-3 text-xs">
              Leave the room
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// Per-profile safety ⋯ + bottom-sheet (report/block). Unchanged behaviour, only
// its PLACEMENT differs per variant, to de-stack it from the room ⋯.
function SafetyMenu({
  name,
  compact = false,
}: {
  name: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Profile actions"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={
          compact
            ? "flex h-8 w-8 items-center justify-center rounded-full bg-velvet/45 text-base leading-none text-taupe backdrop-blur transition hover:text-cream"
            : "flex h-10 w-10 items-center justify-center rounded-full border border-champagne/25 bg-velvet/60 text-lg leading-none text-cream backdrop-blur"
        }
      >
        ⋯
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-velvet/70 px-5 pb-8"
          onClick={() => setOpen(false)}
        >
          <div className="night-panel w-full max-w-sm p-4" onClick={(e) => e.stopPropagation()}>
            <p className="night-kicker">{name}</p>
            <div className="mt-3 grid gap-2">
              <button className="night-button night-button-secondary px-4 py-3 text-xs">
                Report
              </button>
              <button className="night-button night-button-danger px-4 py-3 text-xs">
                Block
              </button>
              <button
                onClick={() => setOpen(false)}
                className="night-button px-4 py-3 text-xs text-taupe transition hover:text-cream"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Matches as a FLOATING overlay strip (the fix: it no longer lives inside a
// header that grows and shrinks the photo). Placement varies per variant.
function MatchesStrip({ className = "" }: { className?: string }) {
  const people = [
    { name: "Anaïs", src: "/test-profiles/portrait-4.svg", unread: 2 },
    { name: "Manon", src: "/test-profiles/portrait-6.svg", unread: 0 },
  ];
  return (
    <div className={`flex items-center gap-2 overflow-x-auto ${className}`}>
      {people.map((p) => (
        <div
          key={p.name}
          className="night-card-hot flex shrink-0 items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 backdrop-blur"
        >
          <span className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.src}
              alt={p.name}
              className="night-photo-ring h-8 w-8 rounded-full object-cover"
            />
            {p.unread > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-blush px-1 text-[10px] font-semibold text-ink">
                {p.unread}
              </span>
            )}
          </span>
          <span className="text-sm font-medium text-cream">{p.name}</span>
        </div>
      ))}
    </div>
  );
}

// Small own-profile avatar (door to the editor).
function OwnAvatar({ className = "" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/test-profiles/portrait-2.svg"
      alt="Your profile"
      className={`night-photo-ring h-9 w-9 rounded-full object-cover ${className}`}
    />
  );
}

// ── Variant A — Wordmark-led, fully on-photo (kill the sticky bar). ──────────
// Brand stays as the top-left anchor; venue+count fold beneath it. Own avatar
// folded into the room ⋯ ("Edit my profile"). Safety ⋯ moves down beside the
// name so it never stacks under the room ⋯. Matches float just under the header.
function ChromeA({
  venue,
  count,
  showMatch,
  name,
}: {
  venue: string;
  count: number;
  showMatch: boolean;
  name: string;
}) {
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-5">
        <div className="pointer-events-auto min-w-0">
          <p className="wordmark text-lg text-cream" style={{ textShadow: "0 1px 18px rgba(18,10,15,.9)" }}>
            Amourette
          </p>
          <div className="mt-1">
            <LiveLine venue={venue} count={count} />
          </div>
        </div>
        <div className="pointer-events-auto shrink-0">
          <RoomMenu includeEditProfile />
        </div>
      </div>

      {showMatch && (
        <div className="absolute inset-x-0 top-[92px] z-20 px-5">
          <MatchesStrip />
        </div>
      )}

      {/* Safety ⋯ pinned to the card's right edge, vertically centred on the
          identity zone — clearly a per-person action, not room chrome. */}
      <div className="absolute right-4 bottom-[42%] z-30">
        <SafetyMenu name={name} />
      </div>
    </>
  );
}

// ── Variant B — Slim persistent bar (conservative). ─────────────────────────
// Keep a bar but thin it to wordmark + own avatar + room ⋯. Venue+count move
// onto the photo. Safety ⋯ stays top-right of the photo but BELOW the bar, so
// the two ⋯ read as two rows, not a stack. Matches float under the bar.
function ChromeB({
  venue,
  count,
  showMatch,
  name,
}: {
  venue: string;
  count: number;
  showMatch: boolean;
  name: string;
}) {
  return (
    <>
      {/* Slim bar — translucent so the photo still bleeds under it. */}
      <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-3 border-b border-champagne/15 bg-velvet/70 px-4 py-2.5 backdrop-blur">
        <p className="wordmark text-base text-cream">Amourette</p>
        <div className="flex items-center gap-2">
          <OwnAvatar />
          <RoomMenu />
        </div>
      </div>

      {/* Venue + live count on the photo, just under the bar. */}
      <div className="absolute inset-x-0 top-[52px] z-20 px-5">
        <LiveLine venue={venue} count={count} />
      </div>

      {showMatch && (
        <div className="absolute inset-x-0 top-[84px] z-20 px-5">
          <MatchesStrip />
        </div>
      )}

      {/* Safety ⋯ on the photo, second row right — distinct from the bar's ⋯. */}
      <div className="absolute right-4 top-[92px] z-20">
        <SafetyMenu name={name} compact />
      </div>
    </>
  );
}

// ── Variant C — Venue-led, on-photo (venue is the in-room context). ─────────
// No bar. The venue name is the hero top-left (you know where you are); the
// "Amourette" wordmark recedes to a tiny mark. Room ⋯ top-right. Safety ⋯ moves
// to the card's own bottom-right corner (near the person). Own avatar as a
// discreet door bottom-left. Matches float near the thumb (bottom).
function ChromeC({
  venue,
  count,
  showMatch,
  name,
}: {
  venue: string;
  count: number;
  showMatch: boolean;
  name: string;
}) {
  return (
    <>
      <div className="absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="wordmark text-[11px] text-champagne/70">Amourette</p>
          <h1
            className="mt-0.5 truncate font-display text-xl font-medium text-cream"
            style={{ textShadow: "0 1px 18px rgba(18,10,15,.9)" }}
          >
            {venue}
          </h1>
          <div className="mt-1">
            <LiveLine venue={venue} count={count} showVenue={false} />
          </div>
        </div>
        <div className="shrink-0">
          <RoomMenu includeEditProfile />
        </div>
      </div>

      {/* Own avatar — discreet door, bottom-left corner, out of the ⋯ cluster. */}
      <div className="absolute bottom-6 left-5 z-30">
        <OwnAvatar />
      </div>

      {/* Safety ⋯ — bottom-right, tied to the person, far from the room ⋯. */}
      <div className="absolute bottom-6 right-5 z-30">
        <SafetyMenu name={name} compact />
      </div>

      {showMatch && (
        <div className="absolute inset-x-0 bottom-24 z-20 px-5">
          <MatchesStrip />
        </div>
      )}
    </>
  );
}

// ── Lab controls (not part of the design; scaffolding to compare variants). ──
function LabControls({
  variant,
  setVariant,
  showMatch,
  setShowMatch,
  longVenue,
  setLongVenue,
  onPrev,
  onNext,
  candidateName,
}: {
  variant: VariantKey;
  setVariant: (v: VariantKey) => void;
  showMatch: boolean;
  setShowMatch: (v: boolean) => void;
  longVenue: boolean;
  setLongVenue: (v: boolean) => void;
  onPrev: () => void;
  onNext: () => void;
  candidateName: string;
}) {
  return (
    <div className="shrink-0 border-t border-champagne/20 bg-ink/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex w-full max-w-md flex-col gap-3">
        <div className="grid grid-cols-3 gap-2">
          {VARIANTS.map((v) => (
            <button
              key={v.key}
              onClick={() => setVariant(v.key)}
              className={`rounded-full px-2 py-2 text-[11px] font-medium transition ${
                variant === v.key
                  ? "bg-cream text-ink"
                  : "border border-champagne/25 text-taupe"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-wider text-taupe">
          <button
            onClick={() => setShowMatch(!showMatch)}
            className={`rounded-full border px-3 py-1.5 transition ${showMatch ? "border-blush/50 text-cream" : "border-champagne/25"}`}
          >
            Match {showMatch ? "on" : "off"}
          </button>
          <button
            onClick={() => setLongVenue(!longVenue)}
            className={`rounded-full border px-3 py-1.5 transition ${longVenue ? "border-blush/50 text-cream" : "border-champagne/25"}`}
          >
            {longVenue ? "Long venue" : "Short venue"}
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onPrev} className="rounded-full border border-champagne/25 px-3 py-1.5">
              ‹
            </button>
            <span className="w-16 text-center normal-case text-cream">{candidateName}</span>
            <button onClick={onNext} className="rounded-full border border-champagne/25 px-3 py-1.5">
              ›
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
