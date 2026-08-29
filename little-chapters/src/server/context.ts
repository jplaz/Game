import { redirect } from "next/navigation";
import { getActiveFamilyId, requireUser, type SessionUser } from "@/server/auth/session";
import { listUserFamilies, type FamilyRole } from "@/server/authz";
import { listChildren, type ChildSummary } from "@/server/domain/children";

/**
 * Page-level context resolution for the authenticated app surface.
 * Redirects into onboarding when the user has no family/children yet.
 */

export interface AppContext {
  user: SessionUser;
  familyId: string;
  familyName: string;
  role: FamilyRole;
  children: ChildSummary[];
}

export async function requireAppContext(): Promise<AppContext> {
  const user = await requireUser().catch(() => null);
  if (!user) redirect("/login");
  const families = await listUserFamilies(user.id);
  if (families.length === 0) redirect("/welcome");
  const activeId = (await getActiveFamilyId(user.id)) ?? families[0]!.familyId;
  const family = families.find((f) => f.familyId === activeId) ?? families[0]!;
  const children = await listChildren(user.id, family.familyId);
  return {
    user,
    familyId: family.familyId,
    familyName: family.name,
    role: family.role,
    children,
  };
}
