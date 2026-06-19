"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ensureAnonSession } from "@/lib/auth";
import { DEV_DEFAULT_VENUE_SLUG } from "@/lib/config";
import { browserLocale, t } from "@/lib/strings";
import { useBrowserLocale } from "@/lib/useLocale";

export default function Home() {
  const router = useRouter();
  const [error, setError] = useState("");
  // Pre-venue page: no venue yet, so fall back to the browser language
  // (resolved after mount to avoid an SSR hydration mismatch).
  const s = t[useBrowserLocale()].landing;

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const user = await ensureAnonSession();

        const { data, error: profileError } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", user.id)
          .maybeSingle();
        if (profileError) throw profileError;
        if (!active) return;

        if (!data) {
          router.replace("/profile");
          return;
        }

        const { data: privateProfile, error: privateError } = await supabase
          .from("profile_private")
          .select("adult_confirmed_at")
          .eq("id", user.id)
          .maybeSingle();
        if (privateError) throw privateError;
        if (!active) return;

        router.replace(
          privateProfile?.adult_confirmed_at
            ? `/v/${DEV_DEFAULT_VENUE_SLUG}`
            : "/profile"
        );
      } catch (e) {
        console.error(e);
        if (active) {
          setError(t[browserLocale()].landing.sessionError);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-black via-zinc-950 to-neutral-900 px-6 text-white">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl backdrop-blur">
        <p className="text-sm uppercase tracking-[0.35em] text-yellow-400">
          {s.welcome}
        </p>
        <h1 className="mt-3 text-6xl font-black tracking-tight">BarTap</h1>
        <p className="mt-4 text-lg text-zinc-300">{s.tagline}</p>

        {error ? (
          <p className="mt-8 text-sm text-red-400">{error}</p>
        ) : (
          <p className="mt-8 text-sm text-zinc-500">{s.settingUp}</p>
        )}
      </div>
    </main>
  );
}
