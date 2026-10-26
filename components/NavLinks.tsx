"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ tabs }: { tabs: { href: string; label: string }[] }) {
  const path = usePathname();
  const active = (href: string) =>
    href === "/" ? path === "/" || (path.startsWith("/products/") && path !== "/products/new") : path.startsWith(href);
  return (
    <nav className="tabs">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={active(t.href) ? "tab active" : "tab"}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
