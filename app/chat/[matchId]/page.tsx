"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ensureAnonSession } from "@/lib/auth";
import type { Database } from "@/lib/database.types";
import { browserLocale, localeForCity, t } from "@/lib/strings";
import { supabase } from "@/lib/supabase";
import { useBrowserLocale } from "@/lib/useLocale";

type PublicProfile = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "first_name" | "photo_url"
>;

type Message = Pick<
  Database["public"]["Tables"]["messages"]["Row"],
  "id" | "match_id" | "sender_id" | "body" | "created_at"
>;

type MatchDetails = Pick<
  Database["public"]["Tables"]["matches"]["Row"],
  "id" | "profile_a" | "profile_b" | "venue_id" | "expires_at"
> & {
  venue: Pick<
    Database["public"]["Tables"]["venues"]["Row"],
    "name" | "city" | "slug"
  >;
};

const PROFILE_COLUMNS = "id, first_name, photo_url";
const MESSAGE_COLUMNS = "id, match_id, sender_id, body, created_at";
const REPORT_REASONS = [
  "harassment",
  "fake_profile",
  "underage",
  "unsafe_behavior",
  "other",
] as const;
type ReportReason = (typeof REPORT_REASONS)[number];

type Status = "loading" | "ready" | "closed" | "error";

export default function MatchChatPage() {
  const params = useParams<{ matchId: string }>();
  const matchId = params.matchId;
  const browserLoc = useBrowserLocale();

  const [me, setMe] = useState<PublicProfile | null>(null);
  const [other, setOther] = useState<PublicProfile | null>(null);
  const [match, setMatch] = useState<MatchDetails | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason>("harassment");
  const [reportNote, setReportNote] = useState("");
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const locale = match ? localeForCity(match.venue.city) : browserLoc;
  const s = t[locale].chat;
  const roomS = t[locale].room;

  const appendMessage = useCallback((message: Message) => {
    setMessages((prev) =>
      prev.some((existing) => existing.id === message.id)
        ? prev
        : [...prev, message].sort(
            (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)
          )
    );
  }, []);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const user = await ensureAnonSession();

        const { data: myProfile } = await supabase
          .from("profiles")
          .select(PROFILE_COLUMNS)
          .eq("id", user.id)
          .maybeSingle();
        if (!active) return;
        if (!myProfile) {
          setStatus("error");
          setErrorMsg(t[browserLocale()].chat.unavailable);
          return;
        }
        setMe(myProfile as PublicProfile);

        const { data: matchRow, error: matchError } = await supabase
          .from("matches")
          .select(
            "id, profile_a, profile_b, venue_id, expires_at, venues!inner(name, city, slug)"
          )
          .eq("id", matchId)
          .maybeSingle();
        if (matchError) throw matchError;
        if (!active) return;
        if (!matchRow) {
          setStatus("error");
          setErrorMsg(t[browserLocale()].chat.unavailable);
          return;
        }

        const normalizedMatch = {
          id: matchRow.id,
          profile_a: matchRow.profile_a,
          profile_b: matchRow.profile_b,
          venue_id: matchRow.venue_id,
          expires_at: matchRow.expires_at,
          venue: Array.isArray(matchRow.venues)
            ? matchRow.venues[0]
            : matchRow.venues,
        } as MatchDetails;

        if (Date.parse(normalizedMatch.expires_at) <= Date.now()) {
          setMatch(normalizedMatch);
          setStatus("closed");
          return;
        }

        const otherId =
          normalizedMatch.profile_a === user.id
            ? normalizedMatch.profile_b
            : normalizedMatch.profile_a;

        const [{ data: otherProfile }, { data: messageRows, error: messagesError }] =
          await Promise.all([
            supabase
              .from("profiles")
              .select(PROFILE_COLUMNS)
              .eq("id", otherId)
              .maybeSingle(),
            supabase
              .from("messages")
              .select(MESSAGE_COLUMNS)
              .eq("match_id", matchId)
              .order("created_at", { ascending: true }),
          ]);
        if (messagesError) throw messagesError;
        if (!active) return;
        if (!otherProfile) {
          setStatus("error");
          setErrorMsg(t[browserLocale()].chat.unavailable);
          return;
        }

        setMatch(normalizedMatch);
        setOther(otherProfile as PublicProfile);
        setMessages((messageRows ?? []) as Message[]);
        setStatus("ready");
      } catch (e) {
        console.error(e);
        if (active) {
          setStatus("error");
          setErrorMsg(t[browserLocale()].chat.unavailable);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [matchId]);

  useEffect(() => {
    if (status !== "ready") return;
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, status]);

  useEffect(() => {
    if (status !== "ready") return;

    const channel = supabase
      .channel(`messages-${matchId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => appendMessage(payload.new as Message)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [appendMessage, matchId, status]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!me || !match || sending) return;

    const body = draft.trim();
    if (!body) return;

    setSending(true);
    setDraft("");

    const { data, error } = await supabase
      .from("messages")
      .insert({ match_id: match.id, sender_id: me.id, body })
      .select(MESSAGE_COLUMNS)
      .single();

    setSending(false);

    if (error) {
      console.error(error);
      setDraft(body);
      setErrorMsg(s.sendError);
      return;
    }

    appendMessage(data as Message);
    setErrorMsg("");
  }

  async function blockOther() {
    if (!me || !other || !match) return;

    const { error } = await supabase.from("blocks").insert({
      blocker_id: me.id,
      blocked_id: other.id,
      venue_id: match.venue_id,
    });
    if (error && error.code !== "23505") {
      console.error(error);
      setErrorMsg(roomS.blockError);
      return;
    }

    setReportOpen(false);
    setMessages([]);
    setStatus("closed");
    setErrorMsg("");
  }

  async function confirmBlockOther() {
    if (!other) return;
    if (!window.confirm(roomS.blockConfirm(other.first_name))) return;
    await blockOther();
  }

  function openReport() {
    setReportOpen(true);
    setReportReason("harassment");
    setReportNote("");
    setReportSubmitted(false);
    setErrorMsg("");
  }

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!me || !other || !match) return;

    const { error } = await supabase.from("reports").insert({
      reporter_id: me.id,
      reported_id: other.id,
      venue_id: match.venue_id,
      reason: reportReason,
      note: reportNote.trim() || null,
    });
    if (error) {
      console.error(error);
      setErrorMsg(roomS.reportError);
      return;
    }

    setReportSubmitted(true);
    setErrorMsg("");
  }

  if (status === "loading") {
    return <Shell>{s.loading}</Shell>;
  }

  if (status === "error") {
    return <Shell tone="error">{errorMsg}</Shell>;
  }

  if (status === "closed" && match) {
    return (
      <Shell tone="error">
        <p>{s.closed}</p>
        <Link
          href={`/v/${match.venue.slug}`}
          className="mt-6 inline-flex rounded-2xl bg-yellow-400 px-5 py-3 font-bold text-black"
        >
          {s.backToRoom}
        </Link>
      </Shell>
    );
  }

  if (!me || !other || !match) {
    return <Shell tone="error">{s.unavailable}</Shell>;
  }

  return (
    <main className="flex min-h-screen flex-col bg-zinc-950 text-white">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-zinc-950/95 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-4">
          <Link
            href={`/v/${match.venue.slug}`}
            className="rounded-full border border-white/10 px-3 py-2 text-sm font-semibold text-zinc-300"
          >
            {s.backToRoom}
          </Link>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={other.photo_url}
            alt={other.first_name}
            className="h-12 w-12 rounded-full object-cover"
          />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-black">{other.first_name}</h1>
            <p className="truncate text-sm text-zinc-400">{s.expiresTonight}</p>
          </div>
          <div className="ml-auto flex shrink-0 gap-2">
            <button
              onClick={openReport}
              className="rounded-full border border-white/10 px-3 py-2 text-sm font-semibold text-zinc-300 transition hover:border-white/30"
            >
              {roomS.report}
            </button>
            <button
              onClick={confirmBlockOther}
              className="rounded-full border border-red-400/30 px-3 py-2 text-sm font-semibold text-red-200 transition hover:border-red-300"
            >
              {roomS.block}
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 px-5 py-6">
        {messages.length === 0 ? (
          <p className="mt-16 text-center text-zinc-500">{s.empty}</p>
        ) : (
          messages.map((message) => {
            const mine = message.sender_id === me.id;
            return (
              <div
                key={message.id}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <p
                  className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    mine
                      ? "bg-yellow-400 text-black"
                      : "bg-white/10 text-zinc-100"
                  }`}
                >
                  {message.body}
                </p>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </section>

      <form
        onSubmit={sendMessage}
        className="sticky bottom-0 border-t border-white/10 bg-zinc-950/95 px-5 py-4 backdrop-blur"
      >
        <div className="mx-auto flex max-w-3xl gap-3">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={2000}
            placeholder={s.placeholder}
            className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-yellow-400"
          />
          <button
            disabled={sending || draft.trim().length === 0}
            className="rounded-2xl bg-yellow-400 px-5 py-3 font-bold text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-zinc-500"
          >
            {s.send}
          </button>
        </div>
        {errorMsg && (
          <p className="mx-auto mt-3 max-w-3xl text-sm text-red-400">
            {errorMsg}
          </p>
        )}
      </form>

      {reportOpen && other && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6 backdrop-blur">
          <form
            onSubmit={submitReport}
            className="w-full max-w-sm rounded-3xl border border-white/10 bg-zinc-950 p-6 shadow-2xl"
          >
            <h2 className="text-2xl font-black">
              {roomS.reportTitle(other.first_name)}
            </h2>
            {reportSubmitted ? (
              <>
                <p className="mt-4 text-zinc-300">{roomS.reportSuccess}</p>
                <p className="mt-2 text-sm text-zinc-500">
                  {roomS.reportBlockPrompt}
                </p>
                <div className="mt-6 grid gap-3">
                  <button
                    type="button"
                    onClick={blockOther}
                    className="rounded-2xl bg-red-500 px-5 py-3 font-bold text-white transition hover:bg-red-400"
                  >
                    {roomS.block}
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportOpen(false)}
                    className="rounded-2xl border border-white/10 px-5 py-3 font-bold text-white transition hover:border-white/30"
                  >
                    {roomS.reportCancel}
                  </button>
                </div>
              </>
            ) : (
              <>
                <label className="mt-5 block text-sm font-semibold text-zinc-300">
                  {roomS.reportReason}
                  <select
                    value={reportReason}
                    onChange={(event) =>
                      setReportReason(event.target.value as ReportReason)
                    }
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-yellow-400"
                  >
                    {REPORT_REASONS.map((reason) => (
                      <option key={reason} value={reason}>
                        {roomS.reportReasons[reason]}
                      </option>
                    ))}
                  </select>
                </label>
                <textarea
                  value={reportNote}
                  onChange={(event) => setReportNote(event.target.value)}
                  maxLength={500}
                  placeholder={roomS.reportNote}
                  className="mt-4 h-28 w-full resize-none rounded-2xl border border-white/10 bg-black px-4 py-3 text-white outline-none placeholder:text-zinc-600 focus:border-yellow-400"
                />
                {errorMsg && (
                  <p className="mt-3 text-sm text-red-400">{errorMsg}</p>
                )}
                <div className="mt-6 grid gap-3">
                  <button
                    type="submit"
                    className="rounded-2xl bg-yellow-400 px-5 py-3 font-bold text-black transition hover:bg-yellow-300"
                  >
                    {roomS.reportSubmit}
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportOpen(false)}
                    className="rounded-2xl border border-white/10 px-5 py-3 font-bold text-white transition hover:border-white/30"
                  >
                    {roomS.reportCancel}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      )}
    </main>
  );
}

function Shell({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "error";
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-white">
      <div
        className={`w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-sm shadow-2xl ${
          tone === "error" ? "text-red-400" : "text-zinc-500"
        }`}
      >
          {children}
      </div>
    </main>
  );
}
