import { z } from "zod";
import { handle, parseBody } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { requireUser } from "@/server/auth/session";
import { addGrowthEntry } from "@/server/domain/milestones";

const schema = z.object({
  childId: z.string().uuid(),
  measuredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weightGrams: z.number().int().min(100).max(200000).nullish(),
  heightMm: z.number().int().min(100).max(2500).nullish(),
  headCircumferenceMm: z.number().int().min(100).max(700).nullish(),
  clothingSize: z.string().max(20).nullish(),
  shoeSize: z.string().max(20).nullish(),
  diaperSize: z.string().max(20).nullish(),
  note: z.string().max(500).nullish(),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await parseBody(request, schema);
    const id = await addGrowthEntry({ userId: user.id, ...body });
    return { growthEntryId: id };
  });
}
