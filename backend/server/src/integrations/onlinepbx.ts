/**
 * onlinePBX Telephony Integration Client
 * Mirrors the pattern of backend/server/src/integrations/wappi.ts
 *
 * onlinePBX API docs: https://support.onlinepbx.ru/index.php/API
 * Typical API base: https://{domain}.onlinepbx.ru
 * Auth header: Authorization: bearer {apiKey}
 *
 * NOTE: Exact endpoint paths and payload field names in startOutgoingCall()
 * and normalizeOnlinePbxWebhook() are marked with TODO comments. Verify them
 * against your specific onlinePBX account API documentation before going live.
 */

export type OnlinePbxConfig = {
  enabled: boolean;
  /** When true, no real API calls are made; a fake call ID is returned. */
  dryRun: boolean;
  apiBaseUrl: string;
  domain: string;
  /** NEVER expose in frontend responses or logs. Server-side only. */
  apiKey?: string;
  webhookSecret?: string;
};

export type CallResult = {
  ok: boolean;
  externalCallId?: string;
  status?: string;
  dryRun?: boolean;
  /** Sanitised summary only – never includes the API key. */
  raw?: unknown;
  error?: string;
};

export type NormalizedPbxWebhook = {
  externalCallId: string | null;
  direction: "incoming" | "outgoing";
  /** "ringing" | "answered" | "missed" | "completed" | "failed" | "cancelled" | "unknown" */
  status: string;
  callerPhone: string;
  calleePhone: string;
  durationSec: number;
  recordingUrl: string | null;
  startedAt: string | null;
  answeredAt: string | null;
  endedAt: string | null;
  raw: unknown;
};

export function getOnlinePbxConfig(env: NodeJS.ProcessEnv = process.env): OnlinePbxConfig {
  return {
    enabled: env.ONLINEPBX_ENABLED === "true",
    // Default true (dry-run) for safety; set ONLINEPBX_DRY_RUN=false to make real calls.
    dryRun: env.ONLINEPBX_DRY_RUN !== "false",
    apiBaseUrl: env.ONLINEPBX_API_BASE_URL ?? "https://api2.onlinepbx.ru",
    domain: env.ONLINEPBX_DOMAIN ?? "",
    apiKey: env.ONLINEPBX_API_KEY,
    webhookSecret: env.ONLINEPBX_WEBHOOK_SECRET,
  };
}

/** Returns the safe non-secret config subset for frontend consumers. */
export function publicOnlinePbxConfig(config = getOnlinePbxConfig()) {
  return {
    enabled: config.enabled,
    dryRun: config.dryRun,
    configured: Boolean(config.domain && config.apiKey),
  };
}

function readField(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v;
    if (typeof v === "number") return String(v);
  }
  return "";
}

/**
 * Initiate an outgoing click-to-call via onlinePBX REST API.
 *
 * TODO: Confirm the exact endpoint URL and request body shape with
 * onlinePBX support for your account type. Common paths:
 *   POST https://{domain}.onlinepbx.ru/call/create.json  (REST API v2)
 *   POST https://{domain}.onlinepbx.ru/click2call         (legacy)
 *
 * Typical successful response:
 *   { status: true, data: { call_session_id: "abc123" } }
 */
export async function startOutgoingCall(
  config: OnlinePbxConfig,
  params: { managerExtension: string; clientPhone: string }
): Promise<CallResult> {
  if (!config.enabled || config.dryRun) {
    return {
      ok: true,
      dryRun: true,
      externalCallId: `dryrun_call_${Date.now()}`,
      status: "initiated",
      raw: { dryRun: true, extension: params.managerExtension, phone: params.clientPhone },
    };
  }

  if (!config.domain || !config.apiKey) {
    return {
      ok: false,
      error: "onlinePBX: домен и API-ключ не настроены. Проверьте ONLINEPBX_DOMAIN и ONLINEPBX_API_KEY в .env.",
    };
  }

  try {
    // TODO: Verify exact URL path with onlinePBX for your account
    const url = `https://${config.domain}.onlinepbx.ru/call/create.json`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        key: config.apiKey,
        from_number: params.managerExtension,
        to_number: params.clientPhone,
      }),
    });

    // Parse response without logging API key echoes
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok || payload.status === false) {
      return {
        ok: false,
        error: `onlinePBX API error: HTTP ${response.status}`,
        raw: { httpStatus: response.status },
      };
    }

    const data = (
      typeof payload.data === "object" && payload.data !== null ? payload.data : payload
    ) as Record<string, unknown>;
    const externalCallId = readField(data, ["call_session_id", "id", "call_id", "uuid"]) || undefined;

    return {
      ok: true,
      dryRun: false,
      externalCallId,
      status: "initiated",
      raw: { httpStatus: response.status },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "onlinePBX request failed",
    };
  }
}

