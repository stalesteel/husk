import { supabase } from './supabase.js';

// Leses før supabase-js rekker å rydde i adressen etter en engangslenke.
const initialHash = location.hash;

export async function getUser() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

// Feil fra en utløpt eller allerede brukt engangslenke, eller null.
export function linkError() {
  const params = new URLSearchParams(initialHash.slice(1));
  const code = params.get('error_code');
  if (!code) return null;
  if (code === 'otp_expired') {
    return 'Innloggingslenken er utløpt eller allerede brukt. Be om en ny.';
  }
  return 'Innloggingen feilet. Be om en ny lenke og prøv igjen.';
}

export function hasLinkError() {
  return new URLSearchParams(initialHash.slice(1)).has('error_code');
}

// Bare stier på dette nettstedet, så lenken ikke kan sende noen videre til et annet.
export function safeNextPath(value) {
  if (!value) return '/';
  try {
    const url = new URL(value, location.origin);
    return url.origin === location.origin ? url.pathname + url.search : '/';
  } catch {
    return '/';
  }
}

// Returnerer en feilmelding å vise, eller null om lenken ble sendt.
export async function sendLoginLink(email, nextPath) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // Kontoer opprettes bare ved invitasjon, aldri herfra.
      shouldCreateUser: false,
      emailRedirectTo: new URL(nextPath, location.origin).href,
    },
  });
  if (!error) return null;
  if (error.code === 'otp_disabled' || /signups not allowed/i.test(error.message)) {
    return 'Denne e-postadressen har ikke tilgang til Husk. Kontoer opprettes bare ved invitasjon.';
  }
  if (error.status === 429) {
    return 'Det ble nettopp sendt en lenke. Vent litt og prøv igjen.';
  }
  return 'Kunne ikke sende innloggingslenke. Prøv igjen om litt.';
}

export async function signOut() {
  await supabase.auth.signOut();
}
