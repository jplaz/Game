import { requireAppContext } from "@/server/context";
import { ChildForm } from "@/components/children/child-form";

export const dynamic = "force-dynamic";

export default async function NewChildPage() {
  const ctx = await requireAppContext();
  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl text-ink-700">Add your child</h1>
        <p className="text-sm text-ink-300 mt-1">
          Twins, adopted, fostered, blended — every family fits here. Only the
          name is required.
        </p>
      </div>
      <ChildForm familyId={ctx.familyId} />
    </div>
  );
}
