import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/auth";
import { AddMemberForm } from "./AddMemberForm";
import { changeRole, removeMember } from "./actions";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const me = await requireMember();
  if (!me.isAdmin) redirect("/");
  const supabase = await createClient();
  const { data: members } = await supabase.from("team_members").select("*").order("role").order("email");

  return (
    <main className="page narrow">
      <div className="page-head">
        <h1>Team</h1>
        <p className="muted">
          Only people on this list can sign in. <strong>Editors</strong> add and change products.{" "}
          <strong>Viewers</strong> can search and export. <strong>Admins</strong> also manage this list.
        </p>
      </div>
      <AddMemberForm />
      <div className="card">
        <table className="grid">
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Added</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(members ?? []).map((m) => (
              <tr key={m.email}>
                <td>
                  {m.email}
                  {m.email === me.email ? <span className="muted small"> (you)</span> : null}
                </td>
                <td>
                  <form action={changeRole} className="inline-form">
                    <input type="hidden" name="email" value={m.email} />
                    <select name="role" defaultValue={m.role}>
                      <option value="admin">Admin</option>
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <button className="btn ghost sm">Update</button>
                  </form>
                </td>
                <td className="muted small">{new Date(m.added_at).toLocaleDateString("en-CA")}</td>
                <td>
                  {m.email !== me.email && (
                    <form action={removeMember}>
                      <input type="hidden" name="email" value={m.email} />
                      <button className="btn ghost sm danger">Remove</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
