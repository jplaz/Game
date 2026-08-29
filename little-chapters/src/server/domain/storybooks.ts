import { getSql } from "@/server/db/client";
import { assertChildAccess } from "@/server/authz";
import { NotFoundError, ValidationError } from "@/server/errors";
import { assertWithinLimit } from "@/server/billing/usage";
import { runAiTask } from "@/server/ai/run";
import { storybookTask } from "@/server/ai/tasks/narrative";
import { titlesTask } from "@/server/ai/tasks/writing";

/**
 * Personalized storybooks: a warm story written ONLY from selected real,
 * approved memories. The generated text is stored as a draft on the
 * storybooks row; the parent approves before it's considered final, and every
 * page remains editable in the book editor.
 */
export async function createStorybook(opts: {
  userId: string;
  childId: string;
  memoryIds: string[];
  title?: string;
  style: "realistic" | "illustrated" | "playful";
}): Promise<{ bookId: string; title: string; pages: Array<{ pageNumber: number; text: string }> }> {
  const ctx = await assertChildAccess(opts.userId, opts.childId, "parent");
  await assertWithinLimit(ctx.familyId, "books", 1, "books");
  if (opts.memoryIds.length < 1 || opts.memoryIds.length > 20) {
    throw new ValidationError("Pick between 1 and 20 memories for the story");
  }

  const sql = getSql();
  // only this child's approved memories can ground the story
  const memories = await sql<
    { id: string; title: string | null; body: string | null; happened_at: string }[]
  >`
    select id, title, body, happened_at::text as happened_at
    from memories
    where id = any(${opts.memoryIds}) and child_id = ${opts.childId}
      and family_id = ${ctx.familyId} and deleted_at is null
      and approval_status = 'approved' and body is not null
    order by happened_at
  `;
  if (memories.length === 0) {
    throw new NotFoundError("Those memories (they need some written words)");
  }

  const childRows = await sql<{ full_name: string; nickname: string | null }[]>`
    select full_name, nickname from children where id = ${opts.childId}
  `;
  const displayName =
    childRows[0]!.nickname || childRows[0]!.full_name.split(" ")[0] || childRows[0]!.full_name;

  const facts = memories.map((m) => ({
    date: m.happened_at,
    title: m.title,
    text: m.body!.trim(),
    isMilestone: false,
  }));

  let title = opts.title?.trim();
  if (!title) {
    const titled = await runAiTask(
      titlesTask,
      {
        kind: "storybook",
        childName: displayName,
        ageTitle: "a story from real days",
        themeHints: memories.map((m) => m.title ?? m.body!.slice(0, 40)).join(", "),
      },
      { familyId: ctx.familyId, childId: opts.childId, userId: opts.userId }
    );
    title = titled.output.titles[0] ?? `${displayName}'s Story`;
  }

  const pageCount = Math.min(16, Math.max(6, memories.length * 2));
  const story = await runAiTask(
    storybookTask,
    { childName: displayName, title, style: opts.style, memories: facts, pageCount },
    { familyId: ctx.familyId, childId: opts.childId, userId: opts.userId }
  );

  // media pool: photos attached to the chosen memories, in order
  const attachedMedia = await sql<{ memory_id: string; media_id: string }[]>`
    select mm.memory_id, mm.media_id from memory_media mm
    join media m on m.id = mm.media_id and m.kind = 'photo'
      and m.status = 'ready' and m.deleted_at is null
    where mm.memory_id = any(${memories.map((m) => m.id)})
    order by mm.sort_order
  `;
  const mediaPool = attachedMedia.map((a) => a.media_id);

  const bookId = await sql.begin(async (tx) => {
    const bookRows = await tx<{ id: string }[]>`
      insert into books (family_id, child_id, kind, title, theme_id, status)
      values (${ctx.familyId}, ${opts.childId}, 'storybook', ${title}, 'storybook', 'ready')
      returning id
    `;
    const id = bookRows[0]!.id;
    await tx`
      insert into storybooks (book_id, style, memory_ids, story_text)
      values (${id}, ${opts.style}, ${memories.map((m) => m.id)},
              ${tx.json({ pages: story.output.pages } as never)})
    `;
    // title page + one page per story page (photo above, text below)
    await tx`
      insert into book_pages (book_id, page_number, layout) values (${id}, 1, 'title')
    `;
    const titlePage = await tx<{ id: string }[]>`
      select id from book_pages where book_id = ${id} and page_number = 1
    `;
    await tx`
      insert into page_elements (page_id, element_type, frame, props, sort_order)
      values (${titlePage[0]!.id}, 'text',
              ${tx.json({ x: 0.1, y: 0.4, w: 0.8, h: 0.14 } as never)},
              ${tx.json({ text: title, fontRole: "display", align: "center" } as never)}, 0)
    `;
    for (const [i, page] of story.output.pages.entries()) {
      const pageNumber = i + 2;
      const pageRows = await tx<{ id: string }[]>`
        insert into book_pages (book_id, page_number, layout)
        values (${id}, ${pageNumber}, 'story-page')
        returning id
      `;
      const pageId = pageRows[0]!.id;
      const mediaId = mediaPool[i % Math.max(mediaPool.length, 1)];
      if (mediaId) {
        await tx`
          insert into page_elements (page_id, element_type, media_id, frame, props, sort_order)
          values (${pageId}, 'photo', ${mediaId},
                  ${tx.json({ x: 0.1, y: 0.08, w: 0.8, h: 0.5 } as never)},
                  ${tx.json({} as never)}, 0)
        `;
      }
      await tx`
        insert into page_elements (page_id, element_type, frame, props, sort_order)
        values (${pageId}, 'text',
                ${tx.json({ x: 0.12, y: 0.64, w: 0.76, h: 0.28 } as never)},
                ${tx.json({ text: page.text, fontRole: "body", align: "center" } as never)}, 1)
      `;
    }
    await tx`
      update books set page_count = ${story.output.pages.length + 1} where id = ${id}
    `;
    return id;
  });

  return { bookId, title, pages: story.output.pages };
}
