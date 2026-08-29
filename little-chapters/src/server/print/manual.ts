import { getSql } from "@/server/db/client";
import type {
  PrintOrderRequest,
  PrintProvider,
  PrintQuote,
  ProviderOrderStatus,
  ShippingAddress,
} from "@/server/print/provider";

/**
 * Manual fulfillment provider (default): orders are recorded, print-ready
 * PDFs are produced, and staff place them with any printer via the admin
 * console. Real print APIs (Lulu/Peecho class) implement the same interface —
 * see docs/INTEGRATIONS.md §5.
 */

const FLAT_SHIPPING_CENTS = 699;

export class ManualFulfillmentProvider implements PrintProvider {
  id = "manual";

  async quote(
    productId: string,
    quantity: number,
    pageCount: number,
    _address: ShippingAddress
  ): Promise<PrintQuote> {
    const sql = getSql();
    const rows = await sql<
      { retail_price_cents: number; extra_page_price_cents: number; min_pages: number }[]
    >`
      select retail_price_cents, extra_page_price_cents, min_pages
      from print_products where id = ${productId} and is_active
    `;
    const product = rows[0];
    if (!product) throw new Error(`Unknown print product ${productId}`);
    const extraPages = Math.max(0, pageCount - product.min_pages);
    const unitPriceCents =
      product.retail_price_cents + extraPages * product.extra_page_price_cents;
    return {
      productId,
      quantity,
      pageCount,
      unitPriceCents,
      shippingCents: FLAT_SHIPPING_CENTS,
      totalCents: unitPriceCents * quantity + FLAT_SHIPPING_CENTS,
    };
  }

  async createOrder(request: PrintOrderRequest): Promise<{ providerOrderRef: string }> {
    // manual fulfillment: our own order id is the provider reference
    return { providerOrderRef: `manual:${request.orderId}` };
  }

  async getStatus(
    providerOrderRef: string
  ): Promise<{ status: ProviderOrderStatus; trackingUrl: string | null }> {
    // status is advanced by staff through the admin console; reflect the DB
    const sql = getSql();
    const orderId = providerOrderRef.replace(/^manual:/, "");
    const rows = await sql<{ status: string; tracking_url: string | null }[]>`
      select status, tracking_url from print_orders where id = ${orderId}
    `;
    const row = rows[0];
    const status = (row?.status ?? "submitted") as ProviderOrderStatus;
    return {
      status: ["submitted", "in_production", "shipped", "delivered", "canceled", "failed"].includes(status)
        ? status
        : "submitted",
      trackingUrl: row?.tracking_url ?? null,
    };
  }

  async cancel(_providerOrderRef: string): Promise<void> {
    // staff cancel manually; nothing to call
  }
}
