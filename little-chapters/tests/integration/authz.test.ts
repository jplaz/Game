import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertChildAccess, assertFamilyRole, assertResourceAccess } from "@/server/authz";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import {
  addMember,
  cleanupFamily,
  cleanupUser,
  createTestFamily,
  createTestMemory,
  createTestUser,
} from "./helpers";

/**
 * Authorization boundary tests against real Postgres. The core promise:
 * no user can ever reach another family's children, memories, or media.
 */
describe("authorization boundaries", () => {
  let owner: string;
  let outsider: string;
  let viewer: string;
  let familyId: string;
  let childId: string;
  let memoryId: string;

  beforeAll(async () => {
    owner = await createTestUser("Owner");
    outsider = await createTestUser("Outsider");
    viewer = await createTestUser("Viewer");
    const family = await createTestFamily(owner);
    familyId = family.familyId;
    childId = family.childId;
    await addMember(familyId, viewer, "viewer");
    memoryId = await createTestMemory(familyId, childId, owner);
  });

  afterAll(async () => {
    await cleanupFamily(familyId);
    for (const id of [owner, outsider, viewer]) await cleanupUser(id);
  });

  it("grants members their role", async () => {
    const ctx = await assertFamilyRole(owner, familyId, "owner");
    expect(ctx.role).toBe("owner");
  });

  it("denies outsiders with NotFound (no existence leak)", async () => {
    await expect(assertFamilyRole(outsider, familyId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(assertChildAccess(outsider, childId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      assertResourceAccess(outsider, "memories", memoryId)
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("enforces role minimums", async () => {
    await expect(assertFamilyRole(viewer, familyId, "parent")).rejects.toBeInstanceOf(
      ForbiddenError
    );
    const ctx = await assertFamilyRole(viewer, familyId, "viewer");
    expect(ctx.role).toBe("viewer");
  });

  it("resolves child → family access", async () => {
    const ctx = await assertChildAccess(viewer, childId, "viewer");
    expect(ctx.familyId).toBe(familyId);
  });

  it("rejects nonexistent resources as NotFound", async () => {
    await expect(
      assertResourceAccess(owner, "memories", "00000000-0000-0000-0000-000000000000")
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
