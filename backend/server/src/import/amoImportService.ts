import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { databaseUrl } from "../../../../db/client.js";

export type AmoImportMode = "dry-run" | "import";

export type AmoImportStats = {
  users: number;
  pipelines: number;
  stages: number;
  leads: number;
  contacts: number;
  leadContacts: number;
  tasks: number;
  notes: number;
  customFields: number;
  customValues: number;
  errors: number;
};

export type AmoImportResult = {
  mode: AmoImportMode | "stats" | "verify";
  sourceDbPath: string;
  stats: AmoImportStats;
  errors: Array<{ scope: string; amoId?: string | number | null; message: string }>;
  startedAt: string;
  finishedAt: string;
};

export type AmoImportVerifyResult = AmoImportResult & {
  matched: boolean;
  checks: Record<"leads" | "contacts" | "tasks" | "notes", { source: number; crm: number; matched: boolean }>;
};

type Row = Record<string, unknown>;

const emptyStats = (): AmoImportStats => ({
  users: 0,
  pipelines: 0,
  stages: 0,
  leads: 0,
  contacts: 0,
  leadContacts: 0,
  tasks: 0,
  notes: 0,
  customFields: 0,
  customValues: 0,
  errors: 0
});

const hashPassword = (password: string) => createHash("sha256").update(password).digest("hex");
const toInt = (value: unknown) => (value === null || value === undefined || value === "" ? null : Number(value));
const toText = (value: unknown) => (value === null || value === undefined ? null : String(value));
const toIso = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return new Date(value > 10_000_000_000 ? value : value * 1000).toISOString();
  if (typeof value === "string" && /^\d+$/.test(value)) return new Date(Number(value) * 1000).toISOString();
  return String(value);
};
const codeFromName = (name: string, fallback: string) =>
  name
    .toLowerCase()
    .replaceAll(" ", "_")
    .replaceAll("-", "_")
    .replace(/[^\p{L}\p{N}_]+/gu, "") || fallback;

function resolveImportDbPath() {
  const candidates = [
    process.env.AMO_IMPORT_DB_PATH,
    path.resolve(process.cwd(), "../amo-crm-importer/data/amo-importer.db"),
    "C:/Users/kanazxz/Downloads/amo-crm-importer/amo-crm-importer/data/local.db"
  ].filter(Boolean) as string[];
  const found = candidates.find((candidate) => existsSync(candidate));
  return found ?? candidates[0];
}

