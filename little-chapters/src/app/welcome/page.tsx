import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { listUserFamilies } from "@/server/authz";
import { WelcomeFlow } from "@/components/onboarding/welcome-flow";

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const families = await listUserFamilies(user.id);
  const hasChildren = families.length > 0;
  // returning users with a family land here only when they have no children yet
  return (
    <main className="min-h-dvh grid place-items-center px-4 py-10">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <p className="font-display text-xl text-clay-600">Little Chapters</p>
          <h1 className="text-3xl text-ink-700 mt-2">
            {hasChildren ? "Almost there" : "Welcome"}
          </h1>
        </div>
        <div className="lc-card p-6 sm:p-8">
          <WelcomeFlow existingFamilyId={families[0]?.familyId ?? null} />
        </div>
      </div>
    </main>
  );
}
