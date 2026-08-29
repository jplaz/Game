/**
 * Demo family seed — fully synthetic, no real children.
 *
 *   npm run db:seed:demo
 *
 * Creates the Ellison family with demo child "Rory": synthetic photos
 * (rendered gradients/scenes via sharp — safe placeholder imagery), memories,
 * voice-transcript examples, milestones, growth entries, comments, letters,
 * a QR-linked memory, and two generated monthly chapters, so the complete
 * product experience is visible without any personal uploads.
 *
 * Sign in as demo@littlechapters.example (dev login) to explore.
 */
import sharp from "sharp";
import { getSql, closeSql } from "../src/server/db/client";
import { LocalStorageDriver } from "../src/server/storage/local";
import { recordStorageObject } from "../src/server/storage";
import { computeDHash, scoreImageQuality } from "../src/server/media/images";
import { generateChapter } from "../src/server/domain/chapters";
import { createQrMemory } from "../src/server/domain/qr";

const DEMO_EMAIL = "demo@littlechapters.example";
const GRANDMA_EMAIL = "grandma@littlechapters.example";

const SCENES = [
  { bg: "#F4E7D8", fg: "#C58F6D", label: "morning light" },
  { bg: "#E8EDE3", fg: "#7E9370", label: "in the garden" },
  { bg: "#F8E9E4", fg: "#D69686", label: "nap time" },
  { bg: "#EAF0F4", fg: "#7FA3B8", label: "bath bubbles" },
  { bg: "#FBF4EC", fg: "#B07A55", label: "at the table" },
  { bg: "#F0E9DC", fg: "#96613F", label: "story time" },
  { bg: "#FDEEE0", fg: "#D9A066", label: "beach day" },
  { bg: "#EFEAF5", fg: "#9C8AB8", label: "evening walk" },
];

