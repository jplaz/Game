import { requireAppContext } from "@/server/context";
import { getSql } from "@/server/db/client";
import { getFeed } from "@/server/domain/feed";
import { formatDateShort } from "@/lib/format";
import { InviteForm, ReviewButtons } from "@/components/family/invite-form";
import { SectionHeading } from "@/components/ui/card";
import { Badge } from "@/components/ui/misc";

export const dynamic = "force-dynamic";

export default async function FamilyPage() {
  const ctx = await requireAppContext();
  const sql = getSql();
  const isParent = ctx.role === "owner" || ctx.role === "parent";

  const members = await sql<
    { id: string; role: string; label: string | null; display_name: string; email: string }[]
  >`
    select fm.id, fm.role, fm.label, u.display_name, u.email
    from family_members fm join users u on u.id = fm.user_id
    where fm.family_id = ${ctx.familyId}
    order by fm.joined_at
  `;

  const pending = isParent
    ? await sql<
        { id: string; title: string | null; body: string | null; display_name: string; email: string }[]
      >`
        select m.id, m.title, m.body, u.display_name, u.email
        from memories m join users u on u.id = m.created_by
        where m.family_id = ${ctx.familyId} and m.approval_status = 'pending'
          and m.deleted_at is null
        order by m.created_at desc limit 20
      `
    : [];

  const feed = await getFeed(ctx.user.id, ctx.familyId, { limit: 30 });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl text-ink-700">{ctx.familyName}</h1>
        <p className="text-sm text-ink-300 mt-1">
          Just your family. No followers, no likes economy — only shared memories.
        </p>
      </div>

      {isParent && pending.length > 0 ? (
        <section className="lc-card p-6 space-y-4">
          <SectionHeading
            title="Waiting for your approval"
            subtitle="Family additions appear in the archive once a parent approves them."
            className="mb-0"
          />
          {pending.map((item) => (
            <div key={item.id} className="rounded-xl border border-sand-100 p-4">
              <p className="text-sm text-ink-300">
                {item.display_name || item.email.split("@")[0]} added a memory
              </p>
              <p className="mt-1 text-ink-600 line-clamp-2">
                {item.title ?? item.body ?? "A new memory"}
              </p>
              <div className="mt-3">
                <ReviewButtons
                  familyId={ctx.familyId}
                  targetType="memory"
                  targetId={item.id}
                />
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <section className="lc-card p-6 space-y-4">
          <SectionHeading title="Family members" className="mb-0" />
          <ul className="space-y-3">
            {members.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sand-100 text-sm font-medium text-ink-500">
                    {(member.label ?? member.display_name ?? member.email)
                      .slice(0, 1)
                      .toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-600 truncate">
                      {member.label ?? member.display_name ?? member.email.split("@")[0]}
                    </p>
                    <p className="text-xs text-ink-300 truncate">{member.email}</p>
                  </div>
                </div>
                <Badge tone={member.role === "owner" || member.role === "parent" ? "accent" : "neutral"}>
                  {member.role}
                </Badge>
              </li>
            ))}
          </ul>
          {isParent ? (
            <div className="border-t border-sand-100 pt-5">
              <h3 className="text-lg text-ink-700 mb-3">Invite someone</h3>
              <InviteForm familyId={ctx.familyId} />
            </div>
          ) : null}
        </section>

        <section className="lc-card p-6 space-y-4">
          <SectionHeading
            title="Family feed"
            subtitle="What's been happening lately."
            className="mb-0"
          />
          {feed.length === 0 ? (
            <p className="text-sm text-ink-300">Quiet so far. It won&apos;t stay that way.</p>
          ) : (
            <ul className="space-y-3">
              {feed.map((item) => (
                <li key={item.id} className="flex items-baseline gap-3 text-sm">
                  <span className="text-xs text-ink-300 shrink-0 w-14">
                    {formatDateShort(item.createdAt)}
                  </span>
                  <span className="text-ink-500">
                    {item.actorName ? (
                      <strong className="font-medium text-ink-600">{item.actorName}</strong>
                    ) : null}{" "}
                    {item.summary}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
