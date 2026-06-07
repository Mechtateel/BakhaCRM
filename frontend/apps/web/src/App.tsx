import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Archive,
  BarChart3,
  Bell,
  Bot,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  ChevronRight,
  CircleDollarSign,
  Clock,
  CreditCard,
  FileText,
  Filter,
  Headphones,
  KanbanSquare,
  LayoutDashboard,
  LogOut,
  MapPin,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  PanelLeft,
  Paperclip,
  Pencil,
  Percent,
  Phone,
  Plug,
  Plus,
  Radio,
  Ruler,
  Search,
  Send,
  Settings,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Timer,
  TrendingUp,
  UserRound,
  Users,
  Wallet,
  Webhook,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { useHorizontalDragScroll } from "./hooks/useHorizontalDragScroll";
import { useFloatingHorizontalScrollbar, TRACK_W, MIN_THUMB } from "./hooks/useKanbanScrollbar";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";

type Pipeline = { id: number; name: string; code: "sales" | "measurement"; sortOrder: number };
type Stage = { id: number; pipelineId: number; name: string; code: string; color: string; sortOrder: number };
type User = { id: number; name: string; email: string; phone?: string | null; status: string; role: string | null; roleTitle: string | null };
type Lead = {
  id: number;
  amoId?: number | null;
  title: string;
  leadNumber: string;
  budget: number;
  source: string;
  status: string;
  contractNumber?: string | null;
  region?: string | null;
  address?: string | null;
  area?: number | null;
  repairStage?: string | null;
  measurementAt?: string | null;
  closestTaskAt?: string | null;
  measurerName?: string | null;
  installerName?: string | null;
  refusalReason?: string | null;
  paymentStatus?: string | null;
  daysInStage: number;
  pipelineId: number;
  pipelineCode: "sales" | "measurement";
  pipelineName: string;
  stageId: number;
  stageName: string;
  responsibleId?: number | null;
  responsibleName?: string | null;
  contactId?: number | null;
  contactName?: string | null;
  contactPhone?: string | null;
};
type Task = {
  id: number;
  title: string;
  description?: string | null;
  dueAt: string;
  type: string;
  priority: string;
  status: string;
  completedAt?: string | null;
  leadId?: number | null;
  leadTitle?: string | null;
  client?: string | null;
  assigneeId?: number | null;
  assigneeName?: string | null;
};
type Integration = { id: number; code: string; name: string; status: string; configJson?: string | null };
type LeadNote = { id: number; body: string; createdAt: string; authorId?: number | null };
type LeadCustomValue = { id: number; value: string | null; fieldName: string | null; fieldCode: string | null; fieldType: string | null };
type CrmMessage = {
  id: number;
  leadId?: number | null;
  contactId?: number | null;
  channel: string;
  direction: "incoming" | "outgoing";
  senderType?: string | null;
  text?: string | null;
  body?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  externalMessageId?: string | null;
  status: string;
  sentAt?: string | null;
  createdAt: string;
};
type AiSuggestionDraft = {
  id: number;
  conversationId?: number | null;
  replyText?: string | null;
  confidence?: number | null;
  status: string;
  sourceMessageId?: number | null;
  suggestedActionsJson?: string | null;
  createdAt: string;
};
type ChatConversation = {
  id: number;
  leadId?: number | null;
  contactId?: number | null;
  phone: string;
  channel: string;
  status: string;
  unreadCount: number;
  lastMessageAt?: string | null;
  aiPaused?: boolean;
  aiPausedUntil?: string | null;
  aiPauseReason?: string | null;
  aiSuggestions?: AiSuggestionDraft[];
  leadTitle?: string | null;
  contactName?: string | null;
};
type WappiStatus = { enabled: boolean; dryRun: boolean; configured: boolean };
type TelephonyStatus = { enabled: boolean; dryRun: boolean; configured: boolean };
type CrmData = { pipelines: Pipeline[]; stages: Stage[]; users: User[]; leads: Lead[]; tasks: Task[]; integrations: Integration[]; wappi?: WappiStatus; telephony?: TelephonyStatus; viewerRole?: string | null };
type CrmContextValue = CrmData & { refresh: () => Promise<void> };
type HistoryEvent = { id: number; action: string; payloadJson?: string | null; createdAt: string };
type LeadDraft = {
  title: string;
  budget: string;
  region: string;
  source: string;
  area: string;
  repairStage: string;
  measurementAt: string;
  address: string;
  measurerName: string;
  installerName: string;
  refusalReason: string;
  paymentStatus: string;
  responsibleId: string;
};
type TaskDraft = { title: string; description: string; dueDate: string; dueTime: string; type: string; priority: string; responsibleUserId: string };
const KANBAN_COLUMN_LIMIT = 80;
const TASK_COLUMN_LIMIT = 120;

const salesStageNames = [
  "Неразобранное",
  "Новый лид",
  "В работе",
  "НДЗ",
  "1-й звонок",
  "2-й звонок",
  "3-й звонок",
  "Согласование",
  "Ремонт не готов",
  "Другой город",
  "Игнор",
  "Назначил замер",
  "Провёл замер",
  "Отказ после замера",
  "Успешно реализовано",
  "Закрыто и не реализовано"
];

const measurementStageNames = [
  "Назначил замер",
  "Не провели замер",
  "Перезамер",
  "Провели замер",
  "Ремонт не готов",
  "Дорого",
  "Подумаю",
  "Сделан перерасчёт",
  "Предоплата",
  "Установка",
  "Полная оплата",
  "Остаток долг"
];

const fallbackData: CrmData = {
  pipelines: [
    { id: 1, name: "Отдел продаж", code: "sales", sortOrder: 1 },
    { id: 2, name: "Замер", code: "measurement", sortOrder: 2 }
  ],
  stages: [
    ...salesStageNames.map((name, index) => ({ id: index + 1, pipelineId: 1, name, code: name, color: "#f97316", sortOrder: index + 1 })),
    ...measurementStageNames.map((name, index) => ({ id: 100 + index, pipelineId: 2, name, code: name, color: "#f97316", sortOrder: index + 1 }))
  ],
  users: [
    { id: 1, name: "Баха Админ", email: "admin@bakha.kz", phone: "+7 700 111 22 33", status: "active", role: "admin", roleTitle: "Администратор" },
    { id: 2, name: "Алия Менеджер", email: "aliya@bakha.kz", phone: "+7 701 300 40 50", status: "active", role: "manager", roleTitle: "Менеджер" },
    { id: 3, name: "Данияр Замерщик", email: "daniyar@bakha.kz", phone: "+7 702 555 18 18", status: "active", role: "measurer", roleTitle: "Замерщик" },
    { id: 4, name: "Руслан Монтажник", email: "ruslan@bakha.kz", phone: "+7 705 222 77 77", status: "active", role: "installer", roleTitle: "Монтажник" }
  ],
  leads: [
    lead(1, "Потолок в гостиную", "BP-2401", "sales", "Новый лид", "Айгерим С.", "+7 701 234 56 78", 185000, "Instagram", "Алия Менеджер", "Кызылорда, мкр. Сырдария, 18", 42, "Черновая отделка", "2026-06-02T11:00:00.000Z", "Не оплачено", "Горячий"),
    lead(2, "Теневой профиль кухня", "BP-2402", "sales", "В работе", "Мурат К.", "+7 777 888 44 55", 260000, "WhatsApp", "Баха Админ", "Кызылорда, ул. Ауэзова, 71", 58, "Шпаклевка", "2026-06-03T07:30:00.000Z", "Ожидает КП", "В работе"),
    lead(3, "Матовый потолок спальня", "BP-2403", "sales", "НДЗ", "Сания Ж.", "+7 708 444 22 11", 97000, "2GIS", "Алия Менеджер", "Шиели, ул. Абая, 12", 24, "Ремонт не готов", "2026-05-31T10:00:00.000Z", "Не оплачено", "Нужен звонок"),
    lead(4, "Комплексный объект 3 комнаты", "BP-2404", "sales", "Согласование", "Ерлан Т.", "+7 701 999 10 20", 510000, "Рекомендация", "Баха Админ", "Кызылорда, ЖК Орда, 4", 118, "Чистовая отделка", "2026-06-01T12:30:00.000Z", "Счёт отправлен", "КП"),
    lead(5, "Замер по квартире", "BP-2405", "measurement", "Назначил замер", "Динара Н.", "+7 702 111 99 00", 330000, "Сайт", "Алия Менеджер", "Кызылорда, ул. Желтоксан, 9", 72, "Готов к замеру", "2026-06-02T06:00:00.000Z", "Не оплачено", "Назначено"),
    lead(6, "Перерасчёт после замера", "BP-2406", "measurement", "Сделан перерасчёт", "Арман Р.", "+7 707 333 45 67", 445000, "Instagram", "Баха Админ", "Кызылорда, Байтерек, 22", 91, "Электрика готова", "2026-05-31T09:00:00.000Z", "Ожидает предоплату", "Перерасчёт"),
    lead(7, "Установка потолка", "BP-2407", "measurement", "Установка", "Гульмира А.", "+7 778 700 08 08", 390000, "Офис", "Алия Менеджер", "Кызылорда, ул. Толе би, 33", 84, "Готово", "2026-05-29T08:00:00.000Z", "Предоплата 50%", "Монтаж")
  ],
  tasks: [
    task(1, "Позвонить клиенту", 1, "Потолок в гостиную", "Айгерим С.", "2026-06-02T11:00:00.000Z", "Алия Менеджер", "call", "high", "open"),
    task(2, "Отправить КП", 2, "Теневой профиль кухня", "Мурат К.", "2026-06-03T07:30:00.000Z", "Баха Админ", "message", "normal", "open"),
    task(3, "Дожать НДЗ", 3, "Матовый потолок спальня", "Сания Ж.", "2026-05-31T10:00:00.000Z", "Алия Менеджер", "call", "high", "open"),
    task(4, "Подтвердить замер", 5, "Замер по квартире", "Динара Н.", "2026-06-02T06:00:00.000Z", "Данияр Замерщик", "measurement", "normal", "open"),
    task(5, "Перерасчёт согласован", 6, "Перерасчёт после замера", "Арман Р.", "2026-05-31T12:00:00.000Z", "Баха Админ", "quote", "normal", "done")
  ],
  integrations: [
    { id: 1, code: "wappi", name: "WAPPI / WhatsApp", status: "disabled" },
    { id: 2, code: "ai_manager", name: "AI-менеджер", status: "disabled" },
    { id: 3, code: "telephony", name: "Телефония", status: "disabled" },
    { id: 4, code: "webhooks", name: "Webhooks", status: "disabled" },
    { id: 5, code: "salesbot", name: "Salesbot", status: "disabled" }
  ]
};

function lead(
  id: number,
  title: string,
  leadNumber: string,
  pipelineCode: "sales" | "measurement",
  stageName: string,
  contactName: string,
  contactPhone: string,
  budget: number,
  source: string,
  responsibleName: string,
  address: string,
  area: number,
  repairStage: string,
  measurementAt: string,
  paymentStatus: string,
  status: string
): Lead {
  const pipelineId = pipelineCode === "sales" ? 1 : 2;
  return {
    id,
    title,
    leadNumber,
    budget,
    source,
    status,
    contractNumber: `DOG-${leadNumber.replace("BP-", "")}`,
    region: address.split(",")[0],
    address,
    area,
    repairStage,
    measurementAt,
    paymentStatus,
    daysInStage: Math.max(1, id % 6),
    pipelineId,
    pipelineCode,
    pipelineName: pipelineCode === "sales" ? "Отдел продаж" : "Замер",
    stageId: pipelineCode === "sales" ? salesStageNames.indexOf(stageName) + 1 : 100 + measurementStageNames.indexOf(stageName),
    stageName,
    responsibleId: responsibleName === "Баха Админ" ? 1 : 2,
    responsibleName,
    contactId: id,
    contactName,
    contactPhone
  };
}

function task(id: number, title: string, leadId: number, leadTitle: string, client: string, dueAt: string, assigneeName: string, type: string, priority: string, status: string): Task {
  return { id, title, leadId, leadTitle, client, dueAt, assigneeName, type, priority, status, completedAt: status === "done" ? dueAt : null };
}

const CrmDataContext = createContext<CrmContextValue>({ ...fallbackData, refresh: async () => undefined });
const useCrm = () => useContext(CrmDataContext);
type Toast = { id: number; message: string };
const ToastContext = createContext<(message: string) => void>(() => undefined);
const useToast = () => useContext(ToastContext);
const formatter = new Intl.NumberFormat("ru-KZ", { style: "currency", currency: "KZT", maximumFractionDigits: 0 });
const formatMoney = (value: number) => formatter.format(value);
const formatDate = (value?: string | null) => (value ? new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "Не указано");
const display = (value: unknown) => (value === null || value === undefined || value === "" ? "—" : String(value));
const toInputDateTime = (value?: string | null) => (value ? new Date(value).toISOString().slice(0, 16) : "");
const fromInputDateTime = (value: string) => (value ? new Date(value).toISOString() : null);
const taskDueAt = (date: string, time: string) => (date ? new Date(`${date}T${time || "10:00"}`).toISOString() : new Date().toISOString());
const todayInputDate = () => new Date().toISOString().slice(0, 10);

function leadToDraft(leadItem: Lead): LeadDraft {
  return {
    title: leadItem.title ?? "",
    budget: String(leadItem.budget ?? 0),
    region: leadItem.region ?? "",
    source: leadItem.source ?? "",
    area: leadItem.area === null || leadItem.area === undefined ? "" : String(leadItem.area),
    repairStage: leadItem.repairStage ?? "",
    measurementAt: toInputDateTime(leadItem.measurementAt),
    address: leadItem.address ?? "",
    measurerName: leadItem.measurerName ?? "",
    installerName: leadItem.installerName ?? "",
    refusalReason: leadItem.refusalReason ?? "",
    paymentStatus: leadItem.paymentStatus ?? "",
    responsibleId: leadItem.responsibleId ? String(leadItem.responsibleId) : ""
  };
}

async function apiJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) }
  });
  if (response.status === 401) {
    localStorage.removeItem("bakha_token");
    localStorage.removeItem("bakha_user");
    window.location.href = "/login";
    throw new Error("Сессия истекла. Войдите снова.");
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? "API request failed");
  }
  return response.json() as Promise<T>;
}

function safeJson(value?: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<ProtectedFrame />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/sales" element={<KanbanPage pipelineCode="sales" title="Отдел продаж" />} />
          <Route path="/measurements" element={<KanbanPage pipelineCode="measurement" title="Замер" />} />
          <Route path="/leads/:id" element={<LeadDetailPage />} />
          <Route path="/chats" element={<ChatsPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/settings/users" element={<UsersSettingsPage />} />
          <Route path="/settings/integrations" element={<IntegrationsSettingsPage />} />
          <Route path="/settings/integrations/telephony" element={<TelephonySettingsPage />} />
          <Route path="/settings/integrations/wappi" element={<WappiSettingsPage />} />
          <Route path="/settings/system" element={<SystemStatusPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function RequireAuth() {
  return localStorage.getItem("bakha_token") ? <Outlet /> : <Navigate to="/login" replace />;
}

function ProtectedFrame() {
  const [data, setData] = useState<CrmData>(fallbackData);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const navigate = useNavigate();

  function notify(message: string) {
    const id = Date.now();
    setToasts((current) => [...current, { id, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3200);
  }

  async function refresh() {
    try {
      const res = await fetch("/api/bootstrap", { credentials: "include" });
      if (!res.ok) throw new Error("API unavailable");
      const payload = (await res.json()) as CrmData;
      setData(payload);
    } catch {
      setData(fallbackData);
    }
  }

  useEffect(() => {
    let alive = true;
    // Validate server-side session and sync user data
    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => {
        if (!res.ok) return null;
        return res.json() as Promise<{ user: { id: number; name: string; email: string; role: string | null; roleTitle: string | null } }>;
      })
      .then((payload) => {
        if (!alive) return;
        if (payload?.user) {
          // Sync latest user info from server (role may have changed)
          const storedToken = localStorage.getItem("bakha_token");
          if (storedToken) {
            localStorage.setItem("bakha_user", JSON.stringify(payload.user));
          }
        } else {
          // Server says no valid session — clear client state and redirect
          const storedToken = localStorage.getItem("bakha_token");
          if (storedToken && storedToken !== "demo-token") {
            localStorage.removeItem("bakha_token");
            localStorage.removeItem("bakha_user");
            if (alive) navigate("/login", { replace: true });
          }
        }
      })
      .catch(() => { /* Server unavailable — keep demo-token flow */ });

    fetch("/api/bootstrap", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("API unavailable"))))
      .then((payload: CrmData) => {
        if (alive) setData(payload);
      })
      .catch(() => {
        if (alive) setData(fallbackData);
      });
    return () => {
      alive = false;
    };
  }, [navigate]);

  return (
    <ToastContext.Provider value={notify}>
      <CrmDataContext.Provider value={{ ...data, refresh }}>
        <AppShell>
          <Outlet />
        </AppShell>
        <ToastStack toasts={toasts} />
      </CrmDataContext.Provider>
    </ToastContext.Provider>
  );
}

function ToastStack({ toasts }: { toasts: Toast[] }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-[min(360px,calc(100vw-32px))] flex-col gap-2">
      {toasts.map((toast) => (
        <div key={toast.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 shadow-panel">
          {toast.message}
        </div>
      ))}
    </div>
  );
}

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@bakha.kz");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({})) as { error?: string };
        if (response.status === 403) {
          setError(err.error ?? "Аккаунт деактивирован");
        } else {
          throw new Error("bad credentials");
        }
        return;
      }
      const payload = await response.json() as { token: string; user: { name: string; email: string; role: string | null; roleTitle: string | null } };
      localStorage.setItem("bakha_token", payload.token);
      localStorage.setItem("bakha_user", JSON.stringify(payload.user));
      navigate("/dashboard");
    } catch {
      if (email === "admin@bakha.kz" && password === "admin123") {
        localStorage.setItem("bakha_token", "demo-token");
        localStorage.setItem("bakha_user", JSON.stringify({ name: "Баха Админ", role: "owner", roleTitle: "Владелец" }));
        navigate("/dashboard");
      } else {
        setError("Неверный email или пароль");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen bg-[#f4f6f8]">
      <section className="hidden w-[46vw] min-w-[500px] bg-[#111111] p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div>
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-bakha-orange text-lg font-black">B</div>
          <h1 className="mt-10 text-5xl font-semibold leading-tight">BAKHA CRM</h1>
          <p className="mt-5 max-w-lg text-lg leading-8 text-zinc-300">Единый рабочий стол для продаж, замеров, задач и аналитики Bakha Potolok.</p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm text-zinc-300">
          {["Воронки", "Задачи", "Импорт AmoCRM"].map((item) => (
            <div key={item} className="rounded-lg border border-white/10 bg-white/[0.06] p-4 shadow-2xl">
              {item}
            </div>
          ))}
        </div>
      </section>
      <section className="flex flex-1 items-center justify-center p-6">
        <form onSubmit={onSubmit} className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-panel">
          <p className="text-sm font-semibold uppercase text-bakha-orange">Bakha Potolok</p>
          <h2 className="mt-2 text-3xl font-semibold text-slate-950">Вход в CRM</h2>
          <label className="mt-8 block text-sm font-medium text-slate-700">
            Email
            <input className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 outline-none transition focus:border-bakha-orange focus:ring-4 focus:ring-orange-100" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="mt-4 block text-sm font-medium text-slate-700">
            Пароль
            <input className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 outline-none transition focus:border-bakha-orange focus:ring-4 focus:ring-orange-100" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          <button className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-bakha-orange px-4 py-3 font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-600" type="submit" disabled={loading}>
            {loading ? "Входим..." : "Войти"}
            <ChevronRight size={18} />
          </button>
        </form>
      </section>
    </main>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { tasks, leads } = useCrm();
  const notify = useToast();
  const [globalSearch, setGlobalSearch] = useState("");
  const user = JSON.parse(localStorage.getItem("bakha_user") ?? "{\"name\":\"Баха Админ\",\"role\":\"owner\",\"roleTitle\":\"Владелец\"}") as { name: string; role?: string | null; roleTitle?: string };
  const isAdminOrOwner = user.role === "owner" || user.role === "admin";

  const allNavItems: Array<{ label: string; href: string; icon: LucideIcon; badge?: string; adminOnly?: boolean }> = [
    { label: "Рабочий стол", href: "/dashboard", icon: LayoutDashboard },
    { label: "Отдел продаж", href: "/sales", icon: KanbanSquare, badge: String(leads.filter((item) => item.pipelineCode === "sales").length) },
    { label: "Замер", href: "/measurements", icon: Ruler, badge: String(leads.filter((item) => item.pipelineCode === "measurement").length) },
    { label: "Резерв", href: "/sales?reserve=1", icon: Archive },
    { label: "Чаты", href: "/chats", icon: MessageCircle },
    { label: "Задачи", href: "/tasks", icon: CheckSquare, badge: String(tasks.filter((item) => item.status !== "done").length) },
    { label: "Аналитика", href: "/analytics", icon: BarChart3 },
    { label: "Настройки", href: "/settings/users", icon: Settings, adminOnly: true },
    { label: "Состояние системы", href: "/settings/system", icon: Activity, adminOnly: true }
  ];
  const navItems = allNavItems.filter((item) => !item.adminOnly || isAdminOrOwner);

  // Collapse sidebar to icon-only when viewing a deal detail page so the
  // three-column workspace gets maximum horizontal space (AmoCRM behaviour).
  const isLeadDetail = /^\/leads\/\d/.test(location.pathname);

  return (
    <div className="min-h-screen bg-[#f5f6f8] lg:flex">
      <aside className={`fixed inset-y-0 left-0 z-20 hidden border-r border-white/10 bg-[#101010] text-white lg:block ${isLeadDetail ? "w-[64px] px-2 py-4" : "w-[248px] px-3 py-4"}`}>
        {/* Logo */}
        <Link to="/dashboard" title="BAKHA CRM" className={`flex items-center rounded-xl ${isLeadDetail ? "justify-center p-2" : "gap-3 px-2 py-2"}`}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bakha-orange text-lg font-black shadow-lg shadow-orange-500/25">B</div>
          {!isLeadDetail && (
            <div className="min-w-0">
              <p className="text-base font-bold tracking-wide">BAKHA CRM</p>
              <p className="text-[11px] uppercase text-zinc-500">Premium sales desk</p>
            </div>
          )}
        </Link>
        {/* Revenue widget — hidden in compact mode */}
        {!isLeadDetail && (
          <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Сегодня</span>
              <span className="rounded-full bg-bakha-orange px-2 py-0.5 font-semibold text-white">live</span>
            </div>
            <p className="mt-2 text-lg font-semibold">{formatMoney(leads.reduce((sum, item) => sum + item.budget, 0))}</p>
            <p className="text-xs text-zinc-500">прогноз активных сделок</p>
          </div>
        )}
        {/* Navigation */}
        <nav className={`${isLeadDetail ? "mt-4" : "mt-5"} space-y-1`}>
          {navItems.map((item) => {
            const active = location.pathname === item.href.split("?")[0];
            const Icon = item.icon;
            if (isLeadDetail) {
              return (
                <Link key={item.label} to={item.href} title={item.label} className={`group relative flex items-center justify-center rounded-lg p-3 transition ${active ? "bg-orange-500/15 text-bakha-orange ring-1 ring-orange-500/25" : "text-zinc-300 hover:bg-white/[0.07] hover:text-white"}`}>
                  <Icon size={20} className={active ? "text-bakha-orange" : "text-zinc-500 group-hover:text-zinc-200"} />
                  {item.badge && item.badge !== "0" ? (
                    <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-bakha-orange px-0.5 text-[9px] font-bold text-white">{item.badge}</span>
                  ) : null}
                </Link>
              );
            }
            return (
              <Link key={item.label} to={item.href} className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${active ? "bg-orange-500/15 text-bakha-orange ring-1 ring-orange-500/25" : "text-zinc-300 hover:bg-white/[0.07] hover:text-white"}`}>
                <Icon size={18} className={active ? "text-bakha-orange" : "text-zinc-500 group-hover:text-zinc-200"} />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.badge ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${active ? "bg-bakha-orange text-white" : "bg-white/10 text-zinc-300"}`}>{item.badge}</span> : null}
              </Link>
            );
          })}
        </nav>
        {/* User card — compact in deal detail mode */}
        {isLeadDetail ? (
          <div className="absolute bottom-4 left-0 right-0 flex justify-center">
            <div title={`${user.name} · ${user.roleTitle ?? ""}`} className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-sm font-bold">{user.name.slice(0, 1)}</div>
          </div>
        ) : (
          <div className="absolute bottom-4 left-3 right-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-sm font-bold">{user.name.slice(0, 1)}</div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="truncate text-xs text-zinc-500">{user.roleTitle ?? "Сотрудник"}</p>
              </div>
            </div>
          </div>
        )}
      </aside>
      <div className={`min-w-0 flex-1 ${isLeadDetail ? "flex flex-col lg:pl-[64px]" : "lg:pl-[248px]"}`}>
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm shadow-slate-200/40 backdrop-blur lg:px-6">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <button className="rounded-lg border border-slate-200 p-2 text-slate-600 lg:hidden" aria-label="Меню" onClick={() => notify("Мобильное меню будет подключено позже. На desktop sidebar уже активен.")}>
                <PanelLeft size={20} />
              </button>
              <div className="relative w-full min-w-0 sm:w-[430px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-bakha-orange focus:bg-white focus:ring-4 focus:ring-orange-100"
                  placeholder="Поиск по сделкам, клиентам, телефону"
                  value={globalSearch}
                  onChange={(event) => setGlobalSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") notify(globalSearch ? `Глобальный поиск по "${globalSearch}" работает в demo-режиме. Используйте поиск на kanban для фильтрации карточек.` : "Введите запрос для поиска.");
                  }}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ToolbarButton icon={CalendarDays} label="Июнь 2026" onClick={() => notify("Глобальный фильтр периода — в разработке. На kanban доступен поиск и фильтр по менеджеру.")} />
              <ToolbarButton icon={Filter} label="Все менеджеры" onClick={() => notify("Глобальный фильтр менеджеров — в разработке. На kanban доступен локальный фильтр.")} />
              <ToolbarButton icon={SlidersHorizontal} label="Фильтры" onClick={() => notify("Расширенные фильтры — в разработке.")} />
              <button className="relative rounded-lg border border-slate-200 p-2.5 text-slate-600 transition hover:border-bakha-orange hover:text-bakha-orange" aria-label="Уведомления" onClick={() => notify("Центр уведомлений будет активирован после подключения всех интеграций.")}>
                <Bell size={18} />
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-bakha-orange" />
              </button>
              <button className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-bakha-orange" onClick={() => notify(`${user.name} · ${user.roleTitle ?? "Сотрудник"}`)}>
                <UserRound size={18} />
                <span className="hidden sm:inline">{user.name}</span>
              </button>
              <button
                className="rounded-lg border border-slate-200 p-2.5 text-slate-600 transition hover:border-bakha-orange hover:text-bakha-orange"
                aria-label="Выйти"
                onClick={() => {
                  fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => undefined);
                  localStorage.removeItem("bakha_token");
                  localStorage.removeItem("bakha_user");
                  navigate("/login");
                }}
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </header>
        {/* Role-scoped data notice for measurer/installer */}
        {(user.role === "measurer" || user.role === "installer") && !isLeadDetail && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 lg:px-6">
            <span className="font-semibold">{user.roleTitle ?? user.role}:</span>{" "}
            {user.role === "measurer" ? "Отображаются только ваши замеры и задачи." : "Отображаются только ваши монтажи и задачи."}
          </div>
        )}
        <main className={isLeadDetail ? "flex flex-1 min-h-0 overflow-hidden" : "px-4 py-5 lg:px-6"}>{children}</main>
      </div>
    </div>
  );
}

function ToolbarButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick?: () => void }) {
  const notify = useToast();
  return (
    <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-bakha-orange hover:text-bakha-orange" onClick={onClick ?? (() => notify("Функция будет подключена позже."))}>
      <Icon size={18} />
      {label}
    </button>
  );
}

function PageHeader({ title, subtitle, action, onAction }: { title: string; subtitle?: string; action?: string; onAction?: () => void }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {action && onAction ? (
        <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-bakha-orange px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-600" onClick={onAction}>
          <Plus size={18} />
          {action}
        </button>
      ) : null}
    </div>
  );
}

type NewDealDraft = {
  title: string;
  contactName: string;
  contactPhone: string;
  source: string;
  responsibleId: string;
  pipelineId: string;
  stageId: string;
  budget: string;
  measurementAt: string;
  comment: string;
};

const SOURCES = ["Instagram", "WhatsApp", "2GIS", "Сайт", "Рекомендация", "Офис", "Другое"];

function NewDealModal({ onClose, onCreated }: { onClose: () => void; onCreated?: (leadId: number) => void }) {
  const { pipelines, stages, users, refresh } = useCrm();
  const notify = useToast();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const defaultPipeline = pipelines.find((p) => p.code === "sales") ?? pipelines[0];
  const defaultPipelineId = defaultPipeline?.id ? String(defaultPipeline.id) : "";
  const pipelineStages = stages.filter((s) => s.pipelineId === Number(defaultPipelineId)).sort((a, b) => a.sortOrder - b.sortOrder);
  const defaultStageId = pipelineStages[0]?.id ? String(pipelineStages[0].id) : "";

  const [draft, setDraft] = useState<NewDealDraft>({
    title: "",
    contactName: "",
    contactPhone: "",
    source: "Instagram",
    responsibleId: "",
    pipelineId: defaultPipelineId,
    stageId: defaultStageId,
    budget: "",
    measurementAt: "",
    comment: ""
  });

  const selectedPipelineStages = stages
    .filter((s) => s.pipelineId === Number(draft.pipelineId))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  function set(field: keyof NewDealDraft, value: string) {
    setDraft((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "pipelineId") {
        const first = stages.filter((s) => s.pipelineId === Number(value)).sort((a, b) => a.sortOrder - b.sortOrder)[0];
        next.stageId = first?.id ? String(first.id) : "";
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.title.trim()) { notify("Введите название сделки."); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        title: draft.title.trim(),
        contactName: draft.contactName.trim() || undefined,
        contactPhone: draft.contactPhone.trim() || undefined,
        source: draft.source,
        responsibleId: draft.responsibleId ? Number(draft.responsibleId) : undefined,
        pipelineId: draft.pipelineId ? Number(draft.pipelineId) : undefined,
        stageId: draft.stageId ? Number(draft.stageId) : undefined,
        budget: draft.budget ? Number(draft.budget) : 0,
        measurementAt: draft.measurementAt ? new Date(draft.measurementAt).toISOString() : undefined,
        comment: draft.comment.trim() || undefined
      };
      const result = await apiJson<{ lead: Lead & { id: number } }>("/api/leads", {
        method: "POST",
        body: JSON.stringify(body)
      });
      await refresh();
      notify("Сделка создана успешно.");
      onClose();
      if (onCreated) onCreated(result.lead.id);
      else navigate(`/leads/${result.lead.id}`);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Не удалось создать сделку.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(15,23,42,0.5)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Новая сделка</h2>
            <p className="text-xs text-slate-400">Заполните основные поля и сохраните</p>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-200 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="max-h-[80vh] overflow-y-auto px-5 py-4">
          <div className="space-y-3">
            {/* Title */}
            <label className="block text-xs font-semibold text-slate-500">
              Название сделки <span className="text-red-500">*</span>
              <input
                required
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-bakha-orange focus:ring-4 focus:ring-orange-100"
                placeholder="Матовый потолок в гостиную"
                value={draft.title}
                onChange={(e) => set("title", e.target.value)}
              />
            </label>

            {/* Contact row */}
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-semibold text-slate-500">
                Имя клиента
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-bakha-orange focus:ring-4 focus:ring-orange-100"
                  placeholder="Айгерим С."
                  value={draft.contactName}
                  onChange={(e) => set("contactName", e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-500">
                Телефон
                <input
                  type="tel"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-bakha-orange focus:ring-4 focus:ring-orange-100"
                  placeholder="+7 700 000 00 00"
                  value={draft.contactPhone}
                  onChange={(e) => set("contactPhone", e.target.value)}
                />
              </label>
            </div>

            {/* Pipeline + Stage */}
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-semibold text-slate-500">
                Воронка
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-bakha-orange"
                  value={draft.pipelineId}
                  onChange={(e) => set("pipelineId", e.target.value)}
                >
                  {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className="block text-xs font-semibold text-slate-500">
                Этап
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-bakha-orange"
                  value={draft.stageId}
                  onChange={(e) => set("stageId", e.target.value)}
                >
                  {selectedPipelineStages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            </div>

            {/* Source + Responsible */}
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-semibold text-slate-500">
                Источник
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-bakha-orange"
                  value={draft.source}
                  onChange={(e) => set("source", e.target.value)}
                >
                  {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="block text-xs font-semibold text-slate-500">
                Ответственный
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-bakha-orange"
                  value={draft.responsibleId}
                  onChange={(e) => set("responsibleId", e.target.value)}
                >
                  <option value="">— не выбран —</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </label>
            </div>

            {/* Budget + Measurement */}
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-semibold text-slate-500">
                Бюджет (₸)
                <input
                  type="number"
                  min="0"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-bakha-orange focus:ring-4 focus:ring-orange-100"
                  placeholder="0"
                  value={draft.budget}
                  onChange={(e) => set("budget", e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-500">
                Дата замера (опционально)
                <input
                  type="datetime-local"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-bakha-orange focus:ring-4 focus:ring-orange-100"
                  value={draft.measurementAt}
                  onChange={(e) => set("measurementAt", e.target.value)}
                />
              </label>
            </div>

            {/* Comment */}
            <label className="block text-xs font-semibold text-slate-500">
              Комментарий (опционально)
              <textarea
                className="mt-1 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-bakha-orange focus:ring-4 focus:ring-orange-100"
                rows={2}
                placeholder="Первичное обращение, интересует матовый потолок..."
                value={draft.comment}
                onChange={(e) => set("comment", e.target.value)}
              />
            </label>
          </div>

          <div className="mt-5 flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-xl bg-bakha-orange py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-60"
            >
              {saving ? "Создание..." : "Создать сделку"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
            >
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DashboardPage() {
  const { leads, tasks } = useCrm();
  const navigate = useNavigate();
  const [showNewDeal, setShowNewDeal] = useState(false);

  const [period, setPeriod] = useState<"today" | "yesterday" | "week" | "month">("today");
  const [managerFilter, setManagerFilter] = useState("all");

  const managers = useMemo(() => {
    const s = new Set<string>();
    leads.forEach((l) => { if (l.responsibleName) s.add(l.responsibleName); });
    return Array.from(s).sort();
  }, [leads]);

  const periodStart = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    if (period === "yesterday") return new Date(start.getTime() - 86_400_000);
    if (period === "week") return new Date(start.getTime() - 7 * 86_400_000);
    if (period === "month") return new Date(start.getTime() - 30 * 86_400_000);
    return start;
  }, [period]);

  const filteredLeads = useMemo(
    () => (managerFilter === "all" ? leads : leads.filter((l) => l.responsibleName === managerFilter)),
    [leads, managerFilter]
  );

  const overdue = useMemo(
    () => tasks.filter((t) => t.status !== "done" && new Date(t.dueAt) < new Date()).length,
    [tasks]
  );

  const completed = useMemo(
    () => tasks.filter((t) => {
      if (t.status !== "done") return false;
      const d = t.completedAt ? new Date(t.completedAt) : null;
      return d ? d >= periodStart : true;
    }).length,
    [tasks, periodStart]
  );

  const withoutTasks = useMemo(
    () => filteredLeads.filter((l) => !tasks.some((t) => t.leadId === l.id && t.status !== "done")).length,
    [filteredLeads, tasks]
  );

  const forecast = useMemo(() => filteredLeads.reduce((s, l) => s + l.budget, 0), [filteredLeads]);

  const salesLeads = useMemo(() => filteredLeads.filter((l) => l.pipelineCode === "sales"), [filteredLeads]);

  const stageItems = useMemo(() => {
    const grouped = groupBy(salesLeads, (l) => l.stageName);
    return Object.entries(grouped)
      .map(([label, vals]) => ({ label, value: vals.length, sum: vals.reduce((s, v) => s + v.budget, 0) }))
      .slice(0, 7);
  }, [salesLeads]);

  const sourceItems = useMemo(() => {
    const grouped = groupBy(filteredLeads, (l) => l.source || "Другое");
    return Object.entries(grouped)
      .map(([label, vals]) => ({ label, value: vals.length, sum: vals.reduce((s, v) => s + v.budget, 0) }))
      .sort((a, b) => b.value - a.value);
  }, [filteredLeads]);

  const managerItems = useMemo(() => {
    const grouped = groupBy(leads, (l) => l.responsibleName ?? "Без ответственного");
    return Object.entries(grouped)
      .map(([label, vals]) => ({ label, value: vals.length, sum: vals.reduce((s, v) => s + v.budget, 0) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [leads]);

  const urgentTasks = useMemo(() => {
    const tomorrowStart = new Date(); tomorrowStart.setDate(tomorrowStart.getDate() + 1); tomorrowStart.setHours(0, 0, 0, 0);
    return tasks
      .filter((t) => t.status !== "done" && new Date(t.dueAt) < tomorrowStart)
      .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
      .slice(0, 5);
  }, [tasks]);

  const recentDone = useMemo(
    () => tasks
      .filter((t) => t.status === "done")
      .sort((a, b) => {
        const da = a.completedAt ? new Date(a.completedAt).getTime() : new Date(a.dueAt).getTime();
        const db = b.completedAt ? new Date(b.completedAt).getTime() : new Date(b.dueAt).getTime();
        return db - da;
      })
      .slice(0, 6),
    [tasks]
  );

  const avgDeal = Math.round(forecast / Math.max(1, filteredLeads.length));

  const PERIODS = [
    { key: "today" as const, label: "Сегодня" },
    { key: "yesterday" as const, label: "Вчера" },
    { key: "week" as const, label: "Неделя" },
    { key: "month" as const, label: "Месяц" },
  ];

  const periodLabel = PERIODS.find((p) => p.key === period)?.label.toLowerCase() ?? "период";

  return (
    <>
      {showNewDeal ? <NewDealModal onClose={() => setShowNewDeal(false)} /> : null}
      <PageHeader title="Рабочий стол" subtitle="Операционная сводка по продажам, задачам, звонкам и сообщениям" action="Новая сделка" onAction={() => setShowNewDeal(true)} />

      {/* Period + manager filter bar */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${period === p.key ? "bg-bakha-orange text-white shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <select
          value={managerFilter}
          onChange={(e) => setManagerFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-bakha-orange focus:outline-none"
        >
          <option value="all">Все менеджеры</option>
          {managers.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <button
          onClick={() => navigate("/settings/users")}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm transition hover:text-bakha-orange"
        >
          <Settings size={15} />
          Настройки
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={AlertTriangle} label="Просроченные задачи" value={String(overdue)} caption="требуют реакции" tone="red" />
        <KpiCard icon={CheckCircle2} label="Выполненные задачи" value={String(completed)} caption={`за ${periodLabel}`} tone="green" />
        <KpiCard icon={Timer} label="Сделки без задач" value={String(withoutTasks)} caption="рискуют потеряться" tone="orange" />
        <KpiCard icon={CircleDollarSign} label="Прогноз продаж" value={formatMoney(forecast)} caption="активный pipeline" tone="dark" />
      </div>

      {/* Main grid: tasks + forecast */}
      <div className="mt-5 grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <Panel title="Задачи на контроле" icon={CheckSquare} action="Открыть задачи" actionTo="/tasks">
          <div className="space-y-2.5">
            {urgentTasks.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">Нет срочных задач</p>
            ) : urgentTasks.map((t) => (
              <Link
                key={t.id}
                to={t.leadId ? `/leads/${t.leadId}` : "/tasks"}
                className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 transition hover:border-bakha-orange hover:bg-white"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{t.title}</p>
                  <p className="truncate text-xs text-slate-500">{t.client ?? t.leadTitle ?? "—"} · {formatDate(t.dueAt)}</p>
                  {t.assigneeName && <p className="truncate text-xs text-slate-400">{t.assigneeName}</p>}
                </div>
                <PriorityBadge priority={t.priority} />
              </Link>
            ))}
          </div>
        </Panel>

        <Panel title="Прогноз продаж" icon={TrendingUp} action="Аналитика" actionTo="/analytics">
          <div className="grid gap-4 lg:grid-cols-[1fr_180px]">
            <BarList items={stageItems} />
            <div className="rounded-xl bg-slate-950 p-4 text-white">
              <p className="text-xs uppercase tracking-wider text-zinc-400">Pipeline value</p>
              <p className="mt-2 text-2xl font-bold">{formatMoney(forecast)}</p>
              <p className="mt-1 text-xs text-zinc-500">{salesLeads.length} активных сделок</p>
              <div className="mt-5 h-20 rounded-lg bg-[linear-gradient(135deg,#f97316_0%,#fb923c_35%,#111827_36%,#111827_100%)] opacity-90" />
            </div>
          </div>
        </Panel>
      </div>

      {/* Analytics grid: sources donut + manager ranking */}
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel title="Источники сделок" icon={Send}>
          <DonutChart data={sourceItems} />
        </Panel>
        <Panel title="Сделки по менеджерам" icon={Users}>
          <ManagerRank items={managerItems} />
        </Panel>
      </div>

      {/* Bottom row: call metric + avg deal + recent events */}
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <MiniMetric title="Звонки" value="18" caption="12 отвеченных, 6 пропущенных" icon={Phone} trend="+14%" />
        <MiniMetric title="Средний чек" value={formatMoney(avgDeal)} caption="по активным сделкам" icon={Wallet} trend="стабильно" />
        <Panel title="Последние события" icon={Radio}>
          <ActivityFeed tasks={recentDone} />
        </Panel>
      </div>
    </>
  );
}

function KpiCard({ icon: Icon, label, value, caption, tone }: { icon: LucideIcon; label: string; value: string; caption: string; tone: "red" | "green" | "orange" | "dark" | "slate" }) {
  const tones = {
    red: "from-red-50 to-white text-red-700 bg-red-100",
    green: "from-emerald-50 to-white text-emerald-700 bg-emerald-100",
    orange: "from-orange-50 to-white text-orange-700 bg-orange-100",
    dark: "from-slate-950 to-slate-800 text-white bg-white/10",
    slate: "from-slate-100 to-white text-slate-700 bg-white"
  };
  return (
    <div className={`relative overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br ${tones[tone]} p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-panel`}>
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${tone === "dark" ? "bg-white/10 text-bakha-orange" : "bg-white text-current"} shadow-sm`}>
          <Icon size={21} />
        </div>
        <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${tone === "dark" ? "bg-white/10 text-zinc-200" : "bg-white text-slate-500"}`}>live</span>
      </div>
      <p className={`mt-4 text-sm ${tone === "dark" ? "text-zinc-300" : "text-slate-500"}`}>{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone === "dark" ? "text-white" : "text-slate-950"}`}>{value}</p>
      <p className={`mt-1 text-xs ${tone === "dark" ? "text-zinc-400" : "text-slate-500"}`}>{caption}</p>
    </div>
  );
}

function Panel({ title, icon: Icon, children, action, actionTo }: { title: string; icon: LucideIcon; children: React.ReactNode; action?: string; actionTo?: string }) {
  const notify = useToast();
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-bakha-orange">
            <Icon size={17} />
          </span>
          <h2 className="font-semibold text-slate-950">{title}</h2>
        </div>
        {action ? (
          actionTo
            ? <Link to={actionTo} className="text-sm font-semibold text-bakha-orange hover:underline">{action}</Link>
            : <button className="text-sm font-semibold text-bakha-orange" onClick={() => notify(`${action}: — в разработке.`)}>{action}</button>
        ) : (
          <MoreHorizontal size={18} className="text-slate-400" />
        )}
      </div>
      {children}
    </section>
  );
}

function BarList({ items }: { items: Array<{ label: string; value: number; sum: number }> }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span className="truncate font-medium text-slate-700">{item.label}</span>
            <span className="shrink-0 text-slate-500">{formatMoney(item.sum)}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-bakha-orange shadow-sm shadow-orange-500/30" style={{ width: `${Math.max(10, (item.value / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function MiniMetric({ title, value, caption, icon: Icon, trend }: { title: string; value: string; caption: string; icon: LucideIcon; trend: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-panel">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <Icon size={18} className="text-bakha-orange" />
      </div>
      <p className="mt-3 text-2xl font-semibold text-slate-950">{value}</p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{caption}</p>
        <span className="rounded-full bg-orange-50 px-2 py-1 text-xs font-semibold text-orange-700">{trend}</span>
      </div>
    </div>
  );
}

/**
 * Click-to-call button that integrates with the onlinePBX backend.
 * Falls back to a native tel: link when telephony is not enabled.
 */
function CallButton({ leadId, phone, telephony }: { leadId: number; phone?: string | null; telephony?: TelephonyStatus }) {
  const notify = useToast();
  const [calling, setCalling] = useState(false);

  async function handleCall() {
    if (!phone) return;
    setCalling(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/call`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json() as { ok?: boolean; dryRun?: boolean; telFallback?: boolean; error?: string };
      if (data.telFallback) {
        notify("Телефония не подключена. Открываем обычный звонок.");
        window.open(`tel:${phone}`, "_self");
      } else if (!res.ok || !data.ok) {
        notify(data.error ?? "Ошибка при инициации звонка");
      } else if (data.dryRun) {
        notify("Dry-run: звонок создан без реального вызова onlinePBX");
      } else {
        notify("Звонок запущен — ожидайте соединения");
      }
    } catch {
      notify("Не удалось связаться с сервером телефонии");
    } finally {
      setCalling(false);
    }
  }

  const cls = "flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-xs font-semibold transition";

  if (!phone) {
    return (
      <button disabled className={`${cls} text-slate-400`}>
        <Phone size={14} /> Позвонить
      </button>
    );
  }

  // Telephony not enabled → fall back to native tel: link
  if (!telephony?.enabled) {
    return (
      <a href={`tel:${phone}`} className={`${cls} text-slate-700 hover:border-bakha-orange hover:text-bakha-orange`}>
        <Phone size={14} /> Позвонить
      </a>
    );
  }

  return (
    <button
      onClick={handleCall}
      disabled={calling}
      className={`${cls} text-slate-700 hover:border-bakha-orange hover:text-bakha-orange disabled:opacity-60`}
    >
      <Phone size={14} /> {calling ? "Звоним..." : "Позвонить"}
    </button>
  );
}

// Source-to-color mapping for the donut chart
const SOURCE_PALETTE: Record<string, string> = {
  WAPPI: "#25D366",
  WhatsApp: "#25D366",
  Instagram: "#E1306C",
  "2GIS": "#0ea5e9",
  Сайт: "#f97316",
  Рекомендация: "#8b5cf6",
  TikTok: "#374151",
  Офис: "#64748b",
};
const DONUT_FALLBACK_COLORS = ["#f97316", "#3b82f6", "#8b5cf6", "#10b981", "#ec4899", "#f59e0b", "#06b6d4", "#64748b"];

function DonutChart({ data }: { data: Array<{ label: string; value: number }> }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <p className="py-4 text-center text-sm text-slate-400">Нет данных по источникам</p>;

  const r = 38;
  const cx = 52;
  const cy = 52;
  const circumference = 2 * Math.PI * r;

  let cumulative = 0;
  const segments = data.map((d, i) => {
    const dash = (d.value / total) * circumference;
    const offset = circumference - cumulative;
    const color = SOURCE_PALETTE[d.label] ?? DONUT_FALLBACK_COLORS[i % DONUT_FALLBACK_COLORS.length];
    cumulative += dash;
    return { label: d.label, value: d.value, dash, offset, color };
  });

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative shrink-0">
        <svg width={cx * 2} height={cy * 2} viewBox={`0 0 ${cx * 2} ${cy * 2}`}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth="13" />
          {segments.map((seg) => (
            <circle
              key={seg.label}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth="13"
              strokeDasharray={`${seg.dash} ${circumference - seg.dash}`}
              strokeDashoffset={seg.offset}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-xl font-bold text-slate-900">{total}</p>
          <p className="text-xs text-slate-400">сделок</p>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-2.5">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: seg.color }} />
            <span className="min-w-0 flex-1 truncate text-sm text-slate-600">{seg.label}</span>
            <span className="shrink-0 text-sm font-semibold text-slate-900">{seg.value}</span>
            <span className="w-10 shrink-0 text-right text-xs text-slate-400">{Math.round((seg.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ManagerRank({ items }: { items: Array<{ label: string; value: number; sum: number }> }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="space-y-3">
      {items.map((item, idx) => (
        <div key={item.label} className="flex items-center gap-3">
          <span className="w-5 shrink-0 text-center text-xs font-bold text-slate-400">{idx + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center justify-between gap-2 text-sm">
              <span className="truncate font-medium text-slate-700">{item.label}</span>
              <div className="shrink-0 text-right">
                <span className="font-semibold text-slate-900">{item.value}</span>
                <span className="ml-2 text-xs text-slate-400">{formatMoney(item.sum)}</span>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100">
              <div className="h-1.5 rounded-full bg-bakha-orange shadow-sm shadow-orange-500/20" style={{ width: `${(item.value / max) * 100}%` }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityFeed({ tasks: doneTasks }: { tasks: Task[] }) {
  if (doneTasks.length === 0) {
    return <p className="py-4 text-center text-sm text-slate-400">Нет завершённых событий</p>;
  }
  return (
    <div className="space-y-3">
      {doneTasks.map((t) => (
        <div key={t.id} className="flex items-start gap-2.5">
          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 size={13} className="text-emerald-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-slate-700">{t.title}</p>
            <p className="truncate text-xs text-slate-400">{t.client ?? t.leadTitle ?? "—"}</p>
          </div>
          <span className="shrink-0 text-xs text-slate-400">{formatDate(t.completedAt ?? t.dueAt)}</span>
        </div>
      ))}
    </div>
  );
}

function KanbanPage({ pipelineCode, title }: { pipelineCode: "sales" | "measurement"; title: string }) {
  const { pipelines, stages, leads, tasks, users, refresh } = useCrm();
  const notify = useToast();
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [query, setQuery] = useState("");
  const [manager, setManager] = useState("all");
  const [source, setSource] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const pipeline = pipelines.find((item) => item.code === pipelineCode);
  const columns = stages.filter((stage) => stage.pipelineId === pipeline?.id).sort((a, b) => a.sortOrder - b.sortOrder);
  const basePipelineLeads = leads.filter((item) => item.pipelineCode === pipelineCode);
  const pipelineLeads = basePipelineLeads.filter((item) => {
    const haystack = [item.id, item.amoId, item.leadNumber, item.title, item.contactName, item.contactPhone, item.address, item.source, item.responsibleName, item.paymentStatus].join(" ").toLowerCase();
    return haystack.includes(query.toLowerCase()) && (manager === "all" || item.responsibleName === manager) && (source === "all" || item.source === source) && (stageFilter === "all" || item.stageName === stageFilter);
  });
  const managerOptions = Array.from(new Set(basePipelineLeads.map((item) => item.responsibleName).filter(Boolean))) as string[];
  const sourceOptions = Array.from(new Set(basePipelineLeads.map((item) => item.source)));
  const subtitle = pipelineCode === "sales" ? "Плотная воронка продаж от первого обращения до реализации" : "Замеры, перерасчёты, предоплаты и монтаж";
  const todayMeasurements = pipelineLeads.filter((item) => item.measurementAt?.slice(0, 10) === "2026-06-01").length;
  const measured = pipelineLeads.filter((item) => ["Провели замер", "Сделан перерасчёт", "Предоплата", "Установка", "Полная оплата"].includes(item.stageName)).length;
  const prepay = pipelineLeads.filter((item) => ["Предоплата", "Установка", "Полная оплата", "Остаток долг"].includes(item.stageName)).length;
  const overdue = tasks.filter((item) => taskBucket(item) === "Просроченные").length;

  const kanbanRef = useRef<HTMLDivElement>(null);
  useHorizontalDragScroll(kanbanRef);

  // @dnd-kit sensors — pointer with 5 px movement threshold so normal clicks
  // are never treated as drags.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Optimistic stage overrides: leadId → stageId. Applied immediately on drag
  // drop so the card moves to the target column without waiting for the API.
  // On failure, the override is cleared and the card reverts to server state.
  const [optimisticStageMap, setOptimisticStageMap] = useState<Map<number, number>>(new Map());

  // The lead card currently being dragged (drives DragOverlay rendering).
  const [activeDragLead, setActiveDragLead] = useState<Lead | null>(null);

  // pipelineLeads with optimistic overrides applied
  const effectiveLeads = pipelineLeads.map((lead) => {
    const overrideStageId = optimisticStageMap.get(lead.id);
    if (overrideStageId !== undefined) {
      const stage = columns.find((s) => s.id === overrideStageId);
      return stage ? { ...lead, stageId: overrideStageId, stageName: stage.name } : lead;
    }
    return lead;
  });

  async function changeLeadStage(leadId: number, stageId: number) {
    // Optimistic update — card appears in target column immediately.
    setOptimisticStageMap((prev) => new Map(prev).set(leadId, stageId));
    try {
      await apiJson(`/api/leads/${leadId}/stage`, {
        method: "PATCH",
        body: JSON.stringify({ stageId })
      });
      await refresh();
      // Server state is now up-to-date — drop the optimistic override.
      setOptimisticStageMap((prev) => { const m = new Map(prev); m.delete(leadId); return m; });
      notify("Этап сделки сохранён.");
    } catch (error) {
      // Rollback: clear override so card snaps back to original column.
      setOptimisticStageMap((prev) => { const m = new Map(prev); m.delete(leadId); return m; });
      notify(error instanceof Error ? error.message : "Не удалось изменить этап сделки.");
    }
  }

  function handleDragStart({ active }: DragStartEvent) {
    setActiveDragLead((active.data.current?.lead as Lead) ?? null);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveDragLead(null);
    if (!over) return;
    const idStr = String(over.id);
    if (!idStr.startsWith("stage-")) return;
    const targetStageId = parseInt(idStr.slice(6), 10);
    if (isNaN(targetStageId)) return;
    const dragged = active.data.current?.lead as Lead | undefined;
    if (!dragged) return;
    const current = effectiveLeads.find((l) => l.id === dragged.id);
    if (current && current.stageId !== targetStageId) {
      void changeLeadStage(dragged.id, targetStageId);
    }
  }

  return (
    <>
      {showNewDeal ? <NewDealModal onClose={() => setShowNewDeal(false)} /> : null}
      <PageHeader title={title} subtitle={subtitle} action="Добавить сделку" onAction={() => setShowNewDeal(true)} />
      {pipelineCode === "measurement" ? (
        <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard icon={CalendarDays} label="Сегодня замеров" value={String(todayMeasurements)} caption="по расписанию" tone="orange" />
          <KpiCard icon={CheckCircle2} label="Провели замер" value={String(measured)} caption="готовы к расчёту" tone="green" />
          <KpiCard icon={Percent} label="Конверсия в предоплату" value={`${Math.round((prepay / Math.max(1, pipelineLeads.length)) * 100)}%`} caption="от замерной воронки" tone="slate" />
          <KpiCard icon={AlertTriangle} label="Просроченные задачи" value={String(overdue)} caption="по всем сделкам" tone="red" />
        </div>
      ) : null}
      <div className="mb-4 flex flex-wrap gap-2">
        <Chip label={`${pipelineLeads.length} сделок`} />
        <Chip label={formatMoney(pipelineLeads.reduce((sum, item) => sum + item.budget, 0))} />
        <Chip label="Плотный kanban" active />
        <Chip label="Автоширина колонок" />
      </div>
      <div className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:grid-cols-[1fr_190px_190px_190px]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
          <input
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-bakha-orange focus:bg-white focus:ring-4 focus:ring-orange-100"
            placeholder="Поиск по имени, телефону, amo_id, адресу, источнику"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <select className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-bakha-orange focus:bg-white" value={manager} onChange={(event) => setManager(event.target.value)}>
          <option value="all">Все менеджеры</option>
          {managerOptions.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <select className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-bakha-orange focus:bg-white" value={source} onChange={(event) => setSource(event.target.value)}>
          <option value="all">Все источники</option>
          {sourceOptions.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <select className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-bakha-orange focus:bg-white" value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
          <option value="all">Все этапы</option>
          {columns.map((option) => (
            <option key={option.id} value={option.name}>{option.name}</option>
          ))}
        </select>
      </div>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveDragLead(null)}
      >
        <div ref={kanbanRef} className="horizontal-drag-scroll scrollbar-thin -mx-4 flex gap-3 overflow-x-auto px-4 pb-5 lg:-mx-6 lg:px-6">
          {columns.map((stage) => {
            const stageLeads = effectiveLeads.filter((item) => item.stageName === stage.name);
            return (
              <KanbanColumn key={stage.id} stage={stage} stageLeads={stageLeads} isDragActive={activeDragLead !== null}>
                {!stageLeads.length ? (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-white/70 p-3 text-sm text-slate-500">Нет сделок по текущему фильтру</div>
                ) : null}
                {stageLeads.slice(0, KANBAN_COLUMN_LIMIT).map((leadItem) => (
                  <DraggableLeadCard
                    key={leadItem.id}
                    lead={leadItem}
                    nextTask={tasks.find((taskItem) => taskItem.leadId === leadItem.id && taskItem.status !== "done")}
                    measurer={users.find((user) => user.role === "measurer")?.name}
                    mode={pipelineCode}
                    stageOptions={columns}
                    onStageChange={changeLeadStage}
                  />
                ))}
                {stageLeads.length > KANBAN_COLUMN_LIMIT ? (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-white/80 p-3 text-center text-sm text-slate-500">
                    Показано {KANBAN_COLUMN_LIMIT} из {stageLeads.length}. Уточните поиск или фильтры.
                  </div>
                ) : null}
              </KanbanColumn>
            );
          })}
        </div>
        {/* Floating card rendered while dragging — positioned by @dnd-kit */}
        <DragOverlay dropAnimation={null}>
          {activeDragLead ? (
            <div className="w-[286px] rotate-[0.5deg] opacity-95 shadow-xl">
              <LeadCard
                lead={activeDragLead}
                nextTask={tasks.find((t) => t.leadId === activeDragLead.id && t.status !== "done")}
                measurer={users.find((u) => u.role === "measurer")?.name}
                mode={pipelineCode}
                stageOptions={columns}
                onStageChange={changeLeadStage}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      {/* Floating horizontal scrollbar — fixed to viewport bottom-right, always
          visible regardless of column height. Fades in on hover/scroll. */}
      <FloatingHorizontalScrollbar scrollRef={kanbanRef} />
    </>
  );
}

function LeadCard({
  lead: leadItem,
  nextTask,
  measurer,
  mode,
  stageOptions,
  onStageChange,
  preventNextClick,
}: {
  lead: Lead;
  nextTask?: Task;
  measurer?: string;
  mode: "sales" | "measurement";
  stageOptions: Stage[];
  onStageChange: (leadId: number, stageId: number) => void;
  preventNextClick?: { current: boolean };
}) {
  return (
    <Link
      to={`/leads/${leadItem.id}`}
      className="block rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-bakha-orange hover:shadow-panel"
      onClick={(e) => {
        if (preventNextClick?.current) {
          e.preventDefault();
          preventNextClick.current = false;
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-950">{mode === "sales" ? leadItem.contactName : leadItem.address}</h3>
          <p className="mt-0.5 truncate text-xs text-slate-500">{leadItem.title}</p>
        </div>
        <StatusPill label={leadItem.status} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        {mode === "sales" ? (
          <>
            <InfoLine label="Телефон" value={display(leadItem.contactPhone)} />
            <InfoLine label="Сумма" value={formatMoney(leadItem.budget)} />
            <InfoLine label="Источник" value={display(leadItem.source)} />
            <InfoLine label="Ответственный" value={display(leadItem.responsibleName)} />
          </>
        ) : (
          <>
            <InfoLine label="Дата" value={formatDate(leadItem.measurementAt)} />
            <InfoLine label="Замерщик" value={display(leadItem.measurerName ?? measurer)} />
            <InfoLine label="Площадь" value={`${leadItem.area ?? 0} м2`} />
            <InfoLine label="Сумма" value={formatMoney(leadItem.budget)} />
            <InfoLine label="Оплата" value={display(leadItem.paymentStatus)} />
            <InfoLine label="Ремонт" value={display(leadItem.repairStage)} />
          </>
        )}
      </div>
      <div className="mt-3 flex items-start gap-2 rounded-md bg-slate-50 px-2 py-2 text-xs text-slate-600">
        <Clock size={14} className="mt-0.5 shrink-0 text-bakha-orange" />
        <span className="min-w-0">
          <span className="font-medium text-slate-800">Задача:</span> {nextTask ? `${nextTask.title}, ${formatDate(nextTask.dueAt)}` : "нет задачи"}
        </span>
      </div>
      <select
        className="mt-2 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 outline-none transition focus:border-bakha-orange"
        value={leadItem.stageId}
        onClick={(event) => event.preventDefault()}
        onChange={(event) => {
          event.preventDefault();
          onStageChange(leadItem.id, Number(event.target.value));
        }}
      >
        {stageOptions.map((stage) => (
          <option key={stage.id} value={stage.id}>{stage.name}</option>
        ))}
      </select>
    </Link>
  );
}

// ─── Kanban Drag-and-Drop helpers ───────────────────────────────────────────

/**
 * A pipeline column that accepts dropped deal cards.
 * Highlights with an orange ring when a card is hovering over it.
 */
function KanbanColumn({
  stage,
  stageLeads,
  isDragActive,
  children,
}: {
  stage: Stage;
  stageLeads: Lead[];
  isDragActive: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `stage-${stage.id}` });
  const highlighted = isDragActive && isOver;
  return (
    <section
      ref={setNodeRef}
      className={[
        "flex w-[286px] shrink-0 flex-col rounded-xl border shadow-sm transition-colors duration-150",
        highlighted ? "border-bakha-orange bg-orange-50/60" : "border-slate-200 bg-[#eef1f5]",
      ].join(" ")}
    >
      <div className="sticky top-0 z-[1] rounded-t-xl border-b border-slate-200 bg-white px-3 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-slate-900">{stage.name}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{stageLeads.length} сделок</p>
          </div>
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
            {formatMoney(stageLeads.reduce((acc, l) => acc + l.budget, 0))}
          </span>
        </div>
      </div>
      <div className="scrollbar-thin min-h-[560px] space-y-2 overflow-y-auto p-2.5">
        {children}
      </div>
    </section>
  );
}

/**
 * Wraps a LeadCard in a @dnd-kit draggable container.
 *
 * - data-no-drag-scroll prevents the horizontal board scroll from activating
 *   when the user presses down on a card.
 * - preventNextClick suppresses the Link navigation that the browser would
 *   otherwise fire at the end of a completed drag gesture.
 */
function DraggableLeadCard(props: Omit<React.ComponentProps<typeof LeadCard>, "preventNextClick">) {
  const { lead } = props;
  const preventNextClick = useRef(false);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `lead-${lead.id}`,
    data: { lead },
  });

  useEffect(() => {
    if (isDragging) preventNextClick.current = true;
  }, [isDragging]);

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-no-drag-scroll
      style={{ opacity: isDragging ? 0 : 1 }}
    >
      <LeadCard {...props} preventNextClick={preventNextClick} />
    </div>
  );
}

/**
 * Floating auto-hide horizontal scrollbar overlay for any horizontally-
 * scrollable container (kanban board, task board, etc.).
 *
 * Positioning strategy: `position: fixed; bottom: 28px; right: 24px`
 * This keeps the scrollbar visible in the bottom-right corner of the
 * VIEWPORT at all times, regardless of how tall the board columns are.
 * Users never need to scroll vertically to reach it.
 *
 * Auto-hide: fades in on board hover/scroll, fades out after ~1.8 s of
 * inactivity. Never fades while the thumb is being dragged.
 *
 * Conflict-safe: sits outside the scroll container in the DOM so it
 * never triggers useHorizontalDragScroll or @dnd-kit card sensors.
 * The outer wrapper has pointer-events:none; only the track is interactive.
 */
function FloatingHorizontalScrollbar({
  scrollRef,
}: {
  scrollRef: { current: HTMLElement | null };
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const { thumbW, thumbX, hasOverflow, visible, show, scheduleHide, setDragging } =
    useFloatingHorizontalScrollbar(scrollRef as React.RefObject<HTMLElement | null>);

  if (!hasOverflow) return null;

  return (
    <div
      data-no-drag-scroll
      aria-hidden="true"
      className="pointer-events-none fixed z-50"
      style={{
        right: 24,
        bottom: 28,
        width: TRACK_W,
        opacity: visible ? 1 : 0,
        transition: "opacity 0.25s ease",
      }}
    >
      {/* Track — the only interactive surface */}
      <div
        ref={trackRef}
        className="pointer-events-auto relative h-3 overflow-hidden rounded-full"
        style={{
          background: "rgba(15, 23, 42, 0.68)",
          boxShadow:
            "0 2px 14px rgba(0,0,0,0.32), inset 0 1px 2px rgba(255,255,255,0.08)",
          backdropFilter: "blur(6px)",
        }}
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
        onClick={(e) => {
          // Click on empty track area → jump scroll to that position.
          if (e.target !== e.currentTarget) return;
          const el = scrollRef.current;
          if (!el) return;
          const rect = e.currentTarget.getBoundingClientRect();
          el.scrollLeft =
            ((e.clientX - rect.left) / rect.width) * (el.scrollWidth - el.clientWidth);
        }}
      >
        {/* Thumb */}
        <div
          className="kanban-scrollbar-thumb absolute inset-y-0 rounded-full will-change-transform"
          style={{
            background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
            width: `${thumbW}px`,
            transform: `translateX(${thumbX}px)`,
            boxShadow: "0 0 8px rgba(249,115,22,0.55)",
          }}
          onPointerDown={(e) => {
            const el = scrollRef.current;
            if (!el || e.button !== 0) return;
            e.preventDefault();
            // Stop propagation so the event cannot reach any parent
            // drag-scroll or @dnd-kit pointer sensor.
            e.stopPropagation();

            show();
            setDragging(true);

            const startX = e.clientX;
            const startScrollLeft = el.scrollLeft;
            const { scrollWidth, clientWidth } = el;
            const scrollMax = scrollWidth - clientWidth;
            // Use actual rendered track width for accurate scale.
            const trackW = trackRef.current?.clientWidth ?? TRACK_W;
            const tw = Math.max(MIN_THUMB, (clientWidth / scrollWidth) * trackW);
            const scale = scrollMax / Math.max(1, trackW - tw);

            document.body.classList.add("is-scrollbar-dragging");

            const onMove = (ev: PointerEvent) => {
              el.scrollLeft = Math.max(
                0,
                Math.min(scrollMax, startScrollLeft + (ev.clientX - startX) * scale)
              );
            };
            const onUp = () => {
              setDragging(false);
              document.body.classList.remove("is-scrollbar-dragging");
              document.removeEventListener("pointermove", onMove);
              document.removeEventListener("pointerup", onUp);
            };
            document.addEventListener("pointermove", onMove);
            document.addEventListener("pointerup", onUp);
          }}
        />
      </div>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-slate-400">{label}</p>
      <p className="truncate font-medium text-slate-700">{value}</p>
    </div>
  );
}

function Chip({ label, active = false }: { label: string; active?: boolean }) {
  return <span className={`rounded-full border px-3 py-1 text-sm font-medium ${active ? "border-bakha-orange bg-orange-50 text-orange-700" : "border-slate-200 bg-white text-slate-600"}`}>{label}</span>;
}

function StatusPill({ label }: { label: string }) {
  return <span className="shrink-0 rounded-full bg-orange-50 px-2 py-1 text-[11px] font-semibold text-orange-700 ring-1 ring-orange-100">{label}</span>;
}

function LeadDetailPage() {
  const { id } = useParams();
  const { leads, tasks, users, stages, wappi, telephony, refresh } = useCrm();
  const notify = useToast();
  const [activeTab, setActiveTab] = useState("Лента событий");
  const [chatMessage, setChatMessage] = useState("");
  const [detailNotes, setDetailNotes] = useState<LeadNote[]>([]);
  const [detailTasks, setDetailTasks] = useState<Task[]>([]);
  const [detailMessages, setDetailMessages] = useState<CrmMessage[]>([]);
  const [customValues, setCustomValues] = useState<LeadCustomValue[]>([]);
  const [historyEvents, setHistoryEvents] = useState<HistoryEvent[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [savingLead, setSavingLead] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [draft, setDraft] = useState<LeadDraft | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [taskDraft, setTaskDraft] = useState<TaskDraft>({
    title: "",
    description: "",
    dueDate: todayInputDate(),
    dueTime: "10:00",
    type: "call",
    priority: "normal",
    responsibleUserId: ""
  });
  const [leadSuggestions, setLeadSuggestions] = useState<AiSuggestionDraft[]>([]);
  const [leadConversation, setLeadConversation] = useState<{ id: number; aiPaused: boolean; aiPausedUntil?: string | null; aiPauseReason?: string | null } | null>(null);
  const [editingSuggestion, setEditingSuggestion] = useState<{ id: number; text: string } | null>(null);
  const [leadSuggestionAction, setLeadSuggestionAction] = useState<Record<number, "approving" | "rejecting" | "saving">>({});
  const [leadAiPauseLoading, setLeadAiPauseLoading] = useState(false);
  const leadItem = leads.find((item) => item.id === Number(id));

  async function loadLeadDetail(leadId: number) {
    try {
      const payload = await apiJson<{
        notes?: LeadNote[];
        customValues?: LeadCustomValue[];
        tasks?: Task[];
        messages?: CrmMessage[];
        aiSuggestions?: AiSuggestionDraft[];
        conversation?: { id: number; aiPaused: boolean; aiPausedUntil?: string | null; aiPauseReason?: string | null } | null;
      }>(`/api/leads/${leadId}`, { method: "GET" });
      const historyPayload = await apiJson<{ history?: HistoryEvent[] }>(`/api/leads/${leadId}/history`, { method: "GET" });
      setDetailNotes(payload.notes ?? []);
      setCustomValues(payload.customValues ?? []);
      setDetailTasks(payload.tasks ?? []);
      setDetailMessages(payload.messages ?? []);
      setHistoryEvents(historyPayload.history ?? []);
      setLeadSuggestions(payload.aiSuggestions ?? []);
      setLeadConversation(payload.conversation ?? null);
    } catch {
      setDetailNotes([]);
      setCustomValues([]);
      setDetailTasks([]);
      setDetailMessages([]);
      setHistoryEvents([]);
      setLeadSuggestions([]);
      setLeadConversation(null);
    }
  }

  useEffect(() => {
    let alive = true;
    if (!leadItem) return () => {
      alive = false;
    };
    setDraft(leadToDraft(leadItem));
    loadLeadDetail(leadItem.id).then(() => {
      if (!alive) return;
    });
    return () => {
      alive = false;
    };
  }, [leadItem?.id]);

  // Lightweight polling: refresh AI suggestions every 8s using focused endpoint (no full lead reload).
  useEffect(() => {
    if (!leadItem) return;
    const leadId = leadItem.id;
    const poll = () => {
      if (document.visibilityState !== "visible") return;
      apiJson<{ suggestions: AiSuggestionDraft[] }>(
        `/api/ai/suggestions?leadId=${leadId}&status=draft`, { method: "GET" }
      )
        .then((p) => { setLeadSuggestions(p.suggestions ?? []); })
        .catch(() => {});
    };
    const iv = setInterval(poll, 8_000);
    const onVisible = () => { if (document.visibilityState === "visible") poll(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [leadItem?.id]);

  if (!leadItem) return <PageHeader title="Сделка не найдена" subtitle="Проверьте ссылку или откройте сделку из kanban" />;
  const currentLead = leadItem;
  const leadTasks = detailTasks.length ? detailTasks : tasks.filter((taskItem) => taskItem.leadId === currentLead.id);
  const measurer = currentLead.measurerName ?? users.find((user) => user.role === "measurer")?.name ?? "Данияр Замерщик";
  const installer = currentLead.installerName ?? users.find((user) => user.role === "installer")?.name ?? "Руслан Монтажник";
  const pipelineStages = stages.filter((stage) => stage.pipelineId === currentLead.pipelineId).sort((a, b) => a.sortOrder - b.sortOrder);

  async function saveLead() {
    if (!draft) return;
    setSavingLead(true);
    try {
      await apiJson(`/api/leads/${currentLead.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: draft.title,
          budget: Number(draft.budget || 0),
          region: draft.region,
          source: draft.source,
          area: draft.area ? Number(draft.area) : null,
          repairStage: draft.repairStage,
          measurementAt: fromInputDateTime(draft.measurementAt),
          address: draft.address,
          measurerName: draft.measurerName,
          installerName: draft.installerName,
          refusalReason: draft.refusalReason,
          paymentStatus: draft.paymentStatus,
          responsibleId: draft.responsibleId ? Number(draft.responsibleId) : null
        })
      });
      await refresh();
      await loadLeadDetail(currentLead.id);
      setIsEditing(false);
      notify("Сделка сохранена.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось сохранить сделку.");
    } finally {
      setSavingLead(false);
    }
  }

  async function changeStage(stageId: number) {
    try {
      await apiJson(`/api/leads/${currentLead.id}/stage`, {
        method: "PATCH",
        body: JSON.stringify({ stageId })
      });
      await refresh();
      await loadLeadDetail(currentLead.id);
      notify("Этап сделки сохранён.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось изменить этап.");
    }
  }

  async function createTask() {
    if (!taskDraft.title.trim()) {
      notify("Введите название задачи.");
      return;
    }
    setSavingTask(true);
    try {
      await apiJson("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          leadId: currentLead.id,
          title: taskDraft.title,
          description: taskDraft.description,
          dueAt: taskDueAt(taskDraft.dueDate, taskDraft.dueTime),
          type: taskDraft.type,
          priority: taskDraft.priority,
          responsibleUserId: taskDraft.responsibleUserId ? Number(taskDraft.responsibleUserId) : currentLead.responsibleId,
          status: "open"
        })
      });
      setTaskDraft({ title: "", description: "", dueDate: todayInputDate(), dueTime: "10:00", type: "call", priority: "normal", responsibleUserId: "" });
      await refresh();
      await loadLeadDetail(currentLead.id);
      notify("Задача создана.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось создать задачу.");
    } finally {
      setSavingTask(false);
    }
  }

  async function completeTask(taskId: number) {
    try {
      await apiJson(`/api/tasks/${taskId}/complete`, { method: "POST" });
      await refresh();
      await loadLeadDetail(currentLead.id);
      notify("Задача выполнена.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось выполнить задачу.");
    }
  }

  async function addNote() {
    if (!noteBody.trim()) {
      notify("Введите текст заметки.");
      return;
    }
    setSavingNote(true);
    try {
      await apiJson("/api/notes", {
        method: "POST",
        body: JSON.stringify({ leadId: currentLead.id, body: noteBody })
      });
      setNoteBody("");
      await loadLeadDetail(currentLead.id);
      notify("Заметка сохранена.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось сохранить заметку.");
    } finally {
      setSavingNote(false);
    }
  }

  async function sendWappiChatMessage() {
    if (!chatMessage.trim()) {
      notify("Введите сообщение перед отправкой.");
      return;
    }
    setSendingMessage(true);
    try {
      const payload = await apiJson<{ message: CrmMessage; dryRun?: boolean; localOnly?: boolean }>(`/api/leads/${currentLead.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ text: chatMessage })
      });
      setChatMessage("");
      await loadLeadDetail(currentLead.id);
      if (payload.localOnly) {
        notify("WAPPI не подключен. Сообщение сохранено локально в CRM.");
      } else if (payload.dryRun) {
        notify("Dry-run: сообщение сохранено в CRM без реальной отправки.");
      } else {
        notify("Сообщение отправлено через WhatsApp.");
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось отправить сообщение WAPPI.");
    } finally {
      setSendingMessage(false);
    }
  }

  // ─── AI Manager helpers for LeadDetailPage ──────────────────────────────
  async function approveLeadSuggestion(suggestionId: number) {
    setLeadSuggestionAction((prev) => ({ ...prev, [suggestionId]: "approving" }));
    try {
      const result = await apiJson<{ ok: boolean; dryRun?: boolean }>(`/api/ai/suggestions/${suggestionId}/approve`, { method: "POST" });
      await loadLeadDetail(currentLead.id);
      notify(result.dryRun ? "Ответ AI одобрен и сохранён (dry-run)." : "Ответ AI отправлен клиенту.");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Не удалось отправить ответ AI.");
    } finally {
      setLeadSuggestionAction((prev) => { const m = { ...prev }; delete m[suggestionId]; return m; });
    }
  }

  async function rejectLeadSuggestion(suggestionId: number) {
    setLeadSuggestionAction((prev) => ({ ...prev, [suggestionId]: "rejecting" }));
    try {
      await apiJson(`/api/ai/suggestions/${suggestionId}/reject`, { method: "POST" });
      await loadLeadDetail(currentLead.id);
      notify("Предложение AI отклонено.");
    } catch {
      notify("Не удалось отклонить предложение AI.");
    } finally {
      setLeadSuggestionAction((prev) => { const m = { ...prev }; delete m[suggestionId]; return m; });
    }
  }

  async function saveEditedSuggestion() {
    if (!editingSuggestion) return;
    const { id, text } = editingSuggestion;
    if (!text.trim()) { notify("Текст ответа не может быть пустым."); return; }
    setLeadSuggestionAction((prev) => ({ ...prev, [id]: "saving" }));
    try {
      await apiJson(`/api/ai/suggestions/${id}`, { method: "PATCH", body: JSON.stringify({ replyText: text }) });
      setEditingSuggestion(null);
      await loadLeadDetail(currentLead.id);
      notify("Текст ответа AI изменён.");
    } catch {
      notify("Не удалось сохранить изменения.");
    } finally {
      setLeadSuggestionAction((prev) => { const m = { ...prev }; delete m[id]; return m; });
    }
  }

  async function pauseLeadAI(mode: "30m" | "off") {
    if (!leadConversation) return;
    setLeadAiPauseLoading(true);
    try {
      await apiJson(`/api/conversations/${leadConversation.id}/ai/pause`, { method: "POST", body: JSON.stringify({ mode }) });
      await loadLeadDetail(currentLead.id);
      notify(mode === "30m" ? "AI приостановлен на 30 минут." : "AI отключён для этого диалога.");
    } catch {
      notify("Не удалось изменить статус AI.");
    } finally {
      setLeadAiPauseLoading(false);
    }
  }

  async function resumeLeadAI() {
    if (!leadConversation) return;
    setLeadAiPauseLoading(true);
    try {
      await apiJson(`/api/conversations/${leadConversation.id}/ai/resume`, { method: "POST" });
      await loadLeadDetail(currentLead.id);
      notify("AI возобновлён.");
    } catch {
      notify("Не удалось возобновить AI.");
    } finally {
      setLeadAiPauseLoading(false);
    }
  }

  // ─── AmoCRM-style 3-column deal workspace ────────────────────────────────
  const nextTask = leadTasks.find((t) => t.status !== "done");

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">

      {/* ── LEFT: compact deal info panel ─────────────────────────────────── */}
      <aside className="hidden w-[292px] shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white lg:flex">
        {/* Back + deal number header */}
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <Link to={`/${leadItem.pipelineCode === "sales" ? "sales" : "measurements"}`} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-bakha-orange hover:text-bakha-orange">
            <ChevronRight size={14} className="rotate-180" />
          </Link>
          <div className="min-w-0">
            <span className="rounded-full bg-bakha-orange px-2.5 py-0.5 text-[11px] font-bold text-white">{leadItem.leadNumber}</span>
            {leadItem.amoId ? <span className="ml-1.5 text-[11px] text-slate-400">amo#{leadItem.amoId}</span> : null}
          </div>
        </div>

        {/* Deal title + pipeline */}
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{leadItem.pipelineName}</p>
          <h1 className="mt-1 text-sm font-semibold leading-snug text-slate-900">{leadItem.title}</h1>
          <p className="mt-0.5 text-xs text-slate-500">{leadItem.daysInStage} дн. в этапе</p>
        </div>

        {/* Stage selector */}
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Этап</p>
          <select
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 outline-none transition focus:border-bakha-orange focus:bg-white"
            value={leadItem.stageId}
            onChange={(event) => changeStage(Number(event.target.value))}
          >
            {pipelineStages.map((stage) => (
              <option key={stage.id} value={stage.id}>{stage.name}</option>
            ))}
          </select>
        </div>

        {/* Tabs: Основное | Статистика | Файлы | Настроить */}
        <div className="border-b border-slate-100 px-4">
          <div className="flex gap-0">
            {["Основное", "Статистика", "Файлы", "Настроить"].map((tab) => (
              <button
                key={tab}
                className={`border-b-2 px-3 py-2.5 text-xs font-semibold transition ${activeTab === tab ? "border-bakha-orange text-bakha-orange" : "border-transparent text-slate-500 hover:text-slate-800"}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Edit bar */}
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
          <span>{isEditing ? "Режим редактирования" : "Данные CRM DB"}</span>
          <div className="flex gap-2">
            {isEditing ? (
              <>
                <button className="font-semibold text-slate-500" onClick={() => { setDraft(leadToDraft(leadItem)); setIsEditing(false); }}>Отмена</button>
                <button className="font-semibold text-bakha-orange disabled:opacity-60" disabled={savingLead} onClick={saveLead}>{savingLead ? "Сохр..." : "Сохранить"}</button>
              </>
            ) : (
              <button className="font-semibold text-bakha-orange" onClick={() => setIsEditing(true)}>Редактировать</button>
            )}
          </div>
        </div>

        {/* Field list / edit form */}
        {activeTab === "Основное" ? (
          <div className="flex-1 px-4 py-3">
            {isEditing && draft ? (
              <div className="space-y-2.5 text-sm">
                <EditField label="Название" value={draft.title} onChange={(v) => setDraft({ ...draft, title: v })} />
                <EditField label="Бюджет" value={draft.budget} type="number" onChange={(v) => setDraft({ ...draft, budget: v })} />
                <label className="block text-xs font-semibold text-slate-500">
                  Ответственный
                  <select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-bakha-orange" value={draft.responsibleId} onChange={(e) => setDraft({ ...draft, responsibleId: e.target.value })}>
                    <option value="">—</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </label>
                <EditField label="Регион" value={draft.region} onChange={(v) => setDraft({ ...draft, region: v })} />
                <EditField label="Источник" value={draft.source} onChange={(v) => setDraft({ ...draft, source: v })} />
                <EditField label="Площадь (м²)" value={draft.area} type="number" onChange={(v) => setDraft({ ...draft, area: v })} />
                <EditField label="Стадия ремонта" value={draft.repairStage} onChange={(v) => setDraft({ ...draft, repairStage: v })} />
                <EditField label="Дата замера" value={draft.measurementAt} type="datetime-local" onChange={(v) => setDraft({ ...draft, measurementAt: v })} />
                <EditField label="Адрес" value={draft.address} onChange={(v) => setDraft({ ...draft, address: v })} />
                <EditField label="Замерщик" value={draft.measurerName} onChange={(v) => setDraft({ ...draft, measurerName: v })} />
                <EditField label="Установщик" value={draft.installerName} onChange={(v) => setDraft({ ...draft, installerName: v })} />
                <EditField label="Причина отказа" value={draft.refusalReason} onChange={(v) => setDraft({ ...draft, refusalReason: v })} />
                <EditField label="Статус оплаты" value={draft.paymentStatus} onChange={(v) => setDraft({ ...draft, paymentStatus: v })} />
              </div>
            ) : (
              <div className="space-y-0">
                {([
                  ["Ответственный", display(leadItem.responsibleName)],
                  ["Бюджет", formatMoney(leadItem.budget)],
                  ["Номер договора", display(leadItem.contractNumber)],
                  ["Регион", display(leadItem.region)],
                  ["Источник", display(leadItem.source)],
                  ["Номер шаблона", "—"],
                  ["Площадь", leadItem.area ? `${leadItem.area} м²` : "—"],
                  ["Стадия ремонта", display(leadItem.repairStage)],
                  ["Дата замера", formatDate(leadItem.measurementAt)],
                  ["Адрес", display(leadItem.address)],
                  ["Замерщик", display(measurer)],
                  ["Установщик", display(installer)],
                  ["Причина отказа", display(leadItem.refusalReason)],
                  ["Статус оплаты", display(leadItem.paymentStatus)],
                  ["Компания/клиент", display(leadItem.contactName)],
                  ["Телефон", display(leadItem.contactPhone)],
                ] as [string, string][]).map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-2 border-b border-slate-50 py-2 text-xs last:border-0">
                    <span className="shrink-0 text-slate-400">{label}</span>
                    <span className="min-w-0 break-words text-right font-medium text-slate-800">{value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : activeTab === "Статистика" ? (
          <div className="flex-1 px-4 py-4">
            <div className="grid gap-2">
              <div className="rounded-lg bg-slate-50 p-3 text-xs">
                <p className="text-slate-400">Дней в текущем этапе</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{leadItem.daysInStage}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 text-xs">
                <p className="text-slate-400">Бюджет сделки</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{formatMoney(leadItem.budget)}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 text-xs">
                <p className="text-slate-400">Статус</p>
                <p className="mt-1 font-semibold text-slate-900">{display(leadItem.status)}</p>
              </div>
            </div>
          </div>
        ) : activeTab === "Файлы" ? (
          <div className="flex-1 space-y-2 px-4 py-4 text-sm">
            <FileRow name="Замерный лист.pdf" size="248 КБ" />
            <FileRow name="Фото объекта.zip" size="8.4 МБ" />
            <button className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-bakha-orange" onClick={() => notify("Загрузка файлов будет подключена позже.")}>Прикрепить файл</button>
          </div>
        ) : (
          <div className="flex-1 px-4 py-4 text-xs text-slate-400">
            {customValues.length ? (
              <div className="space-y-2">
                <p className="font-semibold text-slate-600">Custom fields AmoCRM</p>
                {customValues.slice(0, 12).map((item) => (
                  <div key={item.id} className="flex justify-between gap-2 border-b border-slate-50 py-1.5 last:border-0">
                    <span className="text-slate-400">{display(item.fieldName ?? item.fieldCode)}</span>
                    <span className="text-right font-medium text-slate-700">{display(item.value)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p>Настройки карточки будут доступны позже.</p>
            )}
          </div>
        )}
      </aside>

      {/* ── CENTER: AmoCRM-style communication feed ────────────────────────── */}
      <main className="flex flex-1 min-w-0 flex-col overflow-hidden bg-[#f5f6f8]">
        {/* Search & filter bar */}
        <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-sm outline-none transition focus:border-bakha-orange focus:bg-white"
              placeholder="Поиск и фильтр"
              readOnly
              onClick={() => notify("Поиск по ленте событий будет подключён позже.")}
            />
          </div>
          <WappiStateBadge wappi={wappi} />
        </div>

        {/* Event feed — scrollable */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <AmoFeed
            lead={leadItem}
            tasks={leadTasks}
            notes={detailNotes}
            messages={detailMessages}
            historyEvents={historyEvents}
            onCompleteTask={completeTask}
          />
        </div>

        {/* Tabbed composer: WAPPI chat | Notes | Tasks */}
        <div className="shrink-0 border-t border-slate-200 bg-white">
          {/* Tab bar */}
          <div className="flex border-b border-slate-100 px-3">
            {(["Чат WAPPI", "Примечания", "Задачи"] as const).map((tab) => (
              <button
                key={tab}
                className={`border-b-2 px-3 py-2 text-xs font-semibold transition ${activeTab === tab ? "border-bakha-orange text-bakha-orange" : "border-transparent text-slate-500 hover:text-slate-800"}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Чат WAPPI */}
          {activeTab !== "Примечания" && activeTab !== "Задачи" && (
            <div className="p-3 space-y-2">
              {/* AI status bar — compact, only when conversation linked */}
              {leadConversation && (
                <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <Bot size={11} className={leadConversation.aiPaused ? "text-amber-500" : "text-emerald-500"} />
                    <span className={`text-[11px] font-medium ${leadConversation.aiPaused ? "text-amber-600" : "text-emerald-600"}`}>
                      {leadConversation.aiPaused ? "AI на паузе" : "AI включён"}
                    </span>
                    {leadConversation.aiPausedUntil && leadConversation.aiPaused && (() => {
                      const until = new Date(leadConversation.aiPausedUntil!);
                      if (until > new Date()) {
                        const minLeft = Math.ceil((until.getTime() - Date.now()) / 60_000);
                        return <span className="text-[10px] text-slate-400">({minLeft} мин)</span>;
                      }
                      return null;
                    })()}
                  </div>
                  <div className="flex gap-1">
                    {leadConversation.aiPaused ? (
                      <button
                        className="rounded px-2 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                        onClick={() => void resumeLeadAI()}
                        disabled={leadAiPauseLoading}
                      >
                        Включить AI
                      </button>
                    ) : (
                      <>
                        <button
                          className="rounded px-2 py-0.5 text-[10px] font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                          onClick={() => void pauseLeadAI("30m")}
                          disabled={leadAiPauseLoading}
                        >
                          Пауза 30 мин
                        </button>
                        <button
                          className="rounded px-2 py-0.5 text-[10px] font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                          onClick={() => void pauseLeadAI("off")}
                          disabled={leadAiPauseLoading}
                        >
                          Выкл
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* AI draft suggestion cards */}
              {leadSuggestions.filter((s) => s.status === "draft").map((suggestion) => (
                <div key={suggestion.id} className="rounded-xl border border-violet-200 bg-violet-50 p-3">
                  <div className="mb-2 flex items-center gap-1.5">
                    <Bot size={13} className="text-violet-600" />
                    <span className="text-xs font-semibold text-violet-700">AI предложил ответ</span>
                    {suggestion.confidence !== null && suggestion.confidence !== undefined && (
                      <span className="ml-auto rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-600">
                        {Math.round(suggestion.confidence * 100)}%
                      </span>
                    )}
                  </div>

                  {/* Edit mode */}
                  {editingSuggestion?.id === suggestion.id ? (
                    <div className="mb-2 space-y-1.5">
                      <textarea
                        className="w-full min-h-[72px] rounded-lg border border-violet-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                        value={editingSuggestion.text}
                        onChange={(e) => setEditingSuggestion({ id: suggestion.id, text: e.target.value })}
                      />
                      <div className="flex gap-1.5">
                        <button
                          className="flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
                          disabled={leadSuggestionAction[suggestion.id] === "saving"}
                          onClick={() => void saveEditedSuggestion()}
                        >
                          {leadSuggestionAction[suggestion.id] === "saving" ? "Сохранение..." : "Сохранить"}
                        </button>
                        <button
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                          onClick={() => setEditingSuggestion(null)}
                        >
                          Отмена
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mb-2 rounded-lg bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">{suggestion.replyText}</p>
                  )}

                  {/* Suggested CRM actions — read-only preview */}
                  {suggestion.suggestedActionsJson && (() => {
                    try {
                      const actions = JSON.parse(suggestion.suggestedActionsJson) as Array<{ type?: string; payload?: Record<string, unknown> }>;
                      if (!Array.isArray(actions) || actions.length === 0) return null;
                      return (
                        <div className="mb-2 rounded-lg border border-violet-100 bg-white/60 px-3 py-2 text-xs">
                          <p className="mb-1 font-semibold text-violet-600">AI предложил действия:</p>
                          <ul className="space-y-0.5 text-slate-600">
                            {actions.map((action, i) => (
                              <li key={i} className="flex items-center gap-1.5">
                                <span className="h-1 w-1 shrink-0 rounded-full bg-violet-400" />
                                {action.type === "create_task" ? `Задача: «${String(action.payload?.title ?? "").slice(0, 50)}»`
                                  : action.type === "set_stage" ? `Этап → «${String(action.payload?.stage ?? "")}»`
                                  : action.type === "add_note" ? `Заметка: «${String(action.payload?.note ?? "").slice(0, 50)}»`
                                  : action.type === "add_tag" ? `Тег: «${String(action.payload?.tag ?? "")}»`
                                  : String(action.type ?? "действие")}
                              </li>
                            ))}
                          </ul>
                          <p className="mt-1.5 text-slate-400">Будет доступно для применения после настройки правил</p>
                        </div>
                      );
                    } catch { return null; }
                  })()}

                  {/* Action buttons */}
                  {editingSuggestion?.id !== suggestion.id && (
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        className="flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
                        disabled={leadSuggestionAction[suggestion.id] === "approving"}
                        onClick={() => void approveLeadSuggestion(suggestion.id)}
                      >
                        <Send size={11} />
                        {leadSuggestionAction[suggestion.id] === "approving" ? "..." : "Отправить"}
                      </button>
                      <button
                        className="flex items-center gap-1 rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-60"
                        onClick={() => setEditingSuggestion({ id: suggestion.id, text: suggestion.replyText ?? "" })}
                      >
                        <Pencil size={11} />
                        Редактировать
                      </button>
                      <button
                        className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-red-300 hover:text-red-600 disabled:opacity-60"
                        disabled={leadSuggestionAction[suggestion.id] === "rejecting"}
                        onClick={() => void rejectLeadSuggestion(suggestion.id)}
                      >
                        <X size={11} />
                        {leadSuggestionAction[suggestion.id] === "rejecting" ? "..." : "Отклонить"}
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {/* Chat input */}
              <div className="flex items-center gap-2 text-xs text-slate-500 pt-1">
                <MessageCircle size={13} />
                <span>Чат для {display(leadItem.contactName)}</span>
                <span className="ml-auto rounded-full border border-slate-200 px-2 py-0.5 font-semibold">WAPPI</span>
              </div>
              <div className="flex gap-2">
                <input
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-bakha-orange focus:bg-white focus:ring-4 focus:ring-orange-100"
                  placeholder="Введите текст..."
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendWappiChatMessage(); } }}
                />
                <button
                  className="flex items-center gap-1.5 rounded-lg bg-bakha-orange px-3 py-2 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-600 disabled:opacity-60"
                  disabled={sendingMessage}
                  onClick={sendWappiChatMessage}
                >
                  <Send size={15} />
                  {sendingMessage ? "Отправка..." : "Отправить"}
                </button>
              </div>
            </div>
          )}

          {/* Примечания */}
          {activeTab === "Примечания" && (
            <div className="p-3 space-y-2">
              <textarea
                className="min-h-16 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-bakha-orange focus:ring-4 focus:ring-orange-100"
                placeholder="Новая заметка"
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
              />
              <button
                className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-bakha-orange disabled:opacity-60"
                disabled={savingNote}
                onClick={addNote}
              >
                {savingNote ? "Сохранение..." : "Сохранить заметку"}
              </button>
            </div>
          )}

          {/* Задачи */}
          {activeTab === "Задачи" && (
            <div className="p-3 space-y-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-bakha-orange"
                  placeholder="Название задачи"
                  value={taskDraft.title}
                  onChange={(e) => setTaskDraft({ ...taskDraft, title: e.target.value })}
                />
                <select
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-bakha-orange"
                  value={taskDraft.responsibleUserId}
                  onChange={(e) => setTaskDraft({ ...taskDraft, responsibleUserId: e.target.value })}
                >
                  <option value="">Ответственный по сделке</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-bakha-orange" type="date" value={taskDraft.dueDate} onChange={(e) => setTaskDraft({ ...taskDraft, dueDate: e.target.value })} />
                <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-bakha-orange" type="time" value={taskDraft.dueTime} onChange={(e) => setTaskDraft({ ...taskDraft, dueTime: e.target.value })} />
                <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-bakha-orange" value={taskDraft.type} onChange={(e) => setTaskDraft({ ...taskDraft, type: e.target.value })}>
                  <option value="call">Звонок</option>
                  <option value="message">Сообщение</option>
                  <option value="meeting">Встреча</option>
                  <option value="measurement">Замер</option>
                  <option value="quote">КП</option>
                </select>
                <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-bakha-orange" value={taskDraft.priority} onChange={(e) => setTaskDraft({ ...taskDraft, priority: e.target.value })}>
                  <option value="normal">Обычный</option>
                  <option value="high">Высокий</option>
                  <option value="low">Низкий</option>
                </select>
              </div>
              <button
                className="rounded-lg bg-bakha-orange px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                disabled={savingTask}
                onClick={createTask}
              >
                {savingTask ? "Создание..." : "Добавить задачу"}
              </button>
            </div>
          )}
        </div>
      </main>

      {/* ── RIGHT: quick actions panel ─────────────────────────────────────── */}
      <aside className="hidden w-[268px] shrink-0 flex-col gap-0 overflow-y-auto border-l border-slate-200 bg-white xl:flex">

        {/* Следующее действие */}
        <div className="border-b border-slate-100 p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Следующее действие</p>
          {nextTask ? (
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-900">{nextTask.title}</p>
              <p className="mt-1 text-xs text-slate-500">{formatDate(nextTask.dueAt)} · {display(nextTask.assigneeName)}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Нет активной задачи</p>
          )}
          <button
            className="mt-3 w-full rounded-lg bg-bakha-orange py-2 text-sm font-semibold text-white transition hover:bg-orange-600"
            onClick={() => setActiveTab("Задачи")}
          >
            Поставить задачу
          </button>
        </div>

        {/* Quick action buttons */}
        <div className="border-b border-slate-100 p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Быстрые действия</p>
          <div className="grid grid-cols-2 gap-2">
            <CallButton leadId={currentLead.id} phone={leadItem.contactPhone} telephony={telephony} />
            {leadItem.contactPhone ? (
              <a href={`https://wa.me/${leadItem.contactPhone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-500 hover:text-emerald-600">
                <MessageCircle size={14} /> WhatsApp
              </a>
            ) : (
              <button className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-400" disabled>
                <MessageCircle size={14} /> WhatsApp
              </button>
            )}
            <button className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-700 transition hover:border-bakha-orange hover:text-bakha-orange" onClick={() => setActiveTab("Задачи")}>
              <CheckSquare size={14} /> Задача
            </button>
            <button className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-700 transition hover:border-bakha-orange hover:text-bakha-orange" onClick={() => setActiveTab("Примечания")}>
              <FileText size={14} /> Заметка
            </button>
          </div>
        </div>

        {/* Tasks list */}
        {leadTasks.length > 0 && (
          <div className="border-b border-slate-100 p-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Задачи</p>
            <div className="space-y-2">
              {leadTasks.slice(0, 3).map((t) => (
                <div key={t.id} className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                  <p className="text-xs font-semibold text-slate-800">{t.title}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">{formatDate(t.dueAt)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Финансы */}
        <div className="border-b border-slate-100 p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Финансы</p>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">Сумма</span>
              <span className="font-semibold text-slate-900">{formatMoney(leadItem.budget)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Оплата</span>
              <span className="font-medium text-slate-700">{display(leadItem.paymentStatus)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Договор</span>
              <span className="font-medium text-slate-700">{display(leadItem.contractNumber)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Замер</span>
              <span className="font-medium text-slate-700">{formatDate(leadItem.measurementAt)}</span>
            </div>
          </div>
        </div>

        {/* Файлы */}
        <div className="p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Файлы</p>
          <div className="space-y-1.5 text-sm">
            <FileRow name="Замерный лист.pdf" size="248 КБ" />
            <FileRow name="Фото объекта.zip" size="8.4 МБ" />
          </div>
        </div>
      </aside>
    </div>
  );
}

function EditField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="block text-xs font-semibold text-slate-500">
      {label}
      <input
        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-bakha-orange focus:ring-4 focus:ring-orange-100"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function LeadTabContent({
  activeTab,
  lead,
  tasks,
  notes,
  messages,
  customValues,
  historyEvents,
  users,
  wappi,
  chatMessage,
  setChatMessage,
  notify,
  sendingMessage,
  onSendMessage,
  noteBody,
  setNoteBody,
  savingNote,
  onAddNote,
  taskDraft,
  setTaskDraft,
  savingTask,
  onCreateTask,
  onCompleteTask
}: {
  activeTab: string;
  lead: Lead;
  tasks: Task[];
  notes: LeadNote[];
  messages: CrmMessage[];
  customValues: LeadCustomValue[];
  historyEvents: HistoryEvent[];
  users: User[];
  wappi?: WappiStatus;
  chatMessage: string;
  setChatMessage: (value: string) => void;
  notify: (message: string) => void;
  sendingMessage: boolean;
  onSendMessage: () => void;
  noteBody: string;
  setNoteBody: (value: string) => void;
  savingNote: boolean;
  onAddNote: () => void;
  taskDraft: TaskDraft;
  setTaskDraft: (value: TaskDraft) => void;
  savingTask: boolean;
  onCreateTask: () => void;
  onCompleteTask: (taskId: number) => void;
}) {
  if (activeTab === "Чат WAPPI") {
    return (
      <div className="space-y-3 text-sm">
        <WappiStateBadge wappi={wappi} />
        <MessageList messages={messages} />
        <div className="flex gap-2">
          <input className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-bakha-orange focus:ring-4 focus:ring-orange-100" placeholder="Сообщение" value={chatMessage} onChange={(event) => setChatMessage(event.target.value)} />
          <button className="rounded-lg bg-bakha-orange px-3 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={sendingMessage} onClick={onSendMessage}>{sendingMessage ? "Отправка..." : "Отправить"}</button>
        </div>
      </div>
    );
  }

  if (activeTab === "Файлы") {
    return (
      <div className="space-y-2 text-sm">
        <FileRow name="Замерный лист.pdf" size="248 КБ" />
        <FileRow name="Фото объекта.zip" size="8.4 МБ" />
        <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-bakha-orange" onClick={() => notify("Загрузка файлов будет подключена позже.")}>Прикрепить файл</button>
      </div>
    );
  }

  if (activeTab === "Задачи") {
    return (
      <div className="space-y-3">
        {tasks.map((taskItem) => (
          <div key={taskItem.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">{taskItem.title}</p>
                <p className="mt-1 text-xs text-slate-500">{formatDate(taskItem.dueAt)} · {display(taskItem.assigneeName)} · {display(taskItem.status)}</p>
              </div>
              {taskItem.status !== "done" ? (
                <button className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100" onClick={() => onCompleteTask(taskItem.id)}>Выполнить</button>
              ) : (
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500">Готово</span>
              )}
            </div>
          </div>
        ))}
        {!tasks.length ? <EmptyState title="Нет задач" text="Для этой сделки пока нет задач." /> : null}
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="grid gap-2 md:grid-cols-2">
            <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-bakha-orange" placeholder="Название задачи" value={taskDraft.title} onChange={(event) => setTaskDraft({ ...taskDraft, title: event.target.value })} />
            <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-bakha-orange" value={taskDraft.responsibleUserId} onChange={(event) => setTaskDraft({ ...taskDraft, responsibleUserId: event.target.value })}>
              <option value="">Ответственный по сделке</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </select>
            <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-bakha-orange" type="date" value={taskDraft.dueDate} onChange={(event) => setTaskDraft({ ...taskDraft, dueDate: event.target.value })} />
            <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-bakha-orange" type="time" value={taskDraft.dueTime} onChange={(event) => setTaskDraft({ ...taskDraft, dueTime: event.target.value })} />
            <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-bakha-orange" value={taskDraft.type} onChange={(event) => setTaskDraft({ ...taskDraft, type: event.target.value })}>
              <option value="call">Звонок</option>
              <option value="message">Сообщение</option>
              <option value="meeting">Встреча</option>
              <option value="measurement">Замер</option>
              <option value="quote">КП</option>
            </select>
            <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-bakha-orange" value={taskDraft.priority} onChange={(event) => setTaskDraft({ ...taskDraft, priority: event.target.value })}>
              <option value="normal">Обычный</option>
              <option value="high">Высокий</option>
              <option value="low">Низкий</option>
            </select>
          </div>
          <textarea className="mt-2 min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-bakha-orange" placeholder="Описание" value={taskDraft.description} onChange={(event) => setTaskDraft({ ...taskDraft, description: event.target.value })} />
          <button className="mt-2 rounded-lg bg-bakha-orange px-3 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={savingTask} onClick={onCreateTask}>{savingTask ? "Создание..." : "Добавить задачу"}</button>
        </div>
      </div>
    );
  }

  if (activeTab === "Примечания") {
    return (
      <div className="space-y-3">
        {notes.length ? (
          notes.slice(0, 8).map((note) => (
            <div key={note.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p>{note.body}</p>
              <p className="mt-1 text-xs text-slate-400">{formatDate(note.createdAt)}</p>
            </div>
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500">Создана demo-сделка из источника {lead.source}.</div>
        )}
        <textarea className="min-h-24 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-bakha-orange focus:ring-4 focus:ring-orange-100" placeholder="Новая заметка" value={noteBody} onChange={(event) => setNoteBody(event.target.value)} />
        <button className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-bakha-orange disabled:opacity-60" disabled={savingNote} onClick={onAddNote}>{savingNote ? "Сохранение..." : "Сохранить заметку"}</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Timeline lead={lead} tasks={tasks} notes={notes} historyEvents={historyEvents} />
      {notes.length ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-sm font-semibold text-slate-800">Последние примечания AmoCRM</p>
          <div className="space-y-2">
            {notes.slice(0, 5).map((note) => (
              <div key={note.id} className="rounded-md bg-white px-3 py-2 text-xs text-slate-700">
                <p className="line-clamp-2">{display(note.body)}</p>
                <p className="mt-1 text-slate-400">{formatDate(note.createdAt)}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {customValues.length ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-sm font-semibold text-slate-800">Custom fields AmoCRM</p>
          <div className="grid gap-2 md:grid-cols-2">
            {customValues.slice(0, 10).map((item) => (
              <div key={item.id} className="rounded-md bg-white px-3 py-2 text-xs">
                <p className="text-slate-400">{display(item.fieldName ?? item.fieldCode)}</p>
                <p className="mt-1 truncate font-medium text-slate-700">{display(item.value)}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DarkBadge({ label, active = false }: { label: string; active?: boolean }) {
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${active ? "bg-bakha-orange text-white" : "bg-white/10 text-zinc-300"}`}>{label}</span>;
}

function DarkMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.06] p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function Timeline({ lead, tasks: leadTasks, notes = [], historyEvents = [] }: { lead: Lead; tasks: Task[]; notes?: LeadNote[]; historyEvents?: HistoryEvent[] }) {
  const historyItems = historyEvents.slice(0, 12).map((event) => {
    const payload = safeJson(event.payloadJson);
    const titleByAction: Record<string, string> = {
      "lead.updated": "Изменены поля сделки",
      "lead.stage_changed": String(payload.message ?? "Сделка перемещена на другой этап"),
      "task.created": `Создана задача: ${display(payload.title)}`,
      "task.updated": "Обновлена задача",
      "task.completed": `Выполнена задача: ${display(payload.title)}`,
      "note.created": "Добавлена заметка"
    };
    return { title: titleByAction[event.action] ?? event.action, caption: formatDate(event.createdAt), icon: Clock };
  });
  const noteItems = notes.slice(0, 4).map((note) => ({ title: `Примечание: ${display(note.body).slice(0, 90)}`, caption: formatDate(note.createdAt), icon: FileText }));
  const items = [
    ...historyItems,
    { title: `Сделка перешла в этап ${lead.stageName}`, caption: `${lead.daysInStage} дн. назад`, icon: KanbanSquare },
    { title: `Получено сообщение из ${lead.source}`, caption: formatDate(lead.measurementAt), icon: MessageSquare },
    ...leadTasks.map((taskItem) => ({ title: `Задача: ${taskItem.title}`, caption: formatDate(taskItem.dueAt), icon: CheckSquare })),
    ...noteItems
  ];
  return (
    <div className="space-y-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={`${item.title}${item.caption}`} className="flex gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-bakha-orange">
              <Icon size={16} />
            </span>
            <div>
              <p className="text-sm font-medium text-slate-800">{item.title}</p>
              <p className="text-xs text-slate-500">{item.caption}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── AmoCRM-style chronological event feed ──────────────────────────────────

type FeedEntry =
  | { kind: "message"; ts: number; data: CrmMessage }
  | { kind: "note"; ts: number; id: number; body: string; createdAt: string }
  | { kind: "task"; ts: number; data: Task }
  | { kind: "history"; ts: number; data: HistoryEvent; title: string }
  | { kind: "synthetic"; ts: number; title: string; icon: LucideIcon; caption: string };

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Сегодня";
  if (d.toDateString() === yesterday.toDateString()) return "Вчера";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "long" }).format(d);
}

function AmoFeed({
  lead,
  tasks,
  notes,
  messages,
  historyEvents,
  onCompleteTask,
}: {
  lead: Lead;
  tasks: Task[];
  notes: LeadNote[];
  messages: CrmMessage[];
  historyEvents: HistoryEvent[];
  onCompleteTask?: (id: number) => void;
}) {
  function fmtDur(sec: unknown) {
    const n = Number(sec ?? 0);
    if (!n) return "";
    return ` · ${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
  }
  const actionTitles: Record<string, (p: Record<string, unknown>) => string> = {
    "lead.updated": () => "Изменены поля сделки",
    "lead.stage_changed": (p) => String(p.message ?? "Сделка перемещена на другой этап"),
    "task.created": (p) => `Создана задача: ${display(p.title)}`,
    "task.updated": () => "Обновлена задача",
    "task.completed": (p) => `Выполнена задача: ${display(p.title)}`,
    "note.created": () => "Добавлена заметка",
    "call.outgoing": (p) => {
      const base = p.dryRun ? "Dry-run звонок" : "Исходящий звонок";
      const status = p.status === "failed" ? " · Ошибка" : "";
      return `${base}${fmtDur(p.durationSec)}${status}`;
    },
    "call.incoming": (p) => `Входящий звонок${fmtDur(p.durationSec)}`,
    "call.missed": () => "Пропущенный звонок",
    "call.completed": (p) => `Звонок завершён${fmtDur(p.durationSec)}`,
    "ai.suggestion": (p) => {
      const conf = p.confidence ? ` · ${Math.round(Number(p.confidence) * 100)}%` : "";
      return `AI предложил ответ${conf}`;
    },
    "ai.sent": (p) => p.dryRun ? "AI отправил ответ (dry-run)" : "AI отправил ответ клиенту",
    "ai.approved_and_sent": () => "Менеджер одобрил и отправил ответ AI",
    "ai.rejected": () => "Менеджер отклонил предложение AI",
    "ai.error": (p) => `AI ошибка: ${display(p.error)}`,
    "ai.paused": (p) => {
      if (p.reason === "manager_reply") return `AI приостановлен: менеджер ответил вручную (${p.pauseMinutes ?? 30} мин)`;
      return `AI приостановлен${p.mode ? ` (${p.mode})` : ""}`;
    },
    "ai.resumed": () => "AI возобновлён",
  };

  const entries: FeedEntry[] = [
    // Real messages
    ...messages.map((m) => ({
      kind: "message" as const,
      ts: new Date(m.createdAt ?? m.sentAt ?? Date.now()).getTime(),
      data: m,
    })),
    // Notes
    ...notes.map((n) => ({
      kind: "note" as const,
      ts: new Date(n.createdAt).getTime(),
      id: n.id,
      body: n.body,
      createdAt: n.createdAt,
    })),
    // Task events
    ...tasks.map((t) => ({
      kind: "task" as const,
      ts: new Date(t.dueAt).getTime(),
      data: t,
    })),
    // History events
    ...historyEvents.map((h) => {
      const p = safeJson(h.payloadJson) as Record<string, unknown>;
      const title = actionTitles[h.action]?.(p) ?? h.action;
      return {
        kind: "history" as const,
        ts: new Date(h.createdAt).getTime(),
        data: h,
        title,
      };
    }),
    // Synthetic events from lead data
    {
      kind: "synthetic" as const,
      ts: new Date(lead.measurementAt ?? Date.now()).getTime(),
      title: `Получено сообщение из ${lead.source}`,
      icon: MessageSquare,
      caption: formatDate(lead.measurementAt),
    },
    {
      kind: "synthetic" as const,
      ts: Date.now() - lead.daysInStage * 86_400_000,
      title: `Сделка перешла в этап «${lead.stageName}»`,
      icon: KanbanSquare,
      caption: `${lead.daysInStage} дн. назад`,
    },
  ];

  // Sort newest → oldest
  entries.sort((a, b) => b.ts - a.ts);

  // Group by calendar day
  const groups: { label: string; items: FeedEntry[] }[] = [];
  for (const entry of entries) {
    const label = dayLabel(new Date(entry.ts).toISOString());
    const last = groups[groups.length - 1];
    if (last?.label === label) {
      last.items.push(entry);
    } else {
      groups.push({ label, items: [entry] });
    }
  }

  if (!groups.length) {
    return <EmptyState title="Лента пуста" text="Здесь будут отображаться события по сделке." />;
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.label}>
          {/* Date divider */}
          <div className="mb-3 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="rounded-full border border-slate-200 bg-white px-3 py-0.5 text-[11px] font-semibold text-slate-500">{group.label}</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <div className="space-y-2">
            {group.items.map((entry, idx) => {
              const timeStr = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(entry.ts));

              if (entry.kind === "message") {
                const msg = entry.data;
                const outgoing = msg.direction === "outgoing";
                const isCall = msg.mediaType === "audio" || msg.mediaType === "call";

                if (isCall) {
                  return (
                    <div key={`msg-${msg.id}`} className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100">
                        <Phone size={13} className="text-slate-500" />
                      </span>
                      <div className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-700">{outgoing ? "Исходящий звонок" : "Входящий звонок"}</span>
                          <span className="text-xs text-slate-400">{timeStr}</span>
                        </div>
                        {msg.mediaUrl ? (
                          <div className="mt-1 flex gap-3 text-xs">
                            <a href={msg.mediaUrl} className="font-semibold text-bakha-orange hover:underline">Прослушать</a>
                            <a href={msg.mediaUrl} download className="font-semibold text-slate-500 hover:underline">Скачать</a>
                          </div>
                        ) : (
                          <p className="mt-0.5 text-xs text-slate-400">Не дозвонился</p>
                        )}
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={`msg-${msg.id}`} className={`flex ${outgoing ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] rounded-xl px-3.5 py-2.5 shadow-sm ${outgoing ? "rounded-br-sm bg-bakha-orange text-white" : "rounded-bl-sm border border-slate-200 bg-white text-slate-800"}`}>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{display(msg.text ?? msg.body ?? msg.mediaUrl)}</p>
                      <p className={`mt-1 text-[11px] ${outgoing ? "text-orange-100" : "text-slate-400"}`}>{timeStr} · {msg.status}</p>
                    </div>
                  </div>
                );
              }

              if (entry.kind === "note") {
                return (
                  <div key={`note-${entry.id}`} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-50">
                      <FileText size={13} className="text-amber-500" />
                    </span>
                    <div className="min-w-0 flex-1 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                      <p className="text-sm text-slate-700">{entry.body}</p>
                      <p className="mt-1 text-[11px] text-slate-400">{timeStr}</p>
                    </div>
                  </div>
                );
              }

              if (entry.kind === "task") {
                const t = entry.data;
                return (
                  <div key={`task-${t.id}`} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50">
                      <CheckSquare size={13} className="text-blue-500" />
                    </span>
                    <div className="min-w-0 flex-1 rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-slate-800">{t.title}</p>
                        {t.status !== "done" && onCompleteTask ? (
                          <button
                            className="shrink-0 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100"
                            onClick={() => onCompleteTask(t.id)}
                          >
                            Выполнить
                          </button>
                        ) : (
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${t.status === "done" ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"}`}>
                            {t.status === "done" ? "Готово" : "Открыта"}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-400">{timeStr} · {display(t.assigneeName)}</p>
                    </div>
                  </div>
                );
              }

              if (entry.kind === "history") {
                const histPayload = safeJson(entry.data.payloadJson) as Record<string, unknown>;
                const isCallEvent = entry.data.action.startsWith("call.");
                const isAiEvent = entry.data.action.startsWith("ai.");
                const recUrl = isCallEvent ? (histPayload.recordingUrl as string | null | undefined) : null;

                if (isCallEvent) {
                  const isMissed = entry.data.action === "call.missed";
                  return (
                    <div key={`hist-${entry.data.id}`} className="flex items-start gap-2.5">
                      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${isMissed ? "bg-red-50" : "bg-slate-100"}`}>
                        <Phone size={13} className={isMissed ? "text-red-400" : "text-slate-500"} />
                      </span>
                      <div className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                        <div className="flex items-center gap-2">
                          <span className={`font-medium ${isMissed ? "text-red-600" : "text-slate-700"}`}>{entry.title}</span>
                          <span className="text-xs text-slate-400">{timeStr}</span>
                        </div>
                        {recUrl ? (
                          <div className="mt-1 flex gap-3 text-xs">
                            <a href={recUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-bakha-orange hover:underline">Прослушать</a>
                            <a href={recUrl} download target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-500 hover:underline">Скачать</a>
                          </div>
                        ) : (
                          Boolean(histPayload.dryRun) && <p className="mt-0.5 text-xs text-amber-500">dry-run</p>
                        )}
                      </div>
                    </div>
                  );
                }

                if (isAiEvent) {
                  const isError = entry.data.action === "ai.error";
                  const isPaused = entry.data.action === "ai.paused";
                  const isSuggestion = entry.data.action === "ai.suggestion";
                  return (
                    <div key={`hist-${entry.data.id}`} className="flex items-center gap-2 py-0.5 text-xs">
                      <div className="h-px w-4 shrink-0 bg-violet-200" />
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${isError ? "bg-red-100" : isPaused ? "bg-amber-100" : "bg-violet-100"}`}>
                        <Bot size={10} className={isError ? "text-red-500" : isPaused ? "text-amber-500" : "text-violet-500"} />
                      </span>
                      <span className={`${isError ? "text-red-500" : isPaused ? "text-amber-600" : isSuggestion ? "text-violet-700" : "text-slate-500"}`}>
                        {timeStr} · {entry.title}
                      </span>
                    </div>
                  );
                }

                return (
                  <div key={`hist-${entry.data.id}`} className="flex items-center gap-2 py-0.5 text-xs text-slate-500">
                    <div className="h-px w-4 shrink-0 bg-slate-300" />
                    <span>{timeStr} · {entry.title}</span>
                  </div>
                );
              }

              // synthetic
              const Icon = (entry as Extract<FeedEntry, { kind: "synthetic" }>).icon;
              return (
                <div key={`syn-${idx}`} className="flex items-center gap-2 py-0.5 text-xs text-slate-500">
                  <div className="h-px w-4 shrink-0 bg-slate-300" />
                  <Icon size={12} className="shrink-0 text-bakha-orange" />
                  <span>{timeStr} · {(entry as Extract<FeedEntry, { kind: "synthetic" }>).title}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function WappiStateBadge({ wappi }: { wappi?: WappiStatus }) {
  if (!wappi?.configured) {
    return <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">WAPPI не настроен. Сообщения сохраняются в CRM, реальная отправка заблокирована.</div>;
  }
  if (wappi.dryRun) {
    return <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-medium text-orange-700">Dry run: сообщения не уходят клиентам, только сохраняются в CRM.</div>;
  }
  return <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">WAPPI включён для реальной отправки.</div>;
}

function MessageList({ messages, compact = false }: { messages: CrmMessage[]; compact?: boolean }) {
  if (!messages.length) return <EmptyState title="Нет сообщений" text="История WAPPI по этой сделке пока пустая." />;
  return (
    <div className={`space-y-2 ${compact ? "max-h-52" : "max-h-[430px]"} overflow-y-auto rounded-lg bg-slate-50 p-3`}>
      {messages.map((message) => {
        const outgoing = message.direction === "outgoing";
        return (
          <div key={message.id} className={`flex ${outgoing ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[78%] rounded-lg px-3 py-2 ${outgoing ? "bg-bakha-orange text-white" : "border border-slate-200 bg-white text-slate-700"}`}>
              <p className="whitespace-pre-wrap text-sm">{display(message.text ?? message.body ?? message.mediaUrl)}</p>
              {message.mediaUrl ? <p className={`mt-1 text-xs ${outgoing ? "text-orange-100" : "text-slate-500"}`}>{message.mediaType ?? "media"}: {message.mediaUrl}</p> : null}
              <p className={`mt-1 text-[11px] ${outgoing ? "text-orange-100" : "text-slate-400"}`}>{formatDate(message.createdAt ?? message.sentAt)} · {message.status}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ChatBubble({ text, side }: { text: string; side: "left" | "right" }) {
  return <div className={`max-w-[88%] rounded-lg px-3 py-2 ${side === "right" ? "ml-auto bg-bakha-orange text-white" : "bg-slate-100 text-slate-700"}`}>{text}</div>;
}

function FileRow({ name, size }: { name: string; size: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 transition hover:border-bakha-orange hover:bg-white">
      <span className="truncate font-medium text-slate-800">{name}</span>
      <span className="shrink-0 text-slate-500">{size}</span>
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm">
      <p className="font-semibold text-slate-800">{title}</p>
      <p className="mt-1 text-slate-500">{text}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-800">{value}</span>
    </div>
  );
}

function StageHistory({ label, date, active = false }: { label: string; date: string; active?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`h-2.5 w-2.5 rounded-full ${active ? "bg-bakha-orange" : "bg-slate-300"}`} />
      <div>
        <p className="font-medium text-slate-800">{label}</p>
        <p className="text-xs text-slate-500">{date}</p>
      </div>
    </div>
  );
}

function ChatsPage() {
  const { leads, wappi } = useCrm();
  const notify = useToast();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [conversationMessages, setConversationMessages] = useState<CrmMessage[]>([]);
  const [messagesHasMore, setMessagesHasMore] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const [aiManager, setAiManager] = useState<{ enabled: boolean; dryRun: boolean } | null>(null);
  const [aiPauseLoading, setAiPauseLoading] = useState(false);
  const [suggestionAction, setSuggestionAction] = useState<Record<number, "approving" | "rejecting" | "saving">>({});
  const [chatEditingSuggestion, setChatEditingSuggestion] = useState<{ id: number; text: string } | null>(null);

  function loadConversationMessages(convId: number, before?: number) {
    setMessagesLoading(true);
    const qs = `limit=50${before ? `&before=${before}` : ""}`;
    return apiJson<{ messages: CrmMessage[]; hasMore: boolean }>(
      `/api/conversations/${convId}/messages?${qs}`, { method: "GET" }
    )
      .then((payload) => {
        if (before) {
          setConversationMessages((prev) => [...(payload.messages ?? []), ...prev]);
        } else {
          setConversationMessages(payload.messages ?? []);
        }
        setMessagesHasMore(payload.hasMore ?? false);
      })
      .catch(() => {
        if (!before) setConversationMessages([]);
      })
      .finally(() => setMessagesLoading(false));
  }

  function markConversationRead(convId: number) {
    setConversations((prev) =>
      prev.map((c) => c.id === convId ? { ...c, unreadCount: 0 } : c)
    );
    void apiJson(`/api/conversations/${convId}/read`, { method: "POST" }).catch(() => {});
  }

  function loadChats() {
    return apiJson<{ conversations: ChatConversation[]; aiManager?: { enabled: boolean; dryRun: boolean } }>("/api/chats", { method: "GET" })
      .then((payload) => {
        setConversations(payload.conversations ?? []);
        if (payload.aiManager) setAiManager(payload.aiManager);
        if (!selectedId && payload.conversations?.[0]?.id) {
          setSelectedId(payload.conversations[0].id);
          void loadConversationMessages(payload.conversations[0].id);
        } else if (selectedId) {
          void loadConversationMessages(selectedId);
        }
      })
      .catch(() => {
        setConversations([]);
      });
  }

  useEffect(() => {
    let alive = true;
    apiJson<{ conversations: ChatConversation[]; aiManager?: { enabled: boolean; dryRun: boolean } }>("/api/chats", { method: "GET" })
      .then((payload) => {
        if (!alive) return;
        setConversations(payload.conversations ?? []);
        if (payload.aiManager) setAiManager(payload.aiManager);
        const firstConv = payload.conversations?.[0] ?? null;
        const firstId = firstConv?.id ?? null;
        setSelectedId(firstId);
        if (firstId) {
          void loadConversationMessages(firstId);
          if ((firstConv?.unreadCount ?? 0) > 0) markConversationRead(firstId);
        }
      })
      .catch(() => {
        if (!alive) return;
        setConversations([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lightweight polling: refresh AI suggestions every 8s using focused endpoint when a conversation is selected.
  // Full /api/chats is only loaded on mount and after user actions (send/approve/reject).
  useEffect(() => {
    if (!selectedId) return;
    const convId = selectedId;
    const poll = () => {
      if (document.visibilityState !== "visible") return;
      apiJson<{ suggestions: AiSuggestionDraft[]; aiManager?: { enabled: boolean; dryRun: boolean } }>(
        `/api/ai/suggestions?conversationId=${convId}&status=draft`, { method: "GET" }
      )
        .then((payload) => {
          setConversations((prev) => prev.map((c) =>
            c.id === convId ? { ...c, aiSuggestions: payload.suggestions } : c
          ));
          if (payload.aiManager) setAiManager(payload.aiManager);
        })
        .catch(() => {});
    };
    const iv = setInterval(poll, 8_000);
    const onVisible = () => { if (document.visibilityState === "visible") poll(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [selectedId]);

  async function sendFromChats() {
    if (!chatInput.trim() || !selected?.leadId) return;
    setSending(true);
    try {
      const payload = await apiJson<{ message: CrmMessage; dryRun?: boolean; localOnly?: boolean }>(
        `/api/leads/${selected.leadId}/messages`,
        { method: "POST", body: JSON.stringify({ text: chatInput }) }
      );
      setChatInput("");
      await loadChats();
      if (payload.localOnly) {
        notify("WAPPI не подключен. Сообщение сохранено локально.");
      } else if (payload.dryRun) {
        notify("Dry-run: сообщение сохранено без реальной отправки.");
      } else {
        notify("Сообщение отправлено.");
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : "Ошибка отправки сообщения");
    } finally {
      setSending(false);
    }
  }

  async function pauseAI(conversationId: number, mode: "30m" | "until_manual" | "off") {
    setAiPauseLoading(true);
    try {
      await apiJson(`/api/conversations/${conversationId}/ai/pause`, { method: "POST", body: JSON.stringify({ mode }) });
      await loadChats();
      notify(mode === "30m" ? "AI приостановлен на 30 минут." : mode === "off" ? "AI отключён для этого диалога." : "AI приостановлен до ручного включения.");
    } catch {
      notify("Не удалось изменить статус AI.");
    } finally {
      setAiPauseLoading(false);
    }
  }

  async function resumeAI(conversationId: number) {
    setAiPauseLoading(true);
    try {
      await apiJson(`/api/conversations/${conversationId}/ai/resume`, { method: "POST" });
      await loadChats();
      notify("AI возобновлён для этого диалога.");
    } catch {
      notify("Не удалось возобновить AI.");
    } finally {
      setAiPauseLoading(false);
    }
  }

  async function approveSuggestion(suggestionId: number) {
    setSuggestionAction((prev) => ({ ...prev, [suggestionId]: "approving" }));
    try {
      const result = await apiJson<{ ok: boolean; dryRun?: boolean }>(`/api/ai/suggestions/${suggestionId}/approve`, { method: "POST" });
      await loadChats();
      notify(result.dryRun ? "Ответ AI одобрен и сохранён (dry-run)." : "Ответ AI отправлен клиенту.");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Не удалось отправить ответ AI.");
    } finally {
      setSuggestionAction((prev) => { const m = { ...prev }; delete m[suggestionId]; return m; });
    }
  }

  async function rejectSuggestion(suggestionId: number) {
    setSuggestionAction((prev) => ({ ...prev, [suggestionId]: "rejecting" }));
    try {
      await apiJson(`/api/ai/suggestions/${suggestionId}/reject`, { method: "POST" });
      await loadChats();
      notify("Предложение AI отклонено.");
    } catch {
      notify("Не удалось отклонить предложение AI.");
    } finally {
      setSuggestionAction((prev) => { const m = { ...prev }; delete m[suggestionId]; return m; });
    }
  }

  async function saveChatEditedSuggestion() {
    if (!chatEditingSuggestion) return;
    const { id, text } = chatEditingSuggestion;
    if (!text.trim()) { notify("Текст ответа не может быть пустым."); return; }
    setSuggestionAction((prev) => ({ ...prev, [id]: "saving" }));
    try {
      await apiJson(`/api/ai/suggestions/${id}`, { method: "PATCH", body: JSON.stringify({ replyText: text }) });
      setChatEditingSuggestion(null);
      await loadChats();
      notify("Текст ответа AI изменён.");
    } catch {
      notify("Не удалось сохранить изменения.");
    } finally {
      setSuggestionAction((prev) => { const m = { ...prev }; delete m[id]; return m; });
    }
  }

  function getAiStatus(conv: ChatConversation): { label: string; color: string; pausedUntilStr?: string } {
    if (!aiManager?.enabled) return { label: "AI отключён", color: "text-slate-400" };
    if (conv.aiPaused) {
      if (conv.aiPausedUntil) {
        const until = new Date(conv.aiPausedUntil);
        const now = new Date();
        if (until > now) {
          const minLeft = Math.ceil((until.getTime() - now.getTime()) / 60_000);
          return { label: `AI на паузе`, color: "text-amber-600", pausedUntilStr: `ещё ${minLeft} мин` };
        }
      }
      return { label: "AI на паузе", color: "text-amber-600" };
    }
    return { label: "AI включён", color: "text-emerald-600" };
  }

  const filtered = conversations.filter((conversation) => {
    if (filter === "unread") return conversation.unreadCount > 0;
    if (filter === "closed") return conversation.status === "closed";
    if (filter === "open") return conversation.status === "open";
    if (filter === "no_reply") {
      // "no reply" means the most recently loaded message for selected conv was from client
      // For non-selected conversations we can't know without loading their messages, so show all
      if (conversation.id === selectedId) {
        const lastMsg = conversationMessages[conversationMessages.length - 1];
        return lastMsg?.direction === "incoming";
      }
      return true; // include non-selected convs in the filter (no loaded messages to check)
    }
    return true;
  });
  const selected = filtered.find((conversation) => conversation.id === selectedId) ?? filtered[0] ?? null;
  // Messages are loaded per-conversation via GET /api/conversations/:id/messages
  const selectedMessages = conversationMessages;
  const selectedLead = selected?.leadId ? leads.find((lead) => lead.id === selected.leadId) : null;

  return (
    <>
      <PageHeader title="Чаты" subtitle="MVP imBox WAPPI: входящие, исходящие, статусы и привязка к сделке" />
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          ["all", "Все"],
          ["open", "Открытые"],
          ["unread", "Непрочитанные"],
          ["no_reply", "Без ответа"],
          ["closed", "Закрытые"]
        ].map(([value, label]) => (
          <button key={value} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${filter === value ? "border-bakha-orange bg-orange-50 text-orange-700" : "border-slate-200 bg-white text-slate-600"}`} onClick={() => setFilter(value)}>
            {label}
          </button>
        ))}
      </div>
      <WappiStateBadge wappi={wappi} />
      <div className="mt-4 grid gap-5 xl:grid-cols-[330px_minmax(0,1fr)_300px]">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="font-semibold text-slate-950">Диалоги</h2>
            <p className="text-xs text-slate-500">{filtered.length} conversations</p>
          </div>
          <div className="max-h-[620px] overflow-y-auto p-2">
            {loading ? <EmptyState title="Загрузка" text="Получаем conversations из CRM DB." /> : null}
            {!loading && !filtered.length ? <EmptyState title="Нет чатов" text="Пока нет WAPPI conversations по выбранному фильтру." /> : null}
            {filtered.map((conversation) => (
              <button key={conversation.id} className={`mb-2 w-full rounded-lg border p-3 text-left transition hover:border-bakha-orange ${selected?.id === conversation.id ? "border-bakha-orange bg-orange-50" : "border-slate-200 bg-white"}`} onClick={() => {
                  setSelectedId(conversation.id);
                  setConversationMessages([]);
                  void loadConversationMessages(conversation.id);
                  if (conversation.unreadCount > 0) markConversationRead(conversation.id);
                }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">{display(conversation.contactName ?? conversation.phone)}</p>
                    <p className="truncate text-xs text-slate-500">{display(conversation.leadTitle)}</p>
                  </div>
                  {conversation.unreadCount ? <span className="rounded-full bg-bakha-orange px-2 py-0.5 text-xs font-semibold text-white">{conversation.unreadCount}</span> : null}
                </div>
                <p className="mt-2 text-xs text-slate-500">{formatDate(conversation.lastMessageAt)} · {conversation.status}</p>
              </button>
            ))}
          </div>
        </section>
        <Panel title={selected ? `Чат ${display(selected.contactName ?? selected.phone)}` : "Чат"} icon={MessageCircle}>
          {selected ? (
            <div className="flex flex-col gap-3">
              {/* AI Status Bar — only shown when AI Manager is enabled */}
              {aiManager?.enabled && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <Bot size={13} className={getAiStatus(selected).color} />
                    <span className={`text-xs font-medium ${getAiStatus(selected).color}`}>
                      {getAiStatus(selected).label}
                      {getAiStatus(selected).pausedUntilStr && (
                        <span className="ml-1 text-slate-400">({getAiStatus(selected).pausedUntilStr})</span>
                      )}
                    </span>
                    {aiManager.dryRun && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">dry-run</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    {selected.aiPaused ? (
                      <button
                        className="rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                        onClick={() => void resumeAI(selected.id)}
                        disabled={aiPauseLoading}
                      >
                        Включить AI
                      </button>
                    ) : (
                      <>
                        <button
                          className="rounded-md bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                          onClick={() => void pauseAI(selected.id, "30m")}
                          disabled={aiPauseLoading}
                        >
                          Пауза 30 мин
                        </button>
                        <button
                          className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-50"
                          onClick={() => void pauseAI(selected.id, "off")}
                          disabled={aiPauseLoading}
                        >
                          Выкл
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* AI Draft Suggestions */}
              {(selected.aiSuggestions ?? []).filter((s) => s.status === "draft").map((suggestion) => (
                <div key={suggestion.id} className="rounded-xl border border-violet-200 bg-violet-50 p-3">
                  <div className="mb-2 flex items-center gap-1.5">
                    <Bot size={13} className="text-violet-600" />
                    <span className="text-xs font-semibold text-violet-700">AI предложил ответ</span>
                    {suggestion.confidence !== null && suggestion.confidence !== undefined && (
                      <span className="ml-auto rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-600">
                        {Math.round(suggestion.confidence * 100)}%
                      </span>
                    )}
                  </div>

                  {/* Edit mode */}
                  {chatEditingSuggestion?.id === suggestion.id ? (
                    <div className="mb-2 space-y-1.5">
                      <textarea
                        className="w-full min-h-[60px] rounded-lg border border-violet-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                        value={chatEditingSuggestion.text}
                        onChange={(e) => setChatEditingSuggestion({ id: suggestion.id, text: e.target.value })}
                      />
                      <div className="flex gap-1.5">
                        <button
                          className="rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
                          disabled={suggestionAction[suggestion.id] === "saving"}
                          onClick={() => void saveChatEditedSuggestion()}
                        >
                          {suggestionAction[suggestion.id] === "saving" ? "Сохранение..." : "Сохранить"}
                        </button>
                        <button
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                          onClick={() => setChatEditingSuggestion(null)}
                        >
                          Отмена
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mb-2 rounded-lg bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">{suggestion.replyText}</p>
                  )}

                  {/* Suggested CRM actions — read-only */}
                  {suggestion.suggestedActionsJson && (() => {
                    try {
                      const actions = JSON.parse(suggestion.suggestedActionsJson) as Array<{ type?: string; payload?: Record<string, unknown> }>;
                      if (!Array.isArray(actions) || actions.length === 0) return null;
                      return (
                        <div className="mb-2 rounded-lg border border-violet-100 bg-white/60 px-3 py-2 text-xs">
                          <p className="mb-1 font-semibold text-violet-600">AI предложил действия:</p>
                          <ul className="space-y-0.5 text-slate-600">
                            {actions.map((action, i) => (
                              <li key={i} className="flex items-center gap-1.5">
                                <span className="h-1 w-1 shrink-0 rounded-full bg-violet-400" />
                                {action.type === "create_task" ? `Задача: «${String(action.payload?.title ?? "").slice(0, 50)}»`
                                  : action.type === "set_stage" ? `Этап → «${String(action.payload?.stage ?? "")}»`
                                  : action.type === "add_note" ? `Заметка: «${String(action.payload?.note ?? "").slice(0, 50)}»`
                                  : action.type === "add_tag" ? `Тег: «${String(action.payload?.tag ?? "")}»`
                                  : String(action.type ?? "действие")}
                              </li>
                            ))}
                          </ul>
                          <p className="mt-1 text-slate-400">Будет доступно после настройки правил</p>
                        </div>
                      );
                    } catch { return null; }
                  })()}

                  {/* Action buttons */}
                  {chatEditingSuggestion?.id !== suggestion.id && (
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        className="flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
                        disabled={suggestionAction[suggestion.id] === "approving"}
                        onClick={() => void approveSuggestion(suggestion.id)}
                      >
                        <Send size={11} />
                        {suggestionAction[suggestion.id] === "approving" ? "..." : "Отправить"}
                      </button>
                      <button
                        className="flex items-center gap-1 rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50"
                        onClick={() => setChatEditingSuggestion({ id: suggestion.id, text: suggestion.replyText ?? "" })}
                      >
                        <Pencil size={11} />
                        Редактировать
                      </button>
                      <button
                        className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-red-300 hover:text-red-600 disabled:opacity-60"
                        disabled={suggestionAction[suggestion.id] === "rejecting"}
                        onClick={() => void rejectSuggestion(suggestion.id)}
                      >
                        <X size={11} />
                        {suggestionAction[suggestion.id] === "rejecting" ? "..." : "Отклонить"}
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {messagesHasMore && !messagesLoading && selected && (
                <button
                  className="w-full rounded-lg border border-slate-200 py-1.5 text-xs font-semibold text-slate-500 hover:border-bakha-orange hover:text-bakha-orange transition"
                  onClick={() => {
                    const oldest = conversationMessages[0];
                    if (oldest && selected) void loadConversationMessages(selected.id, oldest.id);
                  }}
                >
                  Загрузить ещё
                </button>
              )}
              {messagesLoading && (
                <p className="text-center text-xs text-slate-400">Загрузка сообщений...</p>
              )}
              <MessageList messages={selectedMessages} />
              <div className="flex gap-2">
                <input
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-bakha-orange focus:ring-4 focus:ring-orange-100"
                  placeholder="Сообщение..."
                  value={chatInput}
                  disabled={sending}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendFromChats(); } }}
                />
                <button
                  className="flex items-center gap-1.5 rounded-lg bg-bakha-orange px-3 py-2 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-60"
                  disabled={sending || !chatInput.trim()}
                  onClick={() => void sendFromChats()}
                >
                  <Send size={14} />
                  {sending ? "..." : "Отправить"}
                </button>
              </div>
            </div>
          ) : (
            <EmptyState title="Диалог не выбран" text="Выберите conversation слева." />
          )}
        </Panel>
        <Panel title="Сделка" icon={FileText}>
          {selectedLead ? (
            <div className="space-y-3 text-sm">
              <Link className="block rounded-lg border border-slate-200 bg-slate-50 p-3 font-semibold text-slate-950 hover:border-bakha-orange" to={`/leads/${selectedLead.id}`}>{selectedLead.title}</Link>
              <InfoRow label="Клиент" value={display(selectedLead.contactName)} />
              <InfoRow label="Телефон" value={display(selectedLead.contactPhone)} />
              <InfoRow label="Этап" value={display(selectedLead.stageName)} />
              <InfoRow label="Сумма" value={formatMoney(selectedLead.budget)} />
              <InfoRow label="Источник" value={display(selectedLead.source)} />
            </div>
          ) : (
            <EmptyState title="Нет сделки" text="Conversation пока не привязан к сделке." />
          )}
        </Panel>
      </div>
    </>
  );
}

function TasksPage() {
  const { tasks, refresh } = useCrm();
  const notify = useToast();
  const [taskOverrides, setTaskOverrides] = useState<Record<number, Pick<Task, "status" | "dueAt">>>({});
  const [query, setQuery] = useState("");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [activeDragTask, setActiveDragTask] = useState<Task | null>(null);
  const [pendingMove, setPendingMove] = useState<{ task: Task; defaultDate: Date } | null>(null);

  const allTasks = tasks.map((taskItem) => ({ ...taskItem, ...taskOverrides[taskItem.id] }));
  const visibleTasks = allTasks.filter((taskItem) => {
    const haystack = [taskItem.id, taskItem.title, taskItem.description, taskItem.leadId, taskItem.leadTitle, taskItem.client, taskItem.assigneeName, taskItem.type, taskItem.priority, taskItem.status].join(" ").toLowerCase();
    return haystack.includes(query.toLowerCase());
  });
  const columns = ["Просроченные", "Сегодня", "Завтра", "Будущие", "Выполненные"];
  const overdue = allTasks.filter((item) => taskBucket(item) === "Просроченные").length;
  const today = allTasks.filter((item) => taskBucket(item) === "Сегодня").length;
  const done = allTasks.filter((item) => item.status === "done").length;
  const high = allTasks.filter((item) => item.priority === "high").length;
  const tasksKanbanRef = useRef<HTMLDivElement>(null);
  useHorizontalDragScroll(tasksKanbanRef);

  // PointerSensor with 5 px threshold so normal clicks still open detail.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function completeTask(taskId: number) {
    const dueAt = allTasks.find((t) => t.id === taskId)?.dueAt ?? new Date().toISOString();
    setTaskOverrides((cur) => ({ ...cur, [taskId]: { status: "done", dueAt } }));
    try {
      await apiJson(`/api/tasks/${taskId}/complete`, { method: "POST" });
      await refresh();
      setTaskOverrides((cur) => { const m = { ...cur }; delete m[taskId]; return m; });
      notify("Задача выполнена.");
    } catch {
      notify("Задача отмечена выполненной локально: backend недоступен.");
    }
  }

  async function completeTaskWithResult(taskId: number, result?: string) {
    const task = allTasks.find((t) => t.id === taskId);
    if (result?.trim() && task?.leadId) {
      try {
        await apiJson("/api/notes", {
          method: "POST",
          body: JSON.stringify({ leadId: task.leadId, body: `Результат задачи «${task.title}»: ${result.trim()}` })
        });
      } catch {
        // note save is non-critical
      }
    }
    await completeTask(taskId);
  }

  async function reopenTask(taskId: number) {
    const task = allTasks.find((t) => t.id === taskId);
    const dueAt = new Date().toISOString();
    setTaskOverrides((cur) => ({ ...cur, [taskId]: { status: "open", dueAt } }));
    try {
      await apiJson(`/api/tasks/${taskId}/reopen`, { method: "POST", body: JSON.stringify({ dueAt }) });
      await refresh();
      setTaskOverrides((cur) => { const m = { ...cur }; delete m[taskId]; return m; });
      notify("Задача возобновлена.");
    } catch {
      notify("Задача возобновлена локально: backend недоступен.");
    }
  }

  async function snoozeTask(taskId: number) {
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 2);
    nextDate.setHours(10, 0, 0, 0);
    setTaskOverrides((cur) => ({ ...cur, [taskId]: { status: "open", dueAt: nextDate.toISOString() } }));
    try {
      await apiJson(`/api/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ dueAt: nextDate.toISOString(), status: "open" })
      });
      await refresh();
      setTaskOverrides((cur) => { const m = { ...cur }; delete m[taskId]; return m; });
      notify("Задача отложена.");
    } catch {
      notify("Задача отложена локально: backend недоступен.");
    }
  }

  async function moveTask(task: Task, newDueAt: string, newStatus: "open" | "done" = "open") {
    setTaskOverrides((cur) => ({ ...cur, [task.id]: { status: newStatus, dueAt: newDueAt } }));
    try {
      if (newStatus === "done") {
        await apiJson(`/api/tasks/${task.id}/complete`, { method: "POST" });
      } else {
        await apiJson(`/api/tasks/${task.id}`, {
          method: "PATCH",
          body: JSON.stringify({ dueAt: newDueAt, status: newStatus })
        });
      }
      await refresh();
      setTaskOverrides((cur) => { const m = { ...cur }; delete m[task.id]; return m; });
      notify("Задача обновлена.");
    } catch {
      setTaskOverrides((cur) => { const m = { ...cur }; delete m[task.id]; return m; });
      notify("Не удалось обновить задачу.");
    }
  }

  function handleDragStart({ active }: DragStartEvent) {
    setActiveDragTask((active.data.current?.task as Task) ?? null);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveDragTask(null);
    if (!over) return;
    const colId = String(over.id);
    if (!colId.startsWith("task-col-")) return;
    const targetCol = colId.slice("task-col-".length);
    const task = active.data.current?.task as Task | undefined;
    if (!task) return;
    if (taskBucket(task) === targetCol) return; // same column — no-op

    const existing = new Date(task.dueAt);
    const h = existing.getHours();
    const m = existing.getMinutes();

    if (targetCol === "Сегодня") {
      const d = new Date();
      d.setHours(h || 18, m || 0, 0, 0);
      void moveTask(task, d.toISOString(), "open");
    } else if (targetCol === "Завтра") {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(h || 10, m || 0, 0, 0);
      void moveTask(task, d.toISOString(), "open");
    } else if (targetCol === "Выполненные") {
      void completeTask(task.id);
    } else if (targetCol === "Будущие" || targetCol === "Просроченные") {
      const d = new Date();
      d.setDate(d.getDate() + (targetCol === "Будущие" ? 7 : -1));
      d.setHours(h || 10, m || 0, 0, 0);
      setPendingMove({ task, defaultDate: d });
    }
  }

  return (
    <>
      <PageHeader title="Задачи" subtitle="Kanban по звонкам, замерам, КП и монтажам" />
      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={AlertTriangle} label="Просроченные" value={String(overdue)} caption="срочно обработать" tone="red" />
        <KpiCard icon={CalendarDays} label="Сегодня" value={String(today)} caption="в работе" tone="orange" />
        <KpiCard icon={CheckCircle2} label="Выполнено" value={String(done)} caption="закрытые задачи" tone="green" />
        <KpiCard icon={Sparkles} label="Высокий приоритет" value={String(high)} caption="важные касания" tone="slate" />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <ToolbarButton icon={Phone} label="Позвонить" />
        <ToolbarButton icon={MessageSquare} label="Написать" />
        <ToolbarButton icon={Ruler} label="Назначить замер" />
      </div>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
          <input
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-bakha-orange focus:bg-white focus:ring-4 focus:ring-orange-100"
            placeholder="Поиск по задаче, сделке, клиенту, lead id"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveDragTask(null)}
      >
        <div ref={tasksKanbanRef} className="horizontal-drag-scroll scrollbar-thin -mx-4 flex gap-3 overflow-x-auto px-4 pb-5 lg:-mx-6 lg:px-6">
          {columns.map((column) => {
            const items = visibleTasks.filter((taskItem) => taskBucket(taskItem) === column);
            const visibleItems = items.slice(0, TASK_COLUMN_LIMIT);
            return (
              <DroppableTaskColumn
                key={column}
                column={column}
                count={items.length}
                isDragActive={activeDragTask !== null}
              >
                {visibleItems.map((taskItem) => (
                  <DraggableTaskCard
                    key={taskItem.id}
                    task={taskItem}
                    onOpenDetail={(t) => setSelectedTask(t)}
                    onComplete={completeTask}
                    onSnooze={snoozeTask}
                  />
                ))}
                {items.length > TASK_COLUMN_LIMIT ? (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-white/80 p-3 text-center text-sm text-slate-500">
                    Показано {TASK_COLUMN_LIMIT} из {items.length}. Уточните фильтры.
                  </div>
                ) : null}
                {!items.length ? <EmptyState title="Нет задач" text="В этой колонке пока нет задач." /> : null}
              </DroppableTaskColumn>
            );
          })}
        </div>
        {/* Ghost card shown while dragging */}
        <DragOverlay dropAnimation={null}>
          {activeDragTask ? (
            <div className="w-[280px] rotate-[0.5deg] opacity-90 shadow-2xl">
              <div className="rounded-lg border border-bakha-orange bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-slate-950">{activeDragTask.title}</p>
                  <PriorityBadge priority={activeDragTask.priority} />
                </div>
                {activeDragTask.client ? (
                  <p className="mt-2 truncate text-xs text-slate-500">{activeDragTask.client}</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <FloatingHorizontalScrollbar scrollRef={tasksKanbanRef} />

      {/* In-place task detail modal — opens on card click, stays on tasks page */}
      {selectedTask ? (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onComplete={(result) => { void completeTaskWithResult(selectedTask.id, result); setSelectedTask(null); }}
          onMoveToDate={(isoDate) => { void moveTask(selectedTask, isoDate, "open"); setSelectedTask(null); }}
        />
      ) : null}

      {/* Date/time picker shown when dragging to Будущие or Просроченные */}
      {pendingMove ? (
        <TaskDatePickerModal
          task={pendingMove.task}
          defaultDate={pendingMove.defaultDate}
          onConfirm={(t, isoDate) => { setPendingMove(null); void moveTask(t, isoDate, "open"); }}
          onCancel={() => setPendingMove(null)}
        />
      ) : null}
    </>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  return <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${priority === "high" ? "bg-red-50 text-red-700 ring-1 ring-red-100" : "bg-slate-100 text-slate-600"}`}>{priority}</span>;
}

function taskBucket(taskItem: Task) {
  if (taskItem.status === "done") return "Выполненные";
  const now = new Date();
  const due = new Date(taskItem.dueAt);
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startTomorrow = new Date(startToday);
  startTomorrow.setDate(startToday.getDate() + 1);
  const startAfterTomorrow = new Date(startToday);
  startAfterTomorrow.setDate(startToday.getDate() + 2);
  if (due < startToday) return "Просроченные";
  if (due >= startToday && due < startTomorrow) return "Сегодня";
  if (due >= startTomorrow && due < startAfterTomorrow) return "Завтра";
  return "Будущие";
}

/** Droppable task column wrapper. Highlights when a card hovers over it. */
function DroppableTaskColumn({
  column,
  count,
  isDragActive,
  children,
}: {
  column: string;
  count: number;
  isDragActive: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `task-col-${column}` });
  return (
    <section
      ref={setNodeRef}
      className={`w-[292px] shrink-0 rounded-xl border shadow-sm transition-colors ${
        isDragActive && isOver
          ? "border-bakha-orange bg-orange-50/60"
          : column === "Просроченные"
          ? "border-red-200 bg-red-50/40"
          : "border-slate-200 bg-[#eef1f5]"
      }`}
    >
      <div className="rounded-t-xl border-b border-slate-200 bg-white px-3 py-3">
        <div className="flex items-center justify-between">
          <h2 className={`font-semibold ${column === "Просроченные" ? "text-red-600" : "text-slate-900"}`}>
            {column}
          </h2>
          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
            column === "Просроченные" ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500"
          }`}>
            {count}
          </span>
        </div>
      </div>
      <div className="space-y-2.5 p-2.5">{children}</div>
    </section>
  );
}

/**
 * Draggable task card. Left-clicking (without dragging) opens the task detail
 * modal. Dragging moves the card to a different column and updates its dueAt /
 * status via the PATCH endpoint.
 *
 * `data-no-drag-scroll` prevents the board's useHorizontalDragScroll hook from
 * starting a board drag when the user grabs this card.
 */
function DraggableTaskCard({
  task,
  onOpenDetail,
  onComplete,
  onSnooze,
}: {
  task: Task;
  onOpenDetail: (task: Task) => void;
  onComplete: (id: number) => void;
  onSnooze: (id: number) => void;
}) {
  const preventNextClick = useRef(false);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `task-${task.id}`,
    data: { task },
  });

  useEffect(() => {
    if (isDragging) preventNextClick.current = true;
  }, [isDragging]);

  const typeLabel: Record<string, string> = {
    call: "📞 Звонок", message: "💬 Сообщение",
    measurement: "📐 Замер", quote: "📄 КП",
    meeting: "🤝 Встреча", other: "📌 Другое",
  };

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-no-drag-scroll
      style={{ opacity: isDragging ? 0 : 1 }}
      className="cursor-pointer rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-bakha-orange hover:shadow-panel"
      onClick={() => {
        if (preventNextClick.current) { preventNextClick.current = false; return; }
        onOpenDetail(task);
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold leading-snug text-slate-950">{task.title}</p>
        <PriorityBadge priority={task.priority} />
      </div>
      <p className="mt-1 text-[11px] text-slate-400">{typeLabel[task.type] ?? task.type}</p>
      <div className="mt-2.5 space-y-1 text-xs text-slate-500">
        {task.leadTitle ? <p className="truncate">Сделка: <span className="font-medium text-slate-700">{task.leadTitle}</span></p> : null}
        {task.client ? <p className="truncate">Клиент: <span className="font-medium text-slate-700">{task.client}</span></p> : null}
        <p>Дата: <span className="font-medium text-slate-700">{formatDate(task.dueAt)}</span></p>
        {task.assigneeName ? <p>Исполнитель: <span className="font-medium text-slate-700">{task.assigneeName}</span></p> : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
        {task.status !== "done" ? (
          <button
            data-no-drag-scroll
            className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
            onClick={() => onComplete(task.id)}
          >
            Выполнить
          </button>
        ) : null}
        {task.status !== "done" ? (
          <button
            data-no-drag-scroll
            className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
            onClick={() => onSnooze(task.id)}
          >
            Отложить
          </button>
        ) : null}
        {task.leadId ? (
          <Link
            to={`/leads/${task.leadId}`}
            data-no-drag-scroll
            className="rounded-md bg-orange-50 px-2 py-1 text-xs font-semibold text-orange-700 transition hover:bg-orange-100"
          >
            Сделка →
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/**
 * In-place task detail panel that opens on card click WITHOUT navigating away.
 * Users can complete the task, snooze it, or explicitly open the linked deal.
 */
function TaskDetailModal({
  task,
  onClose,
  onComplete,
  onMoveToDate,
}: {
  task: Task;
  onClose: () => void;
  onComplete: (result?: string) => void;
  onMoveToDate: (isoDate: string) => void;
}) {
  const [result, setResult] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [customDate, setCustomDate] = useState(() => {
    const d = new Date(task.dueAt);
    d.setDate(d.getDate() + 1);
    // Format for datetime-local input (YYYY-MM-DDTHH:mm)
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });

  const typeLabels: Record<string, string> = {
    call: "Звонок", message: "Сообщение",
    measurement: "Замер", quote: "КП",
    meeting: "Встреча", other: "Другое",
  };

  function handleSnoozeMins(mins: number) {
    const d = new Date(task.dueAt);
    d.setMinutes(d.getMinutes() + mins);
    onMoveToDate(d.toISOString());
  }

  function handleSnoozeTomorrow() {
    const d = new Date(task.dueAt);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    d.setFullYear(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
    if (d.getHours() === 0 && d.getMinutes() === 0) d.setHours(10, 0, 0, 0);
    onMoveToDate(d.toISOString());
  }

  function handleCustomDateConfirm() {
    if (!customDate) return;
    onMoveToDate(new Date(customDate).toISOString());
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {typeLabels[task.type] ?? task.type}
            </p>
            <h2 className="mt-0.5 text-lg font-bold leading-snug text-slate-900">{task.title}</h2>
            {task.description ? (
              <p className="mt-1 text-sm text-slate-500">{task.description}</p>
            ) : null}
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        {/* Meta grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 pt-4 text-sm">
          <div>
            <p className="text-[11px] text-slate-400">Статус</p>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              task.status === "done"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-orange-50 text-orange-700"
            }`}>
              {task.status === "done" ? "Выполнена" : "В работе"}
            </span>
          </div>
          <div>
            <p className="text-[11px] text-slate-400">Приоритет</p>
            <PriorityBadge priority={task.priority} />
          </div>
          <div>
            <p className="text-[11px] text-slate-400">Дата и время</p>
            <p className="font-medium text-slate-800">{formatDate(task.dueAt)}</p>
          </div>
          <div>
            <p className="text-[11px] text-slate-400">Исполнитель</p>
            <p className="font-medium text-slate-800">{task.assigneeName ?? "—"}</p>
          </div>
          {task.leadTitle ? (
            <div className="col-span-2">
              <p className="text-[11px] text-slate-400">Сделка</p>
              <p className="font-medium text-slate-800">{task.leadTitle}</p>
            </div>
          ) : null}
          {task.client ? (
            <div className="col-span-2">
              <p className="text-[11px] text-slate-400">Клиент</p>
              <p className="font-medium text-slate-800">{task.client}</p>
            </div>
          ) : null}
        </div>

        {/* Result textarea */}
        <div className="px-5 pt-3">
          <label className="mb-1 block text-[11px] text-slate-400">Результат / комментарий</label>
          <textarea
            className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm outline-none transition focus:border-bakha-orange focus:bg-white focus:ring-4 focus:ring-orange-100"
            rows={3}
            placeholder="Не дозвонился, перезвонить вечером..."
            value={result}
            onChange={(e) => setResult(e.target.value)}
          />
        </div>

        {/* Custom date picker (shown on "На дату" click) */}
        {showDatePicker ? (
          <div className="flex gap-2 px-5 pb-1">
            <input
              type="datetime-local"
              className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-bakha-orange focus:ring-4 focus:ring-orange-100"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
            />
            <button
              onClick={handleCustomDateConfirm}
              className="rounded-lg bg-bakha-orange px-3 py-2 text-sm font-semibold text-white transition hover:bg-orange-600"
            >
              ОК
            </button>
            <button
              onClick={() => setShowDatePicker(false)}
              className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-200"
            >
              ✕
            </button>
          </div>
        ) : null}

        {/* Action footer */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-5 py-4">
          {task.status !== "done" ? (
            <button
              onClick={() => onComplete(result || undefined)}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600"
            >
              Выполнить
            </button>
          ) : null}

          {task.status !== "done" ? (
            <>
              <span className="text-xs text-slate-400">Отложить:</span>
              <button
                onClick={() => handleSnoozeMins(30)}
                className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
              >
                +30 мин
              </button>
              <button
                onClick={handleSnoozeTomorrow}
                className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
              >
                Завтра
              </button>
              <button
                onClick={() => setShowDatePicker((v) => !v)}
                className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
              >
                На дату
              </button>
            </>
          ) : null}

          <div className="ml-auto flex items-center gap-2">
            {task.leadId ? (
              <Link
                to={`/leads/${task.leadId}`}
                onClick={onClose}
                className="rounded-lg border border-bakha-orange bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700 transition hover:bg-orange-100"
              >
                Открыть сделку →
              </Link>
            ) : null}
            <button
              onClick={onClose}
              className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
            >
              Закрыть
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Date/time confirmation modal shown when a card is dropped into "Будущие" or
 * "Просроченные". User confirms (or cancels) before the task is actually moved.
 */
function TaskDatePickerModal({
  task,
  defaultDate,
  onConfirm,
  onCancel,
}: {
  task: Task;
  defaultDate: Date;
  onConfirm: (task: Task, isoDate: string) => void;
  onCancel: () => void;
}) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const toLocalInput = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

  const [value, setValue] = useState(() => toLocalInput(defaultDate));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(4px)" }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="text-base font-bold text-slate-900">Перенести задачу</h3>
        <p className="mt-1 truncate text-sm text-slate-500">«{task.title}»</p>
        <label className="mt-4 block text-[11px] text-slate-400">Дата и время задачи</label>
        <input
          type="datetime-local"
          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-bakha-orange focus:ring-4 focus:ring-orange-100"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <div className="mt-4 flex gap-3">
          <button
            onClick={() => onConfirm(task, new Date(value).toISOString())}
            className="flex-1 rounded-xl bg-bakha-orange py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600"
          >
            Подтвердить
          </button>
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

function AnalyticsPage() {
  const { leads, tasks } = useCrm();
  const notify = useToast();
  const sales = leads.filter((item) => item.pipelineCode === "sales");
  const measurements = leads.filter((item) => item.pipelineCode === "measurement");
  const conversion = Math.round((measurements.length / Math.max(1, leads.length)) * 100);
  const byManager = Object.entries(groupBy(leads, (item) => item.responsibleName ?? "Без ответственного"));
  const bySource = Object.entries(groupBy(leads, (item) => item.source));

  return (
    <>
      <PageHeader title="Аналитика" subtitle="Продажи, источники, задачи и эффективность менеджеров" />
      <div className="mb-4 flex flex-wrap gap-2">
        <ToolbarButton icon={CalendarDays} label="Июнь 2026" onClick={() => notify("Фильтр по периоду будет доступен в следующей версии аналитики.")} />
        <ToolbarButton icon={Users} label="Все менеджеры" onClick={() => notify("Фильтр по менеджерам — в разработке.")} />
        <ToolbarButton icon={CreditCard} label="Оплаты" onClick={() => notify("Фильтр по оплатам — в разработке.")} />
      </div>
      <div className="grid gap-4 lg:grid-cols-4">
        <KpiCard icon={KanbanSquare} label="Сделки в продажах" value={String(sales.length)} caption={formatMoney(sales.reduce((sum, item) => sum + item.budget, 0))} tone="orange" />
        <KpiCard icon={Ruler} label="Сделки в замере" value={String(measurements.length)} caption={formatMoney(measurements.reduce((sum, item) => sum + item.budget, 0))} tone="slate" />
        <KpiCard icon={CheckSquare} label="Всего задач" value={String(tasks.length)} caption={`${tasks.filter((item) => item.status !== "done").length} открыто`} tone="green" />
        <KpiCard icon={Percent} label="Конверсия в замер" value={`${conversion}%`} caption="от всех сделок" tone="dark" />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Продажи по этапам" icon={BarChart3}>
          <ChartPlaceholder />
        </Panel>
        <Panel title="Задачи по статусам" icon={CheckSquare}>
          <BarList items={Object.entries(groupBy(tasks, (item) => taskBucket(item))).map(([label, values]) => ({ label, value: values.length, sum: values.length * 10000 }))} />
        </Panel>
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel title="Таблица по менеджерам" icon={Users}>
          <DataTable rows={byManager.map(([name, values]) => [name, String(values.length), formatMoney(values.reduce((sum, item) => sum + item.budget, 0)), `${Math.round((values.length / Math.max(1, leads.length)) * 100)}%`])} headers={["Менеджер", "Сделки", "Сумма", "Доля"]} />
        </Panel>
        <Panel title="Таблица по источникам" icon={Send}>
          <DataTable rows={bySource.map(([name, values]) => [name, String(values.length), formatMoney(values.reduce((sum, item) => sum + item.budget, 0)), `${Math.round((values.length / Math.max(1, leads.length)) * 100)}%`])} headers={["Источник", "Сделки", "Сумма", "Доля"]} />
        </Panel>
      </div>
    </>
  );
}

function ChartPlaceholder() {
  const bars = [42, 68, 36, 74, 58, 90, 52, 64, 44, 76];
  return (
    <div className="flex h-72 items-end gap-3 rounded-xl bg-slate-50 p-4">
      {bars.map((height, index) => (
        <div key={index} className="flex min-w-0 flex-1 flex-col items-center gap-2">
          <div className="w-full rounded-t-lg bg-bakha-orange shadow-sm shadow-orange-500/30" style={{ height: `${height}%` }} />
          <span className="text-[10px] font-medium text-slate-400">{index + 1}</span>
        </div>
      ))}
    </div>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <div className="grid grid-cols-4 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase text-slate-500">
        {headers.map((header) => (
          <span key={header}>{header}</span>
        ))}
      </div>
      {rows.map((row) => (
        <div key={row.join("-")} className="grid grid-cols-4 border-t border-slate-100 px-3 py-3 text-sm">
          {row.map((cell, index) => (
            <span key={`${cell}-${index}`} className={index === 0 ? "font-semibold text-slate-900" : "text-slate-600"}>
              {cell}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

const ROLE_OPTIONS = [
  { value: "owner", label: "Владелец" },
  { value: "admin", label: "Администратор" },
  { value: "manager", label: "Менеджер" },
  { value: "measurer", label: "Замерщик" },
  { value: "installer", label: "Монтажник" }
];

type UserRow = User & { lastLoginAt?: string | null };

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: (user: UserRow) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("manager");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !email.trim() || !password.trim()) { setError("Заполните все обязательные поля"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await apiJson<{ user: UserRow }>("/api/users", { method: "POST", body: JSON.stringify({ name, email, phone: phone || null, role, password }) });
      onCreated(res.user);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка создания пользователя");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-950">Новый пользователь</h2>
          <button className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Имя *</label>
            <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-bakha-orange focus:ring-4 focus:ring-orange-100" value={name} onChange={(e) => setName(e.target.value)} placeholder="Иван Иванов" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Email *</label>
            <input type="email" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-bakha-orange focus:ring-4 focus:ring-orange-100" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ivan@bakha.kz" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Телефон</label>
            <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-bakha-orange focus:ring-4 focus:ring-orange-100" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 700 000 00 00" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Роль</label>
            <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-bakha-orange" value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Пароль * (мин. 6 символов)</label>
            <input type="password" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-bakha-orange focus:ring-4 focus:ring-orange-100" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" />
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={onClose}>Отмена</button>
            <button type="submit" disabled={loading} className="flex-1 rounded-lg bg-bakha-orange py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60">
              {loading ? "Создаём..." : "Создать"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SetPasswordModal({ userId, userName, onClose }: { userId: number; userName: string; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const notify = useToast();

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 6) { setError("Минимум 6 символов"); return; }
    setLoading(true);
    setError("");
    try {
      await apiJson(`/api/users/${userId}/set-password`, { method: "POST", body: JSON.stringify({ password }) });
      notify(`Пароль для ${userName} сброшен. Активные сессии завершены.`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-950">Сброс пароля — {userName}</h2>
          <button className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <input type="password" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-bakha-orange" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Новый пароль (мин. 6 символов)" autoFocus />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button type="button" className="flex-1 rounded-lg border border-slate-200 py-2 text-sm hover:bg-slate-50" onClick={onClose}>Отмена</button>
            <button type="submit" disabled={loading} className="flex-1 rounded-lg bg-bakha-orange py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60">
              {loading ? "Сохранить..." : "Сохранить"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UsersSettingsPage() {
  const { users: crmUsers, refresh } = useCrm();
  const notify = useToast();
  const currentUser = JSON.parse(localStorage.getItem("bakha_user") ?? "{}") as { role?: string | null };
  const isAdminOrOwner = currentUser.role === "owner" || currentUser.role === "admin";
  const [localUsers, setLocalUsers] = useState<UserRow[]>(crmUsers as UserRow[]);
  const [showCreate, setShowCreate] = useState(false);
  const [passwordModal, setPasswordModal] = useState<{ id: number; name: string } | null>(null);

  useEffect(() => { setLocalUsers(crmUsers as UserRow[]); }, [crmUsers]);

  async function toggleStatus(u: UserRow) {
    const newStatus = u.status === "active" ? "inactive" : "active";
    try {
      const res = await apiJson<{ user: UserRow }>(`/api/users/${u.id}`, { method: "PATCH", body: JSON.stringify({ status: newStatus }) });
      setLocalUsers((prev) => prev.map((item) => item.id === u.id ? { ...item, ...res.user } : item));
      notify(`${u.name}: статус изменён на «${newStatus === "active" ? "Активен" : "Деактивирован"}».`);
      await refresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Ошибка обновления пользователя");
    }
  }

  async function changeRole(u: UserRow, newRole: string) {
    try {
      const res = await apiJson<{ user: UserRow }>(`/api/users/${u.id}`, { method: "PATCH", body: JSON.stringify({ role: newRole }) });
      setLocalUsers((prev) => prev.map((item) => item.id === u.id ? { ...item, ...res.user } : item));
      notify(`${u.name}: роль изменена.`);
      await refresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Ошибка обновления роли");
    }
  }

  return (
    <>
      <PageHeader
        title="Пользователи и роли"
        subtitle={`${localUsers.length} сотрудников · Роли: владелец, admin, менеджер, замерщик, монтажник`}
        action={isAdminOrOwner ? "Добавить пользователя" : undefined}
        onAction={isAdminOrOwner ? () => setShowCreate(true) : undefined}
      />

      {/* Role permissions legend */}
      <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-5">
        {[
          { role: "Владелец", caps: "Всё + система" },
          { role: "Admin", caps: "CRM + пользователи" },
          { role: "Менеджер", caps: "Продажи + задачи" },
          { role: "Замерщик", caps: "Замеры + объекты" },
          { role: "Монтажник", caps: "Монтажи + статусы" }
        ].map((item) => (
          <div key={item.role} className="flex flex-col rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
            <span className="text-xs font-semibold text-slate-700">{item.role}</span>
            <span className="text-xs text-slate-500">{item.caps}</span>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="grid min-w-[820px] grid-cols-[1.4fr_1fr_1fr_130px_140px] bg-slate-50 px-4 py-3 text-xs font-semibold uppercase text-slate-500">
          <span>Пользователь</span>
          <span>Роль</span>
          <span>Телефон</span>
          <span>Статус</span>
          {isAdminOrOwner && <span>Действия</span>}
        </div>
        <div className="overflow-x-auto">
          {localUsers.map((u) => (
            <div key={u.id} className="grid min-w-[820px] grid-cols-[1.4fr_1fr_1fr_130px_140px] items-center border-t border-slate-100 px-4 py-3 text-sm transition hover:bg-orange-50/30">
              <div className="flex items-center gap-3">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-semibold text-white ${u.status === "active" ? "bg-slate-950" : "bg-slate-400"}`}>{u.name.slice(0, 1)}</div>
                <div>
                  <p className="font-semibold text-slate-950">{u.name}</p>
                  <p className="text-slate-500">{u.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isAdminOrOwner ? (
                  <select
                    className="rounded-lg border border-slate-200 bg-transparent px-2 py-1 text-sm outline-none focus:border-bakha-orange"
                    value={u.role ?? "manager"}
                    onChange={(e) => { void changeRole(u, e.target.value); }}
                  >
                    {ROLE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                ) : (
                  <span className="flex items-center gap-1.5 text-slate-700"><Shield size={14} className="text-bakha-orange" />{u.roleTitle ?? u.role}</span>
                )}
              </div>
              <span className="text-slate-600">{u.phone ?? "—"}</span>
              <span>
                <StatusPill label={u.status} />
              </span>
              {isAdminOrOwner && (
                <div className="flex items-center gap-2">
                  <button
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${u.status === "active" ? "border-red-200 text-red-600 hover:bg-red-50" : "border-green-200 text-green-700 hover:bg-green-50"}`}
                    onClick={() => { void toggleStatus(u); }}
                  >
                    {u.status === "active" ? "Деактив." : "Активир."}
                  </button>
                  <button
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                    onClick={() => setPasswordModal({ id: u.id, name: u.name })}
                    title="Сбросить пароль"
                  >
                    Пароль
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={(newUser) => {
            setLocalUsers((prev) => [...prev, newUser]);
            notify(`Пользователь ${newUser.name} создан.`);
            void refresh();
          }}
        />
      )}
      {passwordModal && (
        <SetPasswordModal
          userId={passwordModal.id}
          userName={passwordModal.name}
          onClose={() => setPasswordModal(null)}
        />
      )}
    </>
  );
}

type SystemStatus = {
  dataMode: string;
  db: { connected: boolean };
  wappi: {
    enabled: boolean;
    dryRun: boolean;
    configured: boolean;
    apiBaseUrlConfigured: boolean;
    profileIdConfigured: boolean;
    tokenConfigured: boolean;
    webhookSecretConfigured: boolean;
    tokenMasked: string | null;
    profileId: string | null;
    requiredEnvVars: string[];
  };
  onlinePbx: {
    enabled: boolean;
    dryRun: boolean;
    apiBaseUrlConfigured: boolean;
    domainConfigured: boolean;
    apiKeyConfigured: boolean;
    apiKeyMasked: string | null;
    webhookSecretConfigured: boolean;
    mappingCount: number;
    requiredEnvVars: string[];
  };
  amoImport: { configured: boolean; requiredEnvVars: string[] };
  aiManager: {
    configured: boolean;
    enabled: boolean;
    dryRun: boolean;
    baseUrlConfigured: boolean;
    endpoint: string;
    apiKeyConfigured: boolean;
    autoSend: boolean;
    autoActions: boolean;
    pauseOnManagerReply: boolean;
    pauseMinutes: number;
    minConfidence: number;
    autoSendWarning?: string | null;
    requiredEnvVars: string[];
  };
};
type AiTestResult = {
  ok: boolean;
  dryRun: boolean;
  status: "disabled" | "dry_run_success" | "connected" | "error" | "misconfigured";
  message: string;
  sampleRequest?: Record<string, unknown>;
  normalizedResponse?: { replyText?: string | null; confidence?: number | null; actionsCount: number };
  error?: string;
};
type AiEventEntry = {
  id: number;
  conversationId?: number | null;
  leadId?: number | null;
  messageId?: number | null;
  direction: string;
  status: string;
  reason?: string | null;
  errorMessage?: string | null;
  createdAt: string;
};

function IntegrationsSettingsPage() {
  const { integrations, telephony, wappi } = useCrm();
  const notify = useToast();
  const navigate = useNavigate();
  const [amoStats, setAmoStats] = useState<Record<string, number> | null>(null);
  const [amoStatus, setAmoStatus] = useState("Не проверено");
  const [sysStatus, setSysStatus] = useState<SystemStatus | null>(null);
  const [checkingConnection, setCheckingConnection] = useState<string | null>(null);
  const [aiTestResult, setAiTestResult] = useState<AiTestResult | null>(null);
  const [aiTestLoading, setAiTestLoading] = useState(false);

  useEffect(() => {
    fetch("/api/system/status", { credentials: "include" })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d: SystemStatus) => setSysStatus(d))
      .catch(() => {});
  }, []);

  async function runAmoAction(action: "stats" | "run") {
    setAmoStatus(action === "run" ? "Импорт выполняется..." : "Проверяем данные...");
    try {
      const response = await fetch(action === "stats" ? "/api/import/amo/stats" : "/api/import/amo/run", {
        method: action === "stats" ? "GET" : "POST",
        credentials: "include"
      });
      if (!response.ok) throw new Error("Import API error");
      const payload = await response.json() as { stats?: Record<string, number>; errors?: unknown[] };
      setAmoStats(payload.stats ?? null);
      setAmoStatus(`${action === "run" ? "Импорт завершён" : "Данные проверены"} · ошибок: ${payload.stats?.errors ?? payload.errors?.length ?? 0}`);
      notify(action === "run" ? "Импорт AmoCRM завершён успешно." : "Данные AmoCRM проверены успешно.");
    } catch {
      setAmoStatus("Сервис импорта недоступен. Требуется настройка окружения.");
      notify("Укажите AMO_IMPORT_DB_PATH в .env и перезапустите сервер.");
    }
  }

  async function checkConnection(code: string) {
    setCheckingConnection(code);
    try {
      const r = await fetch("/api/system/status", { credentials: "include" });
      const d = await r.json() as SystemStatus;
      setSysStatus(d);
      if (code === "wappi") {
        notify(d.wappi.configured ? "WAPPI: ключи настроены. Для активации установите WAPPI_ENABLED=true." : "WAPPI не настроен. Укажите WAPPI_TOKEN и WAPPI_PROFILE_ID в .env.");
      } else if (code === "telephony") {
        notify((d.onlinePbx.domainConfigured && d.onlinePbx.apiKeyConfigured) ? "onlinePBX: ключи настроены. Для активации установите ONLINEPBX_ENABLED=true." : "onlinePBX не настроен. Укажите ONLINEPBX_DOMAIN и ONLINEPBX_API_KEY в .env.");
      } else if (code === "ai_manager") {
        if (d.aiManager.enabled && !d.aiManager.dryRun) {
          notify("AI Manager: активен (реальные вызовы).");
        } else if (d.aiManager.enabled && d.aiManager.dryRun) {
          notify("AI Manager: включён в dry-run режиме (симуляция).");
        } else if (d.aiManager.baseUrlConfigured) {
          notify("AI Manager: URL настроен, но AI_MANAGER_ENABLED=false.");
        } else {
          notify("AI Manager не настроен. Укажите AI_MANAGER_BASE_URL и AI_MANAGER_ENABLED=true в .env.");
        }
      } else {
        notify("Для подключения укажите ключи в настройках сервера.");
      }
    } catch {
      notify("Не удалось получить статус системы.");
    } finally {
      setCheckingConnection(null);
    }
  }

  const iconByCode: Record<string, LucideIcon> = {
    wappi: MessageCircle,
    ai_manager: Bot,
    telephony: Radio,
    webhooks: Webhook,
    salesbot: Plug
  };

  const captions: Record<string, string> = {
    wappi: "WhatsApp-диалоги, шаблоны и история переписки в карточке сделки.",
    ai_manager: "Подсказки ответов, квалификация лидов и контроль качества.",
    telephony: "Звонки, записи, статусы дозвона и привязка к сделкам.",
    webhooks: "Входящие события для сайта, форм, рекламы и внешних сервисов.",
    salesbot: "Автоматические сценарии касаний и распределения задач."
  };

  const requiredKeys: Record<string, string[]> = {
    wappi: ["WAPPI_ENABLED", "WAPPI_TOKEN", "WAPPI_PROFILE_ID"],
    ai_manager: ["AI_MANAGER_ENABLED", "AI_MANAGER_BASE_URL", "AI_MANAGER_API_KEY"],
    telephony: ["ONLINEPBX_ENABLED", "ONLINEPBX_DOMAIN", "ONLINEPBX_API_KEY"],
    webhooks: [],
    salesbot: []
  };

  function getIntegrationStatus(code: string, dbStatus: string) {
    if (code === "wappi") return wappi?.enabled ? (wappi.dryRun ? "Dry-run" : "Активна") : (sysStatus?.wappi.configured ? "Не активирована" : "Не подключена");
    if (code === "telephony") return telephony?.enabled ? (telephony.dryRun ? "Dry-run" : "Активна") : ((sysStatus?.onlinePbx.domainConfigured && sysStatus?.onlinePbx.apiKeyConfigured) ? "Не активирована" : "Не подключена");
    if (code === "ai_manager") {
      if (sysStatus?.aiManager.enabled && !sysStatus.aiManager.dryRun) return "Активен";
      if (sysStatus?.aiManager.enabled && sysStatus.aiManager.dryRun) return "Dry-run";
      if (sysStatus?.aiManager.baseUrlConfigured) return "Не активирован";
      return "Не подключён";
    }
    return dbStatus === "active" ? "Активна" : dbStatus === "disabled" ? "Не подключена" : "В настройке";
  }

  async function testAiConnection() {
    setAiTestLoading(true);
    setAiTestResult(null);
    try {
      const result = await apiJson<AiTestResult>("/api/ai/test-connection", { method: "POST" });
      setAiTestResult(result);
    } catch (err) {
      setAiTestResult({
        ok: false,
        dryRun: false,
        status: "error",
        message: err instanceof Error ? err.message : "Не удалось выполнить проверку подключения."
      });
    } finally {
      setAiTestLoading(false);
    }
  }

  return (
    <>
      <PageHeader title="Интеграции и автоматизации" subtitle="Управление подключёнными сервисами: WhatsApp, телефония, автоматизации" />

      {/* AmoCRM Import */}
      <section className="mb-5 rounded-xl border border-orange-200 bg-orange-50/60 p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-bakha-orange" />
              <h2 className="text-lg font-semibold text-slate-950">Импорт AmoCRM</h2>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${sysStatus?.amoImport.configured ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                {sysStatus?.amoImport.configured ? "Путь настроен" : "Не настроено"}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-600">Перенос клиентов, сделок, задач и истории из AmoCRM. Запускается однократно после настройки.</p>
            <code className="mt-3 block rounded-lg bg-white px-3 py-2 text-xs text-slate-700">AMO_IMPORT_DB_PATH=... → npm run import:amo:dry-run → npm run import:amo</code>
            <p className="mt-2 text-sm font-medium text-slate-700">Статус: {amoStatus}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-bakha-orange" onClick={() => runAmoAction("stats")}>Проверить данные</button>
            <button
              className="rounded-lg bg-bakha-orange px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600"
              onClick={() => {
                if (sysStatus?.amoImport.configured) {
                  void runAmoAction("run");
                } else {
                  notify("Для запуска импорта укажите AMO_IMPORT_DB_PATH в .env на сервере.");
                }
              }}
            >
              Запустить импорт
            </button>
          </div>
        </div>
        {amoStats && (
          <div className="mt-4 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
            {["leads", "contacts", "tasks", "notes", "users", "pipelines"].map((key) => (
              <div key={key} className="rounded-lg bg-white px-3 py-2">
                <p className="text-xs text-slate-500">{key}</p>
                <p className="text-lg font-semibold text-slate-950">{amoStats[key] ?? 0}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Integration cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {integrations.map((integration) => {
          const Icon = iconByCode[integration.code] ?? Plug;
          const isTelephony = integration.code === "telephony";
          const statusLabel = getIntegrationStatus(integration.code, integration.status);
          const isActive = statusLabel === "Активна";
          const isDryRun = statusLabel === "Dry-run";
          const isPending = statusLabel === "В настройке" || statusLabel === "Не активирована";
          const keys = requiredKeys[integration.code] ?? [];

          return (
            <section key={integration.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-panel">
              <div className="flex items-start justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-50 text-bakha-orange ring-1 ring-orange-100">
                  <Icon size={23} />
                </div>
                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                  isActive ? "bg-emerald-100 text-emerald-700"
                  : isDryRun ? "bg-blue-100 text-blue-700"
                  : isPending ? "bg-amber-100 text-amber-700"
                  : "bg-slate-100 text-slate-600"
                }`}>{statusLabel}</span>
              </div>
              <h2 className="mt-4 text-lg font-semibold text-slate-950">{integration.name}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">{captions[integration.code] ?? "Интеграция будет подключена позже."}</p>
              {keys.length > 0 && (
                <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                  <p className="mb-1 text-[11px] font-semibold text-slate-400">Необходимые переменные .env:</p>
                  {keys.map((k) => (
                    <p key={k} className="text-[11px] font-mono text-slate-600">{k}</p>
                  ))}
                  {!isActive && !isDryRun && (
                    <p className="mt-1 text-[11px] text-slate-400">Для подключения укажите ключи в настройках сервера.</p>
                  )}
                </div>
              )}
              <div className="mt-4 flex items-center gap-2">
                <button
                  className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-bakha-orange"
                  onClick={() => {
                    if (isTelephony) navigate("/settings/integrations/telephony");
                    else if (integration.code === "wappi") navigate("/settings/integrations/wappi");
                    else navigate("/settings/system");
                  }}
                >
                  Настроить
                </button>
                <button
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-bakha-orange hover:text-bakha-orange disabled:opacity-50"
                  disabled={checkingConnection === integration.code}
                  onClick={() => checkConnection(integration.code)}
                >
                  {checkingConnection === integration.code ? "Проверка..." : "Проверить"}
                </button>
              </div>

              {/* AI Manager: dedicated test-connection panel */}
              {integration.code === "ai_manager" && (
                <div className="mt-3 border-t border-slate-100 pt-3 space-y-2">
                  <button
                    className="w-full rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                    disabled={aiTestLoading}
                    onClick={() => void testAiConnection()}
                  >
                    {aiTestLoading ? "Проверка подключения..." : "Проверить подключение AI Manager"}
                  </button>
                  {aiTestResult && (
                    <div className={`rounded-lg border p-3 text-xs ${aiTestResult.ok ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
                      <div className="flex items-center gap-1.5 font-semibold">
                        <span className={`inline-block h-2 w-2 rounded-full ${aiTestResult.ok ? "bg-emerald-500" : "bg-red-400"}`} />
                        <span className={aiTestResult.ok ? "text-emerald-700" : "text-red-700"}>
                          {aiTestResult.status === "dry_run_success" ? "Dry-run: симуляция ОК"
                            : aiTestResult.status === "connected" ? "Подключено"
                            : aiTestResult.status === "disabled" ? "AI выключен"
                            : aiTestResult.status === "misconfigured" ? "Не настроен"
                            : "Ошибка подключения"}
                        </span>
                        {aiTestResult.dryRun && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">dry-run</span>}
                      </div>
                      <p className={`mt-1 ${aiTestResult.ok ? "text-emerald-700" : "text-red-700"}`}>{aiTestResult.message}</p>
                      {aiTestResult.normalizedResponse && (
                        <div className="mt-2 rounded bg-white/70 px-2 py-1.5 text-slate-600 space-y-0.5">
                          <p>Ответ: «{(aiTestResult.normalizedResponse.replyText ?? "").slice(0, 100)}»</p>
                          {aiTestResult.normalizedResponse.confidence != null && (
                            <p>Уверенность: {Math.round(aiTestResult.normalizedResponse.confidence * 100)}%</p>
                          )}
                          {aiTestResult.normalizedResponse.actionsCount > 0 && (
                            <p>Предложено действий: {aiTestResult.normalizedResponse.actionsCount}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

type PbxMapping = { id: number; crmUserId: number; onlinepbxExtension: string; isActive: boolean; userName?: string | null };

function TelephonySettingsPage() {
  const { users, telephony } = useCrm();
  const notify = useToast();
  const [mappings, setMappings] = useState<PbxMapping[]>([]);
  const [editExt, setEditExt] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});

  useEffect(() => {
    fetch("/api/telephony/mappings", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { mappings?: PbxMapping[] }) => {
        const rows = d.mappings ?? [];
        setMappings(rows);
        const ext: Record<number, string> = {};
        rows.forEach((m) => { ext[m.crmUserId] = m.onlinepbxExtension; });
        setEditExt(ext);
      })
      .catch(() => {});
  }, []);

  async function saveMapping(userId: number) {
    const ext = (editExt[userId] ?? "").trim();
    if (!ext) { notify("Введите добавочный номер"); return; }
    setSaving((s) => ({ ...s, [userId]: true }));
    try {
      const res = await fetch("/api/telephony/mappings", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crmUserId: userId, extension: ext }),
      });
      const data = await res.json() as { mapping?: PbxMapping; error?: string };
      if (!res.ok) { notify(data.error ?? "Ошибка сохранения"); return; }
      if (data.mapping) {
        setMappings((prev) => {
          const next = prev.filter((m) => m.crmUserId !== userId);
          return [...next, data.mapping!];
        });
      }
      notify("Добавочный номер сохранён");
    } catch { notify("Ошибка сети"); }
    finally { setSaving((s) => ({ ...s, [userId]: false })); }
  }

  const webhookUrl = `${window.location.origin}/api/webhooks/onlinepbx`;
  const statusColor = telephony?.enabled
    ? (telephony.dryRun ? "text-amber-600" : "text-emerald-600")
    : "text-slate-500";
  const statusLabel = telephony?.enabled
    ? (telephony.dryRun ? "Dry-run (без реальных звонков)" : telephony.configured ? "Активна" : "Включена, но не настроена")
    : "Отключена";

  return (
    <>
      <PageHeader title="Телефония onlinePBX" subtitle="Интеграция с onlinePBX для звонков, записей и автозадач" />

      {/* Status card */}
      <section className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Radio size={18} className="text-bakha-orange" />
              <h2 className="font-semibold text-slate-950">Статус интеграции</h2>
            </div>
            <p className={`mt-1 text-sm font-medium ${statusColor}`}>{statusLabel}</p>
            <p className="mt-2 text-xs text-slate-500">Управляется через переменные окружения ONLINEPBX_* на сервере.</p>
          </div>
          <div className="space-y-1 text-right text-xs text-slate-400">
            <p>ONLINEPBX_ENABLED={telephony?.enabled ? "true" : "false"}</p>
            <p>ONLINEPBX_DRY_RUN={telephony?.dryRun ? "true" : "false"}</p>
            <p>ONLINEPBX_API_KEY={"•".repeat(12)}</p>
          </div>
        </div>

        {/* Webhook URL */}
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="mb-1 text-xs font-semibold text-slate-500">URL для webhook onlinePBX</p>
          <code className="break-all text-sm text-slate-800">{webhookUrl}</code>
          <p className="mt-1 text-xs text-slate-400">Укажите этот URL в настройках onlinePBX (Уведомления / Webhook). Требуется публичный HTTPS-адрес в продакшн.</p>
        </div>
      </section>

      {/* Manager extension mappings */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-bakha-orange"><Users size={17} /></span>
          <h2 className="font-semibold text-slate-950">Добавочные номера менеджеров</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-semibold text-slate-500">
                <th className="pb-2 text-left">Менеджер</th>
                <th className="pb-2 text-left">Добавочный номер onlinePBX</th>
                <th className="pb-2 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {users.map((u) => (
                <tr key={u.id} className="py-2">
                  <td className="py-2.5 font-medium text-slate-800">{u.name}</td>
                  <td className="py-2.5">
                    <input
                      type="text"
                      placeholder="напр. 101"
                      value={editExt[u.id] ?? ""}
                      onChange={(e) => setEditExt((prev) => ({ ...prev, [u.id]: e.target.value }))}
                      className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-bakha-orange focus:outline-none"
                    />
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      onClick={() => saveMapping(u.id)}
                      disabled={saving[u.id]}
                      className="rounded-lg bg-bakha-orange px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
                    >
                      {saving[u.id] ? "..." : "Сохранить"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {mappings.length === 0 && (
          <p className="mt-4 text-xs text-slate-400">Ни один менеджер ещё не привязан к добавочному номеру. Заполните таблицу выше и сохраните.</p>
        )}
      </section>

      {/* Dry-run notice */}
      {telephony?.dryRun && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <strong>Dry-run режим активен.</strong> Звонки инициируются в CRM (история, задачи), но реальные API-вызовы в onlinePBX не выполняются. Чтобы отключить dry-run, установите <code>ONLINEPBX_DRY_RUN=false</code> и <code>ONLINEPBX_ENABLED=true</code> в .env.
        </div>
      )}
    </>
  );
}

type WappiTestResult = {
  ok: boolean;
  status: string;
  dryRun?: boolean;
  configured?: boolean;
  profileStatus?: string;
  message: string;
  error?: string;
};

function WappiSettingsPage() {
  const { wappi } = useCrm();
  const notify = useToast();
  const [checking, setChecking] = useState(false);
  const [testResult, setTestResult] = useState<WappiTestResult | null>(null);

  const webhookUrl = `${window.location.origin}/api/webhooks/wappi`;
  const statusColor = wappi?.enabled
    ? (wappi.dryRun ? "text-amber-600" : "text-emerald-600")
    : "text-slate-500";
  const statusLabel = wappi?.enabled
    ? (wappi.dryRun ? "Dry-run (без реальной отправки)" : wappi.configured ? "Активна" : "Включена, но не настроена")
    : "Отключена";

  async function checkConnection() {
    setChecking(true);
    setTestResult(null);
    try {
      const r = await fetch("/api/wappi/test-connection", { method: "POST", credentials: "include" });
      const d = await r.json() as WappiTestResult;
      setTestResult(d);
      if (!d.ok) notify("WAPPI: проверка завершена с ошибкой.");
    } catch {
      setTestResult({ ok: false, status: "error", message: "Не удалось выполнить проверку подключения." });
      notify("Не удалось проверить подключение WAPPI.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <>
      <PageHeader title="WAPPI / WhatsApp" subtitle="Интеграция с WAPPI для отправки и получения WhatsApp-сообщений" />

      {/* Status card */}
      <section className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <MessageCircle size={18} className="text-bakha-orange" />
              <h2 className="font-semibold text-slate-950">Статус интеграции</h2>
            </div>
            <p className={`mt-1 text-sm font-medium ${statusColor}`}>{statusLabel}</p>
            <p className="mt-2 text-xs text-slate-500">Управляется через переменные окружения WAPPI_* на сервере.</p>
          </div>
          <div className="space-y-1 text-right text-xs text-slate-400">
            <p>WAPPI_ENABLED={wappi?.enabled ? "true" : "false"}</p>
            <p>WAPPI_DRY_RUN={wappi?.dryRun ? "true" : "false"}</p>
            <p>WAPPI_TOKEN={"•".repeat(12)}</p>
          </div>
        </div>

        {/* Webhook URL */}
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="mb-1 text-xs font-semibold text-slate-500">URL для входящих webhook WAPPI</p>
          <code className="break-all text-sm text-slate-800">{webhookUrl}</code>
          <p className="mt-1 text-xs text-slate-400">Укажите этот URL в личном кабинете WAPPI в разделе «Уведомления». Требуется публичный HTTPS-адрес в продакшн.</p>
        </div>

        <button
          onClick={() => void checkConnection()}
          disabled={checking}
          className="mt-4 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-bakha-orange hover:text-bakha-orange disabled:opacity-50"
        >
          {checking ? "Проверка..." : "Проверить WAPPI"}
        </button>

        {testResult && (
          <div className={`mt-4 rounded-lg border p-3 text-sm ${testResult.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
            <p className="font-semibold">
              {testResult.ok ? "✓ " : "✗ "}
              {testResult.status === "dry_run_success" ? "Dry-run: симуляция ОК" :
               testResult.status === "connected" ? "Подключено к WAPPI" :
               testResult.status === "disabled" ? "WAPPI отключён" : "Ошибка подключения"}
            </p>
            <p className="mt-1 text-xs opacity-80">{testResult.message}</p>
            {testResult.profileStatus && (
              <p className="mt-0.5 text-xs">Статус профиля: <strong>{testResult.profileStatus}</strong></p>
            )}
            {testResult.configured !== undefined && (
              <p className="mt-0.5 text-xs">Token + Profile ID: {testResult.configured ? "✓ настроены" : "✗ не заданы"}</p>
            )}
          </div>
        )}
      </section>

      {/* Configuration instructions */}
      <section className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-bakha-orange"><Settings size={17} /></span>
          <h2 className="font-semibold text-slate-950">Как подключить WAPPI</h2>
        </div>
        <ol className="space-y-3 text-sm text-slate-700">
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700">1</span>
            <div>
              <p className="font-semibold">Получите токен и ID профиля в личном кабинете WAPPI</p>
              <p className="text-xs text-slate-500 mt-0.5">Зарегистрируйтесь на wappi.pro, подключите WhatsApp-номер, скопируйте токен и Profile ID.</p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700">2</span>
            <div>
              <p className="font-semibold">Укажите переменные окружения в файле .env</p>
              <div className="mt-1 rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800 space-y-0.5">
                <p>WAPPI_ENABLED=true</p>
                <p>WAPPI_DRY_RUN=false</p>
                <p>WAPPI_TOKEN=ваш_токен</p>
                <p>WAPPI_PROFILE_ID=ваш_profile_id</p>
                <p>WAPPI_WEBHOOK_SECRET=случайная_строка</p>
              </div>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700">3</span>
            <div>
              <p className="font-semibold">Настройте webhook в личном кабинете WAPPI</p>
              <p className="text-xs text-slate-500 mt-0.5">Вставьте URL выше в поле «Webhook URL» в WAPPI. Для локальной разработки используйте ngrok или cloudflared.</p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700">4</span>
            <div>
              <p className="font-semibold">Перезапустите сервер и проверьте статус</p>
              <p className="text-xs text-slate-500 mt-0.5">После перезапуска нажмите «Проверить подключение» выше или перейдите в Состояние системы.</p>
            </div>
          </li>
        </ol>
      </section>

      {wappi?.dryRun && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <strong>Dry-run режим активен.</strong> Сообщения сохраняются в CRM и отображаются в чатах, но реально клиентам не отправляются. Чтобы отключить dry-run, установите <code>WAPPI_DRY_RUN=false</code> и <code>WAPPI_ENABLED=true</code> в .env.
        </div>
      )}
    </>
  );
}

function SystemStatusPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiEvents, setAiEvents] = useState<AiEventEntry[]>([]);
  const [aiEventsLoading, setAiEventsLoading] = useState(false);
  const [showAiEvents, setShowAiEvents] = useState(false);

  async function loadStatus() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/system/status", { credentials: "include" });
      if (!r.ok) throw new Error(r.status === 401 ? "Требуется авторизация" : "API error");
      const d = await r.json() as SystemStatus;
      setStatus(d);
    } catch {
      setError("Не удалось получить статус системы. Убедитесь, что сервер запущен.");
    } finally {
      setLoading(false);
    }
  }

  async function loadAiEvents() {
    setAiEventsLoading(true);
    try {
      const payload = await apiJson<{ events: AiEventEntry[] }>("/api/ai/events?limit=30", { method: "GET" });
      setAiEvents(payload.events ?? []);
    } catch {
      setAiEvents([]);
    } finally {
      setAiEventsLoading(false);
    }
  }

  useEffect(() => { void loadStatus(); }, []);

  function StatusDot({ ok }: { ok: boolean }) {
    return <span className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-500" : "bg-red-400"}`} />;
  }

  function StatusRow({ label, value, ok, detail }: { label: string; value: string; ok: boolean; detail?: string }) {
    return (
      <div className="flex items-start justify-between gap-3 border-b border-slate-50 py-3 last:border-0">
        <div className="flex items-center gap-2">
          <StatusDot ok={ok} />
          <span className="text-sm font-medium text-slate-700">{label}</span>
          {detail && <span className="font-mono text-xs text-slate-400">{detail}</span>}
        </div>
        <span className={`text-sm font-semibold ${ok ? "text-emerald-600" : "text-red-500"}`}>{value}</span>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Состояние системы" subtitle="Проверка подключений и конфигурации интеграций" />

      {loading && (
        <div className="flex h-40 items-center justify-center rounded-xl border border-slate-200 bg-white">
          <p className="text-sm text-slate-400">Загрузка статуса...</p>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-5">
          <AlertCircle size={20} className="shrink-0 text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => void loadStatus()} className="ml-auto rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600">
            Повторить
          </button>
        </div>
      )}

      {status && (
        <div className="grid gap-5 xl:grid-cols-2">
          {/* General */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-bakha-orange"><Activity size={17} /></span>
              <h2 className="font-semibold text-slate-950">Общее</h2>
            </div>
            <StatusRow label="База данных" value={status.db.connected ? "Подключена" : "Нет соединения"} ok={status.db.connected} />
            <StatusRow label="Режим данных" value={status.dataMode === "real" ? "Реальные данные" : "Demo-режим"} ok={status.dataMode === "real"} detail={`DATA_MODE=${status.dataMode}`} />
          </section>

          {/* WAPPI */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-bakha-orange"><MessageCircle size={17} /></span>
              <h2 className="font-semibold text-slate-950">WAPPI / WhatsApp</h2>
            </div>
            <StatusRow label="Включён" value={status.wappi.enabled ? "Да" : "Нет"} ok={status.wappi.enabled} detail="WAPPI_ENABLED" />
            <StatusRow label="Dry-run режим" value={status.wappi.dryRun ? "Активен (безопасно)" : "Отключён (реальная отправка)"} ok={!status.wappi.dryRun || !status.wappi.enabled} detail="WAPPI_DRY_RUN" />
            <StatusRow label="Токен" value={status.wappi.tokenConfigured ? "Настроен" : "Не указан"} ok={status.wappi.tokenConfigured} detail="WAPPI_TOKEN" />
            <StatusRow label="Profile ID" value={status.wappi.profileIdConfigured ? "Настроен" : "Не указан"} ok={status.wappi.profileIdConfigured} detail="WAPPI_PROFILE_ID" />
            <StatusRow label="API Base URL" value={status.wappi.apiBaseUrlConfigured ? "Указан" : "По умолчанию (wappi.pro)"} ok={true} detail="WAPPI_API_BASE_URL" />
            <StatusRow label="Webhook Secret" value={status.wappi.webhookSecretConfigured ? "Настроен" : "Не указан"} ok={status.wappi.webhookSecretConfigured} detail="WAPPI_WEBHOOK_SECRET" />
            {status.wappi.tokenMasked && (
              <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                <span className="text-slate-400">Token: </span>
                <span className="font-mono text-slate-600">{status.wappi.tokenMasked}</span>
                {status.wappi.profileId && <><span className="ml-3 text-slate-400">Profile: </span><span className="font-mono text-slate-600">{status.wappi.profileId}</span></>}
              </div>
            )}
            {!status.wappi.configured && (
              <p className="mt-2 text-xs text-amber-600">Для подключения укажите WAPPI_TOKEN и WAPPI_PROFILE_ID в .env</p>
            )}
          </section>

          {/* onlinePBX */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-bakha-orange"><Radio size={17} /></span>
              <h2 className="font-semibold text-slate-950">onlinePBX / Телефония</h2>
            </div>
            <StatusRow label="Включён" value={status.onlinePbx.enabled ? "Да" : "Нет"} ok={status.onlinePbx.enabled} detail="ONLINEPBX_ENABLED" />
            <StatusRow label="Dry-run режим" value={status.onlinePbx.dryRun ? "Активен (безопасно)" : "Отключён (реальные звонки)"} ok={!status.onlinePbx.dryRun || !status.onlinePbx.enabled} detail="ONLINEPBX_DRY_RUN" />
            <StatusRow label="Домен" value={status.onlinePbx.domainConfigured ? "Настроен" : "Не указан"} ok={status.onlinePbx.domainConfigured} detail="ONLINEPBX_DOMAIN" />
            <StatusRow label="API-ключ" value={status.onlinePbx.apiKeyConfigured ? "Настроен" : "Не указан"} ok={status.onlinePbx.apiKeyConfigured} detail="ONLINEPBX_API_KEY" />
            <StatusRow label="Webhook Secret" value={status.onlinePbx.webhookSecretConfigured ? "Настроен" : "Не указан"} ok={status.onlinePbx.webhookSecretConfigured} detail="ONLINEPBX_WEBHOOK_SECRET" />
            <StatusRow label="Добавочные номера" value={`${status.onlinePbx.mappingCount} активных`} ok={status.onlinePbx.mappingCount > 0} />
            {status.onlinePbx.apiKeyMasked && (
              <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                <span className="text-slate-400">API Key: </span>
                <span className="font-mono text-slate-600">{status.onlinePbx.apiKeyMasked}</span>
              </div>
            )}
            {!status.onlinePbx.domainConfigured && (
              <p className="mt-2 text-xs text-amber-600">Для подключения укажите ONLINEPBX_DOMAIN, ONLINEPBX_API_KEY в .env</p>
            )}
          </section>

          {/* Other integrations */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-bakha-orange"><Plug size={17} /></span>
              <h2 className="font-semibold text-slate-950">Прочие интеграции</h2>
            </div>
            <StatusRow label="AmoCRM Import" value={status.amoImport.configured ? "Путь настроен" : "Не настроено"} ok={status.amoImport.configured} detail="AMO_IMPORT_DB_PATH" />
          </section>

          {/* AI Manager */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600"><Bot size={17} /></span>
              <h2 className="font-semibold text-slate-950">AI Manager Bridge</h2>
            </div>
            <StatusRow label="Включён" value={status.aiManager.enabled ? "Да" : "Нет (безопасно)"} ok={status.aiManager.enabled} detail="AI_MANAGER_ENABLED" />
            <StatusRow label="Dry-run режим" value={status.aiManager.dryRun ? "Активен (локальная симуляция)" : "Отключён (реальные вызовы)"} ok={!status.aiManager.dryRun || !status.aiManager.enabled} detail="AI_MANAGER_DRY_RUN" />
            <StatusRow label="Base URL" value={status.aiManager.baseUrlConfigured ? "Настроен" : "Не указан"} ok={status.aiManager.baseUrlConfigured} detail="AI_MANAGER_BASE_URL" />
            <StatusRow label="API Key" value={status.aiManager.apiKeyConfigured ? "Настроен" : "Не указан"} ok={status.aiManager.apiKeyConfigured} detail="AI_MANAGER_API_KEY" />
            <StatusRow label="Endpoint" value={status.aiManager.endpoint} ok={true} detail="AI_MANAGER_ENDPOINT" />
            <StatusRow label="Авто-отправка" value={status.aiManager.autoSend ? "Включена ⚠" : "Выключена (ручное одобрение)"} ok={!status.aiManager.autoSend} detail="AI_MANAGER_AUTO_SEND" />
            <StatusRow label="Авто-действия" value={status.aiManager.autoActions ? "Включены" : "Выключены (требуется одобрение)"} ok={!status.aiManager.autoActions} detail="AI_MANAGER_AUTO_ACTIONS" />
            <StatusRow label="Пауза после менеджера" value={status.aiManager.pauseOnManagerReply ? `Да (${status.aiManager.pauseMinutes} мин)` : "Нет"} ok={status.aiManager.pauseOnManagerReply} detail="AI_MANAGER_PAUSE_ON_MANAGER_REPLY" />
            <StatusRow label="Мин. уверенность" value={`${Math.round(status.aiManager.minConfidence * 100)}%`} ok={true} detail="AI_MANAGER_MIN_CONFIDENCE" />
            {!status.aiManager.enabled && (
              <p className="mt-2 text-xs text-slate-400">AI Manager отключён. Установите AI_MANAGER_ENABLED=true в .env после настройки сервера.</p>
            )}
            {status.aiManager.autoSendWarning && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
                <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-600" />
                <p className="text-xs text-amber-800">{status.aiManager.autoSendWarning}</p>
              </div>
            )}
            {/* AI Event Logs (collapsible) */}
            <div className="mt-4 border-t border-slate-100 pt-3">
              <button
                className="flex w-full items-center justify-between text-xs font-semibold text-slate-500 hover:text-violet-600"
                onClick={() => {
                  if (!showAiEvents) void loadAiEvents();
                  setShowAiEvents((v) => !v);
                }}
              >
                <span className="flex items-center gap-1.5"><Bot size={11} /> Логи AI событий (последние 30)</span>
                <span>{showAiEvents ? "Скрыть ▲" : "Показать ▼"}</span>
              </button>
              {showAiEvents && (
                <div className="mt-2">
                  {aiEventsLoading && <p className="text-xs text-slate-400">Загрузка...</p>}
                  {!aiEventsLoading && aiEvents.length === 0 && (
                    <p className="text-xs text-slate-400">Нет событий AI. Включите AI Manager и подождите входящих сообщений.</p>
                  )}
                  {!aiEventsLoading && aiEvents.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="border-b border-slate-100 text-left text-slate-400">
                            <th className="pb-1 pr-3 font-semibold">Время</th>
                            <th className="pb-1 pr-3 font-semibold">Тип</th>
                            <th className="pb-1 pr-3 font-semibold">Статус</th>
                            <th className="pb-1 pr-3 font-semibold">Причина / Ошибка</th>
                            <th className="pb-1 font-semibold">Lead / Conv</th>
                          </tr>
                        </thead>
                        <tbody>
                          {aiEvents.map((ev) => {
                            const dirLabel: Record<string, string> = {
                              request: "→ запрос",
                              response: "← ответ",
                              error: "✗ ошибка",
                              skipped: "⊘ пропуск"
                            };
                            const reasonLabel: Record<string, string> = {
                              ai_disabled: "AI выключен",
                              not_incoming: "не входящее",
                              not_client_sender: "не клиент",
                              no_text: "нет текста",
                              ai_paused: "на паузе",
                              ai_paused_until: "на паузе (таймер)",
                              duplicate_suggestion: "дубликат",
                              unknown: "неизвестно"
                            };
                            return (
                              <tr key={ev.id} className="border-b border-slate-50 last:border-0">
                                <td className="py-1 pr-3 text-slate-500 whitespace-nowrap">
                                  {new Date(ev.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                                </td>
                                <td className="py-1 pr-3">
                                  <span className={`rounded px-1.5 py-0.5 font-semibold ${
                                    ev.direction === "response" ? "bg-emerald-100 text-emerald-700"
                                    : ev.direction === "request" ? "bg-violet-100 text-violet-700"
                                    : ev.direction === "error" ? "bg-red-100 text-red-600"
                                    : "bg-slate-100 text-slate-500"
                                  }`}>{dirLabel[ev.direction] ?? ev.direction}</span>
                                </td>
                                <td className="py-1 pr-3">
                                  <span className={`rounded px-1.5 py-0.5 font-semibold ${
                                    ev.status === "completed" ? "bg-emerald-100 text-emerald-700"
                                    : ev.status === "skipped" ? "bg-slate-100 text-slate-500"
                                    : ev.status === "failed" ? "bg-red-100 text-red-600"
                                    : "bg-amber-100 text-amber-700"
                                  }`}>{ev.status}</span>
                                </td>
                                <td className="py-1 pr-3 text-slate-500 max-w-[200px] truncate" title={ev.errorMessage ?? ev.reason ?? ""}>
                                  {ev.errorMessage
                                    ? <span className="text-red-500">{ev.errorMessage.slice(0, 70)}</span>
                                    : ev.reason ? (reasonLabel[ev.reason] ?? ev.reason) : "—"}
                                </td>
                                <td className="py-1 text-slate-400 whitespace-nowrap">
                                  {ev.leadId ? `L${ev.leadId}` : ""}{ev.conversationId ? ` C${ev.conversationId}` : ""}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <button
                    className="mt-2 text-[10px] text-violet-500 hover:underline"
                    onClick={() => void loadAiEvents()}
                  >
                    Обновить
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* Instructions */}
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm xl:col-span-2">
            <div className="mb-3 flex items-center gap-2">
              <AlertCircle size={18} className="text-amber-600" />
              <h2 className="font-semibold text-amber-900">Инструкция по настройке</h2>
            </div>
            <p className="text-sm text-amber-800">Все параметры настраиваются в файле <code className="rounded bg-amber-100 px-1.5 py-0.5 text-xs">.env</code> в корне проекта. После изменения переменных перезапустите сервер (<code className="text-xs">npm run dev:server</code>). Значения токенов не отображаются в интерфейсе из соображений безопасности.</p>
            <button
              onClick={() => void loadStatus()}
              className="mt-3 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700"
            >
              Обновить статус
            </button>
          </section>
        </div>
      )}
    </>
  );
}

function groupBy<T>(items: T[], getter: (item: T) => string) {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const key = getter(item);
    acc[key] ??= [];
    acc[key].push(item);
    return acc;
  }, {});
}
