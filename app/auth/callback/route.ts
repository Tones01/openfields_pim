import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // First person ever to sign in becomes the admin
      const { data: role } = await supabase.rpc("claim_admin_if_first");
      return NextResponse.redirect(`${origin}${role ? "/" : "/no-access"}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=link`);
}