function parseJsonArray(value: unknown): Row[] {
  if (!value) return [];
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function customFieldValue(field: Row) {
  const values = Array.isArray(field.values) ? (field.values as Row[]) : [];
  if (!values.length) return null;
  const first = values[0]?.value;
  if (first === null || first === undefined) return null;
  if (typeof first === "number") return toIso(first);
  return String(first);
}

function getNamedCustomValue(fields: Row[], matchers: string[]) {
  const found = fields.find((field) => {
    const name = String(field.field_name ?? field.name ?? "").toLowerCase();
    return matchers.some((matcher) => name.includes(matcher));
  });
  return found ? customFieldValue(found) : null;
}

function normalizeLeadCustomFields(fields: Row[]) {
  return {
    contractNumber: getNamedCustomValue(fields, ["номер договора", "договор"]),
    region: getNamedCustomValue(fields, ["регион"]),
    source: getNamedCustomValue(fields, ["источник"]),
    area: Number(getNamedCustomValue(fields, ["площадь"]) ?? 0) || null,
    repairStage: getNamedCustomValue(fields, ["стадия"]),
    measurementAt: getNamedCustomValue(fields, ["дата замер", "дата замера"]),
    address: getNamedCustomValue(fields, ["адрес"]),
    measurerName: getNamedCustomValue(fields, ["замерщик"]),
    installerName: getNamedCustomValue(fields, ["установщик", "монтажник"]),
    refusalReason: getNamedCustomValue(fields, ["причина отказ", "отказ"]),
    paymentStatus: getNamedCustomValue(fields, ["оплата", "долг"])
  };
}

async function tableCount(client: Client, table: string) {
  const result = await client.execute(`SELECT count(*) as count FROM ${JSON.stringify(table)}`);
  return Number(result.rows[0]?.count ?? 0);
}

async function rows(client: Client, table: string) {
  const result = await client.execute(`SELECT * FROM ${JSON.stringify(table)}`);
  return result.rows as Row[];
}

async function ensureManagerRole(target: Client) {
  await target.execute({
    sql: "INSERT OR IGNORE INTO roles (name, title, description) VALUES (?, ?, ?)",
    args: ["manager", "Менеджер", "Imported AmoCRM manager role"]
  });
  const role = await target.execute({ sql: "SELECT id FROM roles WHERE name = ?", args: ["manager"] });
  return Number(role.rows[0].id);
}

async function idByAmo(target: Client, table: string, amoId: unknown) {
  if (!amoId) return null;
  const result = await target.execute({ sql: `SELECT id FROM ${table} WHERE amo_id = ?`, args: [Number(amoId)] });
  return result.rows[0]?.id ? Number(result.rows[0].id) : null;
}

async function stageIdByAmo(target: Client, stageAmoId: unknown, pipelineAmoId: unknown) {
  if (!stageAmoId || !pipelineAmoId) return null;
  const result = await target.execute({
    sql: "SELECT s.id FROM stages s INNER JOIN pipelines p ON p.id = s.pipeline_id WHERE s.amo_id = ? AND p.amo_id = ?",
    args: [Number(stageAmoId), Number(pipelineAmoId)]
  });
  return result.rows[0]?.id ? Number(result.rows[0].id) : null;
}

async function upsertByAmo(target: Client, table: string, amoId: unknown, insertColumns: string[], values: unknown[], updateColumns: string[]) {
  const existingId = await idByAmo(target, table, amoId);
  if (existingId) {
    await target.execute({
      sql: `UPDATE ${table} SET ${updateColumns.map((column) => `${column} = ?`).join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      args: [...updateColumns.map((column) => values[insertColumns.indexOf(column)]), existingId] as never
    });
    return existingId;
  }
  const result = await target.execute({
    sql: `INSERT INTO ${table} (${insertColumns.join(", ")}) VALUES (${insertColumns.map(() => "?").join(", ")}) RETURNING id`,
    args: values as never
  });
  return Number(result.rows[0].id);
}

export async function getAmoImportStats(): Promise<AmoImportResult> {
  const startedAt = new Date().toISOString();
  const sourceDbPath = resolveImportDbPath();
  const stats = emptyStats();
  const errors: AmoImportResult["errors"] = [];

  if (!existsSync(sourceDbPath)) {
    errors.push({ scope: "stats", message: `Amo import DB not found: ${sourceDbPath}` });
    return { mode: "stats", sourceDbPath, stats, errors, startedAt, finishedAt: new Date().toISOString() };
  }

  const source = createClient({ url: `file:${sourceDbPath}` });
  try {
    stats.users = await tableCount(source, "users");
    stats.pipelines = await tableCount(source, "pipelines");
    stats.stages = await tableCount(source, "stages");
    stats.leads = await tableCount(source, "leads");
    stats.contacts = await tableCount(source, "contacts");
    stats.leadContacts = await tableCount(source, "lead_contacts");
    stats.tasks = await tableCount(source, "tasks");
    stats.notes = await tableCount(source, "notes");
    stats.customFields = await tableCount(source, "custom_fields");
  } catch (error) {
    errors.push({ scope: "stats", message: error instanceof Error ? error.message : String(error) });
  } finally {
    await source.close();
  }

  stats.errors = errors.length;
  return { mode: "stats", sourceDbPath, stats, errors, startedAt, finishedAt: new Date().toISOString() };
}

async function crmAmoCount(target: Client, table: string) {
  const result = await target.execute(`SELECT count(*) as count FROM ${JSON.stringify(table)} WHERE amo_id IS NOT NULL`);
  return Number(result.rows[0]?.count ?? 0);
}

export async function verifyAmoImport(): Promise<AmoImportVerifyResult> {
  const startedAt = new Date().toISOString();
  const sourceStats = await getAmoImportStats();
  const target = createClient({ url: databaseUrl });
  const errors: AmoImportResult["errors"] = [...sourceStats.errors];
  const checks = {
    leads: { source: sourceStats.stats.leads, crm: 0, matched: false },
    contacts: { source: sourceStats.stats.contacts, crm: 0, matched: false },
    tasks: { source: sourceStats.stats.tasks, crm: 0, matched: false },
    notes: { source: sourceStats.stats.notes, crm: 0, matched: false }
  };

  try {
    checks.leads.crm = await crmAmoCount(target, "leads");
    checks.contacts.crm = await crmAmoCount(target, "contacts");
    checks.tasks.crm = await crmAmoCount(target, "tasks");
    checks.notes.crm = await crmAmoCount(target, "notes");
    for (const check of Object.values(checks)) check.matched = check.source === check.crm;
  } catch (error) {
    errors.push({ scope: "verify", message: error instanceof Error ? error.message : String(error) });
  } finally {
    await target.close();
  }

  const matched = Object.values(checks).every((check) => check.matched) && errors.length === 0;
  return {
    mode: "verify",
    sourceDbPath: sourceStats.sourceDbPath,
    stats: { ...sourceStats.stats, errors: errors.length },
    errors,
    checks,
    matched,
    startedAt,
    finishedAt: new Date().toISOString()
  };
}

export async function runAmoImport(mode: AmoImportMode = "import"): Promise<AmoImportResult> {
  const startedAt = new Date().toISOString();
  const sourceDbPath = resolveImportDbPath();
  const errors: AmoImportResult["errors"] = [];
  const stats = emptyStats();
  const fail = (scope: string, amoId: unknown, error: unknown) => {
    errors.push({ scope, amoId: toText(amoId), message: error instanceof Error ? error.message : String(error) });
    stats.errors += 1;
  };

  if (!existsSync(sourceDbPath)) {
    fail("init", null, `Amo import DB not found: ${sourceDbPath}`);
    return { mode, sourceDbPath, stats, errors, startedAt, finishedAt: new Date().toISOString() };
  }

  const source = createClient({ url: `file:${sourceDbPath}` });
  const target = createClient({ url: databaseUrl });

  try {
    await source.execute("PRAGMA busy_timeout = 10000");
    await target.execute("PRAGMA busy_timeout = 10000");
    const sourceStats = await getAmoImportStats();
    Object.assign(stats, sourceStats.stats);
    if (mode === "dry-run") {
      return { mode, sourceDbPath, stats, errors, startedAt, finishedAt: new Date().toISOString() };
    }

    await target.execute("PRAGMA foreign_keys = ON");
    const managerRoleId = await ensureManagerRole(target);

    for (const user of await rows(source, "users")) {
      try {
        await upsertByAmo(
          target,
          "users",
          user.amo_id,
          ["amo_id", "role_id", "name", "email", "password_hash", "status", "raw_json", "created_at", "updated_at"],
          [
            toInt(user.amo_id),
            managerRoleId,
            toText(user.name) ?? `Amo user ${user.amo_id}`,
            toText(user.email) ?? `amo-${user.amo_id}@amo.local`,
            hashPassword("amo-imported"),
            user.is_active === 0 ? "inactive" : "active",
            toText(user.raw_json),
            new Date().toISOString(),
            new Date().toISOString()
          ],
          ["role_id", "name", "email", "status", "raw_json"]
        );
      } catch (error) {
        fail("users", user.amo_id, error);
      }
    }

    for (const pipeline of await rows(source, "pipelines")) {
      try {
        const name = toText(pipeline.name) ?? `Pipeline ${pipeline.amo_id}`;
        const code = name.toLowerCase().includes("замер") ? `amo_measurement_${pipeline.amo_id}` : name.toLowerCase().includes("отдел продаж") ? `amo_sales_${pipeline.amo_id}` : `amo_${pipeline.amo_id}`;
        await upsertByAmo(
          target,
          "pipelines",
          pipeline.amo_id,
          ["amo_id", "name", "code", "description", "sort_order", "raw_json", "created_at", "updated_at"],
          [toInt(pipeline.amo_id), name, code, "Imported from AmoCRM", Number(pipeline.sort ?? 0), toText(pipeline.raw_json), new Date().toISOString(), new Date().toISOString()],
          ["name", "code", "description", "sort_order", "raw_json"]
        );
      } catch (error) {
        fail("pipelines", pipeline.amo_id, error);
      }
    }

    for (const stage of await rows(source, "stages")) {
      try {
        const pipelineId = await idByAmo(target, "pipelines", stage.pipeline_amo_id);
        if (!pipelineId) throw new Error(`Missing pipeline for stage ${stage.amo_id}`);
        const name = toText(stage.name) ?? `Stage ${stage.amo_id}`;
        const existingStageId = await stageIdByAmo(target, stage.amo_id, stage.pipeline_amo_id);
        const values = [toInt(stage.amo_id), pipelineId, name, codeFromName(name, `amo_${stage.amo_id}`), toText(stage.color) ?? "#f97316", Number(stage.sort ?? 0), name.toLowerCase().includes("успеш"), name.toLowerCase().includes("закрыто") || name.toLowerCase().includes("отказ"), toText(stage.raw_json), new Date().toISOString(), new Date().toISOString()];
        if (existingStageId) {
          await target.execute({
            sql: "UPDATE stages SET pipeline_id = ?, name = ?, code = ?, color = ?, sort_order = ?, is_success = ?, is_failure = ?, raw_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            args: [pipelineId, name, codeFromName(name, `amo_${stage.amo_id}`), toText(stage.color) ?? "#f97316", Number(stage.sort ?? 0), name.toLowerCase().includes("успеш"), name.toLowerCase().includes("закрыто") || name.toLowerCase().includes("отказ"), toText(stage.raw_json), existingStageId]
          });
        } else {
          await target.execute({
            sql: "INSERT INTO stages (amo_id, pipeline_id, name, code, color, sort_order, is_success, is_failure, raw_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            args: values
          });
        }
      } catch (error) {
        fail("stages", stage.amo_id, error);
      }
    }

    for (const field of await rows(source, "custom_fields")) {
      try {
        await upsertByAmo(
          target,
          "custom_fields",
          field.amo_id,
          ["amo_id", "entity_type", "name", "code", "field_type", "options_json", "is_required", "sort_order", "raw_json", "created_at", "updated_at"],
          [toInt(field.amo_id), toText(field.entity_type) ?? "leads", toText(field.name) ?? `Field ${field.amo_id}`, toText(field.code) ?? `amo_${field.amo_id}`, toText(field.field_type) ?? "text", null, 0, Number(field.sort ?? 0), toText(field.raw_json), new Date().toISOString(), new Date().toISOString()],
          ["entity_type", "name", "code", "field_type", "options_json", "sort_order", "raw_json"]
        );
      } catch (error) {
        fail("custom_fields", field.amo_id, error);
      }
    }

    for (const contact of await rows(source, "contacts")) {
      try {
        await upsertByAmo(
          target,
          "contacts",
          contact.amo_id,
          ["amo_id", "name", "phone", "email", "source", "raw_json", "created_at", "updated_at"],
          [toInt(contact.amo_id), toText(contact.name) ?? `Contact ${contact.amo_id}`, toText(contact.first_phone) ?? "", null, "AmoCRM", toText(contact.raw_json), toIso(contact.created_at_amo) ?? new Date().toISOString(), toIso(contact.updated_at_amo) ?? new Date().toISOString()],
          ["name", "phone", "email", "source", "raw_json"]
        );
      } catch (error) {
        fail("contacts", contact.amo_id, error);
      }
    }

    const fieldIdByAmo = new Map<number, number>();
    for (const row of (await target.execute("SELECT id, amo_id FROM custom_fields WHERE amo_id IS NOT NULL")).rows) fieldIdByAmo.set(Number(row.amo_id), Number(row.id));

    for (const lead of await rows(source, "leads")) {
      try {
        const pipelineId = await idByAmo(target, "pipelines", lead.pipeline_amo_id);
        const stageId = await stageIdByAmo(target, lead.stage_amo_id, lead.pipeline_amo_id);
        if (!pipelineId || !stageId) throw new Error(`Missing pipeline/stage for lead ${lead.amo_id}`);
        const responsibleId = await idByAmo(target, "users", lead.responsible_user_id);
        const customFields = parseJsonArray(lead.custom_fields_json);
        const normalized = normalizeLeadCustomFields(customFields);
        const leadId = await upsertByAmo(
          target,
          "leads",
          lead.amo_id,
          ["amo_id", "title", "lead_number", "pipeline_id", "stage_id", "responsible_id", "budget", "source", "status", "contract_number", "region", "address", "area", "repair_stage", "measurement_at", "closest_task_at", "measurer_name", "installer_name", "refusal_reason", "payment_status", "days_in_stage", "raw_json", "created_at", "updated_at"],
          [toInt(lead.amo_id), toText(lead.name) ?? `Amo lead ${lead.amo_id}`, `AMO-${lead.amo_id}`, pipelineId, stageId, responsibleId, Number(lead.price ?? 0), normalized.source ?? "AmoCRM", lead.closed_at_amo ? "closed" : "active", normalized.contractNumber, normalized.region, normalized.address, normalized.area, normalized.repairStage, normalized.measurementAt, toIso(lead.closest_task_at_amo), normalized.measurerName, normalized.installerName, normalized.refusalReason, normalized.paymentStatus, 0, toText(lead.raw_json), toIso(lead.created_at_amo) ?? new Date().toISOString(), toIso(lead.updated_at_amo) ?? new Date().toISOString()],
          ["title", "pipeline_id", "stage_id", "responsible_id", "budget", "source", "status", "contract_number", "region", "address", "area", "repair_stage", "measurement_at", "closest_task_at", "measurer_name", "installer_name", "refusal_reason", "payment_status", "raw_json"]
        );

        for (const field of customFields) {
          const fieldAmoId = toInt(field.field_id);
          const customFieldId = fieldAmoId ? fieldIdByAmo.get(fieldAmoId) : null;
          const value = customFieldValue(field);
          if (!customFieldId || value === null) continue;
          await target.execute({
            sql: "INSERT INTO lead_custom_values (lead_id, custom_field_id, value) VALUES (?, ?, ?) ON CONFLICT(lead_id, custom_field_id) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP",
            args: [leadId, customFieldId, value]
          });
          stats.customValues += 1;
        }
      } catch (error) {
        fail("leads", lead.amo_id, error);
      }
    }

    for (const link of await rows(source, "lead_contacts")) {
      try {
        const leadId = await idByAmo(target, "leads", link.lead_amo_id);
        const contactId = await idByAmo(target, "contacts", link.contact_amo_id);
        if (!leadId || !contactId) continue;
        await target.execute({
          sql: "INSERT OR IGNORE INTO lead_contacts (lead_id, contact_id, is_primary) VALUES (?, ?, ?)",
          args: [leadId, contactId, Number(link.is_main ?? 0)]
        });
      } catch (error) {
        fail("lead_contacts", `${link.lead_amo_id}:${link.contact_amo_id}`, error);
      }
    }

    for (const task of await rows(source, "tasks")) {
      try {
        if (task.entity_type !== "leads") continue;
        const leadId = await idByAmo(target, "leads", task.entity_amo_id);
        if (!leadId) continue;
        const assigneeId = await idByAmo(target, "users", task.responsible_user_id);
        await upsertByAmo(
          target,
          "tasks",
          task.amo_id,
          ["amo_id", "lead_id", "title", "description", "due_at", "assignee_id", "type", "priority", "status", "completed_at", "raw_json", "created_at", "updated_at"],
          [toInt(task.amo_id), leadId, toText(task.text) || "Задача AmoCRM", toText(task.result_text), toIso(task.complete_till_amo) ?? new Date().toISOString(), assigneeId, `amo_${task.task_type_id ?? "task"}`, "normal", task.is_completed ? "done" : "open", task.is_completed ? toIso(task.complete_till_amo) : null, toText(task.raw_json), new Date().toISOString(), new Date().toISOString()],
          ["lead_id", "title", "description", "due_at", "assignee_id", "type", "priority", "status", "completed_at", "raw_json"]
        );
      } catch (error) {
        fail("tasks", task.amo_id, error);
      }
    }

    for (const note of await rows(source, "notes")) {
      try {
        if (note.entity_type !== "leads") continue;
        const leadId = await idByAmo(target, "leads", note.entity_amo_id);
        if (!leadId) continue;
        const authorId = await idByAmo(target, "users", note.responsible_user_id ?? note.created_by);
        await upsertByAmo(
          target,
          "notes",
          note.amo_id,
          ["amo_id", "lead_id", "author_id", "body", "raw_json", "created_at", "updated_at"],
          [toInt(note.amo_id), leadId, authorId, toText(note.text) || toText(note.note_type) || "AmoCRM note", toText(note.raw_json), toIso(note.created_at_amo) ?? new Date().toISOString(), toIso(note.updated_at_amo) ?? new Date().toISOString()],
          ["lead_id", "author_id", "body", "raw_json"]
        );
      } catch (error) {
        fail("notes", note.amo_id, error);
      }
    }

    await target.execute({
      sql: "INSERT INTO audit_logs (entity_type, action, payload_json) VALUES (?, ?, ?)",
      args: ["amo_import", "completed", JSON.stringify({ stats, errors: errors.slice(0, 50), sourceDbPath })]
    });
  } finally {
    await source.close();
    await target.close();
  }

  return { mode, sourceDbPath, stats, errors, startedAt, finishedAt: new Date().toISOString() };
}
