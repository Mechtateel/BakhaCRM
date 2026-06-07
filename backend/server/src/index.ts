import { createHash, randomBytes } from "node:crypto";
import cors from "cors";
import "dotenv/config";
import express from "express";
import { rateLimit } from "express-rate-limit";
import { and, desc, eq, gte, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { createDb } from "../../../db/client.js";
import { getAmoImportStats, runAmoImport } from "./import/amoImportService.js";
import { detectWebhookType, getWappiConfig, getWappiProfileStatus, normalizeIncomingWebhook, normalizePhone, normalizeStatusWebhook, publicWappiConfig, sendMessage, verifyWebhook } from "./integrations/wappi.js";
import { getOnlinePbxConfig, normalizeOnlinePbxWebhook, publicOnlinePbxConfig, startOutgoingCall, verifyOnlinePbxWebhook } from "./integrations/onlinepbx.js";
import {
  getAiManagerConfig,
  maskAiConfigStatus,
  sendIncomingMessageToAI,
  shouldCallAI,
  type AiSendParams
} from "./integrations/ai-manager.js";
import {
  aiActionLogs,
  aiEvents,
  aiSuggestions,
  calls,
  chatConversations,
  contacts,
  customFields,
  auditLogs,
  leadCustomValues,
  integrations,
  leadContacts,
  leads,
  messages,
  notes,
  pbxUserMappings,
  pipelines,
  roles,
  sessions,
  stages,
  tasks,
  users
} from "../../../db/schema/index.js";

const app = express();
const db = createDb();
const port = Number(process.env.PORT ?? 4000);
const dataMode = process.env.DATA_MODE === "real" ? "real" : "demo";

function normalizePipelineCode(name?: string | null, code?: string | null) {
  const haystack = `${name ?? ""} ${code ?? ""}`.toLowerCase();
  if (haystack.includes("замер") || haystack.includes("measurement")) return "measurement";
  if (haystack.includes("отдел продаж") || haystack.includes("sales")) return "sales";
  return code ?? "sales";
}

app.use(cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:5173", credentials: true }));
app.use(express.json());

const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Слишком много попыток входа. Попробуйте через 15 минут." },
  skipSuccessfulRequests: true
});

const hashPassword = (password: string) => createHash("sha256").update(password).digest("hex");

// ─── Session / Auth helpers ────────────────────────────────────────────────────

const COOKIE_NAME = "bakha_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function parseCookies(req: express.Request): Record<string, string> {
  const header = req.headers.cookie ?? "";
  return Object.fromEntries(
    header.split(";").flatMap((part) => {
      const eqIdx = part.indexOf("=");
      if (eqIdx < 0) return [];
      return [[part.slice(0, eqIdx).trim(), part.slice(eqIdx + 1).trim()]];
    })
  );
}

function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (stored.startsWith("$2b$") || stored.startsWith("$2a$")) {
    return bcrypt.compare(plain, stored);
  }
  return stored === hashPassword(plain);
}

type CurrentUser = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  role: string | null;
  roleTitle: string | null;
  sessionId: number;
};

const OWNER_ADMIN = ["owner", "admin"];
const MANAGER_UP = ["owner", "admin", "manager"];

async function getSessionUser(req: express.Request): Promise<CurrentUser | null> {
  const cookies = parseCookies(req);
  const rawToken = cookies[COOKIE_NAME];
  if (!rawToken) return null;

  const tokenHash = hashSessionToken(rawToken);

  let sessionRow: { id: number; userId: number; expiresAt: string; revokedAt: string | null } | undefined;
  try {
    [sessionRow] = await db
      .select({ id: sessions.id, userId: sessions.userId, expiresAt: sessions.expiresAt, revokedAt: sessions.revokedAt })
      .from(sessions)
      .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)))
      .limit(1);
  } catch {
    return null;
  }

  if (!sessionRow) return null;
  if (new Date(sessionRow.expiresAt) < new Date()) return null;

  const [userRow] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      status: users.status,
      role: roles.name,
      roleTitle: roles.title
    })
    .from(users)
    .leftJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.id, sessionRow.userId))
    .limit(1);

  if (!userRow || userRow.status !== "active") return null;
  return { ...userRow, sessionId: sessionRow.id };
}

function makeRequireAuth(allowedRoles?: string[]) {
  return async (req: express.Request, res: express.Response, next: express.NextFunction): Promise<void> => {
    try {
      const user = await getSessionUser(req);
      if (!user) {
        res.status(401).json({ error: "Требуется авторизация" });
        return;
      }
      if (allowedRoles && !allowedRoles.includes(user.role ?? "")) {
        res.status(403).json({ error: "Недостаточно прав доступа" });
        return;
      }
      res.locals.currentUser = user;
      next();
    } catch {
      res.status(500).json({ error: "Ошибка проверки сессии" });
    }
  };
}

// ─── End auth helpers ─────────────────────────────────────────────────────────

function nowIso() {
  return new Date().toISOString();
}

function asNullableString(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return String(value);
}

function asNullableNumber(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

async function writeLeadHistory(leadId: number | null | undefined, action: string, payload: Record<string, unknown>, actorId?: number | null) {
  if (!leadId) return;
  await db.insert(auditLogs).values({
    actorId: actorId ?? null,
    entityType: "lead",
    entityId: leadId,
    action,
    payloadJson: JSON.stringify(payload),
    createdAt: nowIso()
  });
}

function actorFromLocals(res: express.Response): number | null {
  return (res.locals.currentUser as CurrentUser | undefined)?.id ?? null;
}

function responseError(res: express.Response, status: number, error: string) {
  res.status(status).json({ error });
}

/**
 * Finds a contact by phone number.
 *
 * Fast path: tries several common stored formats via indexed DB queries.
 * Slow fallback: loads minimal contact rows and normalizes in-memory — handles
 *   legacy AMO-imported contacts stored with non-standard phone formats.
 */
async function findContactByPhone(phone: string) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return null;

  // Fast path: indexed exact-match queries for the most common stored formats
  const variants = [
    normalizedPhone,           // 77011234567 (standard)
    `+${normalizedPhone}`,     // +77011234567 (some AMO exports)
    phone.trim()               // raw value as-is (might already be stored exactly)
  ].filter((v, i, arr) => v && arr.indexOf(v) === i); // dedupe

  for (const variant of variants) {
    const [row] = await db.select().from(contacts).where(eq(contacts.phone, variant)).limit(1);
    if (row) return row;
  }

  // Slow fallback: scan only phone column (avoids loading full rows), normalize in-memory
  const phoneRows = await db.select({ id: contacts.id, phone: contacts.phone }).from(contacts);
  const match = phoneRows.find((c) => normalizePhone(c.phone) === normalizedPhone);
  if (!match) return null;
  const [fullRow] = await db.select().from(contacts).where(eq(contacts.id, match.id)).limit(1);
  return fullRow ?? null;
}

async function findPrimaryLeadByContact(contactId: number) {
  // Load all leads linked to this contact (including status) to prefer active ones
  const linkedRows = await db
    .select({
      leadId: leadContacts.leadId,
      isPrimary: leadContacts.isPrimary,
      leadStatus: leads.status,
      leadUpdatedAt: leads.updatedAt
    })
    .from(leadContacts)
    .innerJoin(leads, eq(leads.id, leadContacts.leadId))
    .where(eq(leadContacts.contactId, contactId));

  if (linkedRows.length === 0) return null;

  // Preference order: active (2) > other non-archived (1) > won/lost/archived (0)
  const statusScore = (s: string | null | undefined) =>
    s === "active" ? 2 : (s === "won" || s === "lost" || s === "archived") ? 0 : 1;

  linkedRows.sort((a, b) => {
    const statusDiff = statusScore(b.leadStatus) - statusScore(a.leadStatus);
    if (statusDiff !== 0) return statusDiff;
    if (a.isPrimary !== b.isPrimary) return b.isPrimary ? 1 : -1;
    return (b.leadUpdatedAt ?? "").localeCompare(a.leadUpdatedAt ?? "");
  });

  const [lead] = await db.select().from(leads).where(eq(leads.id, linkedRows[0].leadId)).limit(1);
  return lead ?? null;
}

async function getDefaultLeadTargets() {
  const [pipeline] = await db.select().from(pipelines).orderBy(pipelines.sortOrder).limit(1);
  if (!pipeline) throw new Error("No pipeline configured");
  const [stage] = await db.select().from(stages).where(eq(stages.pipelineId, pipeline.id)).orderBy(stages.sortOrder).limit(1);
  if (!stage) throw new Error("No stage configured");
  const [admin] = await db.select().from(users).orderBy(users.id).limit(1);
  return { pipeline, stage, admin };
}

async function createWappiLead(contactId: number, phone: string, raw: unknown) {
  const { pipeline, stage, admin } = await getDefaultLeadTargets();
  const createdAt = nowIso();
  const leadNumber = `WAPPI-${Date.now()}`;
  const [lead] = await db
    .insert(leads)
    .values({
      title: `WhatsApp ${phone}`,
      leadNumber,
      pipelineId: pipeline.id,
      stageId: stage.id,
      responsibleId: admin?.id,
      source: "WAPPI",
      status: "active",
      rawJson: JSON.stringify(raw),
      createdAt,
      updatedAt: createdAt
    })
    .returning();
  await db.insert(leadContacts).values({ leadId: lead.id, contactId, isPrimary: true, createdAt, updatedAt: createdAt });
  await writeLeadHistory(lead.id, "lead.created_from_wappi", { phone });
  return lead;
}

async function getOrCreateConversation(input: { leadId: number; contactId: number | null; phone: string; channel?: string; raw?: unknown }) {
  const channel = input.channel ?? "wappi";
  const [existing] = await db
    .select()
    .from(chatConversations)
    .where(and(eq(chatConversations.leadId, input.leadId), eq(chatConversations.channel, channel)))
    .limit(1);
  if (existing) return existing;
  const createdAt = nowIso();
  const [conversation] = await db
    .insert(chatConversations)
    .values({
      leadId: input.leadId,
      contactId: input.contactId,
      phone: input.phone,
      channel,
      status: "open",
      unreadCount: 0,
      lastMessageAt: createdAt,
      aiPaused: true,
      rawJson: input.raw ? JSON.stringify(input.raw) : null,
      createdAt,
      updatedAt: createdAt
    })
    .returning();
  return conversation;
}

async function touchConversation(conversationId: number, messageAt: string, unreadDelta = 0) {
  const [conversation] = await db.select().from(chatConversations).where(eq(chatConversations.id, conversationId));
  if (!conversation) return;
  await db
    .update(chatConversations)
    .set({
      unreadCount: Math.max(0, conversation.unreadCount + unreadDelta),
      lastMessageAt: messageAt,
      updatedAt: nowIso()
    })
    .where(eq(chatConversations.id, conversationId));
}

// Roles whose data is restricted to their own assigned records only
const RESTRICTED_ROLES = ["measurer", "installer"];

