import { AppHeader } from "@/components/AppHeader";
import { requireMember } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMember();
  return (
    <div className="app">
      <AppHeader me={me} />
      {children}
    </div>
  );
}
