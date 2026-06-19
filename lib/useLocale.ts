"use client";

import { useSyncExternalStore } from "react";
import { browserLocale, type Locale } from "@/lib/strings";

// The locale is fixed for the session, so there is nothing to subscribe to.
const subscribe = () => () => {};

// Locale for pre-venue pages (landing, profile), where there is no venue to
// derive a language from so we follow the browser. navigator.language does not
// exist during SSR, so reading it at render time makes the server output differ
// from the client and triggers a hydration mismatch. useSyncExternalStore is
// the hydration-safe path: React renders the server snapshot ("en") for the
// server and the first client paint, then swaps to the real browser locale.
export function useBrowserLocale(): Locale {
  return useSyncExternalStore<Locale>(
    subscribe,
    () => browserLocale(),
    () => "en"
  );
}
