import Link from "next/link";

export default function NotFound() {
  return (
    <main className="login">
      <div className="login-card">
        <h1>Not found</h1>
        <p className="muted">That product or page doesn't exist.</p>
        <Link href="/" className="btn">Back to the catalogue</Link>
      </div>
    </main>
  );
}