async function getBootstrap(viewer?: CurrentUser | null) {
  const viewerRole = viewer?.role ?? null;
  const isRestricted = viewerRole !== null && RESTRICTED_ROLES.includes(viewerRole);

  const [pipelineRows, stageRows, userRows, integrationRows] = await Promise.all([
    db.select().from(pipelines).orderBy(pipelines.sortOrder),
    db.select().from(stages).orderBy(stages.pipelineId, stages.sortOrder),
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
      phone: users.phone,
      status: users.status,
      amoId: users.amoId,
      role: roles.name,
      roleTitle: roles.title
      })
      .from(users)
      .leftJoin(roles, eq(users.roleId, roles.id)),
    db.select().from(integrations)
  ]);

  const leadRows = await db
    .select({
      id: leads.id,
      amoId: leads.amoId,
      title: leads.title,
      leadNumber: leads.leadNumber,
      budget: leads.budget,
      source: leads.source,
      status: leads.status,
      contractNumber: leads.contractNumber,
      region: leads.region,
      address: leads.address,
      area: leads.area,
      repairStage: leads.repairStage,
      measurementAt: leads.measurementAt,
      closestTaskAt: leads.closestTaskAt,
      measurerId: leads.measurerId,
      measurerName: leads.measurerName,
      installerId: leads.installerId,
      installerName: leads.installerName,
      refusalReason: leads.refusalReason,
      paymentStatus: leads.paymentStatus,
      daysInStage: leads.daysInStage,
      createdAt: leads.createdAt,
      pipelineId: pipelines.id,
      pipelineAmoId: pipelines.amoId,
      pipelineCode: pipelines.code,
      pipelineName: pipelines.name,
      stageId: stages.id,
      stageAmoId: stages.amoId,
      stageName: stages.name,
      responsibleId: users.id,
      responsibleName: users.name,
      contactId: contacts.id,
      contactName: contacts.name,
      contactPhone: contacts.phone
    })
    .from(leads)
    .leftJoin(pipelines, eq(leads.pipelineId, pipelines.id))
    .leftJoin(stages, eq(leads.stageId, stages.id))
    .leftJoin(users, eq(leads.responsibleId, users.id))
    .leftJoin(leadContacts, and(eq(leadContacts.leadId, leads.id), eq(leadContacts.isPrimary, true)))
    .leftJoin(contacts, eq(leadContacts.contactId, contacts.id))
    .orderBy(desc(leads.createdAt));

  const normalizedLeadRows = leadRows.map((lead) => ({
    ...lead,
    pipelineCode: normalizePipelineCode(lead.pipelineName, lead.pipelineCode)
  }));
  const dataModeLeads = normalizedLeadRows.filter((lead) => (dataMode === "real" ? lead.amoId !== null || lead.source === "WAPPI" : lead.amoId === null));

  // Role-based lead filtering: measurer/installer only see leads where they are assigned
  const filteredLeads = isRestricted && viewer
    ? dataModeLeads.filter((lead) => {
        if (viewerRole === "measurer") return lead.responsibleId === viewer.id || lead.measurerId === viewer.id;
        if (viewerRole === "installer") return lead.responsibleId === viewer.id || lead.installerId === viewer.id;
        return true;
      })
    : dataModeLeads;

  const visiblePipelineIds = new Set(filteredLeads.map((lead) => lead.pipelineId).filter(Boolean));
  const visibleStageIds = new Set(filteredLeads.map((lead) => lead.stageId).filter(Boolean));

  const taskRows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      dueAt: tasks.dueAt,
      type: tasks.type,
      priority: tasks.priority,
      status: tasks.status,
      completedAt: tasks.completedAt,
      amoId: tasks.amoId,
      leadId: leads.id,
      leadAmoId: leads.amoId,
      leadTitle: leads.title,
      client: contacts.name,
      assigneeId: users.id,
      assigneeName: users.name
    })
    .from(tasks)
    .leftJoin(leads, eq(tasks.leadId, leads.id))
    .leftJoin(leadContacts, and(eq(leadContacts.leadId, leads.id), eq(leadContacts.isPrimary, true)))
    .leftJoin(contacts, eq(leadContacts.contactId, contacts.id))
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .orderBy(tasks.dueAt);

  const dataModeTask = taskRows.filter((task) => (dataMode === "real" ? task.leadAmoId !== null : task.leadAmoId === null));
  // Role-based task filtering: measurer/installer only see their own assigned tasks
  const filteredTasks = isRestricted && viewer
    ? dataModeTask.filter((task) => task.assigneeId === viewer.id)
    : dataModeTask;

  const filteredPipelines = pipelineRows
    .filter((pipeline) => visiblePipelineIds.has(pipeline.id) || (dataMode === "demo" && pipeline.amoId === null))
    .map((pipeline) => ({ ...pipeline, code: normalizePipelineCode(pipeline.name, pipeline.code) }));
  const filteredStages = stageRows.filter((stage) => visibleStageIds.has(stage.id) || (dataMode === "demo" && stage.amoId === null));

  return { mode: dataMode, viewerRole, pipelines: filteredPipelines, stages: filteredStages, users: userRows, leads: filteredLeads, tasks: filteredTasks, integrations: integrationRows, wappi: publicWappiConfig(), telephony: publicOnlinePbxConfig() };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "bakha-crm-api" });
});

app.post("/api/auth/login", loginRateLimit, async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      passwordHash: users.passwordHash,
      status: users.status,
      role: roles.name,
      roleTitle: roles.title
    })
    .from(users)
    .leftJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.email, email.toLowerCase()));

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    res.status(401).json({ error: "Неверный email или пароль" });
    return;
  }

  if (user.status !== "active") {
    res.status(403).json({ error: "Аккаунт деактивирован" });
    return;
  }

  // Auto-upgrade legacy SHA-256 hash to bcrypt on first login
  if (!user.passwordHash.startsWith("$2")) {
    try {
      const upgraded = await bcrypt.hash(password, 12);
      await db.update(users).set({ passwordHash: upgraded, updatedAt: nowIso() }).where(eq(users.id, user.id));
    } catch { /* non-fatal */ }
  }

  const rawToken = generateSessionToken();
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const createdAt = nowIso();

  try {
    await db.insert(sessions).values({
      userId: user.id,
      tokenHash,
      expiresAt,
      userAgent: req.headers["user-agent"] ?? null,
      ipAddress: req.ip ?? null,
      createdAt,
      updatedAt: createdAt
    });
    await db.update(users).set({ updatedAt: createdAt }).where(eq(users.id, user.id));
    try {
      await db.run(sql.raw(`UPDATE users SET last_login_at = '${createdAt}' WHERE id = ${user.id}`));
    } catch { /* column may not exist on first run */ }
  } catch {
    res.status(500).json({ error: "Ошибка создания сессии" });
    return;
  }

  const isProd = process.env.NODE_ENV === "production";
  res.cookie(COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: SESSION_TTL_MS
  });

  res.json({
    token: Buffer.from(`${user.id}:${user.email}`).toString("base64url"),
    user: { id: user.id, name: user.name, email: user.email, role: user.role, roleTitle: user.roleTitle }
  });
});

app.post("/api/auth/logout", async (req, res) => {
  const cookies = parseCookies(req);
  const rawToken = cookies[COOKIE_NAME];
  if (rawToken) {
    const tokenHash = hashSessionToken(rawToken);
    try {
      const now = nowIso();
      await db.update(sessions).set({ revokedAt: now, updatedAt: now }).where(eq(sessions.tokenHash, tokenHash));
    } catch { /* ignore */ }
  }
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

app.get("/api/auth/me", async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const { sessionId: _sid, ...safeUser } = user;
  res.json({ user: safeUser });
});

app.get("/api/bootstrap", async (req, res) => {
  // Attempt to resolve the current viewer for role-based filtering.
  // Bootstrap remains open (no 401) to preserve demo-mode and smoke-test compat.
  const viewer = await getSessionUser(req).catch(() => null);
  res.json(await getBootstrap(viewer));
});

// ─── User management (owner/admin only) ───────────────────────────────────────

app.post("/api/users", makeRequireAuth(OWNER_ADMIN), async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const name = asNullableString(body.name);
  const email = asNullableString(body.email);
  const password = asNullableString(body.password);
  const roleName = asNullableString(body.role) ?? "manager";
  const phone = asNullableString(body.phone);

  if (!name || !email || !password) {
    responseError(res, 400, "Имя, email и пароль обязательны");
    return;
  }
  if (password.length < 6) {
    responseError(res, 400, "Пароль должен быть не менее 6 символов");
    return;
  }

  const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, email.toLowerCase()));
  if (existingUser) {
    responseError(res, 409, "Пользователь с таким email уже существует");
    return;
  }

  const [role] = await db.select().from(roles).where(eq(roles.name, roleName));
  if (!role) {
    responseError(res, 400, `Роль «${roleName}» не найдена`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const createdAt = nowIso();

  const [newUser] = await db
    .insert(users)
    .values({ name, email: email.toLowerCase(), phone, roleId: role.id, passwordHash, status: "active", createdAt, updatedAt: createdAt })
    .returning({ id: users.id, name: users.name, email: users.email, phone: users.phone, status: users.status, roleId: users.roleId });

  res.status(201).json({ user: { ...newUser, role: roleName, roleTitle: role.title } });
});

app.patch("/api/users/:id", makeRequireAuth(OWNER_ADMIN), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { responseError(res, 400, "Неверный id пользователя"); return; }

  const [existing] = await db.select().from(users).where(eq(users.id, id));
  if (!existing) { responseError(res, 404, "Пользователь не найден"); return; }

  const body = req.body as Record<string, unknown>;
  const patch: Partial<typeof users.$inferInsert> = { updatedAt: nowIso() };

  const name = asNullableString(body.name);
  const phone = asNullableString(body.phone);
  const status = asNullableString(body.status);
  const roleName = asNullableString(body.role);

  if (typeof name === "string" && name.trim()) patch.name = name.trim();
  if (phone !== undefined) patch.phone = phone;
  if (status === "active" || status === "inactive") patch.status = status;

  let resolvedRole: string | null = null;
  if (roleName) {
    const [role] = await db.select().from(roles).where(eq(roles.name, roleName));
    if (role) { patch.roleId = role.id; resolvedRole = role.name; }
  }

  await db.update(users).set(patch).where(eq(users.id, id));

  const [updated] = await db
    .select({ id: users.id, name: users.name, email: users.email, phone: users.phone, status: users.status, role: roles.name, roleTitle: roles.title })
    .from(users)
    .leftJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.id, id));

  res.json({ user: updated ?? { ...existing, role: resolvedRole } });
});

app.post("/api/users/:id/set-password", makeRequireAuth(OWNER_ADMIN), async (req, res) => {
  const id = Number(req.params.id);
  const newPassword = asNullableString((req.body as Record<string, unknown>).password);
  if (!newPassword || newPassword.length < 6) {
    responseError(res, 400, "Пароль должен быть не менее 6 символов");
    return;
  }

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.id, id));
  if (!existing) { responseError(res, 404, "Пользователь не найден"); return; }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  const now = nowIso();
  await db.update(users).set({ passwordHash, updatedAt: now }).where(eq(users.id, id));
  // Revoke all active sessions for this user (force re-login)
  await db.update(sessions).set({ revokedAt: now, updatedAt: now }).where(and(eq(sessions.userId, id), isNull(sessions.revokedAt)));

  res.json({ ok: true });
});

app.post("/api/leads", makeRequireAuth(MANAGER_UP), async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const title = asNullableString(body.title);
  const contactName = asNullableString(body.contactName);
  const rawPhone = asNullableString(body.contactPhone);
  const source = asNullableString(body.source) ?? "Не указан";
  const responsibleId = asNullableNumber(body.responsibleId);
  const pipelineId = asNullableNumber(body.pipelineId);
  const stageId = asNullableNumber(body.stageId);
  const budget = asNullableNumber(body.budget) ?? 0;
  const measurementAt = asNullableString(body.measurementAt);
  const comment = asNullableString(body.comment);

  if (!title) {
    responseError(res, 400, "Название сделки обязательно");
    return;
  }

  try {
    let targetPipelineId = pipelineId;
    let targetStageId = stageId;
    if (!targetPipelineId || !targetStageId) {
      const defaults = await getDefaultLeadTargets();
      targetPipelineId ??= defaults.pipeline.id;
      targetStageId ??= defaults.stage.id;
    }

    const [targetStageRow] = await db.select().from(stages).where(eq(stages.id, targetStageId));
    if (!targetStageRow || targetStageRow.pipelineId !== targetPipelineId) {
      responseError(res, 400, "Этап не принадлежит выбранной воронке");
      return;
    }

    const createdAt = nowIso();
    const leadNumber = `BP-${Date.now()}`;

    let contactId: number | null = null;
    const normalizedPhone = rawPhone ? normalizePhone(rawPhone) : null;
    if (normalizedPhone) {
      const existing = await findContactByPhone(normalizedPhone);
      if (existing) {
        contactId = existing.id;
      } else {
        const [newContact] = await db
          .insert(contacts)
          .values({
            name: contactName || `Клиент ${rawPhone}`,
            phone: normalizedPhone,
            source,
            createdAt,
            updatedAt: createdAt
          })
          .returning();
        contactId = newContact.id;
      }
    } else if (contactName) {
      const [newContact] = await db
        .insert(contacts)
        .values({
          name: contactName,
          phone: "",
          source,
          createdAt,
          updatedAt: createdAt
        })
        .returning();
      contactId = newContact.id;
    }

    const [lead] = await db
      .insert(leads)
      .values({
        title,
        leadNumber,
        pipelineId: targetPipelineId,
        stageId: targetStageId,
        responsibleId: responsibleId ?? null,
        budget,
        source,
        status: "active",
        measurementAt: measurementAt ?? null,
        createdAt,
        updatedAt: createdAt
      })
      .returning();

    if (contactId !== null) {
      await db.insert(leadContacts).values({
        leadId: lead.id,
        contactId,
        isPrimary: true,
        createdAt,
        updatedAt: createdAt
      });
    }

    if (comment?.trim()) {
      await db.insert(notes).values({
        leadId: lead.id,
        body: comment.trim(),
        createdAt,
        updatedAt: createdAt
      });
    }

    await writeLeadHistory(lead.id, "lead.created", {
      title,
      source,
      contactPhone: rawPhone,
      responsibleId,
      leadNumber
    }, actorFromLocals(res));

    const bootstrap = await getBootstrap();
    const createdLead = bootstrap.leads.find((item) => item.id === lead.id);
    res.status(201).json({ lead: createdLead ?? lead });
  } catch (error) {
    responseError(res, 500, error instanceof Error ? error.message : "Не удалось создать сделку");
  }
});

app.get("/api/leads/:id", async (req, res) => {
  const id = Number(req.params.id);
  const bootstrap = await getBootstrap();
  const lead = bootstrap.leads.find((item) => item.id === id);
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  const leadNotes = await db.select().from(notes).where(eq(notes.leadId, id)).orderBy(desc(notes.createdAt));
  const customValues = await db
    .select({
      id: leadCustomValues.id,
      value: leadCustomValues.value,
      fieldName: customFields.name,
      fieldCode: customFields.code,
      fieldType: customFields.fieldType
    })
    .from(leadCustomValues)
    .leftJoin(customFields, eq(leadCustomValues.customFieldId, customFields.id))
    .where(eq(leadCustomValues.leadId, id));
  const leadTasks = bootstrap.tasks.filter((task) => task.leadId === id);
  const leadMessages = await db.select().from(messages).where(eq(messages.leadId, id)).orderBy(messages.createdAt);

  // AI Manager data — draft suggestions + active conversation for this lead
  const leadAiSuggestions = await db
    .select({
      id: aiSuggestions.id,
      conversationId: aiSuggestions.conversationId,
      leadId: aiSuggestions.leadId,
      contactId: aiSuggestions.contactId,
      sourceMessageId: aiSuggestions.sourceMessageId,
      replyText: aiSuggestions.replyText,
      confidence: aiSuggestions.confidence,
      status: aiSuggestions.status,
      suggestedActionsJson: aiSuggestions.suggestedActionsJson,
      createdAt: aiSuggestions.createdAt
    })
    .from(aiSuggestions)
    .where(and(eq(aiSuggestions.leadId, id), eq(aiSuggestions.status, "draft")))
    .orderBy(desc(aiSuggestions.createdAt))
    .limit(10);

  const [leadConversation] = await db
    .select({
      id: chatConversations.id,
      aiPaused: chatConversations.aiPaused,
      aiPausedUntil: chatConversations.aiPausedUntil,
      aiPauseReason: chatConversations.aiPauseReason
    })
    .from(chatConversations)
    .where(eq(chatConversations.leadId, id))
    .orderBy(desc(chatConversations.updatedAt))
    .limit(1);

  res.json({
    lead,
    notes: leadNotes,
    tasks: leadTasks,
    customValues,
    messages: leadMessages,
    aiSuggestions: leadAiSuggestions,
    conversation: leadConversation ?? null
  });
});

