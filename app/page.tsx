"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ensureAnonSession } from "@/lib/auth";
import { DEV_DEFAULT_VENUE_SLUG } from "@/lib/config";
import { browserLocale, t } from "@/lib/strings";
import { preferredLocale, useBrowserLocale } from "@/lib/useLocale";
import { LanguageSelector } from "@/app/LanguageSelector";

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
          setError(t[preferredLocale(browserLocale())].landing.sessionError);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main className="night-shell flex min-h-screen items-end px-6 py-10 sm:items-center">
      <div className="fixed right-5 top-5 z-20">
        <LanguageSelector />
      </div>
      <section className="night-content mx-auto w-full max-w-5xl">
        <div className="max-w-2xl">
          <p className="night-kicker">{s.welcome}</p>
          <h1 className="mt-4 text-6xl font-black leading-[0.9] tracking-normal text-white sm:text-8xl">
            Paramour
          </h1>
          <p className="mt-6 max-w-sm text-xl font-medium leading-relaxed text-[#f9d7c4] sm:text-2xl">
            {s.tagline}
          </p>
        </div>

        {error ? (
          <p className="mt-10 max-w-md rounded-2xl border border-red-300/20 bg-red-950/20 px-4 py-3 text-sm text-red-200">
            {error}
          </p>
        ) : (
          <div className="mt-10 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-[#e7c7b4] backdrop-blur">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#f6b35a] shadow-[0_0_18px_rgba(246,179,90,0.9)]" />
            {s.settingUp}
          </div>
        )}
      </section>
    </main>
  );
}
