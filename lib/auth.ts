import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "./supabase/server";

export type Role = "admin" | "editor" | "viewer";

export interface Me {
  email: string;
  role: Role;
  canEdit: boolean;
  isAdmin: boolean;
}

/** The signed-in team member, or null if signed in but not on the team */
export const getMe = cache(async (): Promise<Me | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const { data: role } = await supabase.rpc("my_role");
  if (!role) return null;
  const r = role as Role;
  return { email: user.email.toLowerCase(), role: r, canEdit: r === "admin" || r === "editor", isAdmin: r === "admin" };
});

/** Use at the top of every page: sends people who aren't on the team away */
export async function requireMember(): Promise<Me> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const me = await getMe();
  if (!me) redirect("/no-access");
  return me;
}
