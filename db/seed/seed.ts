import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { createDb } from "../client.js";
import {
  auditLogs,
  calls,
  contacts,
  customFields,
  files,
  integrations,
  leadContacts,
  leadCustomValues,
  leads,
  messages,
  notes,
  permissions,
  pipelines,
  roles,
  settings,
  stages,
  tasks,
  users
} from "../schema/index.js";
import { demoLeads, demoUsers, measurementStages, salesStages } from "./data.js";

const db = createDb();
const hashPassword = (password: string) => createHash("sha256").update(password).digest("hex");
const codeFromName = (value: string) =>
  value
    .toLowerCase()
    .replaceAll(" ", "_")
    .replaceAll("-", "_")
    .replace(/[^\p{L}\p{N}_]+/gu, "");

async function clear() {
  for (const table of [
    auditLogs,
    files,
    calls,
    messages,
    notes,
    tasks,
    leadCustomValues,
    customFields,
    leadContacts,
    leads,
    contacts,
    stages,
    pipelines,
    permissions,
    users,
    roles,
    integrations,
    settings
  ]) {
    await db.delete(table);
  }
  await db.run(sql.raw("DELETE FROM sqlite_sequence"));
}

await clear();

const roleRows = await db
  .insert(roles)
  .values([
    { name: "owner", title: "Владелец", description: "Полный доступ, включая систему и безопасность" },
    { name: "admin", title: "Администратор", description: "Полный доступ к CRM" },
    { name: "manager", title: "Менеджер", description: "Продажи, сделки, задачи, чаты" },
    { name: "measurer", title: "Замерщик", description: "Замеры и задачи по объектам" },
    { name: "installer", title: "Монтажник", description: "Монтажи, файлы, статусы оплаты" }
  ])
  .returning();

for (const role of roleRows) {
  const isPrivileged = role.name === "owner" || role.name === "admin";
  await db.insert(permissions).values([
    { roleId: role.id, resource: "leads", action: isPrivileged ? "manage" : "read" },
    { roleId: role.id, resource: "tasks", action: isPrivileged ? "manage" : "update" },
    { roleId: role.id, resource: "analytics", action: role.name === "installer" ? "read_limited" : "read" },
    { roleId: role.id, resource: "users", action: isPrivileged ? "manage" : "none" },
    { roleId: role.id, resource: "settings", action: isPrivileged ? "manage" : "none" },
    { roleId: role.id, resource: "integrations", action: role.name === "owner" ? "manage" : "none" }
  ]);
}

const roleIdByName = new Map(roleRows.map((role) => [role.name, role.id]));
const userRows = await db
  .insert(users)
  .values(
    demoUsers.map((user) => ({
      name: user.name,
      email: user.email,
      phone: user.phone,
      roleId: roleIdByName.get(user.role)!,
      passwordHash: user.email === "admin@bakha.kz" ? hashPassword("admin123") : hashPassword("demo123"),
      status: "active"
    }))
  )
  .returning();

const salesPipeline = (
  await db
    .insert(pipelines)
    .values({ name: "Отдел продаж", code: "sales", description: "Основная воронка продаж", sortOrder: 1 })
    .returning()
)[0];
const measurementPipeline = (
  await db
    .insert(pipelines)
    .values({ name: "Замер", code: "measurement", description: "Воронка замеров и монтажа", sortOrder: 2 })
    .returning()
)[0];

const stageRows = await db
  .insert(stages)
  .values([
    ...salesStages.map((name, index) => ({
      pipelineId: salesPipeline.id,
      name,
      code: codeFromName(name),
      color: index < 2 ? "#f97316" : index > 13 ? "#22c55e" : "#64748b",
      sortOrder: index + 1,
      isSuccess: name === "Успешно реализовано",
      isFailure: name === "Закрыто и не реализовано" || name.includes("Отказ")
    })),
    ...measurementStages.map((name, index) => ({
      pipelineId: measurementPipeline.id,
      name,
      code: codeFromName(name),
      color: index >= 8 ? "#22c55e" : "#f97316",
      sortOrder: index + 1,
      isSuccess: name === "Полная оплата",
      isFailure: name === "Дорого"
    }))
  ])
  .returning();

