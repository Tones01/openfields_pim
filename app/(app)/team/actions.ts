"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMe, type Role } from "@/lib/auth";

const ROLES: Role[] = ["admin", "editor", "viewer"];

export async function addMember(_prev: { ok: boolean; message: string } | null, formData: FormData) {
  const me = await getMe();
  if (!me?.isAdmin) return { ok: false, message: "Only admins can manage the team." };
  const emails = String(formData.get("email") ?? "")
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const role = String(formData.get("role")) as Role;
  if (!ROLES.includes(role)) return { ok: false, message: "Pick a role." };
  const bad = emails.filter((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  if (emails.length === 0 || bad.length) return { ok: false, message: bad.length ? `Not an email: ${bad.join(", ")}` : "Enter an email." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("team_members")
    .upsert(emails.map((email) => ({ email, role, added_by: me.email })), { onConflict: "email" });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/team");
  return { ok: true, message: `Added ${emails.join(", ")}. They can sign in now with that email.` };
}

async function adminCount(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { count } = await supabase.from("team_members").select("email", { count: "exact", head: true }).eq("role", "admin");
  return count ?? 0;
}

export async function changeRole(formData: FormData) {
  const me = await getMe();
  if (!me?.isAdmin) return;
  const email = String(formData.get("email"));
  const role = String(formData.get("role")) as Role;
  if (!ROLES.includes(role)) return;
  const supabase = await createClient();
  if (email === me.email && role !== "admin" && (await adminCount(supabase)) <= 1) return;
  await supabase.from("team_members").update({ role }).eq("email", email);
  revalidatePath("/team");
}

export async function removeMember(formData: FormData) {
  const me = await getMe();
  if (!me?.isAdmin) return;
  const email = String(formData.get("email"));
  if (email === me.email) return;
  const supabase = await createClient();
  await supabase.from("team_members").delete().eq("email", email);
  revalidatePath("/team");
}