app.patch("/api/leads/:id", makeRequireAuth(MANAGER_UP), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    responseError(res, 400, "Invalid lead id");
    return;
  }

  const [existingLead] = await db.select().from(leads).where(eq(leads.id, id));
  if (!existingLead) {
    responseError(res, 404, "Lead not found");
    return;
  }

  const body = req.body as Record<string, unknown>;
  const updatePayload: Partial<typeof leads.$inferInsert> = { updatedAt: nowIso() };
  const title = asNullableString(body.title);
  const source = asNullableString(body.source);
  const budget = asNullableNumber(body.budget);
  const region = asNullableString(body.region);
  const area = asNullableNumber(body.area);
  const repairStage = asNullableString(body.repairStage);
  const measurementAt = asNullableString(body.measurementAt);
  const address = asNullableString(body.address);
  const measurerName = asNullableString(body.measurerName);
  const installerName = asNullableString(body.installerName);
  const refusalReason = asNullableString(body.refusalReason);
  const paymentStatus = asNullableString(body.paymentStatus);
  const responsibleId = asNullableNumber(body.responsibleId);
  if (typeof title === "string") updatePayload.title = title;
  if (typeof source === "string") updatePayload.source = source;
  if (typeof budget === "number") updatePayload.budget = budget;
  if (region !== undefined) updatePayload.region = region;
  if (area !== undefined) updatePayload.area = area;
  if (repairStage !== undefined) updatePayload.repairStage = repairStage;
  if (measurementAt !== undefined) updatePayload.measurementAt = measurementAt;
  if (address !== undefined) updatePayload.address = address;
  if (measurerName !== undefined) updatePayload.measurerName = measurerName;
  if (installerName !== undefined) updatePayload.installerName = installerName;
  if (refusalReason !== undefined) updatePayload.refusalReason = refusalReason;
  if (paymentStatus !== undefined) updatePayload.paymentStatus = paymentStatus;
  if (responsibleId !== undefined) updatePayload.responsibleId = responsibleId;

  if (!Object.keys(updatePayload).length) {
    responseError(res, 400, "No supported fields to update");
    return;
  }

  try {
    await db.update(leads).set(updatePayload).where(eq(leads.id, id));
    await writeLeadHistory(id, "lead.updated", { fields: Object.keys(updatePayload).filter((field) => field !== "updatedAt") }, actorFromLocals(res));
    const bootstrap = await getBootstrap();
    res.json({ lead: bootstrap.leads.find((item) => item.id === id) ?? null });
  } catch (error) {
    responseError(res, 500, error instanceof Error ? error.message : "Lead update failed");
  }
});

app.patch("/api/leads/:id/stage", makeRequireAuth(MANAGER_UP), async (req, res) => {
  const id = Number(req.params.id);
  const stageId = Number((req.body as { stageId?: unknown }).stageId);
  if (!Number.isFinite(id) || !Number.isFinite(stageId)) {
    responseError(res, 400, "Invalid lead or stage id");
    return;
  }

  const [existingLead] = await db.select().from(leads).where(eq(leads.id, id));
  const [targetStage] = await db.select().from(stages).where(eq(stages.id, stageId));
  if (!existingLead) {
    responseError(res, 404, "Lead not found");
    return;
  }
  if (!targetStage || targetStage.pipelineId !== existingLead.pipelineId) {
    responseError(res, 400, "Stage does not belong to this lead pipeline");
    return;
  }

  const [oldStage] = await db.select().from(stages).where(eq(stages.id, existingLead.stageId));
  await db.update(leads).set({ stageId, daysInStage: 0, updatedAt: nowIso() }).where(eq(leads.id, id));
  await writeLeadHistory(id, "lead.stage_changed", {
    fromStageId: oldStage?.id ?? existingLead.stageId,
    fromStageName: oldStage?.name ?? null,
    toStageId: targetStage.id,
    toStageName: targetStage.name,
    message: `Сделка перемещена: ${oldStage?.name ?? "—"} → ${targetStage.name}`
  }, actorFromLocals(res));
  const bootstrap = await getBootstrap();
  res.json({ lead: bootstrap.leads.find((item) => item.id === id) ?? null });
});

app.get("/api/leads/:id/tasks", async (req, res) => {
  const id = Number(req.params.id);
  const bootstrap = await getBootstrap();
  res.json({ tasks: bootstrap.tasks.filter((task) => task.leadId === id) });
});

app.get("/api/leads/:id/history", async (req, res) => {
  const id = Number(req.params.id);
  const history = await db.select().from(auditLogs).where(and(eq(auditLogs.entityType, "lead"), eq(auditLogs.entityId, id))).orderBy(desc(auditLogs.createdAt));
  res.json({ history });
});

app.get("/api/leads/:id/messages", async (req, res) => {
  const id = Number(req.params.id);
  const leadMessages = await db.select().from(messages).where(eq(messages.leadId, id)).orderBy(messages.createdAt);
  res.json({ messages: leadMessages, wappi: publicWappiConfig() });
});

// ── AI Manager Bridge helpers ─────────────────────────────────────────────────

/**
 * Called non-blocking after a WAPPI incoming message is saved.
 * Checks shouldCallAI, calls the bridge, saves event + suggestion.
 * Never throws — any error is swallowed so WAPPI webhook is not affected.
 */
async function processIncomingMessageWithAI(params: {
  message: { id: number; leadId?: number | null; contactId?: number | null; direction: string; senderType: string; text?: string | null };
  conversation: { id: number; leadId?: number | null; contactId?: number | null; phone: string; aiPaused: boolean; aiPausedUntil?: string | null };
  lead: { id: number; stageName?: string | null; source?: string | null; responsibleId?: number | null };
  contact: { id: number; name: string; phone: string };
}) {
  const { message, conversation, lead, contact } = params;
  const config = getAiManagerConfig();
  const now = nowIso();

  const { call, reason } = shouldCallAI(message, conversation, config);

  if (!call) {
    // If pause has expired, clear it
    if (reason === "ai_paused_until" && conversation.aiPausedUntil) {
      // Pause expired — leave it for next resume call
    }
    if (config.enabled) {
      // Log skip event only when AI is enabled (avoid noise when globally off)
      await db.insert(aiEvents).values({
        conversationId: conversation.id,
        leadId: lead.id,
        contactId: contact.id,
        messageId: message.id,
        direction: "skipped",
        status: "skipped",
        reason: reason ?? "unknown",
        createdAt: now,
        updatedAt: now
      }).catch(() => {});
    }
    return;
  }

  // Check for existing suggestion for this message (duplicate prevention)
  const [existingSuggestion] = await db
    .select({ id: aiSuggestions.id })
    .from(aiSuggestions)
    .where(eq(aiSuggestions.sourceMessageId, message.id))
    .limit(1)
    .catch(() => []);
  if (existingSuggestion) {
    // Log the duplicate skip so it's visible in AI event logs during staging
    await db.insert(aiEvents).values({
      conversationId: conversation.id,
      leadId: lead.id,
      contactId: contact.id,
      messageId: message.id,
      direction: "skipped",
      status: "skipped",
      reason: "duplicate_suggestion",
      createdAt: now,
      updatedAt: now
    }).catch(() => {});
    return;
  }

  // If timed pause has expired, clear it before calling AI
  if (conversation.aiPausedUntil && new Date(conversation.aiPausedUntil).getTime() <= Date.now()) {
    await db.update(chatConversations)
      .set({ aiPaused: false, aiPausedUntil: null, aiPauseReason: null, updatedAt: now })
      .where(eq(chatConversations.id, conversation.id))
      .catch(() => {});
  }

  // Load last 10 prior messages for AI context (oldest → newest, excluding current message)
  const priorMsgRows = await db
    .select({
      direction: messages.direction,
      senderType: messages.senderType,
      text: messages.text,
      createdAt: messages.createdAt
    })
    .from(messages)
    .where(and(
      eq(messages.leadId, lead.id),
      ne(messages.id, message.id)
    ))
    .orderBy(desc(messages.createdAt))
    .limit(10)
    .catch(() => []);

  const recentMessages = priorMsgRows
    .reverse()
    .filter((m) => typeof m.text === "string" && m.text.trim().length > 0)
    .map((m) => {
      const role: "client" | "manager" | "ai" =
        m.senderType === "client" ? "client" : m.senderType === "ai" ? "ai" : "manager";
      return {
        role,
        direction: m.direction,
        senderType: m.senderType,
        text: m.text ?? "",
        createdAt: m.createdAt ?? ""
      };
    });

  // Resolve responsible manager name for context
  let responsibleManager: string | null = null;
  if (lead.responsibleId) {
    const [responsible] = await db.select({ name: users.name }).from(users).where(eq(users.id, lead.responsibleId)).limit(1).catch(() => []);
    responsibleManager = responsible?.name ?? null;
  }

  const sendParams: AiSendParams = {
    conversationId: conversation.id,
    leadId: lead.id,
    contactId: contact.id,
    incomingMessageId: message.id,
    clientPhone: contact.phone,
    clientName: contact.name,
    text: message.text ?? "",
    recentMessages,
    leadStage: (lead as Record<string, unknown>).stageName as string | null ?? null,
    source: lead.source ?? null,
    responsibleManager
  };

  // Log request event
  const [requestEvent] = await db.insert(aiEvents).values({
    conversationId: conversation.id,
    leadId: lead.id,
    contactId: contact.id,
    messageId: message.id,
    direction: "request",
    status: "sent",
    requestJson: JSON.stringify({ ...sendParams, text: sendParams.text.slice(0, 500) }),
    createdAt: now,
    updatedAt: now
  }).returning().catch(() => []);

  // Call the AI Manager
  const result = await sendIncomingMessageToAI(sendParams, config);

  const responseNow = nowIso();

  // Log response/error event
  await db.insert(aiEvents).values({
    conversationId: conversation.id,
    leadId: lead.id,
    contactId: contact.id,
    messageId: message.id,
    direction: result.ok ? "response" : "error",
    status: result.ok ? "completed" : "failed",
    responseJson: result.ok ? JSON.stringify({ replyText: result.replyText, confidence: result.confidence, actionsCount: result.suggestedActions?.length ?? 0 }) : null,
    errorMessage: result.ok ? null : result.error,
    requestJson: requestEvent ? undefined : JSON.stringify({ leadId: lead.id }),
    createdAt: responseNow,
    updatedAt: responseNow
  }).catch(() => {});

  if (!result.ok || !result.replyText) {
    // Nothing to suggest
    if (!result.ok) {
      await writeLeadHistory(lead.id, "ai.error", { error: result.error ?? "AI call failed", messageId: message.id }).catch(() => {});
    }
    return;
  }

  const belowConfidence = result.confidence !== undefined && result.confidence < config.minConfidence;

  // Determine if we should auto-send
  const canAutoSend = config.autoSend
    && !belowConfidence
    && result.replyText.trim().length > 0
    && !conversation.aiPaused;

  if (canAutoSend) {
    // Auto-send via WAPPI
    const wappiConfig = getWappiConfig();
    try {
      const sendResult = await sendMessage(wappiConfig, contact.phone, result.replyText);
      const sentAt = nowIso();

      const [aiMessage] = await db.insert(messages).values({
        leadId: lead.id,
        contactId: contact.id,
        channel: "wappi",
        direction: "outgoing",
        senderType: "ai",
        text: result.replyText,
        body: result.replyText,
        externalMessageId: sendResult.externalMessageId || null,
        externalId: sendResult.externalMessageId || null,
        status: sendResult.status,
        rawJson: JSON.stringify({ aiAutoSend: true, dryRun: sendResult.dryRun }),
        sentAt,
        createdAt: sentAt,
        updatedAt: sentAt
      }).returning();

      await db.insert(aiSuggestions).values({
        conversationId: conversation.id,
        leadId: lead.id,
        contactId: contact.id,
        sourceMessageId: message.id,
        replyText: result.replyText,
        confidence: result.confidence,
        status: "sent",
        suggestedActionsJson: result.suggestedActions ? JSON.stringify(result.suggestedActions) : null,
        createdAt: sentAt,
        updatedAt: sentAt
      }).catch(() => {});

      await touchConversation(conversation.id, sentAt, 0);
      await writeLeadHistory(lead.id, "ai.sent", {
        messageId: aiMessage.id,
        sourceMessageId: message.id,
        replyText: result.replyText.slice(0, 160),
        confidence: result.confidence,
        dryRun: sendResult.dryRun
      }).catch(() => {});
    } catch (sendError) {
      // Auto-send failed — fall back to draft
      const draftAt = nowIso();
      await db.insert(aiSuggestions).values({
        conversationId: conversation.id,
        leadId: lead.id,
        contactId: contact.id,
        sourceMessageId: message.id,
        replyText: result.replyText,
        confidence: result.confidence,
        status: "draft",
        suggestedActionsJson: result.suggestedActions ? JSON.stringify(result.suggestedActions) : null,
        createdAt: draftAt,
        updatedAt: draftAt
      }).catch(() => {});
      await writeLeadHistory(lead.id, "ai.suggestion", {
        sourceMessageId: message.id,
        replyText: result.replyText.slice(0, 160),
        confidence: result.confidence,
        note: "auto-send failed, saved as draft"
      }).catch(() => {});
    }
  } else {
    // Save as draft suggestion
    const draftAt = nowIso();
    await db.insert(aiSuggestions).values({
      conversationId: conversation.id,
      leadId: lead.id,
      contactId: contact.id,
      sourceMessageId: message.id,
      replyText: result.replyText,
      confidence: result.confidence,
      status: "draft",
      suggestedActionsJson: result.suggestedActions ? JSON.stringify(result.suggestedActions) : null,
      createdAt: draftAt,
      updatedAt: draftAt
    }).catch(() => {});

    await writeLeadHistory(lead.id, "ai.suggestion", {
      sourceMessageId: message.id,
      replyText: result.replyText.slice(0, 160),
      confidence: result.confidence,
      autoSend: false,
      reason: belowConfidence ? "low_confidence" : "auto_send_disabled"
    }).catch(() => {});
  }
}

