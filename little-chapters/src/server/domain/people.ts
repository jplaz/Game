import { getSql } from "@/server/db/client";
import { assertFamilyRole, assertResourceAccess } from "@/server/authz";
import { NotFoundError, ValidationError } from "@/server/errors";

/**
 * Known people (Grandma, Uncle, family friend). Manual creation and manual
 * tagging only — no biometric identification exists in the system. The
 * architecture reserves a consent-gated slot for face *grouping* later, which
 * would require explicit opt-in, clear controls, and would still never
 * auto-identify anyone.
 */

export async function createPerson(opts: {
  userId: string;
  familyId: string;
  name: string;
  relationship?: string | null;
}): Promise<string> {
  await assertFamilyRole(opts.userId, opts.familyId, "parent");
  const name = opts.name.trim();
  if (!name) throw new ValidationError("A person needs a name");
  const sql = getSql();
  const rows = await sql<{ id: string }[]>`
    insert into people (family_id, name, relationship, created_by)
    values (${opts.familyId}, ${name}, ${opts.relationship ?? null}, ${opts.userId})
    returning id
  `;
  return rows[0]!.id;
}

export async function listPeople(
  userId: string,
  familyId: string
): Promise<Array<{ id: string; name: string; relationship: string | null; memoryCount: number }>> {
  await assertFamilyRole(userId, familyId, "viewer");
  const sql = getSql();
  const rows = await sql<
    { id: string; name: string; relationship: string | null; memory_count: number }[]
  >`
    select p.id, p.name, p.relationship,
      (select count(*)::int from memory_people mp where mp.person_id = p.id) as memory_count
    from people p
    where p.family_id = ${familyId} and p.deleted_at is null
    order by p.name
  `;
  return rows.map((r) => ({
    id: r.id, name: r.name, relationship: r.relationship, memoryCount: r.memory_count,
  }));
}

export async function tagPersonOnMedia(opts: {
  userId: string;
  mediaId: string;
  personId: string;
  remove?: boolean;
}): Promise<void> {
  const ctx = await assertResourceAccess(opts.userId, "media", opts.mediaId, "contributor");
  const sql = getSql();
  const person = await sql`
    select 1 from people where id = ${opts.personId}
      and family_id = ${ctx.familyId} and deleted_at is null
  `;
  if (person.length === 0) throw new NotFoundError("Person");
  if (opts.remove) {
    await sql`
      delete from media_people where media_id = ${opts.mediaId} and person_id = ${opts.personId}
    `;
  } else {
    await sql`
      insert into media_people (media_id, person_id, tagged_by)
      values (${opts.mediaId}, ${opts.personId}, ${opts.userId})
      on conflict do nothing
    `;
  }
}
