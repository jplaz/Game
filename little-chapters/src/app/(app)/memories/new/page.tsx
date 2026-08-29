import Link from "next/link";
import { requireAppContext } from "@/server/context";
import { CaptureForm } from "@/components/memories/capture-form";
import { VoiceRecorder } from "@/components/media/voice-recorder";
import { EmptyState } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function NewMemoryPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const ctx = await requireAppContext();
  const params = await searchParams;
  const child = ctx.children[0];
  if (!child) {
    return (
      <EmptyState
        title="Add your child first"
        action={<Link href="/children/new" className={buttonClass()}>Add your child</Link>}
      />
    );
  }
  const mode = params.mode === "voice" ? "voice" : "write";

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl text-ink-700">Add a memory</h1>
        <p className="text-sm text-ink-300 mt-1">
          One sentence is enough. You&apos;ll be glad you kept it.
        </p>
      </div>

      <div className="flex gap-2">
        <Link
          href="/memories/new"
          className={buttonClass({
            variant: mode === "write" ? "primary" : "secondary",
            size: "sm",
          })}
        >
          Write or upload
        </Link>
        <Link
          href="/memories/new?mode=voice"
          className={buttonClass({
            variant: mode === "voice" ? "primary" : "secondary",
            size: "sm",
          })}
        >
          Record a voice memory
        </Link>
      </div>

      {mode === "voice" ? (
        <VoiceRecorder familyId={ctx.familyId} childId={child.id} />
      ) : (
        <CaptureForm
          familyId={ctx.familyId}
          childId={child.id}
          childName={child.displayName}
        />
      )}
    </div>
  );
}
