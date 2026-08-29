/**
 * Print provider abstraction. The system is never coupled to one printer:
 * products, quotes, orders and status flow through this interface.
 * Registered implementations live in src/server/print/index.ts.
 */

export interface PrintProductSpec {
  id: string;
  name: string;
  kind: "hardcover" | "softcover" | "layflat" | "mini" | "milestone_cards" | "prints";
  trimSize: string;
  minPages: number;
  maxPages: number;
  baseCostCents: number;
  retailPriceCents: number;
}

export interface PrintQuote {
  productId: string;
  quantity: number;
  pageCount: number;
  unitPriceCents: number;
  shippingCents: number;
  totalCents: number;
}

export interface PrintOrderRequest {
  orderId: string;             // our print_orders.id
  productId: string;
  quantity: number;
  pageCount: number;
  interiorPdfUrl: string;      // short-lived signed URL
  coverPdfUrl: string | null;
  shippingAddress: ShippingAddress;
}

export interface ShippingAddress {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string; // ISO-3166 alpha-2
}

export type ProviderOrderStatus =
  | "submitted"
  | "in_production"
  | "shipped"
  | "delivered"
  | "canceled"
  | "failed";

export interface PrintProvider {
  id: string;
  quote(productId: string, quantity: number, pageCount: number, address: ShippingAddress): Promise<PrintQuote>;
  createOrder(request: PrintOrderRequest): Promise<{ providerOrderRef: string }>;
  getStatus(providerOrderRef: string): Promise<{ status: ProviderOrderStatus; trackingUrl: string | null }>;
  cancel(providerOrderRef: string): Promise<void>;
}
