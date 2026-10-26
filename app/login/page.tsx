"use client";

import { useActionState } from "react";
import { sendLoginLink } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState(sendLoginLink, null);
  return (
    <main className="login">
      <div className="login-card">
        <div className="brand-mark" aria-hidden>OF</div>
        <h1>Product information</h1>
        <p className="muted">Open Fields team sign-in. We'll email you a link, no password needed.</p>
        <form action={action} className="stack">
          <label className="field">
            <span>Work email</span>
            <input name="email" type="email" autoComplete="email" required placeholder="you@openfields.ca" />
          </label>
          <button className="btn primary" disabled={pending}>
            {pending ? "Sending…" : "Email me a sign-in link"}
          </button>
          {state && <p className={state.ok ? "notice ok" : "notice error"}>{state.message}</p>}
        </form>
      </div>
    </main>
  );
}