function sceneSvg(scene: (typeof SCENES)[number], seed: number): string {
  const cx = 200 + ((seed * 137) % 400);
  const cy = 220 + ((seed * 89) % 300);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">
    <rect width="1200" height="900" fill="${scene.bg}"/>
    <circle cx="${cx}" cy="${cy}" r="180" fill="${scene.fg}" opacity="0.5"/>
    <circle cx="${1200 - cx}" cy="${900 - cy}" r="240" fill="${scene.fg}" opacity="0.25"/>
    <rect x="0" y="700" width="1200" height="200" fill="${scene.fg}" opacity="0.15"/>
    <text x="60" y="840" font-family="Georgia" font-size="42" fill="${scene.fg}">${scene.label} · demo</text>
  </svg>`;
}

async function main() {
  const sql = getSql();
  if (process.env.STORAGE_DRIVER === "supabase") {
    throw new Error("Run the demo seed with STORAGE_DRIVER=local");
  }
  const storage = new LocalStorageDriver();

  const existing = await sql`select 1 from users where email = ${DEMO_EMAIL}`;
  if (existing.length > 0) {
    console.log("demo user already exists — nothing to do (delete it to reseed)");
    return;
  }

  console.log("creating demo family…");
  const [demoUser] = await sql<{ id: string }[]>`
    insert into users (email, display_name) values (${DEMO_EMAIL}, 'Avery Ellison')
    returning id
  `;
  const [grandma] = await sql<{ id: string }[]>`
    insert into users (email, display_name) values (${GRANDMA_EMAIL}, 'Grandma June')
    returning id
  `;
  const [family] = await sql<{ id: string }[]>`
    insert into families (name, created_by) values ('The Ellison Family', ${demoUser!.id})
    returning id
  `;
  await sql`
    insert into family_members (family_id, user_id, role, label) values
      (${family!.id}, ${demoUser!.id}, 'owner', 'Avery'),
      (${family!.id}, ${grandma!.id}, 'contributor', 'Grandma')
  `;

  // Rory: born ~7.5 months ago so two full month-chapters exist
  const birth = new Date();
  birth.setMonth(birth.getMonth() - 7);
  birth.setDate(4);
  const birthIso = birth.toISOString().slice(0, 10);
  const [child] = await sql<{ id: string }[]>`
    insert into children
      (family_id, full_name, nickname, pronouns, birth_date, birth_location,
       birth_weight_grams, birth_length_mm, birth_story)
    values
      (${family!.id}, 'Aurora Ellison', 'Rory', 'she/her', ${birthIso},
       'Portland, Oregon', 3290, 502,
       'You arrived just after sunrise, in a hurry and then suddenly very calm, like you had somewhere to be and it turned out to be exactly where you were.')
    returning id
  `;
  await sql`
    insert into child_guardians (child_id, user_id, relationship)
    values (${child!.id}, ${demoUser!.id}, 'Mom')
  `;
  const [grandmaPerson] = await sql<{ id: string }[]>`
    insert into people (family_id, name, relationship, user_id, created_by)
    values (${family!.id}, 'Grandma June', 'Grandma', ${grandma!.id}, ${demoUser!.id})
    returning id
  `;

  // synthetic media over the last two full months
  console.log("rendering synthetic photos…");
  const mediaIds: Array<{ id: string; capturedAt: Date }> = [];
  const monthsAgo = (months: number, day: number, hour: number) => {
    const date = new Date();
    date.setMonth(date.getMonth() - months);
    date.setDate(day);
    date.setHours(hour, 12, 0, 0);
    return date;
  };
  let sceneIndex = 0;
  for (const months of [2, 1]) {
    for (const day of [3, 3, 8, 12, 12, 17, 21, 24, 27]) {
      const scene = SCENES[sceneIndex % SCENES.length]!;
      sceneIndex += 1;
      const capturedAt = monthsAgo(months, day, 9 + (sceneIndex % 8));
      const original = await sharp(Buffer.from(sceneSvg(scene, sceneIndex)))
        .jpeg({ quality: 90 })
        .toBuffer();
      const thumb = await sharp(original)
        .resize(320, 320, { fit: "cover" })
        .webp({ quality: 78 })
        .toBuffer();
      const web = await sharp(original)
        .resize(1600, 1600, { fit: "inside" })
        .webp({ quality: 84 })
        .toBuffer();

      const [media] = await sql<{ id: string }[]>`
        insert into media
          (family_id, child_id, uploaded_by, kind, status, original_filename,
           declared_content_type, declared_size_bytes, verified_content_type,
           captured_at, captured_at_source, width, height, approval_status)
        values
          (${family!.id}, ${child!.id}, ${demoUser!.id}, 'photo', 'processing',
           'demo.jpg', 'image/jpeg', ${original.length}, 'image/jpeg',
           ${capturedAt}, 'exif', 1200, 900, 'approved')
        returning id
      `;
      const mediaId = media!.id;
      const baseKey = `${family!.id}/${mediaId}`;
      await storage.putObject("originals", `${baseKey}/original.jpg`, original, "image/jpeg");
      const originalObj = await recordStorageObject({
        familyId: family!.id, bucket: "originals", objectKey: `${baseKey}/original.jpg`,
        contentType: "image/jpeg", sizeBytes: original.length, purpose: "original",
      });
      for (const [variant, body, type, ext] of [
        ["thumb", thumb, "image/webp", ".webp"],
        ["web", web, "image/webp", ".webp"],
      ] as const) {
        await storage.putObject("derivatives", `${baseKey}/${variant}${ext}`, body, type);
        const objectId = await recordStorageObject({
          familyId: family!.id, bucket: "derivatives", objectKey: `${baseKey}/${variant}${ext}`,
          contentType: type, sizeBytes: body.length, purpose: variant,
        });
        await sql`
          insert into media_variants (media_id, variant, storage_object_id, width, height)
          values (${mediaId}, ${variant}, ${objectId}, 1200, 900)
        `;
      }
      const quality = await scoreImageQuality(web);
      const phash = await computeDHash(thumb);
      await sql`
        update media set status = 'ready', original_object_id = ${originalObj},
          phash = ${phash}, sharpness = ${quality.sharpness},
          exposure = ${quality.exposure}, quality_score = ${quality.quality}
        where id = ${mediaId}
      `;
      mediaIds.push({ id: mediaId, capturedAt });
    }
  }

  // memories grounded on the synthetic photos
  console.log("writing memories…");
  const memory = async (opts: {
    months: number; day: number; title: string; body: string;
    tags?: string[]; favorite?: boolean; author?: string; pending?: boolean;
    attach?: number[]; transcript?: string;
  }) => {
    const when = monthsAgo(opts.months, opts.day, 12).toISOString().slice(0, 10);
    const [row] = await sql<{ id: string }[]>`
      insert into memories
        (family_id, child_id, created_by, kind, title, body, happened_at, tags,
         is_favorite, approval_status, transcript)
      values
        (${family!.id}, ${child!.id}, ${opts.author ?? demoUser!.id},
         ${opts.transcript ? "voice" : "moment"},
         ${opts.title}, ${opts.body}, ${when}, ${opts.tags ?? []},
         ${opts.favorite ?? false}, ${opts.pending ? "pending" : "approved"},
         ${opts.transcript ?? null})
      returning id
    `;
    await sql`
      insert into memory_versions (memory_id, source, title, body, created_by)
      values (${row!.id}, 'user', ${opts.title}, ${opts.body}, ${opts.author ?? demoUser!.id})
    `;
    for (const index of opts.attach ?? []) {
      const m = mediaIds[index];
      if (m) {
        await sql`
          insert into memory_media (memory_id, media_id) values (${row!.id}, ${m.id})
          on conflict do nothing
        `;
      }
    }
    return row!.id;
  };

  await memory({
    months: 2, day: 3, title: "The cat is comedy",
    body: "Rory laughed every time the cat jumped off the couch. Every single time, like it was brand new.",
    tags: ["funny"], favorite: true, attach: [0, 1],
  });
  await memory({
    months: 2, day: 12, title: "First avocado",
    body: "First taste of avocado today. A long suspicious stare, then she grabbed the spoon herself.",
    tags: ["food"], attach: [4],
  });
  const satUpMemory = await memory({
    months: 2, day: 21,
    title: "She sat up by herself",
    body: "Today you sat up by yourself for maybe thirty seconds. I wasn't expecting it and then you just stayed there, looking so proud.",
    favorite: true, attach: [6],
    transcript:
      "Okay so today she sat up by herself for maybe thirty seconds. I wasn't expecting it and then she just stayed there looking so proud of herself.",
  });
  await memory({
    months: 1, day: 3, title: "Beach day",
    body: "First time at the coast. She grabbed a fistful of sand and studied it like a scientist. The waves were a bit much; Grandma's hat was very reassuring.",
    tags: ["trip"], favorite: true, attach: [12, 13],
  });
  await memory({
    months: 1, day: 12, title: "Blueberry face",
    body: "Blueberries for breakfast. Purple everywhere. Zero regrets, from either of us.",
    tags: ["food", "funny"], attach: [14],
  });
  await memory({
    months: 1, day: 17, title: "Grandma's dog",
    body: "Rory laughing at Grandma's dog until she got the hiccups.",
    author: grandma!.id, pending: true, attach: [15],
  });
  await memory({
    months: 1, day: 24, title: "Rolling everywhere",
    body: "Rolling is now her main way of getting around the living room. Nothing on the floor is safe.",
    attach: [16],
  });

  // milestones + growth
  await sql`
    insert into milestones (family_id, child_id, title, category, happened_at, status, created_by, memory_id)
    values
      (${family!.id}, ${child!.id}, 'First smile', 'communication',
       ${monthsAgo(5, 21, 0).toISOString().slice(0, 10)}, 'confirmed', ${demoUser!.id}, null),
      (${family!.id}, ${child!.id}, 'Rolled over', 'movement',
       ${monthsAgo(3, 6, 0).toISOString().slice(0, 10)}, 'confirmed', ${demoUser!.id}, null),
      (${family!.id}, ${child!.id}, 'First food', 'food',
       ${monthsAgo(2, 12, 0).toISOString().slice(0, 10)}, 'confirmed', ${demoUser!.id}, null),
      (${family!.id}, ${child!.id}, 'Sat independently', 'movement',
       ${monthsAgo(2, 21, 0).toISOString().slice(0, 10)}, 'confirmed', ${demoUser!.id}, ${satUpMemory}),
      (${family!.id}, ${child!.id}, 'First beach trip', 'travel',
       ${monthsAgo(1, 3, 0).toISOString().slice(0, 10)}, 'confirmed', ${demoUser!.id}, null)
  `;
  await sql`
    insert into growth_entries
      (family_id, child_id, measured_at, weight_grams, height_mm, clothing_size, diaper_size, created_by)
    values
      (${family!.id}, ${child!.id}, ${monthsAgo(2, 15, 0).toISOString().slice(0, 10)},
       7100, 650, '6–9 months', '3', ${demoUser!.id}),
      (${family!.id}, ${child!.id}, ${monthsAgo(1, 15, 0).toISOString().slice(0, 10)},
       7600, 668, '6–9 months', '3', ${demoUser!.id})
  `;

  // a sealed letter + a regular one
  await sql`
    insert into letters (family_id, child_id, author_id, kind, title, body, unlock_at, unlock_label)
    values
      (${family!.id}, ${child!.id}, ${demoUser!.id}, 'future',
       'For your tenth birthday',
       'Dear Rory — right now you are seven months old and your favorite thing in the world is the cat…',
       ${new Date(new Date().setFullYear(new Date().getFullYear() + 10)).toISOString().slice(0, 10)},
       'Open on your 10th birthday'),
      (${family!.id}, ${child!.id}, ${grandma!.id}, 'general',
       'From Grandma',
       'Sweet girl, the day you laughed at old Biscuit until you hiccuped is the hardest I have laughed in years.',
       null, null)
  `;

  // chapters for the two complete months (deterministic fallback AI)
  console.log("generating chapters…");
  for (const months of [2, 1]) {
    const period = monthsAgo(months, 1, 0);
    const periodStart = `${period.toISOString().slice(0, 7)}-01`;
    const monthName = period.toLocaleString("en-US", { month: "long", year: "numeric" });
    const totalMonths =
      (period.getFullYear() - birth.getFullYear()) * 12 + period.getMonth() - birth.getMonth();
    const [chapterRow] = await sql<{ id: string }[]>`
      insert into chapters
        (family_id, child_id, kind, period_start, period_end, title, subtitle, status)
      values
        (${family!.id}, ${child!.id}, 'month', ${periodStart},
         (${periodStart}::date + interval '1 month' - interval '1 day')::date,
         ${`Rory — ${totalMonths} Months`}, ${monthName}, 'generating')
      on conflict (child_id, kind, period_start) do update set status = 'generating'
      returning id
    `;
    await generateChapter(chapterRow!.id);
  }

  // family reactions + a comment on the beach memory
  const [beachMemory] = await sql<{ id: string }[]>`
    select id from memories where title = 'Beach day' and family_id = ${family!.id}
  `;
  if (beachMemory) {
    await sql`
      insert into comments (family_id, author_id, target_type, target_id, body)
      values (${family!.id}, ${grandma!.id}, 'memory', ${beachMemory.id},
              'That hat has now protected three generations from the wind. 🥹')
    `;
    await sql`
      insert into reactions (family_id, author_id, target_type, target_id, emoji)
      values (${family!.id}, ${grandma!.id}, 'memory', ${beachMemory.id}, '❤️')
    `;
  }

  // QR-linked memory example (the printed-book flow)
  const qr = await createQrMemory({
    userId: demoUser!.id,
    memoryId: satUpMemory,
    title: "The day you sat up",
    visibility: "link",
  });
  console.log(`QR example: ${qr.url}`);

  console.log("\ndemo family ready — sign in with the dev login as:");
  console.log(`  ${DEMO_EMAIL}`);
  console.log(`  (Grandma's view: ${GRANDMA_EMAIL})`);
}

main()
  .then(() => closeSql())
  .catch(async (err) => {
    console.error("seed failed:", err);
    await closeSql();
    process.exit(1);
  });
