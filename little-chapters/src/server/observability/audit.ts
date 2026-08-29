import { getSql } from "@/server/db/client";

/**
 * Audit log for sensitive actions: role changes, deletions, share/QR policy
 * changes, exports, support access. `detail` must contain only structured
 * identifiers and enums — never media bytes or free-text family content.
 */
export async function audit(entry: {
  familyId?: string | null;
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: Record<string, string | number | boolean | null>;
}): Promise<void> {
  const sql = getSql();
  await sql`
    insert into audit_logs (family_id, actor_id, action, target_type, target_id, detail)
    values (
      ${entry.familyId ?? null},
      ${entry.actorId ?? null},
      ${entry.action},
      ${entry.targetType ?? null},
      ${entry.targetId ?? null},
      ${sql.json(entry.detail ?? {})}
    )
  `;
}
