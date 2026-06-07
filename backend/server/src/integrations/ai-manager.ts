/**
 * AI Manager Bridge Adapter
 *
 * Isolates all communication with the external AI Manager server.
 * The external AI Manager already exists on a separate server; this adapter
 * bridges incoming WAPPI messages to it and normalizes its responses.
 *
 * Rules:
 * - Never expose AI_MANAGER_API_KEY in any response or log.
 * - Never crash WAPPI webhook if AI fails — all errors are caught here.
 * - AI_MANAGER_ENABLED=false (default) → no calls, just returns skipped.
 * - AI_MANAGER_DRY_RUN=true → returns realistic local simulation.
 * - All I/O is isolated here; nothing in index.ts knows the AI API shape.
 */

export type AiManagerConfig = {
  enabled: boolean;
  dryRun: boolean;
  baseUrl?: string;
  endpoint: string;
  hasApiKey: boolean;
  autoSend: boolean;
  autoActions: boolean;
  pauseOnManagerReply: boolean;
  pauseMinutes: number;
  minConfidence: number;
};

export type AiSuggestedAction = {
  type: string;
  payload: unknown;
  confidence?: number;
};

export type AiNormalizedResponse = {
  ok: boolean;
  replyText?: string;
  confidence?: number;
  suggestedActions?: AiSuggestedAction[];
  raw?: unknown;
  error?: string;
};

export type AiRecentMessage = {
  role: "client" | "manager" | "ai";
  direction: string;
  senderType: string;
  text: string;
  createdAt: string;
};

export type AiSendParams = {
  conversationId: number;
  leadId: number;
  contactId?: number | null;
  incomingMessageId: number;
  clientPhone: string;
  clientName?: string | null;
  text: string;
  recentMessages?: AiRecentMessage[];
  leadStage?: string | null;
  source?: string | null;
  responsibleManager?: string | null;
  aiContext?: Record<string, unknown>;
};

export function getAiManagerConfig(env: NodeJS.ProcessEnv = process.env): AiManagerConfig {
  return {
    enabled: env.AI_MANAGER_ENABLED === "true",
    dryRun: env.AI_MANAGER_DRY_RUN !== "false",
    baseUrl: env.AI_MANAGER_BASE_URL,
    endpoint: env.AI_MANAGER_ENDPOINT ?? "/api/incoming-message",
    hasApiKey: Boolean(env.AI_MANAGER_API_KEY),
    autoSend: env.AI_MANAGER_AUTO_SEND === "true",
    autoActions: env.AI_MANAGER_AUTO_ACTIONS === "true",
    pauseOnManagerReply: env.AI_MANAGER_PAUSE_ON_MANAGER_REPLY !== "false",
    pauseMinutes: Math.max(1, Number(env.AI_MANAGER_PAUSE_MINUTES ?? 30)),
    minConfidence: Math.min(1, Math.max(0, Number(env.AI_MANAGER_MIN_CONFIDENCE ?? 0.75)))
  };
}

/**
 * Returns safe AI config info for API/status responses.
 * Never includes apiKey value.
 */
export function maskAiConfigStatus(config = getAiManagerConfig()) {
  return {
    enabled: config.enabled,
    dryRun: config.dryRun,
    baseUrlConfigured: Boolean(config.baseUrl),
    endpoint: config.endpoint,
    apiKeyConfigured: config.hasApiKey,
    autoSend: config.autoSend,
    autoActions: config.autoActions,
    pauseOnManagerReply: config.pauseOnManagerReply,
    pauseMinutes: config.pauseMinutes,
    minConfidence: config.minConfidence
  };
}

/**
 * Determines whether AI should be called for this message.
 * Returns false with a reason string if AI should be skipped.
 */
