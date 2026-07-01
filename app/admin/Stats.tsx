"use client";

// Aggregate stats — the lowest-priority surface, and deliberately the least
// powerful. It calls admin_night_stats(), a SECURITY DEFINER function that
// returns per-venue/per-night COUNTS only. There is no admin read of likes or
// matches anywhere; who-liked/matched-whom is never exposed, to anyone. Note the
// ephemeral metrics (likes/matches/chats) are cleaned nightly, so past nights
// read 0 for those — they are effectively "tonight" (see the migration comment).

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type StatRow = {
  venue_id: string;
  venue_name: string;
  night: string;
  checkins: number;
  likes: number;
  matches: number;
  chats_started: number;
};

export function Stats() {
  const [rows, setRows] = useState<StatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // setState only after the await so this is safe to call directly from the
  // mount effect (react-hooks/set-state-in-effect).
  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc("admin_night_stats");
    if (rpcError) {
      setError("Could not load stats.");
      setRows([]);
    } else {
      setError("");
      setRows((data as StatRow[]) ?? []);
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
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold">Per-night stats</h2>
        <button
          type="button"
          onClick={load}
          className="night-button night-button-secondary px-3 py-1.5 text-xs"
        >
          Refresh
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="night-muted text-sm">No activity yet.</p>
      ) : (
        <div className="night-card overflow-x-auto rounded-2xl">
          <table className="w-full text-left text-sm">
            <thead className="night-muted border-b border-white/10 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">Venue</th>
                <th className="px-4 py-3">Night</th>
                <th className="px-4 py-3 text-right">Check-ins</th>
                <th className="px-4 py-3 text-right">Likes</th>
                <th className="px-4 py-3 text-right">Matches</th>
                <th className="px-4 py-3 text-right">Chats</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={`${row.venue_id}-${row.night}`}
                  className="border-b border-white/5 last:border-0"
                >
                  <td className="px-4 py-3 font-semibold">{row.venue_name}</td>
                  <td className="px-4 py-3">{row.night}</td>
                  <td className="px-4 py-3 text-right">{row.checkins}</td>
                  <td className="px-4 py-3 text-right">{row.likes}</td>
                  <td className="px-4 py-3 text-right">{row.matches}</td>
                  <td className="px-4 py-3 text-right">{row.chats_started}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
