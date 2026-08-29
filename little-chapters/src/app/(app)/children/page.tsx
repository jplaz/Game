import Link from "next/link";
import { requireAppContext } from "@/server/context";
import { buttonClass } from "@/components/ui/button";
import { MediaImage } from "@/components/media/media-image";

export const dynamic = "force-dynamic";

export default async function ChildrenPage() {
  const ctx = await requireAppContext();
  const isParent = ctx.role === "owner" || ctx.role === "parent";
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl text-ink-700">Children</h1>
        {isParent ? (
          <Link href="/children/new" className={buttonClass({ size: "sm" })}>
            Add a child
          </Link>
        ) : null}
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {ctx.children.map((child) => (
          <Link
            key={child.id}
            href={`/children/${child.id}`}
            className="lc-card p-5 flex items-center gap-4 hover:shadow-lifted transition-shadow"
          >
            {child.profileMediaId ? (
              <MediaImage
                mediaId={child.profileMediaId}
                alt=""
                className="h-16 w-16 rounded-full"
              />
            ) : (
              <span className="grid h-16 w-16 place-items-center rounded-full bg-blush-100 font-display text-xl text-clay-700">
                {child.displayName.slice(0, 1)}
              </span>
            )}
            <div>
              <p className="font-display text-lg text-ink-700">{child.displayName}</p>
              <p className="text-sm text-ink-300">{child.ageText ?? "On the way"}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
