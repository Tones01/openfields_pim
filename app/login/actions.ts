"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export async function sendLoginLink(_prev: { message: string; ok: boolean } | null, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: "Enter a valid email address." };
  }
  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true, message: `Check ${email} for a sign-in link. Open it in this browser.` };
}
