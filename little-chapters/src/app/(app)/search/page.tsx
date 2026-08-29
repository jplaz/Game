import { requireAppContext } from "@/server/context";
import { SearchClient } from "@/components/search/search-client";

export const dynamic = "force-dynamic";

export default async function SearchPage() {
  const ctx = await requireAppContext();
  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl text-ink-700">Search</h1>
        <p className="text-sm text-ink-300 mt-1">
          Private to your family — captions, transcripts, people, places, dates.
        </p>
      </div>
      <SearchClient familyId={ctx.familyId} />
    </div>
  );
}
