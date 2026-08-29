import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSql } from "@/server/db/client";
import { enqueueJob, claimJobs, completeJob, failJob } from "@/server/jobs/queue";
import { assertWithinLimit, recordUsage } from "@/server/billing/usage";
import { createInvitation, acceptInvitation, reviewSubmission } from "@/server/domain/families";
import { createMemory } from "@/server/domain/memories";
import { generateChapter } from "@/server/domain/chapters";
import { LimitExceededError, ForbiddenError } from "@/server/errors";
import {
  addMember,
  cleanupFamily,
  cleanupUser,
  createTestFamily,
  createTestMemory,
  createTestUser,
} from "./helpers";

describe("job queue", () => {
  let familyId: string;
  let owner: string;

  beforeAll(async () => {
    owner = await createTestUser();
    const family = await createTestFamily(owner);
    familyId = family.familyId;
  });
  afterAll(async () => {
    await cleanupFamily(familyId);
    await cleanupUser(owner);
  });

  it("enqueues idempotently, claims exclusively, retries with backoff", async () => {
    const first = await enqueueJob({
      type: "media.ingest", familyId, payload: { mediaId: "x" },
      idempotencyKey: `test:${familyId}`,
    });
    const duplicate = await enqueueJob({
      type: "media.ingest", familyId, payload: { mediaId: "x" },
      idempotencyKey: `test:${familyId}`,
    });
    expect(first).toBeTruthy();
    expect(duplicate).toBeNull(); // deduped while queued

    const claimed = await claimJobs("worker-test", 50);
    const mine = claimed.find((j) => j.id === first);
    expect(mine).toBeTruthy();
    // a second claimer can't get the same job
    const claimedAgain = await claimJobs("worker-test-2", 50);
    expect(claimedAgain.find((j) => j.id === first)).toBeUndefined();

    await failJob(first!, "simulated failure");
    const sql = getSql();
    const [row] = await sql<{ status: string; attempts: number; last_error: string }[]>`
      select status, attempts, last_error from jobs where id = ${first}
    `;
    expect(row!.status).toBe("queued"); // retry scheduled
    expect(row!.last_error).toContain("simulated");

    // complete it on the "retry"
    await sql`update jobs set run_at = now() where id = ${first}`;
    const retried = await claimJobs("worker-test", 50);
    expect(retried.find((j) => j.id === first)).toBeTruthy();
    await completeJob(first!);
    const [done] = await sql<{ status: string }[]>`select status from jobs where id = ${first}`;
    expect(done!.status).toBe("succeeded");
  });
});

describe("billing limits", () => {
  let familyId: string;
  let owner: string;

  beforeAll(async () => {
    owner = await createTestUser();
    const family = await createTestFamily(owner);
    familyId = family.familyId;
  });
  afterAll(async () => {
    await cleanupFamily(familyId);
    await cleanupUser(owner);
  });

  it("enforces free-plan storage at admission time", async () => {
    // free plan: 2 GB — a 1 GB upload fits, 3 GB doesn't
    await assertWithinLimit(familyId, "storage_bytes", 1024 ** 3, "storage");
    await expect(
      assertWithinLimit(familyId, "storage_bytes", 3 * 1024 ** 3, "storage")
    ).rejects.toBeInstanceOf(LimitExceededError);
  });

  it("counts metered usage", async () => {
    await recordUsage({ familyId, metric: "storage_bytes", delta: 2 * 1024 ** 3 });
    await expect(
      assertWithinLimit(familyId, "storage_bytes", 1024, "storage")
    ).rejects.toBeInstanceOf(LimitExceededError);
  });

  it("free plan has no books", async () => {
    await expect(
      assertWithinLimit(familyId, "books", 1, "books")
    ).rejects.toBeInstanceOf(LimitExceededError);
  });
});

