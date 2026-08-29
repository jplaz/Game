import { getSql } from "@/server/db/client";
import { ForbiddenError, NotFoundError } from "@/server/errors";

/**
 * Central authorization layer.
 *
 * Every domain operation resolves user → family membership → role through
 * this module before touching a resource. Repositories accept a proven
 * FamilyContext, never raw ids. RLS (0006_rls.sql) is the independent
 * backstop; this layer is the primary gate with friendly errors.
 */

export type FamilyRole = "owner" | "parent" | "contributor" | "viewer";

const ROLE_RANK: Record<FamilyRole, number> = {
  owner: 4,
  parent: 3,
  contributor: 2,
  viewer: 1,
};

export interface FamilyContext {
  userId: string;
  familyId: string;
  role: FamilyRole;
}

export function roleAtLeast(role: FamilyRole, min: FamilyRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

/**
 * Prove the user's membership (and minimum role) in a family.
 * Throws NotFoundError — not Forbidden — when the user has no membership at
 * all, so responses don't confirm the existence of other families' resources.
 */
export async function assertFamilyRole(
  userId: string,
  familyId: string,
  minRole: FamilyRole = "viewer"
): Promise<FamilyContext> {
  const sql = getSql();
  const rows = await sql<{ role: FamilyRole }[]>`
    select fm.role
    from family_members fm
    join families f on f.id = fm.family_id and f.deleted_at is null
    where fm.family_id = ${familyId} and fm.user_id = ${userId}
  `;
  const membership = rows[0];
  if (!membership) throw new NotFoundError("Family");
  if (!roleAtLeast(membership.role, minRole)) {
    throw new ForbiddenError(
      minRole === "parent"
        ? "Only parents can do this"
        : "You don't have permission to do this"
    );
  }
  return { userId, familyId, role: membership.role };
}

/** Resolve a child to its family and prove access in one step. */
export async function assertChildAccess(
  userId: string,
  childId: string,
  minRole: FamilyRole = "viewer"
): Promise<FamilyContext & { childId: string }> {
  const sql = getSql();
  const rows = await sql<{ family_id: string }[]>`
    select family_id from children
    where id = ${childId} and deleted_at is null
  `;
  const child = rows[0];
  if (!child) throw new NotFoundError("Child");
  const ctx = await assertFamilyRole(userId, child.family_id, minRole);
  return { ...ctx, childId };
}

/**
 * Generic resource → family resolution for tables carrying family_id.
 * The table name comes from a fixed allowlist — never from input.
 */
const FAMILY_SCOPED_TABLES = {
  media: "media",
  memories: "memories",
  chapters: "chapters",
  books: "books",
  letters: "letters",
  video_recaps: "video_recaps",
  share_links: "share_links",
  qr_memories: "qr_memories",
  print_orders: "print_orders",
  exports: "exports",
  people: "people",
} as const;

export type FamilyScopedTable = keyof typeof FAMILY_SCOPED_TABLES;

export async function assertResourceAccess(
  userId: string,
  table: FamilyScopedTable,
  resourceId: string,
  minRole: FamilyRole = "viewer"
): Promise<FamilyContext> {
  const sql = getSql();
  const tableName = FAMILY_SCOPED_TABLES[table];
  const rows = await sql<{ family_id: string }[]>`
    select family_id from ${sql(tableName)}
    where id = ${resourceId}
  `;
  const row = rows[0];
  if (!row) throw new NotFoundError();
  return assertFamilyRole(userId, row.family_id, minRole);
}

/** List every family the user belongs to (for family switcher / scoping). */
export async function listUserFamilies(
  userId: string
): Promise<Array<{ familyId: string; name: string; role: FamilyRole }>> {
  const sql = getSql();
  const rows = await sql<
    { family_id: string; name: string; role: FamilyRole }[]
  >`
    select fm.family_id, f.name, fm.role
    from family_members fm
    join families f on f.id = fm.family_id and f.deleted_at is null
    where fm.user_id = ${userId}
    order by fm.joined_at
  `;
  return rows.map((r) => ({ familyId: r.family_id, name: r.name, role: r.role }));
}

export async function assertStaff(
  userId: string,
  minRole: "support" | "admin" = "support"
): Promise<void> {
  const sql = getSql();
  const rows = await sql<{ staff_role: string | null }[]>`
    select staff_role from users where id = ${userId} and deleted_at is null
  `;
  const role = rows[0]?.staff_role;
  if (!role) throw new ForbiddenError("Staff access required");
  if (minRole === "admin" && role !== "admin") {
    throw new ForbiddenError("Admin access required");
  }
}
