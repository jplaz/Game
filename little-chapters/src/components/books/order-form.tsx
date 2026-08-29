"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { formatCents } from "@/lib/format";

interface Product {
  id: string;
  name: string;
  retailPriceCents: number;
}

/** Order a printed copy of a rendered book. */
export function OrderForm({
  bookId,
  products,
}: {
  bookId: string;
  products: Product[];
}) {
  const router = useRouter();
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [address, setAddress] = useState({
    name: "", line1: "", line2: "", city: "", state: "", postalCode: "", country: "US",
  });
  const [quote, setQuote] = useState<{ totalCents: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState(false);

  const payload = () => ({
    bookId,
    productId,
    quantity,
    address: {
      ...address,
      line2: address.line2 || null,
      state: address.state || null,
    },
  });

  const getQuote = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/print/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "quote", ...payload() }),
      });
      const data = (await response.json()) as {
        totalCents?: number;
        error?: { message: string };
      };
      if (!response.ok || data.totalCents === undefined) {
        throw new Error(data.error?.message ?? "Couldn't quote that");
      }
      setQuote({ totalCents: data.totalCents });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't quote that");
    } finally {
      setBusy(false);
    }
  };

  const place = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/print/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "place", ...payload() }),
      });
      const data = (await response.json()) as {
        orderId?: string;
        checkoutUrl?: string | null;
        error?: { message: string };
      };
      if (!response.ok || !data.orderId) {
        throw new Error(data.error?.message ?? "Couldn't place the order");
      }
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      setPlaced(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't place the order");
    } finally {
      setBusy(false);
    }
  };

  if (placed) {
    return (
      <p className="text-sm text-sage-600">
        Order placed. Payment isn&apos;t connected in this environment, so it&apos;s
        waiting in <em>awaiting payment</em> — with Stripe configured you&apos;d be
        checking out right now (docs/INTEGRATIONS.md §4).
      </p>
    );
  }

  const setField = (key: keyof typeof address) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => setAddress((a) => ({ ...a, [key]: e.target.value }));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void (quote ? place() : getQuote());
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Product">
          {(id) => (
            <Select
              id={id}
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                setQuote(null);
              }}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — from {formatCents(p.retailPriceCents)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Copies">
          {(id) => (
            <Input
              id={id}
              type="number"
              min={1}
              max={50}
              value={quantity}
              onChange={(e) => {
                setQuantity(Number(e.target.value) || 1);
                setQuote(null);
              }}
            />
          )}
        </Field>
      </div>
      <Field label="Ship to">
        {(id) => (
          <Input id={id} required placeholder="Full name" value={address.name} onChange={setField("name")} />
        )}
      </Field>
      <Input required placeholder="Address line 1" aria-label="Address line 1"
        value={address.line1} onChange={setField("line1")} />
      <Input placeholder="Address line 2 (optional)" aria-label="Address line 2"
        value={address.line2} onChange={setField("line2")} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Input required placeholder="City" aria-label="City"
          value={address.city} onChange={setField("city")} className="sm:col-span-2" />
        <Input placeholder="State" aria-label="State"
          value={address.state} onChange={setField("state")} />
        <Input required placeholder="Postal code" aria-label="Postal code"
          value={address.postalCode} onChange={setField("postalCode")} />
      </div>
      <Input required placeholder="Country (2-letter, e.g. US)" aria-label="Country"
        maxLength={2} value={address.country}
        onChange={(e) => setAddress((a) => ({ ...a, country: e.target.value.toUpperCase() }))} />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {quote ? (
        <p className="text-ink-600">
          Total including shipping: <strong>{formatCents(quote.totalCents)}</strong>
        </p>
      ) : null}
      <Button type="submit" disabled={busy}>
        {busy ? "One moment…" : quote ? "Place order" : "Get a quote"}
      </Button>
    </form>
  );
}
