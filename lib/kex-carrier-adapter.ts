import { createHash } from "node:crypto";

type JsonRecord = Record<string, unknown>;

export type KexCarrierMode = "live" | "mock" | "sandbox";

export type KexCarrierCredentials = Readonly<{
  accountNumber: string | null;
  apiKey: string | null;
  authHeaderName: string;
  authScheme: string | null;
  baseUrl: string | null;
  clientId: string | null;
  clientSecret: string | null;
  createShipmentEndpoint: string | null;
  labelEndpoint: string | null;
  mode: KexCarrierMode;
  pickupEndpoint: string | null;
  sender: JsonRecord;
  testEndpoint: string | null;
  trackingEndpoint: string | null;
}>;

export type KexOrderAddress = Readonly<{
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  country: string | null;
  customerEmail: string | null;
  customerName: string | null;
  notes: string | null;
  phone: string | null;
  postalCode: string | null;
  province: string | null;
}>;

export type KexOrderLine = Readonly<{
  brandName: string | null;
  ean13: string | null;
  manufacturerSku: string | null;
  productId: string;
  productTitle: string;
  quantity: number;
}>;

export type KexOrderContext = Readonly<{
  currency: string;
  customerEmail: string | null;
  customerName: string | null;
  deliveryAddress: KexOrderAddress | null;
  lines: readonly KexOrderLine[];
  orderId: string;
  orderNumber: string;
  retailerOrganisationId: string;
  shipmentId: string | null;
  totalAmount: number | null;
}>;

export type KexAdapterStatus = "failed" | "passed" | "skipped";

export type KexAccountTestResult = Readonly<{
  metadata?: JsonRecord;
  reason: string;
  status: KexAdapterStatus;
}>;

export type KexShipmentResult = Readonly<{
  labelContentBase64?: string | null;
  labelContentType?: string | null;
  labelUrl?: string | null;
  metadata?: JsonRecord;
  pickupRequestId?: string | null;
  pickupWindowEnd?: string | null;
  pickupWindowStart?: string | null;
  providerShipmentId?: string | null;
  status?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
}>;

export type KexWebhookEvent = Readonly<{
  eventOccurredAt: string | null;
  providerEventId: string | null;
  providerShipmentId: string | null;
  providerStatusCode: string | null;
  providerStatusText: string | null;
  rawPayload: JsonRecord;
}>;

type AdapterRequest = Readonly<{
  credentials: KexCarrierCredentials;
  idempotencyKey: string;
  order: KexOrderContext;
  shipment?: KexShipmentResult | null;
}>;

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown) {
  const valueText = cleanText(value);

  return valueText || null;
}

function objectValue(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function statusRecords(payload: JsonRecord) {
  const req = objectValue(payload.req);
  const rawStatus =
    req.status ??
    req.Consignment ??
    req.consignment ??
    payload.status ??
    payload.event;

  return Array.isArray(rawStatus)
    ? rawStatus.map(objectValue)
    : [objectValue(rawStatus || payload)];
}

function valueFromKeys(record: JsonRecord, keys: readonly string[]) {
  for (const key of keys) {
    const value = record[key];

    if (value !== undefined && value !== null && cleanText(value)) {
      return cleanText(value);
    }
  }

  return null;
}

function modeValue(value: unknown): KexCarrierMode {
  const mode = cleanText(value).toLowerCase();

  return mode === "live" || mode === "sandbox" ? mode : "mock";
}

export function parseKexCarrierCredentials(input: unknown): KexCarrierCredentials {
  const source = objectValue(input);
  const endpointRecord = objectValue(source.endpoints);
  const sender = objectValue(source.sender);

  return {
    accountNumber:
      optionalText(source.accountNumber) ??
      optionalText(source.customerCode) ??
      optionalText(source.shipperCode),
    apiKey:
      optionalText(source.apiKey) ??
      optionalText(source.token) ??
      optionalText(source.accessToken),
    authHeaderName: optionalText(source.authHeaderName) ?? "Authorization",
    authScheme: optionalText(source.authScheme) ?? "Bearer",
    baseUrl: optionalText(source.baseUrl),
    clientId: optionalText(source.clientId),
    clientSecret: optionalText(source.clientSecret),
    createShipmentEndpoint:
      optionalText(source.createShipmentEndpoint) ??
      optionalText(endpointRecord.createShipment),
    labelEndpoint:
      optionalText(source.labelEndpoint) ??
      optionalText(endpointRecord.label),
    mode: modeValue(source.mode),
    pickupEndpoint:
      optionalText(source.pickupEndpoint) ??
      optionalText(endpointRecord.pickup),
    sender,
    testEndpoint:
      optionalText(source.testEndpoint) ??
      optionalText(endpointRecord.test),
    trackingEndpoint:
      optionalText(source.trackingEndpoint) ??
      optionalText(endpointRecord.tracking)
  };
}

function endpointUrl(baseUrl: string, path: string, replacements: JsonRecord = {}) {
  const replaced = path.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) =>
    encodeURIComponent(cleanText(replacements[key]))
  );

  return new URL(replaced, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
}

