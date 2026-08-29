import { z } from "zod";
import { handle, parseBody } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { requireUser } from "@/server/auth/session";
import { requestBookRender } from "@/server/domain/books";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await params;
    const body = await parseBody(
      request,
      z.object({ productId: z.string().max(60).optional() })
    );
    return requestBookRender({ userId: user.id, bookId: id, productId: body.productId });
  });
}