const pipelineByCode = new Map([
  ["sales", salesPipeline.id],
  ["measurement", measurementPipeline.id]
]);
const stageByPipelineAndName = new Map(stageRows.map((stage) => [`${stage.pipelineId}:${stage.name}`, stage.id]));
const userByName = new Map(userRows.map((user) => [user.name, user.id]));

for (const demoLead of demoLeads) {
  const contact = (
    await db
      .insert(contacts)
      .values({
        name: demoLead.client,
        phone: demoLead.phone,
        city: demoLead.address.split(",")[0],
        address: demoLead.address,
        source: demoLead.source
      })
      .returning()
  )[0];

  const pipelineId = pipelineByCode.get(demoLead.pipeline)!;
  const lead = (
    await db
      .insert(leads)
      .values({
        title: demoLead.title,
        leadNumber: demoLead.leadNumber,
        pipelineId,
        stageId: stageByPipelineAndName.get(`${pipelineId}:${demoLead.stage}`)!,
        responsibleId: userByName.get(demoLead.responsible),
        budget: demoLead.budget,
        source: demoLead.source,
        status: demoLead.status,
        region: demoLead.address.split(",")[0],
        address: demoLead.address,
        area: demoLead.area,
        repairStage: demoLead.repairStage,
        measurementAt: demoLead.measurementAt,
        measurerId: userByName.get("Данияр Замерщик"),
        installerId: userByName.get("Руслан Монтажник"),
        paymentStatus: demoLead.paymentStatus,
        daysInStage: demoLead.daysInStage,
        contractNumber: `DOG-${demoLead.leadNumber.replace("BP-", "")}`
      })
      .returning()
  )[0];

  await db.insert(leadContacts).values({ leadId: lead.id, contactId: contact.id, isPrimary: true });
  const taskDescriptions: Record<string, string> = {
    "BP-2401": "Уточнить площадь и дату удобного замера",
    "BP-2402": "Отправить расчёт по теневому профилю 58 м²",
    "BP-2403": "Связаться после завершения чернового ремонта",
    "BP-2404": "Согласовать договор и выставить счёт на предоплату",
    "BP-2405": "Подтвердить время и адрес замера с клиентом",
    "BP-2406": "Отправить итоговый расчёт после перемера",
    "BP-2407": "Согласовать дату монтажа с бригадой"
  };
  const noteDescriptions: Record<string, string> = {
    "BP-2401": `Клиент обратился через ${demoLead.source}. Интересует матовый потолок в гостиную. Площадь ${demoLead.area} м². Ремонт: ${demoLead.repairStage}.`,
    "BP-2402": `Заявка через ${demoLead.source}. Обсудили теневой профиль для кухни ${demoLead.area} м². Ждёт коммерческое предложение.`,
    "BP-2403": `Клиент нашёл через ${demoLead.source}. Бюджет ограничен, ремонт ещё не готов. Нужен повторный звонок через 2 недели.`,
    "BP-2404": `Крупный объект ${demoLead.area} м² — три комнаты. Источник: ${demoLead.source}. Чистовая отделка готова. Счёт отправлен.`,
    "BP-2405": `Заявка с сайта. Запись на замер ${demoLead.area} м² — квартира в Кызылорде. Клиент ждёт подтверждения времени.`,
    "BP-2406": `Замер проведён. Площадь уточнена: ${demoLead.area} м². Сделан перерасчёт, ожидаем подтверждение предоплаты.`,
    "BP-2407": `Монтаж согласован. Бригада Руслана выезжает ${demoLead.measurementAt.slice(0, 10)}. Предоплата 50% получена.`
  };
  await db.insert(tasks).values({
    leadId: lead.id,
    title: demoLead.pipeline === "sales" ? "Позвонить клиенту" : "Подтвердить замер",
    description: taskDescriptions[demoLead.leadNumber] ?? "",
    dueAt: demoLead.measurementAt,
    assigneeId: userByName.get(demoLead.responsible),
    type: demoLead.pipeline === "sales" ? "call" : "measurement",
    priority: demoLead.status === "Горячий" ? "high" : "normal",
    status: demoLead.leadNumber === "BP-2406" ? "done" : "open",
    completedAt: demoLead.leadNumber === "BP-2406" ? "2026-05-31T12:00:00.000Z" : null
  });
  await db.insert(notes).values({
    leadId: lead.id,
    authorId: userByName.get(demoLead.responsible),
    body: noteDescriptions[demoLead.leadNumber] ?? `Клиент обратился через ${demoLead.source}.`
  });
  const messagesByLead: Record<string, string> = {
    "BP-2401": "Здравствуйте! Интересует матовый потолок в гостиную, около 42 м². Сколько будет стоить?",
    "BP-2402": "Добрый день, хотим теневой профиль на кухне. Когда можно замерщика вызвать?",
    "BP-2403": "Здравствуйте, смотрела ваши работы в Instagram. Интересует потолок в спальню 24 м².",
    "BP-2404": "Добрый день! У нас трёхкомнатная квартира, хотим натяжные потолки везде. Когда можно договориться?",
    "BP-2405": "Здравствуйте, оставляла заявку на сайте. Хочу уточнить насчёт замера — когда свободны?",
    "BP-2406": "Добрый день, вы делали замер у нас. Когда будет готов окончательный расчёт?",
    "BP-2407": "Здравствуйте, мы уже внесли предоплату. Хотела уточнить дату монтажа."
  };
  await db.insert(messages).values({
    leadId: lead.id,
    contactId: contact.id,
    channel: "whatsapp",
    direction: "incoming",
    body: messagesByLead[demoLead.leadNumber] ?? "Здравствуйте, интересует натяжной потолок. Можно рассчитать?",
    sentAt: demoLead.measurementAt
  });
  await db.insert(calls).values({
    leadId: lead.id,
    contactId: contact.id,
    userId: userByName.get(demoLead.responsible),
    direction: "outbound",
    status: "answered",
    durationSec: 186,
    calledAt: demoLead.measurementAt
  });
}

