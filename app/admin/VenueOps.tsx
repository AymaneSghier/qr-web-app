"use client";

// Venue ops — list/create venues, toggle live, and get each venue's QR. This is
// what a real night needs (it overlaps Bloc 5). is_live is never flipped by a
// raw UPDATE: start/stop goes through the set_venue_live() RPC so stopping also
// empties the room atomically. Creating a venue uses the venues_insert_admin
// policy; new venues start dark (is_live=false) until a founder presses Start.

import { FormEvent, useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

type Venue = Pick<
  Database["public"]["Tables"]["venues"]["Row"],
  "id" | "slug" | "name" | "city" | "timezone" | "is_live"
>;

// Base origin for the check-in URL encoded in the QR. Defaults to the current
// origin (localhost in dev); set NEXT_PUBLIC_SITE_URL to the deployed URL before
// printing real QR codes.
function qrBase() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export function VenueOps() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [qr, setQr] = useState<Record<string, string>>({});

  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [timezone, setTimezone] = useState("Europe/Paris");
  const [creating, setCreating] = useState(false);

  // setState only after the await so this is safe to call directly from the
  // mount effect (react-hooks/set-state-in-effect).
  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from("venues")
      .select("id, slug, name, city, timezone, is_live")
      .order("name");
    if (loadError) {
      setError("Could not load venues.");
    } else {
      setError("");
      setVenues(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function toggleLive(venue: Venue) {
    setBusyId(venue.id);
    setError("");
    const { error: rpcError } = await supabase.rpc("set_venue_live", {
      p_venue_id: venue.id,
      p_live: !venue.is_live,
    });
    if (rpcError) {
      setError(`Could not ${venue.is_live ? "stop" : "start"} ${venue.name}.`);
    } else {
      await load();
    }
    setBusyId(null);
  }

  async function showQr(venue: Venue) {
    if (qr[venue.id]) {
      setQr((prev) => {
        const next = { ...prev };
        delete next[venue.id];
        return next;
      });
      return;
    }
    const url = `${qrBase()}/v/${venue.slug}`;
    const dataUrl = await QRCode.toDataURL(url, { width: 320, margin: 2 });
    setQr((prev) => ({ ...prev, [venue.id]: dataUrl }));
  }

  async function createVenue(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError("");
    const { error: insertError } = await supabase.from("venues").insert({
      slug: slug.trim(),
      name: name.trim(),
      city: city.trim() || null,
      timezone: timezone.trim(),
    });
    if (insertError) {
      setError("Could not create venue. Check the slug is unique and lowercase.");
    } else {
      setSlug("");
      setName("");
      setCity("");
      setTimezone("Europe/Paris");
      await load();
    }
    setCreating(false);
  }

  return (
    <div className="space-y-10">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Venues ({venues.length})</h2>
          <button
            type="button"
            onClick={load}
            className="night-button night-button-secondary px-3 py-1.5 text-xs"
          >
            Refresh
          </button>
        </div>
        {error && <p className="mb-3 text-sm text-red-300">{error}</p>}
        {loading ? (
          <p className="night-muted">Loading…</p>
        ) : (
          <ul className="space-y-3">
            {venues.map((venue) => (
              <li key={venue.id} className="night-card rounded-2xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{venue.name}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                          venue.is_live
                            ? "bg-emerald-500/20 text-emerald-200"
                            : "bg-white/10 text-white/60"
                        }`}
                      >
                        {venue.is_live ? "LIVE" : "dark"}
                      </span>
                    </div>
                    <p className="night-muted text-xs">
                      /{venue.slug}
                      {venue.city ? ` · ${venue.city}` : ""} · {venue.timezone}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => showQr(venue)}
                      className="night-button night-button-secondary px-3 py-2 text-sm"
                    >
                      {qr[venue.id] ? "Hide QR" : "QR"}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === venue.id}
                      onClick={() => toggleLive(venue)}
                      className={`night-button px-4 py-2 text-sm disabled:opacity-60 ${
                        venue.is_live
                          ? "night-button-danger"
                          : "night-button-primary"
                      }`}
                    >
                      {busyId === venue.id
                        ? "…"
                        : venue.is_live
                          ? "Stop"
                          : "Start"}
                    </button>
                  </div>
                </div>
                {qr[venue.id] && (
                  <div className="mt-4 flex flex-col items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qr[venue.id]}
                      alt={`QR for ${venue.name}`}
                      className="rounded-xl bg-white p-2"
                      width={200}
                      height={200}
                    />
                    <a
                      href={qr[venue.id]}
                      download={`${venue.slug}.png`}
                      className="night-button night-button-secondary px-4 py-2 text-sm"
                    >
                      Download PNG
                    </a>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Create venue</h2>
        <form
          onSubmit={createVenue}
          className="night-panel grid gap-4 rounded-3xl p-6 sm:grid-cols-2"
        >
          <div>
            <label className="mb-1 block text-sm font-semibold">Slug</label>
            <input
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="le-comptoir"
              pattern="[a-z0-9-]+"
              title="Lowercase letters, numbers and hyphens only."
              className="night-input px-4 py-3"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold">Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Le Comptoir"
              className="night-input px-4 py-3"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold">City</label>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Paris"
              className="night-input px-4 py-3"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold">Timezone</label>
            <input
              required
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="Europe/Paris"
              title="IANA timezone, e.g. Europe/Paris or America/New_York."
              className="night-input px-4 py-3"
            />
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={creating}
              className="night-button night-button-primary px-5 py-3 disabled:opacity-60"
            >
              {creating ? "Creating…" : "Create venue (dark)"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