// ── AI Manager API endpoints ──────────────────────────────────────────────────

/** List draft AI suggestions, optionally filtered by conversationId or leadId. */
/** Focused suggestions endpoint — lightweight polling and UI queries. */
app.get("/api/ai/suggestions", makeRequireAuth(MANAGER_UP), async (req, res) => {
  const conversationId = asNullableNumber((req.query as Record<string, unknown>).conversationId);
  const leadId = asNullableNumber((req.query as Record<string, unknown>).leadId);
  const statusFilter = asNullableString((req.query as Record<string, unknown>).status) ?? "draft";
  const since = asNullableString((req.query as Record<string, unknown>).since);

  const conditions = [];
  if (statusFilter !== "all") conditions.push(eq(aiSuggestions.status, statusFilter));
  if (conversationId) conditions.push(eq(aiSuggestions.conversationId, conversationId));
  if (leadId) conditions.push(eq(aiSuggestions.leadId, leadId));
  if (since) conditions.push(gte(aiSuggestions.createdAt, since));

  const rows = await db
    .select({
      id: aiSuggestions.id,
      conversationId: aiSuggestions.conversationId,
      leadId: aiSuggestions.leadId,
      contactId: aiSuggestions.contactId,
      sourceMessageId: aiSuggestions.sourceMessageId,
      replyText: aiSuggestions.replyText,
      confidence: aiSuggestions.confidence,
      status: aiSuggestions.status,
      suggestedActionsJson: aiSuggestions.suggestedActionsJson,
      createdAt: aiSuggestions.createdAt,
      updatedAt: aiSuggestions.updatedAt
    })
    .from(aiSuggestions)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(aiSuggestions.createdAt))
    .limit(50);

  const cfg = getAiManagerConfig();
  res.json({
    suggestions: rows,
    aiManager: {
      enabled: cfg.enabled,
      dryRun: cfg.dryRun,
      autoSend: cfg.autoSend,
      autoActions: cfg.autoActions
    }
  });
});

/** Recent AI events — admin/owner only, for staging debug. No raw request/response JSON. */
app.get("/api/ai/events", makeRequireAuth(OWNER_ADMIN), async (req, res) => {
  const limitParam = Math.min(100, Math.max(1, asNullableNumber((req.query as Record<string, unknown>).limit) ?? 30));
  const leadId = asNullableNumber((req.query as Record<string, unknown>).leadId);
  const conversationId = asNullableNumber((req.query as Record<string, unknown>).conversationId);

  const conditions = [];
  if (leadId) conditions.push(eq(aiEvents.leadId, leadId));
  if (conversationId) conditions.push(eq(aiEvents.conversationId, conversationId));

  const rows = await db
    .select({
      id: aiEvents.id,
      conversationId: aiEvents.conversationId,
      leadId: aiEvents.leadId,
      messageId: aiEvents.messageId,
      direction: aiEvents.direction,
      status: aiEvents.status,
      reason: aiEvents.reason,
      errorMessage: aiEvents.errorMessage,
      createdAt: aiEvents.createdAt
    })
    .from(aiEvents)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(aiEvents.createdAt))
    .limit(limitParam);

  res.json({ events: rows });
});

/** Approve an AI suggestion: send via WAPPI and mark as sent. */
app.post("/api/ai/suggestions/:id/approve", makeRequireAuth(MANAGER_UP), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { responseError(res, 400, "Invalid suggestion id"); return; }

  const [suggestion] = await db.select().from(aiSuggestions).where(eq(aiSuggestions.id, id)).limit(1);
  if (!suggestion) { responseError(res, 404, "Suggestion not found"); return; }
  if (suggestion.status !== "draft") { responseError(res, 409, `Suggestion is already ${suggestion.status}`); return; }
  if (!suggestion.replyText) { responseError(res, 400, "Suggestion has no reply text"); return; }

  const actor = actorFromLocals(res);
  const now = nowIso();

  // Resolve contact phone for sending
  let contactPhone: string | null = null;
  if (suggestion.conversationId) {
    const [conv] = await db.select({ phone: chatConversations.phone }).from(chatConversations).where(eq(chatConversations.id, suggestion.conversationId)).limit(1);
    contactPhone = conv?.phone ?? null;
  }
  if (!contactPhone && suggestion.contactId) {
    const [ct] = await db.select({ phone: contacts.phone }).from(contacts).where(eq(contacts.id, suggestion.contactId)).limit(1);
    contactPhone = ct?.phone ?? null;
  }
  if (!contactPhone) { responseError(res, 400, "Cannot resolve contact phone for sending"); return; }

  const wappiConfig = getWappiConfig();
  try {
    const sendResult = await sendMessage(wappiConfig, contactPhone, suggestion.replyText);
    const sentAt = nowIso();

    // Save outgoing AI message
    if (suggestion.leadId) {
      await db.insert(messages).values({
        leadId: suggestion.leadId,
        contactId: suggestion.contactId,
        channel: "wappi",
        direction: "outgoing",
        senderType: "ai",
        text: suggestion.replyText,
        body: suggestion.replyText,
        externalMessageId: sendResult.externalMessageId || null,
        externalId: sendResult.externalMessageId || null,
        status: sendResult.status,
        rawJson: JSON.stringify({ aiApproved: true, approvedBy: actor, dryRun: sendResult.dryRun }),
        sentAt,
        createdAt: sentAt,
        updatedAt: sentAt
      });
      if (suggestion.conversationId) {
        await touchConversation(suggestion.conversationId, sentAt, 0);
      }
      await writeLeadHistory(suggestion.leadId, "ai.approved_and_sent", {
        suggestionId: id,
        replyText: suggestion.replyText.slice(0, 160),
        dryRun: sendResult.dryRun
      }, actor);
    }

    await db.update(aiSuggestions)
      .set({ status: "sent", reviewedByUserId: actor, updatedAt: sentAt })
      .where(eq(aiSuggestions.id, id));

    res.json({ ok: true, sent: true, dryRun: sendResult.dryRun });
  } catch (err) {
    await db.update(aiSuggestions)
      .set({ status: "failed", reviewedByUserId: actor, updatedAt: now })
      .where(eq(aiSuggestions.id, id));
    responseError(res, 502, err instanceof Error ? err.message : "WAPPI send failed");
  }
});

/** Reject an AI suggestion. */
app.post("/api/ai/suggestions/:id/reject", makeRequireAuth(MANAGER_UP), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { responseError(res, 400, "Invalid suggestion id"); return; }

  const [suggestion] = await db.select().from(aiSuggestions).where(eq(aiSuggestions.id, id)).limit(1);
  if (!suggestion) { responseError(res, 404, "Suggestion not found"); return; }
  if (suggestion.status !== "draft") { responseError(res, 409, `Suggestion is already ${suggestion.status}`); return; }

  const actor = actorFromLocals(res);
  const now = nowIso();

  await db.update(aiSuggestions)
    .set({ status: "rejected", reviewedByUserId: actor, updatedAt: now })
    .where(eq(aiSuggestions.id, id));

  if (suggestion.leadId) {
    await writeLeadHistory(suggestion.leadId, "ai.rejected", {
      suggestionId: id,
      replyText: (suggestion.replyText ?? "").slice(0, 160)
    }, actor);
  }

  res.json({ ok: true });
});

/**
 * Test the AI Manager connection from the settings UI.
 * - If disabled: returns a clean "disabled" message.
 * - If dry-run: runs local simulation (no real external call).
 * - If real: sends a safe test payload (no real client data, no WhatsApp sent).
 * Never logs or exposes the API key.
 */
app.post("/api/ai/test-connection", makeRequireAuth(OWNER_ADMIN), async (_req, res) => {
  const config = getAiManagerConfig();

  const sampleRequest = {
    conversationId: 0,
    leadId: 0,
    messageId: 0,
    clientPhone: "77000000000",
    clientName: "CRM Connection Test",
    text: "Тест подключения к AI Manager",
    recentMessages: [],
    leadStage: null,
    source: "test",
    responsibleManager: null
  };

  if (!config.enabled) {
    res.json({
      ok: false,
      dryRun: config.dryRun,
      status: "disabled",
      message: "AI Manager выключен. Установите AI_MANAGER_ENABLED=true в .env для проверки подключения.",
      sampleRequest
    });
    return;
  }

  if (!config.dryRun && !config.baseUrl) {
    res.json({
      ok: false,
      dryRun: false,
      status: "misconfigured",
      message: "AI_MANAGER_BASE_URL не указан. Укажите URL внешнего AI Manager в .env.",
      sampleRequest
    });
    return;
  }

  const testParams: AiSendParams = {
    conversationId: 0,
    leadId: 0,
    incomingMessageId: 0,
    clientPhone: "77000000000",
    clientName: "CRM Connection Test",
    text: "Тест подключения к AI Manager",
    recentMessages: [],
    leadStage: null,
    source: "test",
    responsibleManager: null
  };

  const result = await sendIncomingMessageToAI(testParams, config);

  res.json({
    ok: result.ok,
    dryRun: config.dryRun,
    status: result.ok
      ? (config.dryRun ? "dry_run_success" : "connected")
      : "error",
    message: result.ok
      ? (config.dryRun
          ? "Dry-run: симуляция прошла успешно. Реальный AI Manager не вызывался."
          : "Соединение с AI Manager установлено. Ответ получен.")
      : `Ошибка: ${result.error ?? "неизвестная ошибка"}`,
    sampleRequest,
    normalizedResponse: result.ok ? {
      replyText: result.replyText,
      confidence: result.confidence,
      actionsCount: result.suggestedActions?.length ?? 0
    } : undefined,
    error: result.ok ? undefined : result.error
  });
});

/** Edit reply text of a draft AI suggestion (manager can refine before sending). */
app.patch("/api/ai/suggestions/:id", makeRequireAuth(MANAGER_UP), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { responseError(res, 400, "Invalid suggestion id"); return; }

  const replyText = asNullableString((req.body as Record<string, unknown>).replyText);
  if (!replyText?.trim()) { responseError(res, 400, "replyText is required and cannot be empty"); return; }

  const [suggestion] = await db.select().from(aiSuggestions).where(eq(aiSuggestions.id, id)).limit(1);
  if (!suggestion) { responseError(res, 404, "Suggestion not found"); return; }
  if (suggestion.status !== "draft") { responseError(res, 409, `Cannot edit a ${suggestion.status} suggestion`); return; }

  const actor = actorFromLocals(res);
  const now = nowIso();

  const [updated] = await db.update(aiSuggestions)
    .set({ replyText: replyText.trim(), reviewedByUserId: actor, updatedAt: now })
    .where(eq(aiSuggestions.id, id))
    .returning();

  res.json({ ok: true, suggestion: updated });
});

/** Pause AI for a conversation. */
app.post("/api/conversations/:id/ai/pause", makeRequireAuth(MANAGER_UP), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { responseError(res, 400, "Invalid conversation id"); return; }

  const mode = asNullableString((req.body as Record<string, unknown>).mode) ?? "30m";
  const now = nowIso();
  let pausedUntil: string | null = null;
  let reason = "manual";

  if (mode === "30m") {
    pausedUntil = new Date(Date.now() + 30 * 60_000).toISOString();
    reason = "manual_30m";
  } else if (mode === "until_manual") {
    pausedUntil = null;
    reason = "manual_until_manual";
  } else if (mode === "off") {
    // Pause indefinitely
    pausedUntil = null;
    reason = "manual_off";
  }

  await db.update(chatConversations)
    .set({ aiPaused: true, aiPausedUntil: pausedUntil, aiPauseReason: reason, updatedAt: now })
    .where(eq(chatConversations.id, id));

  const [conv] = await db.select({ leadId: chatConversations.leadId }).from(chatConversations).where(eq(chatConversations.id, id)).limit(1);
  if (conv?.leadId) {
    await writeLeadHistory(conv.leadId, "ai.paused", { conversationId: id, mode, pausedUntil, reason }, actorFromLocals(res));
  }

  res.json({ ok: true, aiPaused: true, aiPausedUntil: pausedUntil, reason });
});