function authHeaders(credentials: KexCarrierCredentials) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (credentials.apiKey) {
    headers[credentials.authHeaderName] = credentials.authScheme
      ? `${credentials.authScheme} ${credentials.apiKey}`
      : credentials.apiKey;
  }

  if (credentials.clientId) {
    headers["X-Client-Id"] = credentials.clientId;
  }

  if (credentials.clientSecret) {
    headers["X-Client-Secret"] = credentials.clientSecret;
  }

  if (credentials.accountNumber) {
    headers["X-KEX-Account"] = credentials.accountNumber;
  }

  return headers;
}

async function fetchKexJson(input: Readonly<{
  body?: JsonRecord | null;
  credentials: KexCarrierCredentials;
  endpoint: string;
  method?: "GET" | "POST";
  replacements?: JsonRecord;
}>) {
  if (!input.credentials.baseUrl) {
    throw new Error("KEX baseUrl is required");
  }

  const url = endpointUrl(
    input.credentials.baseUrl,
    input.endpoint,
    input.replacements
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      body: input.method === "GET" ? undefined : JSON.stringify(input.body ?? {}),
      headers: authHeaders(input.credentials),
      method: input.method ?? "POST",
      signal: controller.signal
    });
    const responseText = await response.text();
    const parsed = responseText
      ? objectValue(JSON.parse(responseText) as unknown)
      : {};

    if (!response.ok) {
      throw new Error(
        `KEX API request failed with status ${response.status}: ${
          cleanText(parsed.message) || cleanText(parsed.error) || response.statusText
        }`
      );
    }

    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

function mockProviderId(prefix: string, source: string) {
  return `${prefix}-${createHash("sha256").update(source).digest("hex").slice(0, 12).toUpperCase()}`;
}

function trackingUrl(trackingNumber: string | null) {
  return trackingNumber
    ? `https://th.kex-express.com/en/track-parcel?tracking=${encodeURIComponent(trackingNumber)}`
    : null;
}

function shipmentPayload(input: AdapterRequest) {
  return {
    accountNumber: input.credentials.accountNumber,
    idempotencyKey: input.idempotencyKey,
    order: {
      currency: input.order.currency,
      customerEmail: input.order.customerEmail,
      customerName: input.order.customerName,
      deliveryAddress: input.order.deliveryAddress,
      lines: input.order.lines,
      orderId: input.order.orderId,
      orderNumber: input.order.orderNumber,
      totalAmount: input.order.totalAmount
    },
    sender: input.credentials.sender
  };
}

function resultFromResponse(response: JsonRecord): KexShipmentResult {
  const data = objectValue(response.data);
  const shipment = objectValue(data.shipment);
  const label = objectValue(data.label);
  const pickup = objectValue(data.pickup);
  const source = {
    ...response,
    ...data,
    ...shipment
  };
  const labelSource = { ...response, ...data, ...label };
  const pickupSource = { ...response, ...data, ...pickup };
  const trackingNumber = valueFromKeys(source, [
    "trackingNumber",
    "tracking_number",
    "con_no",
    "awb",
    "awbNumber"
  ]);

  return {
    labelContentBase64: valueFromKeys(labelSource, [
      "labelContentBase64",
      "label_base64",
      "pdfBase64",
      "qrBase64"
    ]),
    labelContentType: valueFromKeys(labelSource, [
      "labelContentType",
      "contentType"
    ]),
    labelUrl: valueFromKeys(labelSource, ["labelUrl", "label_url", "url"]),
    metadata: response,
    pickupRequestId: valueFromKeys(pickupSource, [
      "pickupRequestId",
      "pickup_request_id",
      "requestId"
    ]),
    pickupWindowEnd: valueFromKeys(pickupSource, [
      "pickupWindowEnd",
      "pickup_window_end"
    ]),
    pickupWindowStart: valueFromKeys(pickupSource, [
      "pickupWindowStart",
      "pickup_window_start"
    ]),
    providerShipmentId: valueFromKeys(source, [
      "providerShipmentId",
      "shipmentId",
      "shipment_id",
      "consignmentId",
      "con_no",
      "awb"
    ]),
    status: valueFromKeys(source, ["status", "statusText", "status_desc"]),
    trackingNumber,
    trackingUrl:
      valueFromKeys(source, ["trackingUrl", "tracking_url"]) ??
      trackingUrl(trackingNumber)
  };
}