const fieldRows = await db
  .insert(customFields)
  .values([
    { entityType: "lead", name: "Тип потолка", code: "ceiling_type", fieldType: "select", optionsJson: JSON.stringify(["Матовый", "Глянцевый", "Теневой профиль"]) },
    { entityType: "lead", name: "Источник AmoCRM", code: "amo_source_id", fieldType: "text" },
    { entityType: "lead", name: "ID AmoCRM", code: "amo_lead_id", fieldType: "text" }
  ])
  .returning();

const firstLead = (await db.select().from(leads).where(eq(leads.leadNumber, "BP-2401")))[0];
if (firstLead) {
  await db.insert(leadCustomValues).values([
    { leadId: firstLead.id, customFieldId: fieldRows[0].id, value: "Матовый" },
    { leadId: firstLead.id, customFieldId: fieldRows[1].id, value: "instagram_direct" },
    { leadId: firstLead.id, customFieldId: fieldRows[2].id, value: "amo_demo_1001" }
  ]);
}

await db.insert(integrations).values([
  { code: "wappi", name: "WAPPI / WhatsApp", status: "disabled", configJson: "{}" },
  { code: "ai_manager", name: "AI-менеджер", status: "disabled", configJson: "{}" },
  { code: "telephony", name: "Телефония", status: "disabled", configJson: "{}" },
  { code: "webhooks", name: "Webhooks", status: "disabled", configJson: "{}" },
  { code: "salesbot", name: "Salesbot", status: "disabled", configJson: "{}" }
]);

await db.insert(settings).values([
  { key: "company", valueJson: JSON.stringify({ name: "Bakha Potolok", currency: "KZT", timezone: "Asia/Qyzylorda" }) },
  { key: "amo_import", valueJson: JSON.stringify({ enabled: false, lastImportAt: null }) }
]);

console.log("Seed data inserted");
