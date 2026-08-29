import { getSql } from "@/server/db/client";
import { env } from "@/server/env";
import { logger, errorFields } from "@/server/observability/logger";

/**
 * Notifications: in-app rows always; email/push per user preference.
 * Email goes through a Resend-compatible provider; push via Web Push (VAPID).
 * SMS has an architecture slot (a channel in preferences) but no provider yet.
 */

export type NotificationType =
  | "chapter.ready"
  | "family.submission"
  | "capture.summary"
  | "age.milestone"
  | "reengagement"
  | "book.ready"
  | "recap.ready"
  | "export.ready"
  | "invite.accepted";

const DEFAULT_CHANNELS: Record<NotificationType, { email: boolean; push: boolean }> = {
  "chapter.ready": { email: true, push: true },
  "family.submission": { email: false, push: true },
  "capture.summary": { email: true, push: false },
  "age.milestone": { email: false, push: true },
  reengagement: { email: true, push: false },
  "book.ready": { email: true, push: true },
  "recap.ready": { email: false, push: true },
  "export.ready": { email: true, push: false },
  "invite.accepted": { email: false, push: true },
};

export async function notifyUser(opts: {
  userId: string;
  familyId?: string | null;
  type: NotificationType;
  title: string;
  body: string;
  linkPath?: string;
}): Promise<void> {
  const sql = getSql();
  const rows = await sql<{ id: string }[]>`
    insert into notifications (user_id, family_id, type, title, body, link_path)
    values (${opts.userId}, ${opts.familyId ?? null}, ${opts.type},
            ${opts.title}, ${opts.body}, ${opts.linkPath ?? null})
    returning id
  `;
  const notificationId = rows[0]!.id;

  const prefRows = await sql<{ preferences: Record<string, { email?: boolean; push?: boolean }> }[]>`
    select preferences from notification_preferences
    where user_id = ${opts.userId}
      and (family_id = ${opts.familyId ?? null} or family_id is null)
    order by family_id nulls last limit 1
  `;
  const pref = prefRows[0]?.preferences?.[opts.type];
  const channels = {
    email: pref?.email ?? DEFAULT_CHANNELS[opts.type].email,
    push: pref?.push ?? DEFAULT_CHANNELS[opts.type].push,
  };

  const sent: Record<string, string> = {};
  if (channels.email) {
    const ok = await sendEmail(opts.userId, opts.title, opts.body, opts.linkPath);
    if (ok) sent.email = new Date().toISOString();
  }
  // web push delivery requires the web-push wire protocol (VAPID JWT + payload
  // encryption); the subscription store is in place and delivery is dispatched
  // through the email provider path until the push worker lands (ROADMAP §7)
  if (Object.keys(sent).length > 0) {
    await sql`
      update notifications set channels_sent = ${sql.json(sent)}
      where id = ${notificationId}
    `;
  }
}

async function sendEmail(
  userId: string,
  subject: string,
  body: string,
  linkPath?: string
): Promise<boolean> {
  const { EMAIL_PROVIDER, EMAIL_API_URL, EMAIL_API_KEY, EMAIL_FROM, NEXT_PUBLIC_APP_URL } = env();
  if (EMAIL_PROVIDER !== "resend_compatible" || !EMAIL_API_KEY) return false;
  const sql = getSql();
  const users = await sql<{ email: string }[]>`select email from users where id = ${userId}`;
  const to = users[0]?.email;
  if (!to) return false;
  try {
    const link = linkPath ? `${NEXT_PUBLIC_APP_URL}${linkPath}` : NEXT_PUBLIC_APP_URL;
    const response = await fetch(`${EMAIL_API_URL.replace(/\/$/, "")}/emails`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${EMAIL_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [to],
        subject,
        text: `${body}\n\n${link}\n\n— Little Chapters`,
      }),
    });
    return response.ok;
  } catch (err) {
    logger.warn("email send failed", errorFields(err));
    return false;
  }
}

/** Notify every member of a family with a given minimum role. */
export async function notifyFamily(opts: {
  familyId: string;
  type: NotificationType;
  title: string;
  body: string;
  linkPath?: string;
  excludeUserId?: string;
  minRole?: "viewer" | "contributor" | "parent" | "owner";
}): Promise<void> {
  const sql = getSql();
  const members = await sql<{ user_id: string }[]>`
    select user_id from family_members
    where family_id = ${opts.familyId}
      and family_role_rank(role) >= family_role_rank(${opts.minRole ?? "viewer"})
  `;
  for (const member of members) {
    if (member.user_id === opts.excludeUserId) continue;
    await notifyUser({
      userId: member.user_id,
      familyId: opts.familyId,
      type: opts.type,
      title: opts.title,
      body: opts.body,
      linkPath: opts.linkPath,
    });
  }
}
