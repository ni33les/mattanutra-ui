export type RetailCarrierCapability =
  | "create_shipment"
  | "print_label"
  | "receive_events"
  | "request_pickup"
  | "track";

export type RetailCarrierId = "custom" | "dhl" | "flash_express" | "grab" | "kex_th" | "thailand_post";

export type RetailCarrierDefinition = Readonly<{
  aliases: readonly string[];
  capabilities: readonly RetailCarrierCapability[];
  displayName: string;
  id: RetailCarrierId;
  requiresOfficialLabel: boolean;
  trackingUrl: string | null;
  usesQrCode: boolean;
}>;

export const retailCarriers = [
  {
    aliases: ["KEX", "KEX Express", "KEX Logistics", "Kerry Express", "Kerry"],
    capabilities: [
      "create_shipment",
      "print_label",
      "receive_events",
      "request_pickup",
      "track"
    ],
    displayName: "KEX Express (Thailand)",
    id: "kex_th",
    requiresOfficialLabel: true,
    trackingUrl: "https://th.kex-express.com/en/track-parcel",
    usesQrCode: true
  },
  {
    aliases: ["Thailand Post", "Thai Post"],
    capabilities: ["print_label", "track"],
    displayName: "Thailand Post",
    id: "thailand_post",
    requiresOfficialLabel: false,
    trackingUrl: null,
    usesQrCode: false
  },
  {
    aliases: ["Flash Express", "Flash"],
    capabilities: ["print_label", "track"],
    displayName: "Flash Express",
    id: "flash_express",
    requiresOfficialLabel: false,
    trackingUrl: null,
    usesQrCode: false
  },
  {
    aliases: ["DHL"],
    capabilities: ["print_label", "track"],
    displayName: "DHL",
    id: "dhl",
    requiresOfficialLabel: false,
    trackingUrl: null,
    usesQrCode: false
  },
  {
    aliases: ["Grab"],
    capabilities: ["print_label"],
    displayName: "Grab",
    id: "grab",
    requiresOfficialLabel: false,
    trackingUrl: null,
    usesQrCode: false
  }
] as const satisfies readonly RetailCarrierDefinition[];

const carrierById = new Map<RetailCarrierId, RetailCarrierDefinition>(
  retailCarriers.map((carrier) => [carrier.id, carrier])
);
const carrierAliasMap = new Map<string, RetailCarrierDefinition>(
  retailCarriers.flatMap((carrier) => [
    [carrier.id.toLowerCase(), carrier] as const,
    [carrier.displayName.toLowerCase(), carrier] as const,
    ...carrier.aliases.map((alias) => [alias.toLowerCase(), carrier] as const)
  ])
);

export function retailCarrierById(id: string | null | undefined) {
  return carrierById.get(id as RetailCarrierId) ?? null;
}

export function normalizeRetailCarrier(value: string | null | undefined) {
  const key = value?.trim().toLowerCase();

  return key ? carrierAliasMap.get(key) ?? null : null;
}

export function retailCarrierDisplayName(value: string | null | undefined) {
  return normalizeRetailCarrier(value)?.displayName ?? value?.trim() ?? "";
}
