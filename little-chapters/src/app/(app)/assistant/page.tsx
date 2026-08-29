import Link from "next/link";
import { requireAppContext } from "@/server/context";
import { AssistantClient } from "@/components/assistant/assistant-client";
import { EmptyState } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const ctx = await requireAppContext();
  const child = ctx.children[0];
  if (!child) {
    return (
      <EmptyState
        title="No child yet"
        action={<Link href="/children/new" className={buttonClass()}>Add your child</Link>}
      />
    );
  }
  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl text-ink-700">Remember together</h1>
        <p className="text-sm text-ink-300 mt-1">
          Little questions that help you notice the ordinary moments you&apos;ll
          want back someday. Nothing is saved until you say so.
        </p>
      </div>
      <AssistantClient childId={child.id} childName={child.displayName} />
    </div>
  );
}
