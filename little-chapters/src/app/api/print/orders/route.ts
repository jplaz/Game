import { z } from "zod";
import { handle, parseBody } from "@/server/api";
import { assertSameOrigin } from "@/server/security/csrf";
import { requireUser } from "@/server/auth/session";
import {
  placeBookOrder,
  quoteBookOrder,
  shippingAddressSchema,
} from "@/server/domain/printOrders";

const schema = z.object({
  mode: z.enum(["quote", "place"]),
  bookId: z.string().uuid(),
  productId: z.string().max(60),
  quantity: z.number().int().min(1).max(50).default(1),
  address: shippingAddressSchema,
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await parseBody(request, schema);
    if (body.mode === "quote") {
      return quoteBookOrder({
        userId: user.id, bookId: body.bookId, productId: body.productId,
        quantity: body.quantity, address: body.address,
      });
    }
    return placeBookOrder({
      userId: user.id, bookId: body.bookId, productId: body.productId,
      quantity: body.quantity, address: body.address,
    });
  });
}
