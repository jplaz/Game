import { z } from "zod";
import { getSql } from "@/server/db/client";
import { assertFamilyRole, assertResourceAccess } from "@/server/authz";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { getPrintProvider } from "@/server/print";
import { getStorage } from "@/server/storage";
import { billingEnabled, getStripe } from "@/server/billing/stripe";
import { audit } from "@/server/observability/audit";
import { env } from "@/server/env";

/**
 * Physical product ordering. Margin lives in print_products (base cost vs
 * retail); the provider abstraction quotes and fulfills; payment goes through
 * Stripe Checkout (one-time) when configured, otherwise orders wait in
 * `awaiting_payment` for manual handling via the admin console.
 */

export const shippingAddressSchema = z.object({
  name: z.string().min(1).max(120),
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).nullish(),
  city: z.string().min(1).max(120),
  state: z.string().max(120).nullish(),
  postalCode: z.string().min(2).max(20),
  country: z.string().length(2),
});

export type ShippingAddressInput = z.infer<typeof shippingAddressSchema>;

export async function quoteBookOrder(opts: {
  userId: string;
  bookId: string;
  productId: string;
  quantity: number;
  address: ShippingAddressInput;
}): Promise<{ unitPriceCents: number; shippingCents: number; totalCents: number; pageCount: number }> {
  await assertResourceAccess(opts.userId, "books", opts.bookId, "parent");
  const sql = getSql();
  const book = await sql<{ page_count: number | null; status: string }[]>`
    select page_count, status from books where id = ${opts.bookId} and deleted_at is null
  `;
  if (!book[0]) throw new NotFoundError("Book");
  const pageCount = book[0].page_count ?? 0;
  const quote = await getPrintProvider().quote(
    opts.productId,
    opts.quantity,
    pageCount,
    { ...opts.address, line2: opts.address.line2 ?? undefined, state: opts.address.state ?? undefined }
  );
  return {
    unitPriceCents: quote.unitPriceCents,
    shippingCents: quote.shippingCents,
    totalCents: quote.totalCents,
    pageCount,
  };
}

export async function placeBookOrder(opts: {
  userId: string;
  bookId: string;
  productId: string;
  quantity: number;
  address: ShippingAddressInput;
}): Promise<{ orderId: string; checkoutUrl: string | null }> {
  const ctx = await assertResourceAccess(opts.userId, "books", opts.bookId, "parent");
  if (opts.quantity < 1 || opts.quantity > 50) {
    throw new ValidationError("Quantity must be between 1 and 50");
  }
  const sql = getSql();
  const bookRows = await sql<
    { status: string; page_count: number | null; title: string;
      preflight: { ok?: boolean; issues?: Array<{ severity: string }> } }[]
  >`
    select status, page_count, title, preflight from books
    where id = ${opts.bookId} and deleted_at is null
  `;
  const book = bookRows[0];
  if (!book) throw new NotFoundError("Book");
  if (book.status !== "rendered") {
    throw new ConflictError("Prepare the print-ready files before ordering");
  }
  const hardErrors = (book.preflight.issues ?? []).filter((i) => i.severity === "error");
  if (hardErrors.length > 0) {
    throw new ConflictError(
      "Some photos are too low-resolution to print well — swap them first"
    );
  }
  const productRows = await sql<
    { id: string; provider_id: string; base_cost_cents: number; min_pages: number;
      max_pages: number; extra_page_cost_cents: number }[]
  >`
    select id, provider_id, base_cost_cents, min_pages, max_pages, extra_page_cost_cents
    from print_products where id = ${opts.productId} and is_active
  `;
  const product = productRows[0];
  if (!product) throw new NotFoundError("Print product");
  const pageCount = book.page_count ?? 0;
  if (pageCount < product.min_pages || pageCount > product.max_pages) {
    throw new ConflictError(
      `This product supports ${product.min_pages}–${product.max_pages} pages`
    );
  }

  const provider = getPrintProvider();
  const address = {
    ...opts.address,
    line2: opts.address.line2 ?? undefined,
    state: opts.address.state ?? undefined,
  };
  const quote = await provider.quote(opts.productId, opts.quantity, pageCount, address);
  const unitCost =
    product.base_cost_cents +
    Math.max(0, pageCount - product.min_pages) * product.extra_page_cost_cents;

  const orderId = await sql.begin(async (tx) => {
    const orderRows = await tx<{ id: string }[]>`
      insert into print_orders
        (family_id, ordered_by, provider_id, status, shipping_address,
         subtotal_cents, shipping_cents, total_cents)
      values
        (${ctx.familyId}, ${opts.userId}, ${product.provider_id}, 'awaiting_payment',
         ${tx.json(opts.address as never)},
         ${quote.unitPriceCents * opts.quantity}, ${quote.shippingCents}, ${quote.totalCents})
      returning id
    `;
    const id = orderRows[0]!.id;
    await tx`
      insert into print_order_items
        (order_id, product_id, book_id, quantity, page_count, unit_price_cents, unit_cost_cents)
      values
        (${id}, ${opts.productId}, ${opts.bookId}, ${opts.quantity}, ${pageCount},
         ${quote.unitPriceCents}, ${unitCost})
    `;
    return id;
  });

  await audit({
    familyId: ctx.familyId, actorId: opts.userId, action: "print_order.placed",
    targetType: "print_order", targetId: orderId,
    detail: { productId: opts.productId, totalCents: quote.totalCents },
  });

  // payment
  let checkoutUrl: string | null = null;
  if (billingEnabled()) {
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: opts.quantity,
          price_data: {
            currency: "usd",
            unit_amount: quote.unitPriceCents,
            product_data: { name: `${book.title} — printed book` },
          },
        },
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: quote.shippingCents,
            product_data: { name: "Shipping" },
          },
        },
      ],
      metadata: { printOrderId: orderId, familyId: ctx.familyId },
      success_url: `${env().NEXT_PUBLIC_APP_URL}/books/${opts.bookId}?order=paid`,
      cancel_url: `${env().NEXT_PUBLIC_APP_URL}/books/${opts.bookId}?order=canceled`,
    });
    checkoutUrl = session.url;
  }
  return { orderId, checkoutUrl };
}

