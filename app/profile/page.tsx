"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ensureAnonSession } from "@/lib/auth";
import { DEV_DEFAULT_VENUE_SLUG } from "@/lib/config";
import { GENDERS, GENDER_LABELS, type Gender } from "@/lib/profile";

export default function ProfilePage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [bio, setBio] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [interestedIn, setInterestedIn] = useState<Gender[]>([]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  // Ensure a session, and skip onboarding if this user already has a profile.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const user = await ensureAnonSession();
        if (!active) return;
        setUserId(user.id);

        const { data } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", user.id)
          .maybeSingle();
        if (active && data) router.replace(`/v/${DEV_DEFAULT_VENUE_SLUG}`);
      } catch (e) {
        console.error(e);
        if (active) setMessage("Couldn't start your session. Try again.");
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  function toggleInterest(g: Gender) {
    setInterestedIn((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]
    );
  }

  async function handleSaveProfile() {
    if (!userId) return;
    if (!firstName.trim()) return setMessage("Please enter your first name.");
    if (!photo) return setMessage("Please add a profile picture.");
    if (!gender) return setMessage("Please select your gender.");
    if (interestedIn.length === 0)
      return setMessage("Please select who you'd like to meet.");

    setSaving(true);
    setMessage("");

    // Photo goes to the public profile-photos bucket, namespaced by user id.
    const fileName = `${userId}/${Date.now()}-${photo.name}`;
    const { error: uploadError } = await supabase.storage
      .from("profile-photos")
      .upload(fileName, photo);
    if (uploadError) {
      console.error(uploadError);
      setSaving(false);
      return setMessage("Photo upload failed.");
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("profile-photos").getPublicUrl(fileName);

    const { error } = await supabase.from("profiles").insert({
      id: userId,
      first_name: firstName.trim(),
      photo_url: publicUrl,
      bio: bio.trim() || null,
      gender,
      interested_in: interestedIn,
    });
    if (error) {
      console.error(error);
      setSaving(false);
      return setMessage("Something went wrong. Try again.");
    }

    router.replace(`/v/${DEV_DEFAULT_VENUE_SLUG}`);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-black via-zinc-950 to-neutral-900 px-6 py-10 text-white">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur">
        <p className="text-sm uppercase tracking-[0.35em] text-yellow-400">
          BarTap
        </p>
        <h1 className="mt-3 text-4xl font-black">Set up your profile</h1>
        <p className="mt-3 text-zinc-400">
          {"A real first name and photo, that's it."}
        </p>

        <div className="mt-8 flex justify-center">
          <label className="cursor-pointer">
            <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-zinc-500 bg-black/30 text-center text-sm text-zinc-400">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="h-full w-full object-cover"
                />
              ) : (
                "Add Photo"
              )}
            </div>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoChange}
            />
          </label>
        </div>

        <input
          className="mt-8 w-full rounded-2xl border border-white/10 bg-black/40 px-5 py-4 text-white outline-none placeholder:text-zinc-600 focus:border-yellow-400"
          placeholder="First name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        />

        <textarea
          className="mt-4 h-28 w-full resize-none rounded-2xl border border-white/10 bg-black/40 px-5 py-4 text-white outline-none placeholder:text-zinc-600 focus:border-yellow-400"
          placeholder="Bio (optional)"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
        />

        <div className="mt-6">
          <p className="text-sm text-zinc-400">I am</p>
          <div className="mt-2 flex gap-2">
            {GENDERS.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGender(g)}
                className={`flex-1 rounded-2xl border px-3 py-3 text-sm font-semibold transition ${
                  gender === g
                    ? "border-yellow-400 bg-yellow-400 text-black"
                    : "border-white/10 bg-black/40 text-zinc-300 hover:border-yellow-400"
                }`}
              >
                {GENDER_LABELS[g]}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <p className="text-sm text-zinc-400">{"I'd like to meet"}</p>
          <div className="mt-2 flex gap-2">
            {GENDERS.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => toggleInterest(g)}
                className={`flex-1 rounded-2xl border px-3 py-3 text-sm font-semibold transition ${
                  interestedIn.includes(g)
                    ? "border-yellow-400 bg-yellow-400 text-black"
                    : "border-white/10 bg-black/40 text-zinc-300 hover:border-yellow-400"
                }`}
              >
                {GENDER_LABELS[g]}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleSaveProfile}
          disabled={saving}
          className="mt-8 w-full rounded-2xl bg-yellow-400 px-5 py-4 font-bold text-black transition hover:bg-yellow-300 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save profile"}
        </button>

        {message && (
          <p className="mt-4 text-center text-sm text-zinc-300">{message}</p>
        )}
      </div>
    </main>
  );
}