export async function testKexAccount(
  credentials: KexCarrierCredentials
): Promise<KexAccountTestResult> {
  if (credentials.mode === "mock") {
    return {
      reason: "mock_mode",
      status: "passed"
    };
  }

  if (!credentials.baseUrl || !credentials.testEndpoint) {
    return {
      reason: "missing_test_endpoint",
      status: "failed"
    };
  }

  if (!credentials.apiKey && !credentials.clientId) {
    return {
      reason: "missing_api_credentials",
      status: "failed"
    };
  }

  const response = await fetchKexJson({
    credentials,
    endpoint: credentials.testEndpoint,
    method: "GET"
  });

  return {
    metadata: response,
    reason: "kex_test_endpoint_passed",
    status: "passed"
  };
}

export async function createKexShipment(input: AdapterRequest): Promise<KexShipmentResult> {
  if (input.credentials.mode === "mock") {
    const trackingNumber = mockProviderId("KEX", input.order.orderId);

    return {
      providerShipmentId: trackingNumber,
      status: "shipment_created",
      trackingNumber,
      trackingUrl: trackingUrl(trackingNumber)
    };
  }

  if (!input.credentials.createShipmentEndpoint) {
    throw new Error("KEX create shipment endpoint is not configured");
  }

  const response = await fetchKexJson({
    body: shipmentPayload(input),
    credentials: input.credentials,
    endpoint: input.credentials.createShipmentEndpoint
  });

  return resultFromResponse(response);
}

export async function generateKexLabel(input: AdapterRequest): Promise<KexShipmentResult> {
  if (input.credentials.mode === "mock") {
    return {
      labelContentBase64: Buffer.from(
        `KEX MOCK LABEL\nOrder: ${input.order.orderNumber}\nTracking: ${input.shipment?.trackingNumber ?? ""}`
      ).toString("base64"),
      labelContentType: "text/plain",
      labelUrl: null,
      status: "label_generated"
    };
  }

  if (!input.credentials.labelEndpoint) {
    throw new Error("KEX label endpoint is not configured");
  }

  const response = await fetchKexJson({
    body: shipmentPayload(input),
    credentials: input.credentials,
    endpoint: input.credentials.labelEndpoint,
    replacements: {
      orderId: input.order.orderId,
      shipmentId: input.shipment?.providerShipmentId ?? input.order.shipmentId,
      trackingNumber: input.shipment?.trackingNumber
    }
  });

  return resultFromResponse(response);
}

export async function bookKexPickup(input: AdapterRequest): Promise<KexShipmentResult> {
  if (input.credentials.mode === "mock") {
    return {
      pickupRequestId: mockProviderId("KEXPICKUP", input.idempotencyKey),
      pickupWindowStart: new Date().toISOString(),
      status: "pickup_booked"
    };
  }

  if (!input.credentials.pickupEndpoint) {
    throw new Error("KEX pickup endpoint is not configured");
  }

  const response = await fetchKexJson({
    body: shipmentPayload(input),
    credentials: input.credentials,
    endpoint: input.credentials.pickupEndpoint,
    replacements: {
      orderId: input.order.orderId,
      shipmentId: input.shipment?.providerShipmentId ?? input.order.shipmentId,
      trackingNumber: input.shipment?.trackingNumber
    }
  });

  return resultFromResponse(response);
}

export async function syncKexTracking(input: AdapterRequest): Promise<KexShipmentResult> {
  if (input.credentials.mode === "mock") {
    return {
      status: input.shipment?.status ?? "shipment_created",
      trackingNumber: input.shipment?.trackingNumber ?? null,
      trackingUrl:
        input.shipment?.trackingUrl ??
        trackingUrl(input.shipment?.trackingNumber ?? null)
    };
  }

  if (!input.credentials.trackingEndpoint) {
    throw new Error("KEX tracking endpoint is not configured");
  }

  const response = await fetchKexJson({
    credentials: input.credentials,
    endpoint: input.credentials.trackingEndpoint,
    method: "GET",
    replacements: {
      orderId: input.order.orderId,
      shipmentId: input.shipment?.providerShipmentId ?? input.order.shipmentId,
      trackingNumber: input.shipment?.trackingNumber
    }
  });

  return resultFromResponse(response);
}

export function parseKexWebhookPayload(payload: JsonRecord): KexWebhookEvent[] {
  return statusRecords(payload).map((status) => ({
    eventOccurredAt:
      optionalText(status.status_date) ??
      optionalText(status.update_date) ??
      optionalText(status.eventTime),
    providerEventId:
      optionalText(status.event_id) ??
      optionalText(status.webhookEventId) ??
      optionalText(status.id),
    providerShipmentId:
      optionalText(status.con_no) ??
      optionalText(status.tracking_number) ??
      optionalText(status.trackingNumber),
    providerStatusCode:
      optionalText(status.status_code) ??
      optionalText(status.code),
    providerStatusText:
      optionalText(status.status_desc) ??
      optionalText(status.status) ??
      optionalText(status.description),
    rawPayload: status
  }));
}