/** Resume AI for a conversation. */
app.post("/api/conversations/:id/ai/resume", makeRequireAuth(MANAGER_UP), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { responseError(res, 400, "Invalid conversation id"); return; }

  const now = nowIso();
  await db.update(chatConversations)
    .set({ aiPaused: false, aiPausedUntil: null, aiPauseReason: null, updatedAt: now })
    .where(eq(chatConversations.id, id));

  const [conv] = await db.select({ leadId: chatConversations.leadId }).from(chatConversations).where(eq(chatConversations.id, id)).limit(1);
  if (conv?.leadId) {
    await writeLeadHistory(conv.leadId, "ai.resumed", { conversationId: id }, actorFromLocals(res));
  }

  res.json({ ok: true, aiPaused: false });
});

/**
 * GET /api/conversations/:id/messages — paginated messages for one conversation.
 *
 * Returns the most recent `limit` (max 100, default 50) messages in ascending
 * order (oldest→newest). Pass `before=<messageId>` to load older messages.
 * `hasMore=true` means there are messages older than the earliest in this batch.
 */
app.get("/api/conversations/:id/messages", makeRequireAuth(MANAGER_UP), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { responseError(res, 400, "Invalid conversation id"); return; }

  const limit = Math.min(100, Math.max(1, Number((req.query as Record<string, string>).limit ?? 50)));
  const beforeId = Number((req.query as Record<string, string>).before ?? 0);

  const [conv] = await db
    .select({ leadId: chatConversations.leadId })
    .from(chatConversations)
    .where(eq(chatConversations.id, id))
    .limit(1);
  if (!conv) { responseError(res, 404, "Conversation not found"); return; }
  if (conv.leadId == null) { res.json({ messages: [], hasMore: false }); return; }

  const conditions = [eq(messages.leadId, conv.leadId)];
  if (Number.isFinite(beforeId) && beforeId > 0) {
    conditions.push(lt(messages.id, beforeId));
  }

  // Fetch one extra to determine hasMore
  const rows = await db
    .select({
      id: messages.id,
      leadId: messages.leadId,
      contactId: messages.contactId,
      channel: messages.channel,
      direction: messages.direction,
      senderType: messages.senderType,
      text: messages.text,
      body: messages.body,
      mediaUrl: messages.mediaUrl,
      mediaType: messages.mediaType,
      externalMessageId: messages.externalMessageId,
      status: messages.status,
      sentAt: messages.sentAt,
      createdAt: messages.createdAt
    })
    .from(messages)
    .where(and(...conditions))
    .orderBy(desc(messages.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse(); // oldest→newest for display

  res.json({ messages: page, hasMore });
});

/** Mark a conversation as read — clears unread count. Does not call real WAPPI read API. */
app.post("/api/conversations/:id/read", makeRequireAuth(MANAGER_UP), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { responseError(res, 400, "Invalid conversation id"); return; }

  await db.update(chatConversations)
    .set({ unreadCount: 0, updatedAt: nowIso() })
    .where(eq(chatConversations.id, id));

  res.json({ ok: true });
});

/** Test WAPPI connection — safe, no real message sent. */
app.post("/api/wappi/test-connection", makeRequireAuth(MANAGER_UP), async (req, res) => {
  const config = getWappiConfig();

  if (!config.enabled) {
    res.json({ ok: false, status: "disabled", message: "WAPPI отключён. Установите WAPPI_ENABLED=true в .env." });
    return;
  }

  if (config.dryRun) {
    res.json({
      ok: true,
      status: "dry_run_success",
      dryRun: true,
      configured: Boolean(config.token && config.profileId),
      message: config.token && config.profileId
        ? "Dry-run режим: токен и профиль настроены. Установите WAPPI_DRY_RUN=false для реального подключения."
        : "Dry-run режим: WAPPI_TOKEN или WAPPI_PROFILE_ID не заданы."
    });
    return;
  }

  const result = await getWappiProfileStatus(config);
  if (result.ok) {
    res.json({
      ok: true,
      status: "connected",
      dryRun: false,
      configured: result.configured,
      profileStatus: result.profileStatus,
      message: `WAPPI подключён. Статус профиля: ${result.profileStatus ?? "активен"}.`
    });
  } else {
    res.json({
      ok: false,
      status: "error",
      dryRun: false,
      configured: result.configured,
      message: `Ошибка подключения: ${result.error ?? "неизвестная ошибка"}`,
      error: result.error
    });
  }
});

app.post("/api/webhooks/wappi", async (req, res) => {
  const config = getWappiConfig();
  if (!verifyWebhook(config, req.header("x-wappi-signature") ?? req.header("x-webhook-secret"))) {
    responseError(res, 401, "Invalid webhook signature");
    return;
  }

  try {
    // ── Status webhook (delivery / read receipt) ─────────────────────────────
    const webhookType = detectWebhookType(req.body);
    if (webhookType === "status") {
      const statusUpdate = normalizeStatusWebhook(req.body);
      if (statusUpdate.externalMessageId) {
        const [existing] = await db
          .select({ id: messages.id, status: messages.status })
          .from(messages)
          .where(eq(messages.externalMessageId, statusUpdate.externalMessageId))
          .limit(1);
        if (existing) {
          // Only advance status (never regress: read > delivered > sent)
          const statusRank: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 0 };
          const currentRank = statusRank[existing.status] ?? 0;
          const newRank = statusRank[statusUpdate.status] ?? 0;
          const shouldUpdate = statusUpdate.status === "failed" || newRank > currentRank;
          if (shouldUpdate) {
            await db.update(messages)
              .set({ status: statusUpdate.status, updatedAt: nowIso() })
              .where(eq(messages.id, existing.id));
          }
          // Log failed delivery as a lead history event for visibility
          if (statusUpdate.status === "failed") {
            const [msg] = await db.select({ leadId: messages.leadId }).from(messages).where(eq(messages.id, existing.id)).limit(1);
            if (msg?.leadId) {
              await writeLeadHistory(msg.leadId, "message.delivery_failed", {
                messageId: existing.id,
                externalMessageId: statusUpdate.externalMessageId,
                error: statusUpdate.errorMessage ?? "Delivery failed"
              });
            }
          }
          res.json({ ok: true, statusUpdated: true, messageId: existing.id, status: statusUpdate.status });
        } else {
          // Unknown message ID — log and ignore
          res.json({ ok: true, statusUpdated: false, reason: "message_not_found" });
        }
      } else {
        res.json({ ok: true, statusUpdated: false, reason: "no_external_message_id" });
      }
      return;
    }
    // ─────────────────────────────────────────────────────────────────────────

    const normalized = normalizeIncomingWebhook(req.body);
    if (!normalized.phone || (!normalized.text && !normalized.mediaUrl)) {
      responseError(res, 400, "Webhook phone and text/media are required");
      return;
    }

    if (normalized.externalMessageId) {
      const [existing] = await db.select().from(messages).where(eq(messages.externalMessageId, normalized.externalMessageId)).limit(1);
      if (existing) {
        res.json({ ok: true, duplicate: true, message: existing });
        return;
      }
    }

    let contact = await findContactByPhone(normalized.phone);
    const createdAt = normalized.receivedAt;
    if (!contact) {
      [contact] = await db
        .insert(contacts)
        .values({
          name: `WhatsApp ${normalized.phone}`,
          phone: normalized.phone,
          source: "WAPPI",
          rawJson: JSON.stringify(normalized.raw),
          createdAt,
          updatedAt: createdAt
        })
        .returning();
    }

    let lead = await findPrimaryLeadByContact(contact.id);
    if (!lead) lead = await createWappiLead(contact.id, normalized.phone, normalized.raw);
    const conversation = await getOrCreateConversation({ leadId: lead.id, contactId: contact.id, phone: normalized.phone, raw: normalized.raw });
    const [message] = await db
      .insert(messages)
      .values({
        leadId: lead.id,
        contactId: contact.id,
        channel: "wappi",
        direction: "incoming",
        senderType: "client",
        text: normalized.text,
        body: normalized.text || normalized.mediaUrl || "",
        mediaUrl: normalized.mediaUrl,
        mediaType: normalized.mediaType,
        externalMessageId: normalized.externalMessageId,
        externalId: normalized.externalMessageId,
        status: "received",
        rawJson: JSON.stringify(normalized.raw),
        sentAt: createdAt,
        createdAt,
        updatedAt: createdAt
      })
      .returning();
    await touchConversation(conversation.id, createdAt, 1);
    await writeLeadHistory(lead.id, "message.incoming", { messageId: message.id, channel: "wappi", text: normalized.text.slice(0, 160) });

    // ── AI Manager Bridge ──────────────────────────────────────────────────────
    // Non-blocking: fire-and-forget. WAPPI webhook always returns 200 even if AI fails.
    void processIncomingMessageWithAI({
      message,
      conversation,
      lead,
      contact
    }).catch(() => {
      // Silently swallow — AI errors must never affect WAPPI webhook response
    });
    // ──────────────────────────────────────────────────────────────────────────

    res.json({ ok: true, leadId: lead.id, contactId: contact.id, conversationId: conversation.id, message });
  } catch (error) {
    responseError(res, 500, error instanceof Error ? error.message : "WAPPI webhook failed");
  }
});

app.post("/api/leads/:id/messages", makeRequireAuth(MANAGER_UP), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { responseError(res, 400, "Invalid lead id"); return; }

  const textBody = asNullableString((req.body as Record<string, unknown>).text ?? (req.body as Record<string, unknown>).body);
  if (!textBody) { responseError(res, 400, "Message text is required"); return; }

  // Direct DB query — avoids loading entire bootstrap for a single lead lookup
  const [leadRow] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  if (!leadRow) { responseError(res, 404, "Lead not found"); return; }

  // Resolve primary contact + phone via join
  const [contactLink] = await db
    .select({ contactId: leadContacts.contactId, phone: contacts.phone })
    .from(leadContacts)
    .leftJoin(contacts, eq(contacts.id, leadContacts.contactId))
    .where(and(eq(leadContacts.leadId, id), eq(leadContacts.isPrimary, true)))
    .limit(1);

  const contactId = contactLink?.contactId ?? null;
  const phone = normalizePhone(contactLink?.phone ?? "");
  if (!phone) { responseError(res, 400, "Lead contact phone is missing"); return; }

  const config = getWappiConfig();
  const createdAt = nowIso();

  // ── WAPPI disabled: save locally, no send ────────────────────────────────
  if (!config.enabled) {
    const conversation = await getOrCreateConversation({ leadId: id, contactId, phone });
    const [message] = await db
      .insert(messages)
      .values({
        leadId: id,
        contactId,
        channel: "wappi",
        direction: "outgoing",
        senderType: "manager",
        text: textBody,
        body: textBody,
        status: "local_only",
        rawJson: JSON.stringify({ localOnly: true, wappiEnabled: false }),
        sentAt: createdAt,
        createdAt,
        updatedAt: createdAt,
      })
      .returning();
    await touchConversation(conversation.id, createdAt, 0);
    await writeLeadHistory(id, "message.outgoing", { messageId: message.id, channel: "wappi", localOnly: true, text: textBody.slice(0, 160) }, actorFromLocals(res));
    res.status(201).json({ message, localOnly: true, wappi: publicWappiConfig(config) });
    return;
  }

  // ── WAPPI enabled (dry-run or real) ──────────────────────────────────────
  try {
    const sendResult = await sendMessage(config, phone, textBody);
    const conversation = await getOrCreateConversation({ leadId: id, contactId, phone });
    const [message] = await db
      .insert(messages)
      .values({
        leadId: id,
        contactId,
        channel: "wappi",
        direction: "outgoing",
        senderType: "manager",
        text: textBody,
        body: textBody,
        externalMessageId: sendResult.externalMessageId || null,
        externalId: sendResult.externalMessageId || null,
        status: sendResult.status,
        rawJson: JSON.stringify({ dryRun: sendResult.dryRun, response: sendResult.response }),
        sentAt: createdAt,
        createdAt,
        updatedAt: createdAt,
      })
      .returning();
    // Pause AI temporarily after manager reply
    const aiCfg = getAiManagerConfig();
    const pauseUntil = aiCfg.pauseOnManagerReply
      ? new Date(Date.now() + aiCfg.pauseMinutes * 60_000).toISOString()
      : null;
    await db.update(chatConversations)
      .set({
        aiPaused: true,
        aiPausedUntil: pauseUntil,
        aiPauseReason: "manager_reply"
      })
      .where(eq(chatConversations.id, conversation.id));
    if (aiCfg.pauseOnManagerReply) {
      await writeLeadHistory(id, "ai.paused", {
        reason: "manager_reply",
        pauseMinutes: aiCfg.pauseMinutes,
        pausedUntil: pauseUntil
      }, actorFromLocals(res));
    }
    await touchConversation(conversation.id, createdAt, 0);
    await writeLeadHistory(id, "message.outgoing", { messageId: message.id, channel: "wappi", dryRun: sendResult.dryRun, text: textBody.slice(0, 160) }, actorFromLocals(res));
    res.status(201).json({ message, dryRun: sendResult.dryRun, wappi: publicWappiConfig(config) });
  } catch (error) {
    const conversation = await getOrCreateConversation({ leadId: id, contactId, phone });
    const [message] = await db
      .insert(messages)
      .values({
        leadId: id,
        contactId,
        channel: "wappi",
        direction: "outgoing",
        senderType: "manager",
        text: textBody,
        body: textBody,
        status: "failed",
        rawJson: JSON.stringify({ error: error instanceof Error ? error.message : "WAPPI send failed" }),
        sentAt: createdAt,
        createdAt,
        updatedAt: createdAt,
      })
      .returning();
    await touchConversation(conversation.id, createdAt, 0);
    await writeLeadHistory(id, "message.outgoing_failed", { messageId: message.id, channel: "wappi" }, actorFromLocals(res));
    res.status(502).json({ error: error instanceof Error ? error.message : "WAPPI send failed", message });
  }
});

