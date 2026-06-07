import { relations, sql } from "drizzle-orm";
import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)
};

export const roles = sqliteTable("roles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  ...timestamps
});

export const permissions = sqliteTable("permissions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  roleId: integer("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  resource: text("resource").notNull(),
  action: text("action").notNull(),
  ...timestamps
});

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  amoId: integer("amo_id"),
  roleId: integer("role_id").notNull().references(() => roles.id),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  phone: text("phone"),
  avatarUrl: text("avatar_url"),
  status: text("status").notNull().default("active"),
  lastLoginAt: text("last_login_at"),
  rawJson: text("raw_json"),
  ...timestamps
});

export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  revokedAt: text("revoked_at"),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  ...timestamps
});

export const pipelines = sqliteTable("pipelines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  amoId: integer("amo_id"),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  rawJson: text("raw_json"),
  ...timestamps
});

export const stages = sqliteTable("stages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  amoId: integer("amo_id"),
  pipelineId: integer("pipeline_id").notNull().references(() => pipelines.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  code: text("code").notNull(),
  color: text("color").notNull().default("#f97316"),
  sortOrder: integer("sort_order").notNull().default(0),
  isSuccess: integer("is_success", { mode: "boolean" }).notNull().default(false),
  isFailure: integer("is_failure", { mode: "boolean" }).notNull().default(false),
  rawJson: text("raw_json"),
  ...timestamps
});

export const contacts = sqliteTable("contacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  amoId: integer("amo_id"),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  city: text("city"),
  address: text("address"),
  source: text("source"),
  rawJson: text("raw_json"),
  ...timestamps
});

export const leads = sqliteTable("leads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  amoId: integer("amo_id"),
  title: text("title").notNull(),
  leadNumber: text("lead_number").notNull().unique(),
  pipelineId: integer("pipeline_id").notNull().references(() => pipelines.id),
  stageId: integer("stage_id").notNull().references(() => stages.id),
  responsibleId: integer("responsible_id").references(() => users.id),
  budget: real("budget").notNull().default(0),
  source: text("source").notNull().default("Не указан"),
  status: text("status").notNull().default("active"),
  contractNumber: text("contract_number"),
  region: text("region"),
  address: text("address"),
  area: real("area"),
  repairStage: text("repair_stage"),
  measurementAt: text("measurement_at"),
  closestTaskAt: text("closest_task_at"),
  measurerId: integer("measurer_id").references(() => users.id),
  measurerName: text("measurer_name"),
  installerId: integer("installer_id").references(() => users.id),
  installerName: text("installer_name"),
  refusalReason: text("refusal_reason"),
  paymentStatus: text("payment_status"),
  daysInStage: integer("days_in_stage").notNull().default(0),
  rawJson: text("raw_json"),
  ...timestamps
});

export const leadContacts = sqliteTable(
  "lead_contacts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    leadId: integer("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    contactId: integer("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
    ...timestamps
  },
  (table) => ({
    uniqueLeadContact: uniqueIndex("lead_contacts_lead_contact_idx").on(table.leadId, table.contactId)
  })
);

export const customFields = sqliteTable("custom_fields", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  amoId: integer("amo_id"),
  entityType: text("entity_type").notNull(),
  name: text("name").notNull(),
  code: text("code").notNull(),
  fieldType: text("field_type").notNull(),
  optionsJson: text("options_json"),
  isRequired: integer("is_required", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  rawJson: text("raw_json"),
  ...timestamps
});

export const leadCustomValues = sqliteTable("lead_custom_values", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leadId: integer("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  customFieldId: integer("custom_field_id").notNull().references(() => customFields.id, { onDelete: "cascade" }),
  value: text("value"),
  ...timestamps
});

export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  amoId: integer("amo_id"),
  leadId: integer("lead_id").references(() => leads.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  dueAt: text("due_at").notNull(),
  assigneeId: integer("assignee_id").references(() => users.id),
  type: text("type").notNull().default("call"),
  priority: text("priority").notNull().default("normal"),
  status: text("status").notNull().default("open"),
  completedAt: text("completed_at"),
  rawJson: text("raw_json"),
  ...timestamps
});

