import { AppShell } from "@/components/layout/app-shell";
import { createClient } from "@/lib/db/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const avatar = user?.user_metadata?.avatar_url || null;
  const name = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";

  return (
    <AppShell userAvatar={avatar} userName={name}>
      {children}
    </AppShell>
  );
}
