import { z } from "zod";
import { handle, parseBody } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { requireUser } from "@/server/auth/session";
import { createBook } from "@/server/domain/books";

const schema = z.object({
  childId: z.string().uuid(),
  kind: z.enum(["monthly", "first_year", "birthday", "storybook", "grandparent", "milestone_cards", "custom"]),
  title: z.string().max(120).optional(),
  yearNumber: z.number().int().min(0).max(18).nullish(),
  themeId: z.string().max(40).optional(),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await parseBody(request, schema);
    return createBook({ userId: user.id, ...body });
  });
}