export const notes = sqliteTable("notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  amoId: integer("amo_id"),
  leadId: integer("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  authorId: integer("author_id").references(() => users.id),
  body: text("body").notNull(),
  rawJson: text("raw_json"),
  ...timestamps
});

export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leadId: integer("lead_id").references(() => leads.id, { onDelete: "cascade" }),
  contactId: integer("contact_id").references(() => contacts.id),
  channel: text("channel").notNull().default("wappi"),
  direction: text("direction").notNull(),
  senderType: text("sender_type").notNull().default("client"),
  text: text("text"),
  body: text("body").notNull(),
  mediaUrl: text("media_url"),
  mediaType: text("media_type"),
  externalMessageId: text("external_message_id"),
  externalId: text("external_id"),
  status: text("status").notNull().default("received"),
  rawJson: text("raw_json"),
  sentAt: text("sent_at").notNull(),
  ...timestamps
});

export const chatConversations = sqliteTable("chat_conversations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leadId: integer("lead_id").references(() => leads.id, { onDelete: "cascade" }),
  contactId: integer("contact_id").references(() => contacts.id),
  phone: text("phone").notNull(),
  channel: text("channel").notNull().default("wappi"),
  status: text("status").notNull().default("open"),
  unreadCount: integer("unread_count").notNull().default(0),
  lastMessageAt: text("last_message_at"),
  aiPaused: integer("ai_paused", { mode: "boolean" }).notNull().default(true),
  aiPausedUntil: text("ai_paused_until"),
  aiPauseReason: text("ai_pause_reason"),
  rawJson: text("raw_json"),
  ...timestamps
});

export const calls = sqliteTable("calls", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leadId: integer("lead_id").references(() => leads.id, { onDelete: "cascade" }),
  contactId: integer("contact_id").references(() => contacts.id),
  userId: integer("user_id").references(() => users.id),
  direction: text("direction").notNull(),
  status: text("status").notNull(),
  durationSec: integer("duration_sec").notNull().default(0),
  recordingUrl: text("recording_url"),
  calledAt: text("called_at").notNull(),
  // onlinePBX extended fields — added via migration 0004_onlinepbx.sql
  externalCallId: text("external_call_id"),
  managerExtension: text("manager_extension"),
  clientPhone: text("client_phone"),
  provider: text("provider").notNull().default("onlinepbx"),
  rawPayloadJson: text("raw_payload_json"),
  errorMessage: text("error_message"),
  startedAt: text("started_at"),
  answeredAt: text("answered_at"),
  endedAt: text("ended_at"),
  ...timestamps
});

/** Maps CRM users to their onlinePBX extension numbers. */
export const pbxUserMappings = sqliteTable("pbx_user_mappings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  crmUserId: integer("crm_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  onlinepbxExtension: text("onlinepbx_extension").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  ...timestamps
});

export const files = sqliteTable("files", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leadId: integer("lead_id").references(() => leads.id, { onDelete: "cascade" }),
  uploadedById: integer("uploaded_by_id").references(() => users.id),
  name: text("name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull().default(0),
  url: text("url").notNull(),
  ...timestamps
});

export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actorId: integer("actor_id").references(() => users.id),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id"),
  action: text("action").notNull(),
  payloadJson: text("payload_json"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const integrations = sqliteTable("integrations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  status: text("status").notNull().default("disabled"),
  configJson: text("config_json"),
  ...timestamps
});

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  valueJson: text("value_json").notNull(),
  ...timestamps
});

/** Internal notification for a CRM user (task assignments, mentions, etc.). */
export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  actorId: integer("actor_id"),
  type: text("type").notNull().default("info"),
  title: text("title").notNull(),
  body: text("body"),
  entityType: text("entity_type"),
  entityId: integer("entity_id"),
  link: text("link"),
  readAt: text("read_at"),
  /** Unique deduplication key — insert silently fails if duplicate. */
  dedupeKey: text("dedupe_key"),
  ...timestamps
});

