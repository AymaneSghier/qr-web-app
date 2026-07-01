"use client";

// Moderation queue — the highest-priority admin surface. Reports and blocks land
// here so the founders can finally see and act on them (until now reports were
// readable only by the reporter). Reads ride the admin RLS policies
// (reports_select_admin / blocks_select_admin / profiles_select_admin); a
// non-admin session sees nothing. No like/match data is ever shown here.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type MiniProfile = {
  id: string;
  first_name: string;
  photo_url: string;
};

type VenueRef = { name: string; slug: string } | null;

type ReportRow = {
  id: string;
  reason: string;
  note: string | null;
  created_at: string;
  reporter: MiniProfile | null;
  reported: MiniProfile | null;
  venue: VenueRef;
};

type BlockRow = {
  id: string;
  created_at: string;
  blocker: MiniProfile | null;
  blocked: MiniProfile | null;
  venue: VenueRef;
};

const REASON_LABELS: Record<string, string> = {
  harassment: "Harassment",
  fake_profile: "Fake profile",
  underage: "Underage",
  unsafe_behavior: "Unsafe behavior",
  other: "Other",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

function PersonChip({ profile }: { profile: MiniProfile | null }) {
  if (!profile) return <span className="night-muted">unknown</span>;
  return (
    <span className="inline-flex items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={profile.photo_url}
        alt={profile.first_name}
        className="h-7 w-7 rounded-full object-cover"
      />
      <span className="font-semibold">{profile.first_name}</span>
    </span>
  );
}

export function ModerationQueue() {
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // setState only after the await so this is safe to call directly from the
  // mount effect (react-hooks/set-state-in-effect).
  const load = useCallback(async () => {
    const [reportsRes, blocksRes] = await Promise.all([
      supabase
        .from("reports")
        .select(
          `id, reason, note, created_at,
           reporter:profiles!reports_reporter_id_fkey ( id, first_name, photo_url ),
           reported:profiles!reports_reported_id_fkey ( id, first_name, photo_url ),
           venue:venues ( name, slug )`
        )
        .order("created_at", { ascending: false })
        .returns<ReportRow[]>(),
      supabase
        .from("blocks")
        .select(
          `id, created_at,
           blocker:profiles!blocks_blocker_id_fkey ( id, first_name, photo_url ),
           blocked:profiles!blocks_blocked_id_fkey ( id, first_name, photo_url ),
           venue:venues ( name, slug )`
        )
        .order("created_at", { ascending: false })
        .returns<BlockRow[]>(),
    ]);

    if (reportsRes.error || blocksRes.error) {
      setError("Could not load the moderation queue.");
    } else {
      setError("");
      setReports(reportsRes.data ?? []);
      setBlocks(blocksRes.data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  if (loading) return <p className="night-muted">Loading…</p>;
  if (error) return <p className="text-sm text-red-300">{error}</p>;

  return (
    <div className="space-y-10">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Reports ({reports.length})</h2>
          <button
            type="button"
            onClick={load}
            className="night-button night-button-secondary px-3 py-1.5 text-xs"
          >
            Refresh
          </button>
        </div>
        {reports.length === 0 ? (
          <p className="night-muted text-sm">No reports.</p>
        ) : (
          <ul className="space-y-3">
            {reports.map((report) => (
              <li key={report.id} className="night-card rounded-2xl p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="night-pill rounded-full px-3 py-1 text-xs font-bold">
                    {REASON_LABELS[report.reason] ?? report.reason}
                  </span>
                  <span className="night-muted text-xs">
                    {formatDate(report.created_at)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <PersonChip profile={report.reporter} />
                  <span className="night-muted">reported</span>
                  <PersonChip profile={report.reported} />
                  {report.venue && (
                    <span className="night-muted">· at {report.venue.name}</span>
                  )}
                </div>
                {report.note && (
                  <p className="mt-2 rounded-xl bg-black/30 px-3 py-2 text-sm">
                    “{report.note}”
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Blocks ({blocks.length})</h2>
        {blocks.length === 0 ? (
          <p className="night-muted text-sm">No blocks.</p>
        ) : (
          <ul className="space-y-3">
            {blocks.map((block) => (
              <li key={block.id} className="night-card rounded-2xl p-4">
                <div className="mb-2 flex items-center justify-end">
                  <span className="night-muted text-xs">
                    {formatDate(block.created_at)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <PersonChip profile={block.blocker} />
                  <span className="night-muted">blocked</span>
                  <PersonChip profile={block.blocked} />
                  {block.venue && (
                    <span className="night-muted">· at {block.venue.name}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
