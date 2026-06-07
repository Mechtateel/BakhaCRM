export type WappiConfig = {
  enabled: boolean;
  dryRun: boolean;
  apiBaseUrl?: string;
  token?: string;
  profileId?: string;
  webhookSecret?: string;
};

export type WappiWebhookType = "message" | "status" | "unknown";

export type NormalizedWappiStatus = {
  externalMessageId: string | null;
  status: "sent" | "delivered" | "read" | "failed" | string;
  errorMessage?: string | null;
  raw: unknown;
};

export type NormalizedWappiMessage = {
  externalMessageId: string | null;
  phone: string;
  text: string;
  mediaUrl: string | null;
  mediaType: string | null;
  raw: unknown;
  receivedAt: string;
};

export function getWappiConfig(env: NodeJS.ProcessEnv = process.env): WappiConfig {
  return {
    enabled: env.WAPPI_ENABLED === "true",
    dryRun: env.WAPPI_DRY_RUN !== "false",
    apiBaseUrl: env.WAPPI_API_BASE_URL ?? "https://wappi.pro",
    token: env.WAPPI_TOKEN,
    profileId: env.WAPPI_PROFILE_ID,
    webhookSecret: env.WAPPI_WEBHOOK_SECRET
  };
}

export function publicWappiConfig(config = getWappiConfig()) {
  return {
    enabled: config.enabled,
    dryRun: config.dryRun,
    // apiBaseUrl always has a default; only token + profileId are user-supplied credentials
    configured: Boolean(config.token && config.profileId),
  };
}

export function normalizePhone(value?: string | number | null) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `7${digits}`;
  if (digits.length === 11 && digits.startsWith("8")) return `7${digits.slice(1)}`;
  return digits;
}

function readString(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return "";
}

export function normalizeIncomingWebhook(payload: unknown): NormalizedWappiMessage {
  const data = (typeof payload === "object" && payload !== null ? payload : {}) as Record<string, unknown>;
  const nestedMessage = (typeof data.message === "object" && data.message !== null ? data.message : {}) as Record<string, unknown>;
  const nestedContact = (typeof data.contact === "object" && data.contact !== null ? data.contact : {}) as Record<string, unknown>;
  const source = { ...data, ...nestedMessage, ...nestedContact };
  const phone = normalizePhone(readString(source, ["phone", "from", "chatId", "sender", "wa_id", "contact_phone"]));
  const text = readString(source, ["text", "body", "message", "caption"]);
  const externalMessageId = readString(source, ["id", "messageId", "message_id", "external_message_id", "wamid"]) || null;
  const mediaUrl = readString(source, ["mediaUrl", "media_url", "file", "url"]) || null;
  const mediaType = readString(source, ["mediaType", "media_type", "type"]) || null;
  const receivedAt = readString(source, ["timestamp", "created_at", "date"]) || new Date().toISOString();

  return {
    externalMessageId,
    phone,
    text,
    mediaUrl,
    mediaType,
    raw: payload,
    receivedAt: Number.isFinite(Number(receivedAt)) ? new Date(Number(receivedAt) * 1000).toISOString() : new Date(receivedAt).toISOString()
  };
}

/**
 * Heuristically determines if this webhook payload is a message status update
 * (delivery/read receipt) vs a new incoming message.
 *
 * WAPPI.pro sends status callbacks when messages are delivered or read.
 * We detect them by looking for status-specific type values and the absence
 * of message text content.
 */
export function detectWebhookType(payload: unknown): WappiWebhookType {
  const data = (typeof payload === "object" && payload !== null ? payload : {}) as Record<string, unknown>;
  const type = typeof data.type === "string" ? data.type.toLowerCase() : "";

  // Explicit status-type indicators
  if (["message_status", "ack", "status_update", "delivery", "delivery_receipt", "read_receipt"].includes(type)) {
    return "status";
  }

  // Top-level status object with an id → delivery receipt
  if (typeof data.status === "object" && data.status !== null && !data.message) {
    const s = data.status as Record<string, unknown>;
    if (typeof s.id === "string" || typeof s.message_id === "string") {
      return "status";
    }
  }

  // Message sent by us (from_me=true) with a status but no text → delivery/read callback
  if (data.message && typeof data.message === "object") {
    const msg = data.message as Record<string, unknown>;
    const hasText =
      (typeof msg.text === "object" && msg.text !== null) ||
      typeof msg.body === "string" ||
      typeof msg.caption === "string";
    const hasDeliveryStatus =
      typeof msg.status === "string" &&
      ["delivered", "read", "failed", "sent", "server", "device"].includes(msg.status);
    if (hasDeliveryStatus && !hasText && msg.from_me === true) {
      return "status";
    }
  }

  if (type === "message" || !type) return "message";
  return "unknown";
}