describe("family collaboration flow", () => {
  let owner: string;
  let grandma: string;
  let familyId: string;
  let childId: string;

  beforeAll(async () => {
    owner = await createTestUser("Owner");
    grandma = await createTestUser("Grandma");
    const family = await createTestFamily(owner);
    familyId = family.familyId;
    childId = family.childId;
  });
  afterAll(async () => {
    await cleanupFamily(familyId);
    await cleanupUser(owner);
    await cleanupUser(grandma);
  });

  it("invitation is email-bound and single-use", async () => {
    const sql = getSql();
    const [grandmaRow] = await sql<{ email: string }[]>`
      select email from users where id = ${grandma}
    `;
    const invite = await createInvitation({
      userId: owner, familyId, email: grandmaRow!.email, role: "contributor",
      label: "Grandma",
    });
    // wrong account can't accept
    await expect(acceptInvitation(owner, invite.inviteToken)).rejects.toBeInstanceOf(
      ForbiddenError
    );
    const accepted = await acceptInvitation(grandma, invite.inviteToken);
    expect(accepted.familyId).toBe(familyId);
    // second use fails
    await expect(acceptInvitation(grandma, invite.inviteToken)).rejects.toBeTruthy();
  });

  it("contributor memories await approval, parents approve", async () => {
    const created = await createMemory(grandma, {
      childId,
      kind: "moment",
      body: "Rory laughing at Grandma's dog.",
      happenedAt: "2026-08-10",
      tags: [],
      mediaIds: [],
      personIds: [],
      requestKeepsakeDraft: false,
      title: null,
    });
    const sql = getSql();
    const [before] = await sql<{ approval_status: string }[]>`
      select approval_status from memories where id = ${created.memoryId}
    `;
    expect(before!.approval_status).toBe("pending");

    // grandma can't approve her own submission
    await expect(
      reviewSubmission({
        userId: grandma, familyId, targetType: "memory",
        targetId: created.memoryId, decision: "approved",
      })
    ).rejects.toBeInstanceOf(ForbiddenError);

    await reviewSubmission({
      userId: owner, familyId, targetType: "memory",
      targetId: created.memoryId, decision: "approved",
    });
    const [after] = await sql<{ approval_status: string }[]>`
      select approval_status from memories where id = ${created.memoryId}
    `;
    expect(after!.approval_status).toBe("approved");
  });
});

describe("chapter generation (null AI provider)", () => {
  let owner: string;
  let familyId: string;
  let childId: string;

  beforeAll(async () => {
    owner = await createTestUser();
    const family = await createTestFamily(owner);
    familyId = family.familyId;
    childId = family.childId;
    await createTestMemory(familyId, childId, owner, {
      body: "You laughed at the cat until you hiccuped.",
    });
    await addMember(familyId, await createTestUser("Extra"), "viewer");
  });
  afterAll(async () => {
    await cleanupFamily(familyId);
    await cleanupUser(owner);
  });

  it("produces editable sections grounded in approved memories", async () => {
    const sql = getSql();
    const [chapter] = await sql<{ id: string }[]>`
      insert into chapters (family_id, child_id, kind, period_start, period_end, title, status)
      values (${familyId}, ${childId}, 'month', '2026-08-01', '2026-08-31',
              'Testy — Six Months', 'generating')
      returning id
    `;
    await generateChapter(chapter!.id);
    const sections = await sql<{ section_type: string; content: { text?: string } }[]>`
      select section_type, content from chapter_sections where chapter_id = ${chapter!.id}
    `;
    const story = sections.find((s) => s.section_type === "story");
    expect(story?.content.text).toContain("cat");
    const [status] = await sql<{ status: string }[]>`
      select status from chapters where id = ${chapter!.id}
    `;
    expect(status!.status).toBe("ready");
  });

  it("regeneration preserves user-edited sections", async () => {
    const sql = getSql();
    const [chapter] = await sql<{ id: string }[]>`
      select id from chapters where child_id = ${childId} and period_start = '2026-08-01'
    `;
    await sql`
      update chapter_sections set content = ${sql.json({ text: "My own words." })},
        edited_by_user = true
      where chapter_id = ${chapter!.id} and section_type = 'story'
    `;
    await generateChapter(chapter!.id);
    const [story] = await sql<{ content: { text?: string } }[]>`
      select content from chapter_sections
      where chapter_id = ${chapter!.id} and section_type = 'story'
    `;
    expect(story!.content.text).toBe("My own words.");
  });
});
