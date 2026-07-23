/*
 * SCRATCH — #69 visual QA of the REAL room feed card treatment.
 * Mirrors the .room-* layered treatment + identity block that ship in
 * app/v/[venueSlug]/page.tsx (RoomFeedCard), so we can screenshot the card
 * against fixtures AND a deliberately bright white/gold "photo" (the legibility
 * stress test Marwane raised) without going through auth/venue/check-in.
 * Delete this route before opening the PR.
 */
"use client";

import { useState } from "react";

/* The exact on-photo card body from RoomFeedCard, minus the app wiring. */
function CardBody({
  name,
  bio,
  count,
}: {
  name: string;
  bio: string;
  count: number;
}) {
  const [liked, setLiked] = useState(false);
  return (
    <>
      <div className="room-grade pointer-events-none absolute inset-0" />
      <div className="room-key pointer-events-none absolute inset-0" />
      <div className="room-vignette pointer-events-none absolute inset-0" />
      <div className="room-grain pointer-events-none absolute inset-0" />
      <div className="room-top-scrim pointer-events-none absolute inset-x-0 top-0 h-40" />
      <div className="room-identity-scrim pointer-events-none absolute inset-0" />
      <div className="absolute inset-x-0 top-0 flex items-start justify-between p-5">
        <div
          className="flex items-center gap-2"
          style={{ textShadow: "0 1px 18px rgba(18,10,15,.95)" }}
        >
          <span className="h-[5px] w-[5px] rounded-full bg-red shadow-[0_0_10px_rgba(204,20,54,.85)]" />
          <span className="font-label text-[10px] uppercase tracking-[0.24em] text-taupe">
            {count} in the room
          </span>
        </div>
        <div
          className="text-[19px] leading-none text-cream"
          style={{ textShadow: "0 1px 18px rgba(18,10,15,.95)" }}
        >
          ⋯
        </div>
      </div>
      <div className="room-card-enter absolute inset-x-6 bottom-11 text-center">
        <h2
          className="wordmark text-[3.25rem] leading-[0.96] text-cream"
          style={{ textShadow: "0 1px 22px rgba(18,10,15,.7)" }}
        >
          {name}
        </h2>
        <p
          className="mx-auto mt-3 line-clamp-2 max-w-[250px] font-body text-sm font-light leading-relaxed text-taupe"
          style={{ textShadow: "0 1px 16px rgba(18,10,15,.6)" }}
        >
          {bio}
        </p>
        <hr className="hairline mx-auto my-5 w-16" />
        <button
          onClick={() => setLiked((v) => !v)}
          className={`heart-button px-8 py-[15px] text-xs ${
            liked ? "heart-liked cursor-default" : "heart-idle"
          }`}
        >
          <span aria-hidden className="text-base leading-none">
            ♥
          </span>
          {liked ? "Tapped" : "Tap"}
        </button>
      </div>
    </>
  );
}

function Phone({
  label,
  note,
  children,
}: {
  label: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex w-[360px] flex-col items-center gap-4">
      <div
        className="p-[7px]"
        style={{
          width: 360,
          height: 760,
          borderRadius: 46,
          background: "linear-gradient(160deg,#241a20,#0e090c)",
          boxShadow:
            "0 40px 90px rgba(0,0,0,.55), 0 2px 0 rgba(255,255,255,.04) inset",
        }}
      >
        <div className="relative h-full w-full overflow-hidden rounded-[40px] bg-bordeaux">
          {children}
        </div>
      </div>
      <div className="w-[340px] text-center">
        <div className="font-label text-xs uppercase tracking-[0.24em] text-cream">
          {label}
        </div>
        <div className="mt-1.5 font-body text-[13px] leading-relaxed text-taupe">
          {note}
        </div>
      </div>
    </div>
  );
}

const BIO =
  "Here for the jazz and the mezcal. Terrible at pool, great at conversation, and I will absolutely judge your cocktail order.";

export default function RoomHeroLab() {
  return (
    <main className="min-h-screen bg-[#080508] px-4 py-12 sm:px-10">
      <div className="mb-10 text-center">
        <h1 className="wordmark text-2xl text-cream">
          Room feed card — real treatment · legibility QA
        </h1>
        <p className="mt-2 font-label text-[11px] uppercase tracking-[0.22em] text-taupe">
          fixtures + une photo blanc/or synthétique pour tester la lisibilité
        </p>
      </div>
      <div className="flex flex-col items-center gap-12 lg:flex-row lg:justify-center">
        <Phone
          label="Mid-key (elena)"
          note="Photo claire mid-key. Le night-grade doit écraser les hautes lumières."
        >
          <img
            src="/fixtures/room/elena.jpg"
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: "52% 20%" }}
          />
          <CardBody name="Elena" bio={BIO} count={23} />
        </Phone>
        <Phone
          label="Near-black (julian)"
          note="Chiaroscuro quasi noir. L'effet « émerge de l'ombre » doit claquer."
        >
          <img
            src="/fixtures/room/julian.jpg"
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: "52% 20%" }}
          />
          <CardBody name="Julian" bio={BIO} count={23} />
        </Phone>
        <Phone
          label="STRESS: photo blanc/or"
          note="Le pire cas : un fond quasi blanc + or. Le texte cream, le filet or et le point rouge doivent rester lisibles grâce au grade + scrims."
        >
          {/* Synthetic bright white/gold "photo" — no real fixture is this
              blown-out, and this is exactly the case Marwane flagged. */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(70% 55% at 50% 30%, #fffef8, #f6e6b8 45%, #e9cf86 75%, #d8b25a)",
            }}
          />
          <CardBody name="Nadia" bio={BIO} count={23} />
        </Phone>
      </div>
    </main>
  );
}