/**
 * Verify the shared secret in an incoming webhook request.
 *
 * TODO: Confirm header name with onlinePBX. Commonly used headers:
 *   X-OnlinePBX-Token, X-Webhook-Secret, Authorization.
 */
export function verifyOnlinePbxWebhook(
  config: OnlinePbxConfig,
  headerValue?: string | null
): boolean {
  if (!config.webhookSecret) return true; // no secret configured → accept all
  return headerValue === config.webhookSecret;
}

/**
 * Normalize an onlinePBX webhook event payload to a consistent shape.
 *
 * TODO: Adjust field name mappings once you have real webhook payloads.
 * Use the onlinePBX admin panel test-webhook feature to capture samples.
 *
 * Common onlinePBX webhook fields:
 *   call_id / uuid          — external call identifier
 *   call_direction          — "in" | "out"
 *   call_state / status     — "ringing" | "answered" | "hangup" | "missed"
 *   from_number / from      — caller phone
 *   to_number / to          — callee phone
 *   duration / bill_seconds — call duration in seconds
 *   record_url / file       — recording URL (appears in completed/hangup event)
 *   date_start              — call start (ISO or Unix timestamp)
 *   date_answer             — call answer (ISO or Unix timestamp)
 *   date_end                — call end (ISO or Unix timestamp)
 */
export function normalizeOnlinePbxWebhook(payload: unknown): NormalizedPbxWebhook {
  const data = (
    typeof payload === "object" && payload !== null ? payload : {}
  ) as Record<string, unknown>;

  const externalCallId =
    readField(data, ["call_id", "uuid", "call_session_id", "id"]) || null;

  const dirRaw = readField(data, ["call_direction", "direction", "type"]).toLowerCase();
  const direction: "incoming" | "outgoing" =
    dirRaw === "in" || dirRaw === "incoming" ? "incoming" : "outgoing";

  const stRaw = readField(data, [
    "call_state",
    "status",
    "hangup_cause",
    "event",
  ]).toLowerCase();
  let status = "unknown";
  if (stRaw.includes("ring")) status = "ringing";
  else if (stRaw.includes("answer")) status = "answered";
  else if (stRaw === "noanswer" || stRaw.includes("miss")) status = "missed";
  else if (stRaw.includes("hang") || stRaw === "completed" || stRaw === "bye") status = "completed";
  else if (stRaw.includes("fail")) status = "failed";
  else if (stRaw.includes("cancel") || stRaw === "busy") status = "cancelled";
  else if (stRaw) status = stRaw;

  const callerPhone = readField(data, [
    "from_number",
    "from",
    "caller",
    "caller_id",
    "call_from",
  ]);
  const calleePhone = readField(data, [
    "to_number",
    "to",
    "callee",
    "called_number",
    "call_to",
  ]);

  const durationRaw = data.duration ?? data.bill_seconds ?? data.duration_sec ?? 0;
  const durationSec =
    typeof durationRaw === "number"
      ? durationRaw
      : parseInt(String(durationRaw), 10) || 0;

  const recordingUrl =
    readField(data, ["record_url", "file", "recording_url", "record_file"]) || null;

  function parseTs(val: string | null): string | null {
    if (!val) return null;
    if (/^\d{9,}$/.test(val)) return new Date(Number(val) * 1000).toISOString();
    try {
      return new Date(val).toISOString();
    } catch {
      return null;
    }
  }

  const startedAt = parseTs(
    readField(data, ["date_start", "start_time", "started_at"]) || null
  );
  const answeredAt = parseTs(
    readField(data, ["date_answer", "answer_time", "answered_at"]) || null
  );
  const endedAt = parseTs(
    readField(data, ["date_end", "end_time", "ended_at"]) || null
  );

  return {
    externalCallId,
    direction,
    status,
    callerPhone,
    calleePhone,
    durationSec,
    recordingUrl,
    startedAt,
    answeredAt,
    endedAt,
    raw: payload,
  };
}
