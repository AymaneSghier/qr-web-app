"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ensureAnonSession } from "@/lib/auth";
import { isMutuallyCompatible } from "@/lib/profile";
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

export default function VenueRoom() {
  const router = useRouter();
  const params = useParams<{ venueSlug: string }>();
  const venueSlug = params.venueSlug;

  const [me, setMe] = useState<PublicProfile | null>(null);
  const [venue, setVenue] = useState<Venue | null>(null);
  const [candidates, setCandidates] = useState<PublicProfile[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [matchedIds, setMatchedIds] = useState<Set<string>>(new Set());
  const [newMatch, setNewMatch] = useState<PublicProfile | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  // Keep the latest "me" available to the realtime callback without resubscribing.
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
    return data;
  }, []);

  const registerMatch = useCallback((other: PublicProfile, reveal: boolean) => {
    setMatchedIds((prev) => {
      if (prev.has(other.id)) return prev;
      const next = new Set(prev);
      next.add(other.id);
      return next;
    });
    if (reveal) setNewMatch((current) => current ?? other);
  }, []);

  // Bootstrap: session, profile, venue, candidates, existing likes & matches.
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
          setErrorMsg("This venue doesn't exist.");
          return;
        }
        setVenue(venueRow);

        const [{ data: others }, { data: myLikes }, { data: myMatches }] =
          await Promise.all([
            supabase.from("profiles").select(PUBLIC_COLUMNS).neq("id", user.id),
            supabase
              .from("likes")
              .select("liked_id")
              .eq("venue_id", venueRow.id),
            supabase
              .from("matches")
              .select("profile_a, profile_b")
              .eq("venue_id", venueRow.id),
          ]);
        if (!active) return;

        setCandidates(
          (others ?? []).filter((p) => isMutuallyCompatible(myProfile, p))
        );
        setLikedIds(new Set((myLikes ?? []).map((l) => l.liked_id)));
        setMatchedIds(
          new Set(
            (myMatches ?? []).map((m) =>
              m.profile_a === user.id ? m.profile_b : m.profile_a
            )
          )
        );
        setStatus("ready");
      } catch (e) {
        console.error(e);
        if (active) {
          setStatus("error");
          setErrorMsg("Couldn't load the room. Anonymous sign-in may be disabled.");
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [venueSlug, router, loadProfileById]);

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
          const m = payload.new as { profile_a: string; profile_b: string };
          const myId = meRef.current?.id;
          if (!myId || (m.profile_a !== myId && m.profile_b !== myId)) return;
          const otherId = m.profile_a === myId ? m.profile_b : m.profile_a;
          const other = await loadProfileById(otherId);
          if (other) registerMatch(other, true);
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
      setErrorMsg("Couldn't register your like. Try again.");
      return;
    }

    // If they had already liked me, the trigger just created the match. Realtime
    // will deliver it, but check directly too so the reveal feels instant.
    const { data: match } = await supabase
      .from("matches")
      .select("profile_a, profile_b")
      .eq("venue_id", venue.id)
      .or(`profile_a.eq.${candidate.id},profile_b.eq.${candidate.id}`)
      .maybeSingle();
    if (match) registerMatch(candidate, true);
  }

  if (status === "loading") {
    return (
      <Shell>
        <p className="text-sm text-zinc-500">Walking into the room…</p>
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

  const visible = candidates.filter((c) => !matchedIds.has(c.id));

  return (
    <main className="min-h-screen bg-gradient-to-br from-black via-zinc-950 to-neutral-900 px-6 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm uppercase tracking-[0.35em] text-yellow-400">
          BarTap
        </p>
        <h1 className="mt-3 text-4xl font-black">
          {`Who's at ${venue?.name ?? "the bar"}`}
        </h1>
        <p className="mt-2 text-zinc-400">
          {
            "Like discreetly. A chat only opens if it's mutual — no one ever knows you liked them unless they like you back."
          }
        </p>

        {visible.length === 0 ? (
          <p className="mt-12 text-zinc-500">
            No one to show yet. Check back when the room fills up.
          </p>
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
                    {liked ? "Liked" : "Like"}
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
              {"It's a match"}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={newMatch.photo_url}
              alt={newMatch.first_name}
              className="mx-auto mt-6 h-32 w-32 rounded-full object-cover"
            />
            <h2 className="mt-4 text-3xl font-black">{newMatch.first_name}</h2>
            <p className="mt-3 text-zinc-300">
              {"You both tapped. Go say hi — they're here tonight."}
            </p>
            <button
              onClick={() => setNewMatch(null)}
              className="mt-8 w-full rounded-2xl bg-yellow-400 px-5 py-4 font-bold text-black transition hover:bg-yellow-300"
            >
              Keep browsing
            </button>
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