export function shouldCallAI(
  message: { direction: string; senderType: string; text?: string | null },
  conversation: { aiPaused: boolean; aiPausedUntil?: string | null },
  config: AiManagerConfig
): { call: boolean; reason?: string } {
  if (!config.enabled) {
    return { call: false, reason: "ai_disabled" };
  }
  if (message.direction !== "incoming") {
    return { call: false, reason: "not_incoming" };
  }
  if (message.senderType !== "client") {
    return { call: false, reason: "not_client_sender" };
  }
  if (!message.text?.trim()) {
    return { call: false, reason: "no_text" };
  }
  if (conversation.aiPaused) {
    // Check if timed pause has expired
    if (conversation.aiPausedUntil) {
      const pausedUntil = new Date(conversation.aiPausedUntil).getTime();
      if (Date.now() < pausedUntil) {
        return { call: false, reason: "ai_paused_until" };
      }
      // Pause has expired — allow call (runtime will clear the pause)
    } else {
      return { call: false, reason: "ai_paused" };
    }
  }
  return { call: true };
}

/**
 * Normalizes the raw AI Manager response into a standard shape.
 *
 * Supported reply text field names (first non-empty string wins):
 *   replyText | reply | message | text | answer | output | response (string)
 *   data.replyText | data.reply | data.message | data.text | data.answer
 *
 * Supported confidence field names:
 *   confidence | score | probability | certainty
 *
 * Supported actions array field names:
 *   suggestedActions | actions | tasks | recommendations
 *
 * If the AI Manager returns an error field instead of a reply, ok=false is returned.
 */
export function normalizeAIResponse(raw: unknown): AiNormalizedResponse {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "AI response was empty or non-object", raw };
  }
  const r = raw as Record<string, unknown>;

  // Check for AI Manager-side error in a 200 response
  if (typeof r.error === "string" && r.error) {
    return { ok: false, error: `AI Manager returned error: ${r.error}`, raw };
  }

  // Look for nested data wrapper (common in many AI APIs)
  const nested =
    (r.data && typeof r.data === "object" && !Array.isArray(r.data))
      ? r.data as Record<string, unknown>
      : null;

  // Extract reply text — ordered by specificity: direct field first, then nested
  const replyText =
    (typeof r.replyText === "string" && r.replyText) ? r.replyText :
    (typeof r.reply === "string" && r.reply) ? r.reply :
    (typeof r.message === "string" && r.message) ? r.message :
    (typeof r.answer === "string" && r.answer) ? r.answer :
    (typeof r.output === "string" && r.output) ? r.output :
    (typeof r.response === "string" && r.response) ? r.response :
    (typeof r.text === "string" && r.text) ? r.text :
    // Nested wrapper (e.g. { data: { replyText: "..." } })
    (nested && typeof nested.replyText === "string" && nested.replyText) ? nested.replyText :
    (nested && typeof nested.reply === "string" && nested.reply) ? nested.reply :
    (nested && typeof nested.message === "string" && nested.message) ? nested.message :
    (nested && typeof nested.answer === "string" && nested.answer) ? nested.answer :
    (nested && typeof nested.text === "string" && nested.text) ? nested.text :
    undefined;

  // Extract confidence (0.0–1.0)
  const rawConf =
    typeof r.confidence === "number" ? r.confidence :
    typeof r.score === "number" ? r.score :
    typeof r.probability === "number" ? r.probability :
    typeof r.certainty === "number" ? r.certainty :
    (nested && typeof nested.confidence === "number") ? nested.confidence :
    (nested && typeof nested.score === "number") ? nested.score :
    undefined;
  // Normalise confidence: if given as percentage (>1), divide by 100
  const confidence = rawConf !== undefined
    ? (rawConf > 1 ? rawConf / 100 : rawConf)
    : undefined;

  // Extract suggested actions array
  const rawActionsArray =
    Array.isArray(r.suggestedActions) ? r.suggestedActions :
    Array.isArray(r.actions) ? r.actions :
    Array.isArray(r.tasks) ? r.tasks :
    Array.isArray(r.recommendations) ? r.recommendations :
    (nested && Array.isArray(nested.suggestedActions)) ? nested.suggestedActions :
    (nested && Array.isArray(nested.actions)) ? nested.actions :
    [];

  const suggestedActions: AiSuggestedAction[] = rawActionsArray
    .filter((a): a is Record<string, unknown> => typeof a === "object" && a !== null)
    .map((a) => ({
      type: typeof a.type === "string" ? a.type : (typeof a.action === "string" ? a.action : "unknown"),
      payload: a.payload ?? a.params ?? a.data ?? a,
      confidence: typeof a.confidence === "number" ? a.confidence : undefined
    }));

  return {
    ok: true,
    replyText: replyText || undefined,
    confidence,
    suggestedActions: suggestedActions.length ? suggestedActions : undefined,
    raw
  };
}