app.get("/api/chats", async (_req, res) => {
  const conversationRows = await db
    .select({
      id: chatConversations.id,
      leadId: chatConversations.leadId,
      contactId: chatConversations.contactId,
      phone: chatConversations.phone,
      channel: chatConversations.channel,
      status: chatConversations.status,
      unreadCount: chatConversations.unreadCount,
      lastMessageAt: chatConversations.lastMessageAt,
      aiPaused: chatConversations.aiPaused,
      aiPausedUntil: chatConversations.aiPausedUntil,
      aiPauseReason: chatConversations.aiPauseReason,
      leadTitle: leads.title,
      contactName: contacts.name
    })
    .from(chatConversations)
    .leftJoin(leads, eq(chatConversations.leadId, leads.id))
    .leftJoin(contacts, eq(chatConversations.contactId, contacts.id))
    .orderBy(desc(chatConversations.lastMessageAt));

  // Attach draft AI suggestions per conversation
  const draftSuggestions = await db
    .select({
      id: aiSuggestions.id,
      conversationId: aiSuggestions.conversationId,
      replyText: aiSuggestions.replyText,
      confidence: aiSuggestions.confidence,
      status: aiSuggestions.status,
      sourceMessageId: aiSuggestions.sourceMessageId,
      suggestedActionsJson: aiSuggestions.suggestedActionsJson,
      createdAt: aiSuggestions.createdAt
    })
    .from(aiSuggestions)
    .where(eq(aiSuggestions.status, "draft"))
    .orderBy(desc(aiSuggestions.createdAt));

  const suggestionsByConversation: Record<number, typeof draftSuggestions[0][]> = {};
  for (const s of draftSuggestions) {
    if (s.conversationId !== null && s.conversationId !== undefined) {
      (suggestionsByConversation[s.conversationId] ??= []).push(s);
    }
  }

  // Load last message per lead — single query using correlated subquery (no N+1)
  const leadIds = conversationRows.map((c) => c.leadId).filter((id): id is number => id != null);
  type LastMsgRow = { id: number; leadId: number | null; direction: string; senderType: string; text: string | null; status: string; createdAt: string | null };
  let lastMessageByLead: Record<number, LastMsgRow> = {};
  if (leadIds.length > 0) {
    const lastMsgRows = await db
      .select({
        id: messages.id,
        leadId: messages.leadId,
        direction: messages.direction,
        senderType: messages.senderType,
        text: messages.text,
        status: messages.status,
        createdAt: messages.createdAt
      })
      .from(messages)
      .where(
        and(
          inArray(messages.leadId, leadIds),
          sql`messages.id = (SELECT MAX(id) FROM messages AS m2 WHERE m2.lead_id = messages.lead_id)`
        )
      );
    for (const row of lastMsgRows) {
      if (row.leadId != null) lastMessageByLead[row.leadId] = row as LastMsgRow;
    }
  }

  const enrichedConversations = conversationRows.map((conv) => {
    const lastMsg = conv.leadId != null ? lastMessageByLead[conv.leadId] : undefined;
    const needsReply = lastMsg
      ? lastMsg.direction === "incoming" && lastMsg.senderType === "client"
      : false;
    return {
      ...conv,
      lastMessageText: lastMsg?.text?.slice(0, 100) ?? null,
      lastMessageDirection: lastMsg?.direction ?? null,
      lastMessageSenderType: lastMsg?.senderType ?? null,
      lastMessageStatus: lastMsg?.status ?? null,
      needsReply,
      aiSuggestions: suggestionsByConversation[conv.id] ?? []
    };
  });

  res.json({
    conversations: enrichedConversations,
    messages: [], // Deprecated: use GET /api/conversations/:id/messages for paginated messages
    wappi: publicWappiConfig(),
    aiManager: maskAiConfigStatus()
  });
});

app.post("/api/tasks", makeRequireAuth(MANAGER_UP), async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const title = asNullableString(body.title);
  const leadId = asNullableNumber(body.leadId);
  const dueAt = asNullableString(body.dueAt);
  if (!title || !dueAt) {
    responseError(res, 400, "Task title and dueAt are required");
    return;
  }

  try {
    const [inserted] = await db
      .insert(tasks)
      .values({
        leadId,
        title,
        description: asNullableString(body.description),
        dueAt,
        assigneeId: asNullableNumber(body.responsibleUserId ?? body.assigneeId),
        type: asNullableString(body.type) ?? "call",
        priority: asNullableString(body.priority) ?? "normal",
        status: asNullableString(body.status) ?? "open",
        createdAt: nowIso(),
        updatedAt: nowIso()
      })
      .returning();
    await writeLeadHistory(leadId, "task.created", { taskId: inserted.id, title: inserted.title, dueAt: inserted.dueAt }, actorFromLocals(res));
    res.status(201).json({ task: inserted });
  } catch (error) {
    responseError(res, 500, error instanceof Error ? error.message : "Task create failed");
  }
});

app.patch("/api/tasks/:id", makeRequireAuth(MANAGER_UP), async (req, res) => {
  const id = Number(req.params.id);
  const [existingTask] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!existingTask) {
    responseError(res, 404, "Task not found");
    return;
  }

  const body = req.body as Record<string, unknown>;
  const updatePayload: Partial<typeof tasks.$inferInsert> = { updatedAt: nowIso() };
  const title = asNullableString(body.title);
  const description = asNullableString(body.description);
  const dueAt = asNullableString(body.dueAt);
  const assigneeId = asNullableNumber(body.responsibleUserId ?? body.assigneeId);
  const type = asNullableString(body.type);
  const priority = asNullableString(body.priority);
  const status = asNullableString(body.status);
  if (typeof title === "string") updatePayload.title = title;
  if (description !== undefined) updatePayload.description = description;
  if (typeof dueAt === "string") updatePayload.dueAt = dueAt;
  if (assigneeId !== undefined) updatePayload.assigneeId = assigneeId;
  if (typeof type === "string") updatePayload.type = type;
  if (typeof priority === "string") updatePayload.priority = priority;
  if (typeof status === "string") updatePayload.status = status;

  try {
    await db.update(tasks).set(updatePayload).where(eq(tasks.id, id));
    await writeLeadHistory(existingTask.leadId, "task.updated", { taskId: id, fields: Object.keys(updatePayload).filter((field) => field !== "updatedAt") }, actorFromLocals(res));
    const [updatedTask] = await db.select().from(tasks).where(eq(tasks.id, id));
    res.json({ task: updatedTask });
  } catch (error) {
    responseError(res, 500, error instanceof Error ? error.message : "Task update failed");
  }
});

app.post("/api/tasks/:id/complete", makeRequireAuth(MANAGER_UP), async (req, res) => {
  const id = Number(req.params.id);
  const [existingTask] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!existingTask) {
    responseError(res, 404, "Task not found");
    return;
  }

  const completedAt = nowIso();
  await db.update(tasks).set({ status: "done", completedAt, updatedAt: completedAt }).where(eq(tasks.id, id));
  await writeLeadHistory(existingTask.leadId, "task.completed", { taskId: id, title: existingTask.title, completedAt }, actorFromLocals(res));
  const [updatedTask] = await db.select().from(tasks).where(eq(tasks.id, id));
  res.json({ task: updatedTask });
});

app.post("/api/tasks/:id/reopen", makeRequireAuth(MANAGER_UP), async (req, res) => {
  const id = Number(req.params.id);
  const [existingTask] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!existingTask) {
    responseError(res, 404, "Task not found");
    return;
  }

  const now = nowIso();
  const body = req.body as Record<string, unknown>;
  const newDueAt = asNullableString(body.dueAt) ?? existingTask.dueAt;
  await db.update(tasks).set({ status: "open", completedAt: null, dueAt: newDueAt, updatedAt: now }).where(eq(tasks.id, id));
  await writeLeadHistory(existingTask.leadId, "task.reopened", { taskId: id, title: existingTask.title }, actorFromLocals(res));
  const [updatedTask] = await db.select().from(tasks).where(eq(tasks.id, id));
  res.json({ task: updatedTask });
});

app.post("/api/notes", makeRequireAuth(MANAGER_UP), async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const leadId = asNullableNumber(body.leadId);
  const bodyText = asNullableString(body.body);
  if (!leadId || !bodyText) {
    responseError(res, 400, "Note leadId and body are required");
    return;
  }

  try {
    const actorId = actorFromLocals(res);
    const [inserted] = await db
      .insert(notes)
      .values({
        leadId,
        authorId: actorId ?? asNullableNumber(body.authorId),
        body: bodyText,
        createdAt: nowIso(),
        updatedAt: nowIso()
      })
      .returning();
    await writeLeadHistory(leadId, "note.created", { noteId: inserted.id, body: inserted.body.slice(0, 160) }, actorFromLocals(res));
    res.status(201).json({ note: inserted });
  } catch (error) {
    responseError(res, 500, error instanceof Error ? error.message : "Note create failed");
  }
});

/**
 * GET /api/search?q=<query>
 * Lightweight cross-entity search across leads, contacts, and tasks.
 * Returns up to 15 leads, 8 contacts, and 8 tasks matching the query.
 * No auth required — data already served by /api/bootstrap.
 */
app.get("/api/search", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q || q.length < 2) return res.json({ leads: [], contacts: [], tasks: [] });
  const lq = q.toLowerCase();
  const phoneQ = q.replace(/\D/g, "");

  // Search leads (join primary contact for phone/name)
  const leadRows = await db
    .select({
      id: leads.id,
      title: leads.title,
      leadNumber: leads.leadNumber,
      source: leads.source,
      status: leads.status,
      budget: leads.budget,
      address: leads.address,
      pipelineCode: pipelines.code,
      stageName: stages.name,
      contactName: contacts.name,
      contactPhone: contacts.phone
    })
    .from(leads)
    .leftJoin(leadContacts, and(eq(leadContacts.leadId, leads.id), eq(leadContacts.isPrimary, true)))
    .leftJoin(contacts, eq(contacts.id, leadContacts.contactId))
    .leftJoin(pipelines, eq(pipelines.id, leads.pipelineId))
    .leftJoin(stages, eq(stages.id, leads.stageId))
    .limit(200);

  const matchedLeads = leadRows.filter((l) => {
    const hay = `${l.title ?? ""} ${l.leadNumber ?? ""} ${l.contactName ?? ""} ${l.address ?? ""} ${l.source ?? ""}`.toLowerCase();
    const phoneMatch = phoneQ.length >= 4 && (l.contactPhone ?? "").replace(/\D/g, "").includes(phoneQ);
    return hay.includes(lq) || phoneMatch;
  }).slice(0, 15);

  // Search contacts
  const contactRows = await db
    .select({ id: contacts.id, name: contacts.name, phone: contacts.phone, email: contacts.email })
    .from(contacts)
    .limit(200);

  const matchedContacts = contactRows.filter((c) => {
    const hay = `${c.name ?? ""} ${c.email ?? ""}`.toLowerCase();
    const phoneMatch = phoneQ.length >= 4 && (c.phone ?? "").replace(/\D/g, "").includes(phoneQ);
    return hay.includes(lq) || phoneMatch;
  }).slice(0, 8);

  // Search tasks
  const taskRows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      leadId: tasks.leadId,
      status: tasks.status,
      type: tasks.type,
      dueAt: tasks.dueAt
    })
    .from(tasks)
    .limit(200);

  const matchedTasks = taskRows.filter((t) => {
    const hay = `${t.title ?? ""} ${t.description ?? ""}`.toLowerCase();
    return hay.includes(lq);
  }).slice(0, 8);

  return res.json({ leads: matchedLeads, contacts: matchedContacts, tasks: matchedTasks });
});

app.get("/api/dashboard", async (_req, res) => {
  const [{ totalBudget }] = await db.select({ totalBudget: sql<number>`sum(${leads.budget})` }).from(leads);
  const bootstrap = await getBootstrap();
  res.json({
    totalBudget: totalBudget ?? 0,
    leadsCount: bootstrap.leads.length,
    openTasks: bootstrap.tasks.filter((task) => task.status !== "done").length,
    completedTasks: bootstrap.tasks.filter((task) => task.status === "done").length
  });
});

