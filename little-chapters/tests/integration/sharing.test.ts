import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createShareLink, resolveShareLink, revokeShareLink } from "@/server/domain/sharing";
import { createQrMemory, resolveQrToken, updateQrPolicy } from "@/server/domain/qr";
import { NotFoundError } from "@/server/errors";
import { getSql } from "@/server/db/client";
import {
  addMember,
  cleanupFamily,
  cleanupUser,
  createTestFamily,
  createTestMemory,
  createTestUser,
} from "./helpers";

describe("share links and QR memories", () => {
  let owner: string;
  let viewer: string;
  let outsider: string;
  let familyId: string;
  let childId: string;
  let memoryId: string;
  let chapterId: string;

  beforeAll(async () => {
    owner = await createTestUser("Owner");
    viewer = await createTestUser("Viewer");
    outsider = await createTestUser("Outsider");
    const family = await createTestFamily(owner);
    familyId = family.familyId;
    childId = family.childId;
    await addMember(familyId, viewer, "viewer");
    memoryId = await createTestMemory(familyId, childId, owner);
    const sql = getSql();
    const chapter = await sql<{ id: string }[]>`
      insert into chapters (family_id, child_id, kind, period_start, period_end, title, status)
      values (${familyId}, ${childId}, 'month', '2026-08-01', '2026-08-31', 'Test — Six Months', 'ready')
      returning id
    `;
    chapterId = chapter[0]!.id;
  });

  afterAll(async () => {
    await cleanupFamily(familyId);
    for (const id of [owner, viewer, outsider]) await cleanupUser(id);
  });

  it("creates and resolves an open link", async () => {
    const { shareUrl } = await createShareLink({
      userId: owner, familyId, targetType: "chapter", targetId: chapterId,
      visibility: "link",
    });
    const token = shareUrl.split("/s/")[1]!;
    const resolved = await resolveShareLink(token);
    expect(resolved.targetId).toBe(chapterId);
    expect(resolved.requires).toBe("none");
  });

  it("password links require the password", async () => {
    const { shareUrl } = await createShareLink({
      userId: owner, familyId, targetType: "memory", targetId: memoryId,
      visibility: "password", password: "sunshine",
    });
    const token = shareUrl.split("/s/")[1]!;
    expect((await resolveShareLink(token)).requires).toBe("password");
    await expect(resolveShareLink(token, { password: "wrong" })).rejects.toBeInstanceOf(NotFoundError);
    const ok = await resolveShareLink(token, { password: "sunshine" });
    expect(ok.requires).toBe("none");
  });

  it("family links require membership", async () => {
    const { shareUrl } = await createShareLink({
      userId: owner, familyId, targetType: "chapter", targetId: chapterId,
      visibility: "family",
    });
    const token = shareUrl.split("/s/")[1]!;
    expect((await resolveShareLink(token, {})).requires).toBe("family_auth");
    await expect(
      resolveShareLink(token, { viewerUserId: outsider })
    ).rejects.toBeInstanceOf(NotFoundError);
    const ok = await resolveShareLink(token, { viewerUserId: viewer });
    expect(ok.requires).toBe("none");
  });

  it("revoked links stop resolving", async () => {
    const { shareUrl, shareLinkId } = await createShareLink({
      userId: owner, familyId, targetType: "chapter", targetId: chapterId,
      visibility: "link",
    });
    const token = shareUrl.split("/s/")[1]!;
    await revokeShareLink(owner, shareLinkId);
    await expect(resolveShareLink(token)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("viewers cannot create share links", async () => {
    await expect(
      createShareLink({
        userId: viewer, familyId, targetType: "chapter", targetId: chapterId,
        visibility: "link",
      })
    ).rejects.toBeTruthy();
  });

  it("QR tokens default to family-only, are stable per target, and revoke", async () => {
    const qr = await createQrMemory({ userId: owner, memoryId });
    expect(qr.url).toContain("/m/");
    // resolving without auth requires family sign-in
    expect((await resolveQrToken(qr.token)).requires).toBe("family_auth");
    // same target reuses the token so reprints stay stable
    const again = await createQrMemory({ userId: owner, memoryId });
    expect(again.token).toBe(qr.token);
    // open it up, then disable it
    await updateQrPolicy({ userId: owner, qrMemoryId: qr.qrMemoryId, visibility: "link" });
    expect((await resolveQrToken(qr.token)).requires).toBe("none");
    await updateQrPolicy({ userId: owner, qrMemoryId: qr.qrMemoryId, revoke: true });
    await expect(resolveQrToken(qr.token)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("expired QR tokens stop resolving", async () => {
    const qr = await createQrMemory({
      userId: owner,
      mediaId: undefined,
      memoryId: await createTestMemory(familyId, childId, owner, { body: "expiring" }),
      visibility: "link",
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    await expect(resolveQrToken(qr.token)).rejects.toBeInstanceOf(NotFoundError);
  });
});
