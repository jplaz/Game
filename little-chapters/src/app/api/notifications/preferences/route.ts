import { z } from "zod";
import { handle, parseBody } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { requireUser } from "@/server/auth/session";
import { getSql } from "@/server/db/client";

const channelSchema = z.object({
  email: z.boolean().optional(),
  push: z.boolean().optional(),
  sms: z.boolean().optional(), // architecture slot; no SMS provider yet
});

const putSchema = z.object({
  preferences: z.record(z.string().max(60), channelSchema),
});

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const sql = getSql();
    const rows = await sql<{ preferences: Record<string, unknown> }[]>`
      select preferences from notification_preferences
      where user_id = ${user.id} and family_id is null
    `;
    return { preferences: rows[0]?.preferences ?? {} };
  });
}

export async function PUT(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await parseBody(request, putSchema);
    const sql = getSql();
    await sql`
      insert into notification_preferences (user_id, family_id, preferences)
      values (${user.id}, null, ${sql.json(body.preferences as never)})
      on conflict (user_id) where family_id is null do update
        set preferences = excluded.preferences
    `;
    return { ok: true };
  });
}