app.get("/api/system/status", makeRequireAuth(OWNER_ADMIN), async (_req, res) => {
  const wappiCfg = getWappiConfig();
  const pbxCfg = getOnlinePbxConfig();

  let dbConnected = false;
  try {
    await db.select().from(users).limit(1);
    dbConnected = true;
  } catch {
    dbConnected = false;
  }

  // Count active extension mappings
  let pbxMappingCount = 0;
  try {
    const [row] = await db
      .select({ n: sql<number>`count(*)` })
      .from(pbxUserMappings)
      .where(eq(pbxUserMappings.isActive, true));
    pbxMappingCount = Number(row?.n ?? 0);
  } catch {
    pbxMappingCount = 0;
  }

  const maskToken = (val?: string) => (val ? `${"•".repeat(Math.max(0, val.length - 4))}${val.slice(-4)}` : null);

  res.json({
    dataMode,
    db: { connected: dbConnected },
    wappi: {
      enabled: wappiCfg.enabled,
      dryRun: wappiCfg.dryRun,
      configured: Boolean(wappiCfg.token && wappiCfg.profileId),
      apiBaseUrlConfigured: Boolean(process.env.WAPPI_API_BASE_URL),
      profileIdConfigured: Boolean(wappiCfg.profileId),
      tokenConfigured: Boolean(wappiCfg.token),
      webhookSecretConfigured: Boolean(wappiCfg.webhookSecret),
      tokenMasked: maskToken(wappiCfg.token),
      profileId: wappiCfg.profileId ?? null,
      requiredEnvVars: ["WAPPI_ENABLED", "WAPPI_TOKEN", "WAPPI_PROFILE_ID", "WAPPI_API_BASE_URL", "WAPPI_WEBHOOK_SECRET"]
    },
    onlinePbx: {
      enabled: pbxCfg.enabled,
      dryRun: pbxCfg.dryRun,
      apiBaseUrlConfigured: Boolean(pbxCfg.apiBaseUrl),
      domainConfigured: Boolean(pbxCfg.domain),
      apiKeyConfigured: Boolean(pbxCfg.apiKey),
      apiKeyMasked: maskToken(pbxCfg.apiKey),
      webhookSecretConfigured: Boolean(pbxCfg.webhookSecret),
      mappingCount: pbxMappingCount,
      requiredEnvVars: ["ONLINEPBX_ENABLED", "ONLINEPBX_DOMAIN", "ONLINEPBX_API_KEY", "ONLINEPBX_API_BASE_URL", "ONLINEPBX_WEBHOOK_SECRET"]
    },
    amoImport: {
      configured: Boolean(process.env.AMO_IMPORT_DB_PATH),
      requiredEnvVars: ["AMO_IMPORT_DB_PATH"]
    },
    aiManager: {
      ...maskAiConfigStatus(),
      configured: Boolean(process.env.AI_MANAGER_BASE_URL) || Boolean(process.env.AI_MANAGER_URL),
      // Safety warning: auto-send + direct-send AI Manager = duplicate messages risk
      autoSendWarning: getAiManagerConfig().autoSend
        ? "ВНИМАНИЕ: AI_MANAGER_AUTO_SEND=true. Убедитесь, что AI Manager не отправляет WhatsApp напрямую, иначе возможны дубли сообщений."
        : null,
      requiredEnvVars: [
        "AI_MANAGER_ENABLED",
        "AI_MANAGER_BASE_URL",
        "AI_MANAGER_API_KEY",
        "AI_MANAGER_ENDPOINT",
        "AI_MANAGER_AUTO_SEND",
        "AI_MANAGER_AUTO_ACTIONS",
        "AI_MANAGER_PAUSE_ON_MANAGER_REPLY",
        "AI_MANAGER_PAUSE_MINUTES",
        "AI_MANAGER_MIN_CONFIDENCE"
      ]
    }
  });
});

app.get("/api/import/amo/stats", async (_req, res) => {
  res.json(await getAmoImportStats());
});

app.post("/api/import/amo/dry-run", makeRequireAuth(OWNER_ADMIN), async (_req, res) => {
  res.json(await runAmoImport("dry-run"));
});

app.post("/api/import/amo/run", makeRequireAuth(OWNER_ADMIN), async (_req, res) => {
  res.json(await runAmoImport("import"));
});

// ─── onlinePBX telephony routes ──────────────────────────────────────────────

/**
 * Apply onlinePBX schema additions idempotently on startup.
 * ALTER TABLE ADD COLUMN throws if the column already exists in SQLite,
 * so we catch those errors silently. CREATE TABLE IF NOT EXISTS is safe.
 */
async function ensureTelephonySchema() {
  const alterStatements = [
    "ALTER TABLE calls ADD COLUMN external_call_id TEXT",
    "ALTER TABLE calls ADD COLUMN manager_extension TEXT",
    "ALTER TABLE calls ADD COLUMN client_phone TEXT",
    "ALTER TABLE calls ADD COLUMN provider TEXT NOT NULL DEFAULT 'onlinepbx'",
    "ALTER TABLE calls ADD COLUMN raw_payload_json TEXT",
    "ALTER TABLE calls ADD COLUMN error_message TEXT",
    "ALTER TABLE calls ADD COLUMN started_at TEXT",
    "ALTER TABLE calls ADD COLUMN answered_at TEXT",
    "ALTER TABLE calls ADD COLUMN ended_at TEXT",
  ];
  for (const stmt of alterStatements) {
    try {
      await db.run(sql.raw(stmt));
    } catch {
      // Column already exists — safe to ignore
    }
  }
  try {
    await db.run(sql.raw(`
      CREATE TABLE IF NOT EXISTS pbx_user_mappings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        crm_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        onlinepbx_extension TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `));
  } catch {
    // Table already exists — safe to ignore
  }
}

/** GET /api/telephony/config — public config for the frontend */
app.get("/api/telephony/config", (_req, res) => {
  res.json({ telephony: publicOnlinePbxConfig() });
});

/** GET /api/telephony/mappings — all manager → extension mappings */
app.get("/api/telephony/mappings", async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: pbxUserMappings.id,
        crmUserId: pbxUserMappings.crmUserId,
        onlinepbxExtension: pbxUserMappings.onlinepbxExtension,
        isActive: pbxUserMappings.isActive,
        userName: users.name,
      })
      .from(pbxUserMappings)
      .leftJoin(users, eq(pbxUserMappings.crmUserId, users.id))
      .orderBy(users.name);
    res.json({ mappings: rows });
  } catch (error) {
    responseError(res, 500, error instanceof Error ? error.message : "Failed to fetch mappings");
  }
});

/** POST /api/telephony/mappings — upsert a manager extension mapping */
app.post("/api/telephony/mappings", makeRequireAuth(OWNER_ADMIN), async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const crmUserId = asNullableNumber(body.crmUserId);
  const extension = asNullableString(body.extension);
  const isActive = body.isActive !== false;

  if (!crmUserId || !extension) {
    responseError(res, 400, "crmUserId and extension are required");
    return;
  }

  try {
    const [existing] = await db
      .select()
      .from(pbxUserMappings)
      .where(eq(pbxUserMappings.crmUserId, crmUserId))
      .limit(1);

    const now = nowIso();
    if (existing) {
      await db
        .update(pbxUserMappings)
        .set({ onlinepbxExtension: extension, isActive, updatedAt: now })
        .where(eq(pbxUserMappings.id, existing.id));
    } else {
      await db.insert(pbxUserMappings).values({
        crmUserId,
        onlinepbxExtension: extension,
        isActive,
        createdAt: now,
        updatedAt: now,
      });
    }

    const [updated] = await db
      .select()
      .from(pbxUserMappings)
      .where(eq(pbxUserMappings.crmUserId, crmUserId))
      .limit(1);
    res.json({ mapping: updated });
  } catch (error) {
    responseError(res, 500, error instanceof Error ? error.message : "Failed to save mapping");
  }
});

// ─── Outgoing call service ────────────────────────────────────────────────────

/**
 * Core outgoing-call logic shared by:
 *   POST /api/leads/:id/call          (deal-centric, existing)
 *   POST /api/telephony/onlinepbx/call (generic, contact/task-aware)
 *
 * Extension resolution priority:
 *   1. managerExtensionOverride (explicit body param)
 *   2. pbxUserMappings for actorUserId
 */
