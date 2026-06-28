"use client";

import { LANGUAGE_OPTIONS, setPreferredLocale, usePreferredLocale } from "@/lib/useLocale";
import type { Locale } from "@/lib/strings";

export function LanguageSelector({ className = "" }: { className?: string }) {
  const locale = usePreferredLocale();

  return (
    <label
      className={`inline-flex items-center rounded-full border border-white/10 bg-black/25 px-3 py-2 text-xs font-black uppercase tracking-normal text-[#fde7bd] backdrop-blur ${className}`}
    >
      <span className="sr-only">Language</span>
      <select
        value={locale}
        onChange={(event) => setPreferredLocale(event.target.value as Locale)}
        aria-label="Language"
        className="bg-transparent text-inherit outline-none"
      >
        {LANGUAGE_OPTIONS.map((option) => (
          <option key={option.locale} value={option.locale} className="text-black">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