/** Called from the Stripe webhook once a print payment settles. */
export async function markPrintOrderPaid(orderId: string): Promise<void> {
  const sql = getSql();
  const rows = await sql<
    { id: string; family_id: string; provider_id: string; total_cents: number;
      shipping_address: never; status: string }[]
  >`
    select id, family_id, provider_id, total_cents, shipping_address, status
    from print_orders where id = ${orderId}
  `;
  const order = rows[0];
  if (!order || order.status !== "awaiting_payment") return;
  await sql`
    insert into payments (family_id, kind, amount_cents, status, print_order_id)
    values (${order.family_id}, 'print_order', ${order.total_cents}, 'succeeded', ${orderId})
  `;

  // submit to the fulfillment provider with fresh signed PDF URLs
  const items = await sql<
    { product_id: string; book_id: string | null; quantity: number; page_count: number | null }[]
  >`
    select product_id, book_id, quantity, page_count from print_order_items
    where order_id = ${orderId}
  `;
  const item = items[0];
  let providerRef: string | null = null;
  if (item?.book_id) {
    const pdfs = await sql<
      { ibucket: string | null; ikey: string | null; cbucket: string | null; ckey: string | null }[]
    >`
      select iso.bucket as ibucket, iso.object_key as ikey,
             cso.bucket as cbucket, cso.object_key as ckey
      from books b
      left join storage_objects iso on iso.id = b.interior_pdf_object_id
      left join storage_objects cso on cso.id = b.cover_pdf_object_id
      where b.id = ${item.book_id}
    `;
    const pdf = pdfs[0];
    if (pdf?.ibucket && pdf.ikey) {
      const storage = getStorage();
      const interiorUrl = await storage.createSignedReadUrl(pdf.ibucket as never, pdf.ikey, 86400);
      const coverUrl = pdf.cbucket && pdf.ckey
        ? await storage.createSignedReadUrl(pdf.cbucket as never, pdf.ckey, 86400)
        : null;
      const result = await getPrintProvider().createOrder({
        orderId,
        productId: item.product_id,
        quantity: item.quantity,
        pageCount: item.page_count ?? 0,
        interiorPdfUrl: interiorUrl,
        coverPdfUrl: coverUrl,
        shippingAddress: order.shipping_address,
      });
      providerRef = result.providerOrderRef;
    }
  }
  await sql`
    update print_orders set status = 'submitted', provider_order_ref = ${providerRef}
    where id = ${orderId}
  `;
}

export async function listPrintOrders(
  userId: string,
  familyId: string
): Promise<Array<{
  id: string; status: string; totalCents: number; createdAt: Date;
  trackingUrl: string | null; bookTitle: string | null;
}>> {
  await assertFamilyRole(userId, familyId, "parent");
  const sql = getSql();
  const rows = await sql<
    { id: string; status: string; total_cents: number; created_at: Date;
      tracking_url: string | null; title: string | null }[]
  >`
    select o.id, o.status, o.total_cents, o.created_at, o.tracking_url, b.title
    from print_orders o
    left join print_order_items i on i.order_id = o.id
    left join books b on b.id = i.book_id
    where o.family_id = ${familyId}
    order by o.created_at desc limit 50
  `;
  return rows.map((r) => ({
    id: r.id, status: r.status, totalCents: r.total_cents,
    createdAt: r.created_at, trackingUrl: r.tracking_url, bookTitle: r.title,
  }));
}