async function doOutgoingCall(params: {
  actorUserId: number | null;
  rawPhone: string;
  leadId?: number | null;
  contactId?: number | null;
  taskId?: number | null;
  managerExtensionOverride?: string | null;
}): Promise<{
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
}> {
  const { actorUserId, rawPhone, leadId, contactId, taskId, managerExtensionOverride } = params;

  const clientPhone = normalizePhone(rawPhone);
  if (!clientPhone) {
    return { ok: false, status: 400, body: { error: "phone is invalid or empty after normalisation" } };
  }

  // Resolve manager extension
  let managerExtension: string | null = managerExtensionOverride ?? null;
  if (!managerExtension && actorUserId) {
    const [mapping] = await db
      .select()
      .from(pbxUserMappings)
      .where(and(eq(pbxUserMappings.crmUserId, actorUserId), eq(pbxUserMappings.isActive, true)))
      .limit(1);
    managerExtension = mapping?.onlinepbxExtension ?? null;
  }

  const config = getOnlinePbxConfig();

  if (!config.enabled) {
    // Telephony disabled — log intent and return tel-fallback signal
    const now = nowIso();
    await db.insert(calls).values({
      leadId: leadId ?? null,
      contactId: contactId ?? null,
      userId: actorUserId,
      direction: "outgoing",
      status: "failed",
      durationSec: 0,
      calledAt: now,
      clientPhone,
      managerExtension: managerExtension ?? null,
      provider: "onlinepbx",
      errorMessage: "Телефония отключена (ONLINEPBX_ENABLED=false)",
      createdAt: now,
      updatedAt: now,
    });
    return {
      ok: true,
      status: 200,
      body: { ok: true, telFallback: true, phone: clientPhone, message: "Телефония не подключена. Используйте обычный звонок." }
    };
  }

  if (!config.dryRun && !managerExtension) {
    return {
      ok: false,
      status: 422,
      body: { error: "Для пользователя не указан добавочный номер onlinePBX. Добавьте его в Настройки → Интеграции → Телефония." }
    };
  }

  const effectiveExtension = managerExtension ?? "dryrun_ext";
  const now = nowIso();

  // Create call_log record
  const [callRecord] = await db
    .insert(calls)
    .values({
      leadId: leadId ?? null,
      contactId: contactId ?? null,
      userId: actorUserId,
      direction: "outgoing",
      status: "initiated",
      durationSec: 0,
      calledAt: now,
      clientPhone,
      managerExtension: effectiveExtension,
      provider: "onlinepbx",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  // Insert a message entry so the call appears in the AmoFeed immediately
  let callMessageId: number | null = null;
  if (leadId) {
    const [callMessage] = await db
      .insert(messages)
      .values({
        leadId,
        channel: "phone",
        direction: "outgoing",
        senderType: "manager",
        text: "Исходящий звонок",
        body: "Исходящий звонок",
        mediaType: "call",
        status: "initiated",
        sentAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    callMessageId = callMessage.id;
  }

  // Call onlinePBX adapter (or dry-run)
  const result = await startOutgoingCall(config, { managerExtension: effectiveExtension, clientPhone });

  // Update call_log with result
  await db.update(calls).set({
    status: result.ok ? "initiated" : "failed",
    externalCallId: result.externalCallId ?? null,
    errorMessage: result.error ?? null,
    updatedAt: nowIso(),
  }).where(eq(calls.id, callRecord.id));

  // Update message external reference
  if (result.externalCallId && callMessageId) {
    await db.update(messages)
      .set({ externalId: result.externalCallId, updatedAt: nowIso() })
      .where(eq(messages.id, callMessageId));
  }

  // Write timeline event on the linked lead
  if (leadId) {
    await writeLeadHistory(leadId, "call.outgoing", {
      callId: callRecord.id,
      externalCallId: result.externalCallId,
      phone: clientPhone,
      extension: effectiveExtension,
      dryRun: result.dryRun ?? false,
      status: result.ok ? "initiated" : "failed",
      error: result.error,
      message: result.dryRun ? `Dry-run звонок: ${clientPhone}` : `Исходящий звонок: ${clientPhone}`,
    }, actorUserId);
  }

  if (!result.ok) {
    return { ok: false, status: 500, body: { ok: false, error: result.error } };
  }

  return {
    ok: true,
    status: 200,
    body: {
      ok: true,
      dryRun: result.dryRun ?? false,
      externalCallId: result.externalCallId,
      callId: callRecord.id,
      messageId: callMessageId,
    }
  };
}

/**
 * POST /api/leads/:id/call — initiate a click-to-call for a deal.
 * Uses the authenticated session user for extension resolution.
 */
app.post("/api/leads/:id/call", makeRequireAuth(MANAGER_UP), async (req, res) => {
  const leadId = Number(req.params.id);
  if (!Number.isFinite(leadId)) { responseError(res, 400, "Invalid lead id"); return; }

  const body = req.body as Record<string, unknown>;
  const rawPhone = asNullableString(body.phone);
  if (!rawPhone) { responseError(res, 400, "phone is required"); return; }

  const currentUser = res.locals.currentUser as CurrentUser;
  const result = await doOutgoingCall({
    actorUserId: currentUser.id,
    rawPhone,
    leadId,
    managerExtensionOverride: asNullableString(body.managerExtension),
  });

  res.status(result.status).json(result.body);
});

/**
 * POST /api/telephony/onlinepbx/call — generic click-to-call.
 * Supports optional dealId, contactId, taskId.
 * Allows calling without a specific deal context.
 */
app.post("/api/telephony/onlinepbx/call", makeRequireAuth(MANAGER_UP), async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const rawPhone = asNullableString(body.phone);
  if (!rawPhone) { responseError(res, 400, "phone is required"); return; }

  const currentUser = res.locals.currentUser as CurrentUser;
  const result = await doOutgoingCall({
    actorUserId: currentUser.id,
    rawPhone,
    leadId: asNullableNumber(body.dealId ?? body.leadId),
    contactId: asNullableNumber(body.contactId),
    taskId: asNullableNumber(body.taskId),
    managerExtensionOverride: asNullableString(body.managerExtension),
  });

  res.status(result.status).json(result.body);
});

/** GET /api/leads/:id/calls — call history for a deal */
app.get("/api/leads/:id/calls", async (req, res) => {
  const leadId = Number(req.params.id);
  if (!Number.isFinite(leadId)) {
    responseError(res, 400, "Invalid lead id");
    return;
  }
  const rows = await db
    .select()
    .from(calls)
    .where(eq(calls.leadId, leadId))
    .orderBy(desc(calls.calledAt));
  res.json({ calls: rows });
});

/**
 * POST /api/webhooks/onlinepbx — receive call events from onlinePBX.
 *
 * onlinePBX must be configured to POST events to:
 *   https://your-public-domain.com/api/webhooks/onlinepbx
 *
 * TODO: Configure the webhook URL in your onlinePBX admin panel.
 *       Use ngrok / cloudflared for local testing.
 */
app.post("/api/webhooks/onlinepbx", async (req, res) => {
  const config = getOnlinePbxConfig();

  // Verify secret — accept any of the common header names onlinePBX might send
  const headerValue =
    req.header("x-onlinepbx-token") ??
    req.header("x-webhook-secret") ??
    req.header("authorization");

  if (!verifyOnlinePbxWebhook(config, headerValue)) {
    responseError(res, 401, "Invalid webhook secret");
    return;
  }

  let normalized: ReturnType<typeof normalizeOnlinePbxWebhook>;
  try {
    normalized = normalizeOnlinePbxWebhook(req.body);
  } catch {
    responseError(res, 400, "Failed to parse webhook payload");
    return;
  }

  const now = nowIso();

  try {
    // Find existing call record by external_call_id
    let existingCall: typeof calls.$inferSelect | null = null;
    if (normalized.externalCallId) {
      const [found] = await db
        .select()
        .from(calls)
        .where(eq(calls.externalCallId, normalized.externalCallId))
        .limit(1);
      existingCall = found ?? null;
    }

    // Determine lead/contact from phone if not already linked
    const phoneToSearch =
      normalized.direction === "incoming"
        ? normalized.callerPhone
        : normalized.calleePhone;

    const contact = phoneToSearch ? await findContactByPhone(phoneToSearch) : null;
    const leadFromContact = contact
      ? await findPrimaryLeadByContact(contact.id)
      : null;
    const effectiveLeadId = existingCall?.leadId ?? leadFromContact?.id ?? null;

    // Duration-formatted body text for feed display
    const mins = Math.floor(normalized.durationSec / 60);
    const secs = String(normalized.durationSec % 60).padStart(2, "0");
    const durStr = normalized.durationSec > 0 ? ` · ${mins}:${secs}` : "";
    let bodyText = normalized.direction === "incoming" ? "Входящий звонок" : "Исходящий звонок";
    if (normalized.status === "missed") {
      bodyText = normalized.direction === "incoming" ? "Пропущенный звонок" : "Не дозвонился";
    } else if (normalized.status === "completed" || normalized.status === "answered") {
      bodyText += durStr;
    }

    if (existingCall) {
      // Update existing call record
      await db
        .update(calls)
        .set({
          status: normalized.status,
          durationSec: normalized.durationSec,
          recordingUrl: normalized.recordingUrl ?? existingCall.recordingUrl,
          startedAt: normalized.startedAt ?? existingCall.startedAt,
          answeredAt: normalized.answeredAt ?? existingCall.answeredAt,
          endedAt: normalized.endedAt ?? existingCall.endedAt,
          rawPayloadJson: JSON.stringify(normalized.raw),
          updatedAt: now,
        })
        .where(eq(calls.id, existingCall.id));

      // Update the corresponding message entry
      if (normalized.externalCallId) {
        await db
          .update(messages)
          .set({
            status: normalized.status,
            body: bodyText,
            text: bodyText,
            mediaUrl: normalized.recordingUrl ?? null,
            updatedAt: now,
          })
          .where(eq(messages.externalId, normalized.externalCallId));
      }
    } else {
      // Create new call record from webhook
      const [newCall] = await db
        .insert(calls)
        .values({
          leadId: effectiveLeadId,
          contactId: contact?.id ?? null,
          direction: normalized.direction,
          status: normalized.status,
          durationSec: normalized.durationSec,
          recordingUrl: normalized.recordingUrl,
          calledAt: normalized.startedAt ?? now,
          externalCallId: normalized.externalCallId,
          clientPhone: phoneToSearch || null,
          provider: "onlinepbx",
          startedAt: normalized.startedAt,
          answeredAt: normalized.answeredAt,
          endedAt: normalized.endedAt,
          rawPayloadJson: JSON.stringify(normalized.raw),
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      // Insert a message so it appears in AmoFeed
      if (effectiveLeadId) {
        await db.insert(messages).values({
          leadId: effectiveLeadId,
          contactId: contact?.id ?? null,
          channel: "phone",
          direction: normalized.direction,
          senderType: normalized.direction === "incoming" ? "client" : "manager",
          text: bodyText,
          body: bodyText,
          mediaType: "call",
          mediaUrl: normalized.recordingUrl ?? null,
          externalId: normalized.externalCallId ?? null,
          status: normalized.status,
          sentAt: normalized.startedAt ?? now,
          createdAt: now,
          updatedAt: now,
        });
      }

      // Auto-create callback task for missed incoming calls (skip if one already open)
      if (
        normalized.status === "missed" &&
        normalized.direction === "incoming" &&
        effectiveLeadId
      ) {
        const [existingCallback] = await db
          .select({ id: tasks.id })
          .from(tasks)
          .where(
            and(
              eq(tasks.leadId, effectiveLeadId),
              eq(tasks.title, "Перезвонить клиенту"),
              eq(tasks.status, "open"),
            )
          )
          .limit(1);

        if (!existingCallback) {
          const callbackDue = new Date(Date.now() + 15 * 60 * 1000).toISOString();
          const [newTask] = await db
            .insert(tasks)
            .values({
              leadId: effectiveLeadId,
              title: "Перезвонить клиенту",
              description: `Пропущенный звонок с номера ${phoneToSearch}`,
              dueAt: callbackDue,
              type: "call",
              priority: "high",
              status: "open",
              createdAt: now,
              updatedAt: now,
            })
            .returning();
          await writeLeadHistory(effectiveLeadId, "task.created", {
            taskId: newTask.id,
            title: newTask.title,
            dueAt: newTask.dueAt,
            auto: true,
            reason: "missed_call",
          });
        }
      }
    }

    // Write timeline event
    const actionKey =
      normalized.status === "missed"
        ? "call.missed"
        : normalized.direction === "incoming"
          ? "call.incoming"
          : "call.completed";

    await writeLeadHistory(effectiveLeadId, actionKey, {
      externalCallId: normalized.externalCallId,
      direction: normalized.direction,
      status: normalized.status,
      durationSec: normalized.durationSec,
      recordingUrl: normalized.recordingUrl,
      phone: phoneToSearch,
      message: bodyText,
    });

    res.json({ ok: true });
  } catch (error) {
    // Save raw payload even on error for debugging
    console.error("[onlinepbx-webhook]", error instanceof Error ? error.message : error);
    try {
      await db.insert(auditLogs).values({
        entityType: "webhook",
        entityId: null,
        action: "call.webhook_error",
        payloadJson: JSON.stringify({ error: error instanceof Error ? error.message : "unknown", raw: req.body }),
        createdAt: now,
      });
    } catch {
      // ignore secondary logging failure
    }
    res.status(500).json({ ok: false, error: "Webhook processing failed" });
  }
});

// ─── Server startup ───────────────────────────────────────────────────────────

async function ensureAuthSchema() {
  try {
    await db.run(sql.raw(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        user_agent TEXT,
        ip_address TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `));
  } catch { /* table already exists */ }
  try {
    await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS sessions_token_hash_idx ON sessions(token_hash)`));
  } catch { /* index already exists */ }
  try {
    await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id)`));
  } catch { /* index already exists */ }
  try {
    await db.run(sql.raw(`ALTER TABLE users ADD COLUMN last_login_at TEXT`));
  } catch { /* column already exists */ }
}

async function ensureAiSchema() {
  const alterStatements = [
    "ALTER TABLE chat_conversations ADD COLUMN ai_paused_until TEXT",
    "ALTER TABLE chat_conversations ADD COLUMN ai_pause_reason TEXT"
  ];
  for (const stmt of alterStatements) {
    try {
      await db.run(sql.raw(stmt));
    } catch {
      // Column already exists — safe to ignore
    }
  }
  // Create AI tables (idempotent)
  try {
    await db.run(sql.raw(`
      CREATE TABLE IF NOT EXISTS ai_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER REFERENCES chat_conversations(id),
        lead_id INTEGER REFERENCES leads(id),
        contact_id INTEGER REFERENCES contacts(id),
        message_id INTEGER REFERENCES messages(id),
        direction TEXT NOT NULL DEFAULT 'request',
        status TEXT NOT NULL DEFAULT 'pending',
        reason TEXT,
        request_json TEXT,
        response_json TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `));
  } catch { /* already exists */ }
  try {
    await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS ai_events_conversation_idx ON ai_events(conversation_id)`));
    await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS ai_events_lead_idx ON ai_events(lead_id)`));
  } catch { /* already exists */ }
  try {
    await db.run(sql.raw(`
      CREATE TABLE IF NOT EXISTS ai_suggestions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER REFERENCES chat_conversations(id),
        lead_id INTEGER REFERENCES leads(id),
        contact_id INTEGER REFERENCES contacts(id),
        source_message_id INTEGER REFERENCES messages(id),
        reply_text TEXT,
        confidence REAL,
        status TEXT NOT NULL DEFAULT 'draft',
        suggested_actions_json TEXT,
        reviewed_by_user_id INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `));
  } catch { /* already exists */ }
  try {
    await db.run(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS ai_suggestions_source_msg_idx ON ai_suggestions(source_message_id) WHERE source_message_id IS NOT NULL`));
    await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS ai_suggestions_conversation_idx ON ai_suggestions(conversation_id)`));
    await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS ai_suggestions_status_idx ON ai_suggestions(status)`));
  } catch { /* already exists */ }
  try {
    await db.run(sql.raw(`
      CREATE TABLE IF NOT EXISTS ai_action_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        suggestion_id INTEGER REFERENCES ai_suggestions(id),
        lead_id INTEGER REFERENCES leads(id),
        conversation_id INTEGER REFERENCES chat_conversations(id),
        action_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        payload_json TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `));
  } catch { /* already exists */ }
}

function logAiManagerStartupWarnings() {
  const aiCfg = getAiManagerConfig();
  if (!aiCfg.enabled) return; // Silent when disabled — expected default

  if (!aiCfg.dryRun && !aiCfg.baseUrl) {
    console.warn("[AI] WARNING: AI_MANAGER_ENABLED=true and AI_MANAGER_DRY_RUN=false but AI_MANAGER_BASE_URL is not set. Real AI calls will fail.");
  }
  if (!aiCfg.dryRun && !aiCfg.hasApiKey) {
    console.warn("[AI] WARNING: AI_MANAGER_API_KEY is not set. Requests to AI Manager will have no Authorization header.");
  }
  if (aiCfg.dryRun) {
    console.log("[AI] DRY-RUN mode: AI Manager calls are simulated locally. Set AI_MANAGER_DRY_RUN=false for real AI.");
  } else {
    console.log(`[AI] REAL mode: AI Manager at ${aiCfg.baseUrl}${aiCfg.endpoint}`);
  }
  if (aiCfg.autoSend) {
    const wappiCfg = getWappiConfig();
    if (!wappiCfg.enabled) {
      console.warn("[AI] WARNING: AI_MANAGER_AUTO_SEND=true but WAPPI is disabled. Auto-sent AI messages will be saved locally only (no real WhatsApp delivery).");
    }
    // Critical: duplicate-send warning when auto-send is enabled
    console.warn("[AI] WARNING: AI_MANAGER_AUTO_SEND=true — CRITICAL: ensure your AI Manager does NOT send WhatsApp directly, or clients will receive duplicate messages.");
  }
  if (aiCfg.autoActions) {
    console.warn("[AI] WARNING: AI_MANAGER_AUTO_ACTIONS=true — auto-actions are enabled. Ensure action types are safe before production use.");
  }
}

async function ensureWappiSchema() {
  // DB-level duplicate prevention: one row per unique externalMessageId (nulls allowed to coexist)
  try {
    await db.run(sql.raw(
      `CREATE UNIQUE INDEX IF NOT EXISTS messages_ext_id_unique_idx ON messages(external_message_id) WHERE external_message_id IS NOT NULL`
    ));
  } catch { /* index already exists */ }
  // Fast contact lookup by phone
  try {
    await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS contacts_phone_idx ON contacts(phone)`));
  } catch { /* already exists */ }
}

async function main() {
  await ensureTelephonySchema();
  await ensureAuthSchema();
  await ensureAiSchema();
  await ensureWappiSchema();
  logAiManagerStartupWarnings();
  app.listen(port, () => {
    console.log(`Bakha CRM API listening on http://localhost:${port}`);
  });
}

main().catch((err: unknown) => {
  console.error("Server startup failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
