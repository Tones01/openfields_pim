"use client";

import { useActionState } from "react";
import { addMember } from "./actions";

export function AddMemberForm() {
  const [state, action, pending] = useActionState(addMember, null);
  return (
    <form action={action} className="card add-member">
      <label className="field grow">
        <span>Email (separate several with commas)</span>
        <input name="email" placeholder="name@openfields.ca" required />
      </label>
      <label className="field">
        <span>Role</span>
        <select name="role" defaultValue="editor">
          <option value="editor">Editor</option>
          <option value="viewer">Viewer</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      <button className="btn primary" disabled={pending}>
        {pending ? "Adding…" : "Add to team"}
      </button>
      {state && <p className={state.ok ? "notice ok full" : "notice error full"}>{state.message}</p>}
    </form>
  );
}
