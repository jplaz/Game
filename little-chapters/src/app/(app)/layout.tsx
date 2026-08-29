import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { AppNav } from "@/components/shell/app-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-dvh">
      <AppNav />
      <main className="mx-auto max-w-5xl px-4 sm:px-6 pt-6 pb-28 md:pb-16">
        {children}
      </main>
    </div>
  );
}
