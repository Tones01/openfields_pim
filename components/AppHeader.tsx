import Link from "next/link";
import type { Me } from "@/lib/auth";
import { NavLinks } from "./NavLinks";

export function AppHeader({ me }: { me: Me }) {
  const tabs = [
    { href: "/", label: "Catalogue" },
    ...(me.canEdit
      ? [
          { href: "/products/new", label: "Add product" },
          { href: "/upload", label: "Bulk upload" },
        ]
      : []),
    { href: "/activity", label: "Activity" },
    ...(me.isAdmin ? [{ href: "/team", label: "Team" }] : []),
  ];
  return (
    <header className="app-header">
      <div className="app-header-left">
        <Link href="/" className="logo">
          <span className="brand-mark small" aria-hidden>OF</span>
          <span>Product information</span>
        </Link>
        <NavLinks tabs={tabs} />
      </div>
      <div className="app-header-right">
        <span className="muted small">
          {me.email} · {me.role[0].toUpperCase() + me.role.slice(1)}
        </span>
        <form action="/auth/signout" method="post">
          <button className="btn ghost sm">Sign out</button>
        </form>
      </div>
    </header>
  );
}
