import { createClient } from "@/lib/supabase/server";

export default async function NoAccess() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return (
    <main className="login">
      <div className="login-card">
        <h1>You're not on the team list yet</h1>
        <p className="muted">
          {user?.email ? <>Signed in as <strong>{user.email}</strong>. </> : null}
          Ask an admin to add your email on the Team page, then sign in again.
        </p>
        <form action="/auth/signout" method="post">
          <button className="btn">Sign out</button>
        </form>
      </div>
    </main>
  );
}
