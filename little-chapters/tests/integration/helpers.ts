import { randomBytes } from "crypto";
import { getSql } from "@/server/db/client";

/** Test fixtures against a real Postgres (migrations applied). */

export async function createTestUser(name = "Test User"): Promise<string> {
  const sql = getSql();
  const rows = await sql<{ id: string }[]>`
    insert into users (email, display_name)
    values (${`test-${randomBytes(8).toString("hex")}@test.example`}, ${name})
    returning id
  `;
  return rows[0]!.id;
}

export async function createTestFamily(
  ownerId: string
): Promise<{ familyId: string; childId: string }> {
  const sql = getSql();
  const family = await sql<{ id: string }[]>`
    insert into families (name, created_by)
    values (${`Test Family ${randomBytes(4).toString("hex")}`}, ${ownerId})
    returning id
  `;
  const familyId = family[0]!.id;
  await sql`
    insert into family_members (family_id, user_id, role)
    values (${familyId}, ${ownerId}, 'owner')
  `;
  const child = await sql<{ id: string }[]>`
    insert into children (family_id, full_name, nickname, birth_date)
    values (${familyId}, 'Testy McTestface', 'Testy', '2026-01-15')
    returning id
  `;
  return { familyId, childId: child[0]!.id };
}

export async function addMember(
  familyId: string,
  userId: string,
  role: "parent" | "contributor" | "viewer"
): Promise<void> {
  const sql = getSql();
  await sql`
    insert into family_members (family_id, user_id, role)
    values (${familyId}, ${userId}, ${role})
  `;
}

export async function createTestMemory(
  familyId: string,
  childId: string,
  createdBy: string,
  overrides: { approval?: string; body?: string } = {}
): Promise<string> {
  const sql = getSql();
  const rows = await sql<{ id: string }[]>`
    insert into memories (family_id, child_id, created_by, body, happened_at, approval_status)
    values (${familyId}, ${childId}, ${createdBy},
            ${overrides.body ?? "A test memory"}, '2026-08-10',
            ${overrides.approval ?? "approved"})
    returning id
  `;
  return rows[0]!.id;
}

export async function cleanupFamily(familyId: string): Promise<void> {
  const sql = getSql();
  await sql`delete from families where id = ${familyId}`;
}

export async function cleanupUser(userId: string): Promise<void> {
  const sql = getSql();
  await sql`delete from users where id = ${userId}`;
}
