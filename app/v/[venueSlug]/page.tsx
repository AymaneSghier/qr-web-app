"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ensureAnonSession } from "@/lib/auth";
import { isMutuallyCompatible } from "@/lib/profile";
import { browserLocale, localeForCity, t } from "@/lib/strings";
import { useBrowserLocale } from "@/lib/useLocale";
import type { Database } from "@/lib/database.types";

// Public-facing profile: only the columns other users are ever allowed to see.
type PublicProfile = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "first_name" | "photo_url" | "bio" | "gender" | "interested_in"
>;
const PUBLIC_COLUMNS = "id, first_name, photo_url, bio, gender, interested_in";

type Venue = Pick<
  Database["public"]["Tables"]["venues"]["Row"],
  "id" | "name" | "city"
>;

type MatchRow = Pick<
  Database["public"]["Tables"]["matches"]["Row"],
  "id" | "profile_a" | "profile_b" | "expires_at"
>;

type ActiveMatch = {
  id: string;
  other: PublicProfile;
};

// How often we bump our presence heartbeat. Presence does not expire on this
// timer (the room lasts the night, closed by the rollover cron) — the heartbeat
// just keeps last_seen_at fresh while the tab is open.
const HEARTBEAT_MS = 120_000;

type Status = "loading" | "ready" | "error" | "left";

