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
          className="night-button night-button-primary mt-6 inline-flex px-5 py-3"
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
    <main className="night-shell flex min-h-screen flex-col text-white">
      <header className="night-content sticky top-0 z-10 border-b border-white/10 bg-[#070305]/80 px-4 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-4">
          <Link
            href={`/v/${match.venue.slug}`}
            className="night-button night-button-secondary rounded-full px-3 py-2 text-sm"
          >
            {s.backToRoom}
          </Link>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={other.photo_url}
            alt={other.first_name}
            className="night-photo-ring h-12 w-12 rounded-full object-cover"
          />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-black">{other.first_name}</h1>
            <p className="truncate text-sm text-[#d9bbb1]">{s.expiresTonight}</p>
          </div>
          <div className="ml-auto flex shrink-0 gap-2">
            <button
              onClick={openReport}
              className="night-button night-button-secondary rounded-full px-3 py-2 text-sm"
            >
              {roomS.report}
            </button>
            <button
              onClick={confirmBlockOther}
              className="night-button night-button-danger rounded-full px-3 py-2 text-sm"
            >
              {roomS.block}
            </button>
          </div>
        </div>
      </header>

      <section className="night-content mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 px-4 py-6 sm:px-5">
        {messages.length === 0 ? (
          <div className="night-panel mt-16 rounded-[2rem] p-8 text-center">
            <p className="night-muted">{s.empty}</p>
          </div>
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
                      ? "bg-gradient-to-br from-[#f6b35a] via-[#ff7aa8] to-[#c084fc] text-[#120508] shadow-[0_14px_36px_rgba(255,61,129,0.22)]"
                      : "border border-white/10 bg-white/10 text-[#fff7ed]"
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
        className="night-content sticky bottom-0 border-t border-white/10 bg-[#070305]/84 px-4 py-4 backdrop-blur-xl sm:px-5"
      >
        <div className="mx-auto flex max-w-3xl gap-3">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={2000}
            placeholder={s.placeholder}
            className="night-input min-w-0 flex-1 px-4 py-3"
          />
          <button
            disabled={sending || draft.trim().length === 0}
            className="night-button night-button-primary px-5 py-3 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-[#8b7773]"
          >
            {s.send}
          </button>
        </div>
        {errorMsg && (
          <p className="mx-auto mt-3 max-w-3xl text-sm text-red-300">
            {errorMsg}
          </p>
        )}
      </form>

      {reportOpen && other && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6 backdrop-blur-xl">
          <form
            onSubmit={submitReport}
            className="night-panel w-full max-w-sm rounded-[2rem] p-6"
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
                    className="night-button night-button-danger px-5 py-3"
                  >
                    {roomS.block}
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportOpen(false)}
                    className="night-button night-button-secondary px-5 py-3"
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
                    className="night-input mt-2 px-4 py-3"
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
                  className="night-input mt-4 h-28 resize-none px-4 py-3"
                />
                {errorMsg && (
                  <p className="mt-3 text-sm text-red-400">{errorMsg}</p>
                )}
                <div className="mt-6 grid gap-3">
                  <button
                    type="submit"
                    className="night-button night-button-primary px-5 py-3"
                  >
                    {roomS.reportSubmit}
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportOpen(false)}
                    className="night-button night-button-secondary px-5 py-3"
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
    <main className="night-shell flex min-h-screen items-center justify-center px-6 text-white">
      <div
        className={`night-content night-panel w-full max-w-md rounded-[2rem] p-8 text-center text-sm ${
          tone === "error" ? "text-red-300" : "night-muted"
        }`}
      >
        {children}
      </div>
    </main>
  );
}
