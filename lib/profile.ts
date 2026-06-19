// Shared profile vocabulary for the dating filter (see docs/decisions.md,
// 2026-06-19). Kept in sync with the CHECK constraints on public.profiles.

export const GENDERS = ["woman", "man", "nonbinary"] as const;
export type Gender = (typeof GENDERS)[number];

export const GENDER_LABELS: Record<Gender, string> = {
  woman: "Woman",
  man: "Man",
  nonbinary: "Non-binary",
};

// Mutual compatibility: each side must want the other's gender. This is the
// filter that decides who shows up in the room.
export function isMutuallyCompatible(
  a: { gender: string; interested_in: string[] },
  b: { gender: string; interested_in: string[] }
): boolean {
  return a.interested_in.includes(b.gender) && b.interested_in.includes(a.gender);
}