export default function VenueRoom() {
  const router = useRouter();
  const params = useParams<{ venueSlug: string }>();
  const venueSlug = params.venueSlug;

  const [me, setMe] = useState<PublicProfile | null>(null);
  const [venue, setVenue] = useState<Venue | null>(null);
  const [candidates, setCandidates] = useState<PublicProfile[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [matchedIds, setMatchedIds] = useState<Set<string>>(new Set());
  const [matches, setMatches] = useState<ActiveMatch[]>([]);
  const [newMatch, setNewMatch] = useState<ActiveMatch | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  // Locale follows the venue's city once it is known; before that (loading,
  // hard errors) we fall back to the browser language (resolved after mount to
  // avoid an SSR hydration mismatch on the loading screen).
  const browserLoc = useBrowserLocale();
  const s = t[venue ? localeForCity(venue.city) : browserLoc].room;

  // Keep the latest "me" available to realtime callbacks without resubscribing.
  const meRef = useRef<PublicProfile | null>(null);
  useEffect(() => {
    meRef.current = me;
  }, [me]);

  const loadProfileById = useCallback(async (id: string) => {
    const { data } = await supabase
      .from("profiles")
      .select(PUBLIC_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    return data as PublicProfile | null;
  }, []);

  // Who is checked in here right now and mutually compatible with me. Scoped to
  // active presence (left_at IS NULL) — this is the live room, not the user table.
  const loadCandidates = useCallback(
    async (venueId: string, myId: string, myProfile: PublicProfile) => {
      const { data } = await supabase
        .from("presence")
        .select(`profiles!inner(${PUBLIC_COLUMNS})`)
        .eq("venue_id", venueId)
        .is("left_at", null)
        .neq("profile_id", myId);
      const profiles = (data ?? []).map(
        (row) => row.profiles as unknown as PublicProfile
      );
      return profiles.filter((p) => isMutuallyCompatible(myProfile, p));
    },
    []
  );

  const registerMatch = useCallback((match: ActiveMatch, reveal: boolean) => {
    setMatchedIds((prev) => {
      if (prev.has(match.other.id)) return prev;
      const next = new Set(prev);
      next.add(match.other.id);
      return next;
    });
    setMatches((prev) =>
      prev.some((existing) => existing.id === match.id) ? prev : [...prev, match]
    );
    if (reveal) setNewMatch((current) => current ?? match);
  }, []);

  // Bootstrap: session, profile, venue, check-in, then the live room state.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const user = await ensureAnonSession();

        const myProfile = await loadProfileById(user.id);
        if (!active) return;
        if (!myProfile) {
          router.replace("/profile");
          return;
        }
        setMe(myProfile);

        const { data: venueRow, error: venueError } = await supabase
          .from("venues")
          .select("id, name, city")
          .eq("slug", venueSlug)
          .maybeSingle();
        if (venueError) throw venueError;
        if (!active) return;
        if (!venueRow) {
          setStatus("error");
          setErrorMsg(t[browserLocale()].room.venueNotFound);
          return;
        }
        setVenue(venueRow);

        // Scanning the QR = checking in. This must land before we read other
        // profiles: the tightened RLS only lets you see who shares your room.
        const { error: checkInError } = await supabase.rpc("check_in", {
          p_venue_id: venueRow.id,
        });
        if (checkInError) throw checkInError;
        if (!active) return;

        const [candidatesData, { data: myLikes }, { data: myMatches }] =
          await Promise.all([
            loadCandidates(venueRow.id, user.id, myProfile),
            supabase.from("likes").select("liked_id").eq("venue_id", venueRow.id),
            supabase
              .from("matches")
              .select("id, profile_a, profile_b, expires_at")
              .eq("venue_id", venueRow.id)
              .gt("expires_at", new Date().toISOString()),
          ]);
        if (!active) return;

        const activeMatches = (
          await Promise.all(
            ((myMatches ?? []) as MatchRow[]).map(async (m) => {
              const otherId = m.profile_a === user.id ? m.profile_b : m.profile_a;
              const other = await loadProfileById(otherId);
              return other ? { id: m.id, other } : null;
            })
          )
        ).filter((m): m is ActiveMatch => m !== null);

        setCandidates(candidatesData);
        setLikedIds(new Set((myLikes ?? []).map((l) => l.liked_id)));
        setMatches(activeMatches);
        setMatchedIds(new Set(activeMatches.map((m) => m.other.id)));
        setStatus("ready");
      } catch (e) {
        console.error(e);
        if (active) {
          setStatus("error");
          setErrorMsg(t[browserLocale()].room.loadError);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [venueSlug, router, loadProfileById, loadCandidates]);

  // Heartbeat: keep our presence fresh while the room is open and the tab is
  // visible. check_in is idempotent — it just bumps last_seen_at.
  useEffect(() => {
    if (!venue || status !== "ready") return;
    const beat = () => supabase.rpc("check_in", { p_venue_id: venue.id });
    const id = setInterval(beat, HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [venue, status]);

  // Realtime: the room fills and empties as people check in / leave.
  useEffect(() => {
    if (!venue || !me || status !== "ready") return;
    const channel = supabase
      .channel(`presence-${venue.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "presence",
          filter: `venue_id=eq.${venue.id}`,
        },
        async () => {
          const next = await loadCandidates(venue.id, me.id, me);
          setCandidates(next);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [venue, me, status, loadCandidates]);

  // Realtime: a match unlocks the moment a reciprocal like lands (for either side).
  useEffect(() => {
    if (!venue) return;
    const channel = supabase
      .channel(`matches-${venue.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "matches",
          filter: `venue_id=eq.${venue.id}`,
        },
        async (payload) => {
          const m = payload.new as MatchRow;
          const myId = meRef.current?.id;
          if (!myId || (m.profile_a !== myId && m.profile_b !== myId)) return;
          if (Date.parse(m.expires_at) <= Date.now()) return;
          const otherId = m.profile_a === myId ? m.profile_b : m.profile_a;
          const other = await loadProfileById(otherId);
          if (other) registerMatch({ id: m.id, other }, true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [venue, loadProfileById, registerMatch]);

  async function like(candidate: PublicProfile) {
    if (!me || !venue) return;
    // Optimistic: the like is secret, so the only feedback is "you liked them".
    setLikedIds((prev) => new Set(prev).add(candidate.id));

    const { error } = await supabase.from("likes").insert({
      liker_id: me.id,
      liked_id: candidate.id,
      venue_id: venue.id,
    });
    if (error) {
      console.error(error);
      setLikedIds((prev) => {
        const next = new Set(prev);
        next.delete(candidate.id);
        return next;
      });
      setErrorMsg(s.likeError);
      return;
    }

    // If they had already liked me, the trigger just created the match. Realtime
    // will deliver it, but check directly too so the reveal feels instant.
    const { data: match } = await supabase
      .from("matches")
      .select("id, profile_a, profile_b, expires_at")
      .eq("venue_id", venue.id)
      .or(`profile_a.eq.${candidate.id},profile_b.eq.${candidate.id}`)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (match) registerMatch({ id: match.id, other: candidate }, true);
  }

  // Explicit control over your own presence (women-first): leave the room and
  // disappear from it immediately, without waiting for the nightly rollover.
  async function leave() {
    if (!me) return;
    await supabase
      .from("presence")
      .update({ left_at: new Date().toISOString() })
      .eq("profile_id", me.id)
      .is("left_at", null);
    setStatus("left");
  }

  async function rejoin() {
    if (!venue || !me) return;
    setStatus("loading");
    const { error } = await supabase.rpc("check_in", { p_venue_id: venue.id });
    if (error) {
      console.error(error);
      setStatus("error");
      setErrorMsg(s.loadError);
      return;
    }
    setCandidates(await loadCandidates(venue.id, me.id, me));
    setStatus("ready");
  }

  if (status === "loading") {
    return (
      <Shell>
        <p className="text-sm text-zinc-500">{s.entering}</p>
      </Shell>
    );
  }

  if (status === "error") {
    return (
      <Shell>
        <p className="text-sm text-red-400">{errorMsg}</p>
      </Shell>
    );
  }

  if (status === "left") {
    return (
      <Shell>
        <h2 className="text-2xl font-bold">{s.leftTitle}</h2>
        <p className="mt-3 text-zinc-400">{s.leftBody}</p>
        <button
          onClick={rejoin}
          className="mt-8 w-full rounded-2xl bg-yellow-400 px-5 py-4 font-bold text-black transition hover:bg-yellow-300"
        >
          {s.rejoin}
        </button>
      </Shell>
    );
  }

  const visible = candidates.filter((c) => !matchedIds.has(c.id));

  return (
    <main className="min-h-screen bg-gradient-to-br from-black via-zinc-950 to-neutral-900 px-6 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.35em] text-yellow-400">
              BarTap
            </p>
            <h1 className="mt-3 text-4xl font-black">
              {s.whosHere(venue?.name ?? "")}
            </h1>
          </div>
          <button
            onClick={leave}
            className="shrink-0 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:border-white/30 hover:text-white"
          >
            {s.leave}
          </button>
        </div>
        <p className="mt-2 text-zinc-400">{s.pitch}</p>

        {matches.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-[0.25em] text-zinc-500">
              {s.activeMatches}
            </h2>
            <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
              {matches.map((match) => (
                <Link
                  key={match.id}
                  href={`/chat/${match.id}`}
                  className="flex min-w-48 items-center gap-3 rounded-2xl border border-yellow-400/30 bg-yellow-400/10 p-3 transition hover:border-yellow-300/70"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={match.other.photo_url}
                    alt={match.other.first_name}
                    className="h-12 w-12 rounded-full object-cover"
                  />
                  <span>
                    <span className="block font-bold text-white">
                      {match.other.first_name}
                    </span>
                    <span className="block text-sm text-yellow-200">
                      {s.chat}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {visible.length === 0 ? (
          <p className="mt-12 text-zinc-500">{s.empty}</p>
        ) : (
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {visible.map((c) => {
              const liked = likedIds.has(c.id);
              return (
                <div
                  key={c.id}
                  className="rounded-3xl border border-white/10 bg-white/5 p-6"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={c.photo_url}
                    alt={c.first_name}
                    className="h-48 w-full rounded-2xl object-cover"
                  />
                  <h2 className="mt-4 text-2xl font-bold">{c.first_name}</h2>
                  <p className="mt-2 min-h-[1.5rem] text-zinc-400">
                    {c.bio ?? ""}
                  </p>
                  <button
                    onClick={() => like(c)}
                    disabled={liked}
                    className={`mt-4 w-full rounded-2xl px-5 py-3 font-bold transition ${
                      liked
                        ? "cursor-default bg-white/10 text-zinc-400"
                        : "bg-yellow-400 text-black hover:bg-yellow-300"
                    }`}
                  >
                    {liked ? s.liked : s.like}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {newMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6 backdrop-blur">
          <div className="w-full max-w-sm rounded-3xl border border-yellow-400/40 bg-zinc-950 p-8 text-center shadow-2xl">
            <p className="text-sm uppercase tracking-[0.35em] text-yellow-400">
              {s.matchKicker}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={newMatch.other.photo_url}
              alt={newMatch.other.first_name}
              className="mx-auto mt-6 h-32 w-32 rounded-full object-cover"
            />
            <h2 className="mt-4 text-3xl font-black">
              {newMatch.other.first_name}
            </h2>
            <p className="mt-3 text-zinc-300">{s.matchBody}</p>
            <div className="mt-8 grid gap-3">
              <Link
                href={`/chat/${newMatch.id}`}
                className="w-full rounded-2xl bg-yellow-400 px-5 py-4 font-bold text-black transition hover:bg-yellow-300"
              >
                {s.openChat}
              </Link>
              <button
                onClick={() => setNewMatch(null)}
                className="w-full rounded-2xl border border-white/10 px-5 py-4 font-bold text-white transition hover:border-white/30"
              >
                {s.matchDismiss}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-black via-zinc-950 to-neutral-900 px-6 text-white">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl backdrop-blur">
        <p className="text-sm uppercase tracking-[0.35em] text-yellow-400">
          BarTap
        </p>
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
