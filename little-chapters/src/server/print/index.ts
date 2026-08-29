import { env } from "@/server/env";
import { ManualFulfillmentProvider } from "@/server/print/manual";
import type { PrintProvider } from "@/server/print/provider";

const providers: Record<string, () => PrintProvider> = {
  manual: () => new ManualFulfillmentProvider(),
  // future: lulu: () => new LuluProvider(), peecho: () => new PeechoProvider(), …
};

let active: PrintProvider | null = null;

export function getPrintProvider(): PrintProvider {
  if (!active) {
    const factory = providers[env().PRINT_PROVIDER] ?? providers.manual!;
    active = factory();
  }
  return active;
}
