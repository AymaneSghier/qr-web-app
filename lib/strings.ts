// Lightweight FR/EN UI dictionary (see docs/decisions.md, 2026-06-19).
// No i18n framework yet: the app is a handful of screens, so a single typed
// dictionary is the cheap insurance that a later switch is a one-file change,
// not a hunt across components. Code stays English; only displayed strings live
// here. The brand name "BarTap" is never localized and stays inline in the UI.
//
// Locale is derived from the venue's city inside a room (Paris -> fr, NYC -> en)
// and from the browser language on the pre-venue pages (landing, profile).

export type Locale = "fr" | "en";

// Cities whose room is shown in French. Extend as venues grow; everything else
// defaults to English.
const FRENCH_CITIES = new Set(["paris"]);

export function localeForCity(city: string | null | undefined): Locale {
  if (city && FRENCH_CITIES.has(city.trim().toLowerCase())) return "fr";
  return "en";
}

// Browser-language fallback for pages reached before a venue is known.
export function browserLocale(): Locale {
  if (
    typeof navigator !== "undefined" &&
    navigator.language?.toLowerCase().startsWith("fr")
  ) {
    return "fr";
  }
  return "en";
}

type Dict = {
  landing: {
    welcome: string;
    tagline: string;
    settingUp: string;
    sessionError: string;
  };
  profile: {
    title: string;
    subtitle: string;
    addPhoto: string;
    firstName: string;
    bioOptional: string;
    iAm: string;
    iWantToMeet: string;
    save: string;
    saving: string;
    sessionError: string;
    needFirstName: string;
    needPhoto: string;
    needGender: string;
    needInterest: string;
    photoUploadFailed: string;
    genericError: string;
  };
  genders: { woman: string; man: string; nonbinary: string };
  room: {
    entering: string;
    loadError: string;
    venueNotFound: string;
    // takes the venue name
    whosHere: (venue: string) => string;
    pitch: string;
    empty: string;
    like: string;
    liked: string;
    likeError: string;
    leave: string;
    matchKicker: string;
    matchBody: string;
    matchDismiss: string;
    leftTitle: string;
    leftBody: string;
    rejoin: string;
  };
};

export const t: Record<Locale, Dict> = {
  en: {
    landing: {
      welcome: "Welcome to",
      tagline: "Scan. Tap. Start your night.",
      settingUp: "Setting up your night…",
      sessionError:
        "Couldn't start your session. Anonymous sign-in may be disabled for this project.",
    },
    profile: {
      title: "Set up your profile",
      subtitle: "A real first name and photo, that's it.",
      addPhoto: "Add Photo",
      firstName: "First name",
      bioOptional: "Bio (optional)",
      iAm: "I am",
      iWantToMeet: "I'd like to meet",
      save: "Save profile",
      saving: "Saving…",
      sessionError: "Couldn't start your session. Try again.",
      needFirstName: "Please enter your first name.",
      needPhoto: "Please add a profile picture.",
      needGender: "Please select your gender.",
      needInterest: "Please select who you'd like to meet.",
      photoUploadFailed: "Photo upload failed.",
      genericError: "Something went wrong. Try again.",
    },
    genders: { woman: "Woman", man: "Man", nonbinary: "Non-binary" },
    room: {
      entering: "Walking into the room…",
      loadError: "Couldn't load the room. Anonymous sign-in may be disabled.",
      venueNotFound: "This venue doesn't exist.",
      whosHere: (venue) => `Who's at ${venue}`,
      pitch:
        "Like discreetly. A chat only opens if it's mutual. No one ever knows you liked them unless they like you back.",
      empty: "No one to show yet. Check back when the room fills up.",
      like: "Like",
      liked: "Liked",
      likeError: "Couldn't register your like. Try again.",
      leave: "Leave for the night",
      matchKicker: "It's a match",
      matchBody: "You both tapped. Go say hi, they're here tonight.",
      matchDismiss: "Keep browsing",
      leftTitle: "You've left the room",
      leftBody: "You're no longer visible here. Come back whenever you like.",
      rejoin: "Re-join the room",
    },
  },
  fr: {
    landing: {
      welcome: "Bienvenue chez",
      tagline: "Scanne. Tape. Commence ta soirée.",
      settingUp: "On prépare ta soirée…",
      sessionError:
        "Impossible de démarrer ta session. La connexion anonyme est peut-être désactivée.",
    },
    profile: {
      title: "Crée ton profil",
      subtitle: "Un vrai prénom et une photo, c'est tout.",
      addPhoto: "Ajouter une photo",
      firstName: "Prénom",
      bioOptional: "Bio (optionnel)",
      iAm: "Je suis",
      iWantToMeet: "Je veux rencontrer",
      save: "Enregistrer le profil",
      saving: "Enregistrement…",
      sessionError: "Impossible de démarrer ta session. Réessaie.",
      needFirstName: "Entre ton prénom.",
      needPhoto: "Ajoute une photo de profil.",
      needGender: "Choisis ton genre.",
      needInterest: "Choisis qui tu veux rencontrer.",
      photoUploadFailed: "L'envoi de la photo a échoué.",
      genericError: "Un problème est survenu. Réessaie.",
    },
    genders: { woman: "Femme", man: "Homme", nonbinary: "Non-binaire" },
    room: {
      entering: "On entre dans la salle…",
      loadError:
        "Impossible de charger la salle. La connexion anonyme est peut-être désactivée.",
      venueNotFound: "Ce lieu n'existe pas.",
      whosHere: (venue) => `Qui est à ${venue}`,
      pitch:
        "Like en toute discrétion. Un chat ne s'ouvre que si c'est réciproque. Personne ne saura jamais que tu l'as liké tant qu'il ne te like pas en retour.",
      empty: "Personne pour l'instant. Reviens quand la salle se remplit.",
      like: "Like",
      liked: "Liké",
      likeError: "Impossible d'enregistrer ton like. Réessaie.",
      leave: "Quitter la soirée",
      matchKicker: "C'est un match",
      matchBody: "Vous vous êtes likés. Va lui dire bonjour, il est là ce soir.",
      matchDismiss: "Continuer à explorer",
      leftTitle: "Tu as quitté la salle",
      leftBody: "Tu n'es plus visible ici. Reviens quand tu veux.",
      rejoin: "Revenir dans la salle",
    },
  },
};