/**
 * Normalises a WAPPI status-update webhook into a standard shape.
 * Handles multiple documented and undocumented WAPPI payload formats.
 *
 * TODO: confirm exact real WAPPI status payload shape with WAPPI support.
 */
export function normalizeStatusWebhook(payload: unknown): NormalizedWappiStatus {
  const data = (typeof payload === "object" && payload !== null ? payload : {}) as Record<string, unknown>;
  const nestedStatus = (typeof data.status === "object" && data.status !== null ? data.status : {}) as Record<string, unknown>;
  const nestedMessage = (typeof data.message === "object" && data.message !== null ? data.message : {}) as Record<string, unknown>;

  const externalMessageId =
    (typeof nestedStatus.id === "string" && nestedStatus.id) ? nestedStatus.id :
    (typeof nestedStatus.message_id === "string" && nestedStatus.message_id) ? nestedStatus.message_id :
    (typeof nestedMessage.id === "string" && nestedMessage.id) ? nestedMessage.id :
    (typeof data.message_id === "string" && data.message_id) ? data.message_id :
    (typeof data.id === "string" && data.id) ? data.id :
    null;

  const rawStatus: string =
    (typeof nestedStatus.status === "string" && nestedStatus.status) ? nestedStatus.status :
    (typeof nestedMessage.status === "string" && nestedMessage.status) ? nestedMessage.status :
    (typeof data.ack === "string" && data.ack) ? data.ack :
    (typeof data.status === "string" && data.status) ? data.status :
    "delivered";

  // Map common WAPPI ack codes and string names to canonical values
  const statusMap: Record<string, string> = {
    "1": "sent", "server": "sent", "pending": "sent",
    "2": "delivered", "device": "delivered",
    "3": "read", "seen": "read",
    "0": "failed", "error": "failed"
  };
  const status = statusMap[rawStatus] ?? rawStatus;

  const errorMessage =
    (typeof nestedStatus.error === "string" && nestedStatus.error) ? nestedStatus.error :
    (typeof data.error === "string" && data.error) ? data.error :
    null;

  return { externalMessageId, status, errorMessage, raw: payload };
}

/**
 * Fetches WAPPI profile status for the test-connection endpoint.
 * Returns a safe result — never throws, never exposes the token.
 *
 * TODO: confirm exact WAPPI.pro profile-status endpoint path with WAPPI support.
 */
export async function getWappiProfileStatus(
  config: WappiConfig
): Promise<{ ok: boolean; configured: boolean; profileStatus?: string; error?: string }> {
  if (!config.enabled) return { ok: false, configured: false, error: "WAPPI_ENABLED=false" };
  if (config.dryRun) return { ok: true, configured: Boolean(config.token && config.profileId) };
  if (!config.token || !config.profileId) {
    return { ok: false, configured: false, error: "Missing WAPPI_TOKEN or WAPPI_PROFILE_ID" };
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const base = (config.apiBaseUrl ?? "https://wappi.pro").replace(/\/$/, "");
    const res = await fetch(
      `${base}/api/sync/profile/status?profile_id=${encodeURIComponent(config.profileId)}`,
      {
        headers: { Authorization: `Bearer ${config.token}` },
        signal: controller.signal
      }
    ).finally(() => clearTimeout(timeout));
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!res.ok) return { ok: false, configured: true, error: `WAPPI responded with HTTP ${res.status}` };
    const status = typeof body.status === "string" ? body.status : (body.connected ? "active" : "connected");
    return { ok: true, configured: true, profileStatus: status };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, configured: true, error: msg };
  }
}

export function verifyWebhook(config: WappiConfig, signature?: string | null) {
  if (!config.webhookSecret) return true;
  return signature === config.webhookSecret;
}

export async function sendMessage(config: WappiConfig, phone: string, text: string) {
  if (!config.enabled || config.dryRun) {
    return {
      dryRun: true,
      status: "sent",
      externalMessageId: `dry-run-${Date.now()}`,
      response: { phone, text }
    };
  }

  if (!config.apiBaseUrl || !config.token || !config.profileId) {
    throw new Error("WAPPI is enabled but API base URL, token or profile id is missing");
  }

  const response = await fetch(`${config.apiBaseUrl.replace(/\/$/, "")}/api/sync/message/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.token}`
    },
    body: JSON.stringify({
      profile_id: config.profileId,
      phone,
      body: text
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`WAPPI send failed: ${response.status}`);
  }

  return {
    dryRun: false,
    status: "sent",
    externalMessageId: String((payload as Record<string, unknown>).id ?? (payload as Record<string, unknown>).message_id ?? ""),
    response: payload
  };
}