/**
 * Sends an incoming message to the external AI Manager.
 *
 * - If AI_MANAGER_ENABLED=false → returns skipped (should never reach here due to shouldCallAI)
 * - If AI_MANAGER_DRY_RUN=true → returns a realistic simulated response
 * - Otherwise → POSTs to AI_MANAGER_BASE_URL + AI_MANAGER_ENDPOINT with 15s timeout
 *
 * Never throws — all errors are caught and returned as ok=false.
 */
export async function sendIncomingMessageToAI(
  params: AiSendParams,
  config: AiManagerConfig = getAiManagerConfig()
): Promise<AiNormalizedResponse> {
  if (!config.enabled) {
    return { ok: false, error: "AI Manager is disabled" };
  }

  if (config.dryRun) {
    return simulateDryRunResponse(params);
  }

  if (!config.baseUrl) {
    return { ok: false, error: "AI_MANAGER_BASE_URL is not configured" };
  }

  const url = `${config.baseUrl.replace(/\/$/, "")}${config.endpoint}`;

  const requestBody = {
    conversationId: params.conversationId,
    leadId: params.leadId,
    contactId: params.contactId,
    messageId: params.incomingMessageId,
    clientPhone: params.clientPhone,
    clientName: params.clientName,
    text: params.text,
    recentMessages: params.recentMessages ?? [],
    leadStage: params.leadStage,
    source: params.source,
    responsibleManager: params.responsibleManager,
    ...(params.aiContext ?? {})
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    // API key added to headers only — never logged below
    if (process.env.AI_MANAGER_API_KEY) {
      headers["Authorization"] = `Bearer ${process.env.AI_MANAGER_API_KEY}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal
    }).finally(() => clearTimeout(timeout));

    const raw = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        ok: false,
        error: `AI Manager responded with HTTP ${response.status}`,
        raw
      };
    }

    return normalizeAIResponse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // Never include API key in error messages
    const safeMessage = message.includes("AI_MANAGER_API_KEY") ? "AI request failed" : message;
    return { ok: false, error: safeMessage };
  }
}

/**
 * Returns a realistic simulated AI response for dry-run mode.
 * Used for local development and staging without a real AI Manager.
 */
function simulateDryRunResponse(params: AiSendParams): AiNormalizedResponse {
  const text = params.text.toLowerCase();
  let replyText: string;
  const confidence = 0.82;

  if (text.includes("цена") || text.includes("сколько") || text.includes("стоит")) {
    replyText = "Здравствуйте! Стоимость натяжного потолка зависит от площади и типа полотна. Для точного расчёта нам нужно провести бесплатный замер. Когда вам удобно? 🏠";
  } else if (text.includes("замер") || text.includes("измер")) {
    replyText = "Конечно! Наш специалист проведёт бесплатный замер в удобное для вас время. Какой день вам подходит — будни или выходные?";
  } else if (text.includes("привет") || text.includes("здравствуй") || text.includes("добрый")) {
    replyText = "Здравствуйте! Рады приветствовать вас в Bakha. Чем могу помочь?";
  } else if (text.includes("спасибо") || text.includes("благодар")) {
    replyText = "Пожалуйста! Если возникнут вопросы — всегда готовы помочь 😊";
  } else {
    replyText = `Спасибо за ваше обращение! Наш менеджер свяжется с вами в ближайшее время для уточнения деталей.`;
  }

  return {
    ok: true,
    replyText,
    confidence,
    suggestedActions: [
      {
        type: "add_note",
        payload: { note: `AI (dry-run): клиент написал «${params.text.slice(0, 80)}»` },
        confidence: 0.9
      }
    ],
    raw: { dryRun: true, simulatedAt: new Date().toISOString() }
  };
}