/** Records every AI Manager request, response, error, and skip. */
export const aiEvents = sqliteTable("ai_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  conversationId: integer("conversation_id").references(() => chatConversations.id),
  leadId: integer("lead_id").references(() => leads.id),
  contactId: integer("contact_id").references(() => contacts.id),
  messageId: integer("message_id").references(() => messages.id),
  direction: text("direction").notNull().default("request"),
  status: text("status").notNull().default("pending"),
  reason: text("reason"),
  requestJson: text("request_json"),
  responseJson: text("response_json"),
  errorMessage: text("error_message"),
  ...timestamps
});

/** Draft AI reply suggestions awaiting manager review. */
export const aiSuggestions = sqliteTable("ai_suggestions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  conversationId: integer("conversation_id").references(() => chatConversations.id),
  leadId: integer("lead_id").references(() => leads.id),
  contactId: integer("contact_id").references(() => contacts.id),
  sourceMessageId: integer("source_message_id").references(() => messages.id),
  replyText: text("reply_text"),
  confidence: real("confidence"),
  status: text("status").notNull().default("draft"),
  suggestedActionsJson: text("suggested_actions_json"),
  reviewedByUserId: integer("reviewed_by_user_id").references(() => users.id),
  ...timestamps
});

/** Log of each AI-suggested CRM action and its outcome. */
export const aiActionLogs = sqliteTable("ai_action_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  suggestionId: integer("suggestion_id").references(() => aiSuggestions.id),
  leadId: integer("lead_id").references(() => leads.id),
  conversationId: integer("conversation_id").references(() => chatConversations.id),
  actionType: text("action_type").notNull(),
  status: text("status").notNull().default("pending"),
  payloadJson: text("payload_json"),
  errorMessage: text("error_message"),
  ...timestamps
});

/** Task type definitions — system defaults + admin-created custom types. */
export const taskTypes = sqliteTable("task_types", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  label: text("label").notNull(),
  icon: text("icon").notNull().default("check"),
  color: text("color").notNull().default("gray"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
  createdBy: integer("created_by"),
  ...timestamps
});

/** Automation rules: auto-create tasks when deals enter stages or are created. */
export const taskAutomationRules = sqliteTable("task_automation_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
  triggerType: text("trigger_type").notNull().default("lead_entered_stage"),
  stageId: integer("stage_id"),
  source: text("source"),
  delayMinutes: integer("delay_minutes").notNull().default(0),
  taskTypeCode: text("task_type_code").notNull().default("call"),
  titleTemplate: text("title_template").notNull(),
  commentTemplate: text("comment_template"),
  assigneeMode: text("assignee_mode").notNull().default("responsible"),
  fixedUserId: integer("fixed_user_id"),
  createdBy: integer("created_by"),
  ...timestamps
});

/** Deduplification log — prevents same rule from firing twice for the same lead+stage. */
export const taskAutomationRuns = sqliteTable("task_automation_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ruleId: integer("rule_id").notNull(),
  leadId: integer("lead_id"),
  stageId: integer("stage_id"),
  dedupeKey: text("dedupe_key").notNull().unique(),
  createdTaskId: integer("created_task_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const usersRelations = relations(users, ({ one, many }) => ({
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
  leads: many(leads),
  tasks: many(tasks)
}));

export const leadsRelations = relations(leads, ({ one, many }) => ({
  pipeline: one(pipelines, { fields: [leads.pipelineId], references: [pipelines.id] }),
  stage: one(stages, { fields: [leads.stageId], references: [stages.id] }),
  responsible: one(users, { fields: [leads.responsibleId], references: [users.id] }),
  contacts: many(leadContacts),
  tasks: many(tasks),
  notes: many(notes)
}));
