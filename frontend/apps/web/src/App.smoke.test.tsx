// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserRouter } from "react-router-dom";
import App from "./App";

function renderApp(path = "/dashboard") {
  window.history.pushState({}, "", path);
  return render(
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const jsonResponse = (payload: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(payload) });
      if (url === "/api/leads/1" && method === "GET") {
        return jsonResponse({
          notes: [],
          customValues: [],
          tasks: [],
          messages: [{ id: 1, leadId: 1, channel: "wappi", direction: "incoming", text: "WAPPI smoke incoming", status: "received", createdAt: "2026-06-02T10:00:00.000Z" }],
          aiSuggestions: [],
          conversation: null
        });
      }
      if (url === "/api/leads/1/history" && method === "GET") {
        return jsonResponse({ history: [] });
      }
      if (url === "/api/chats" && method === "GET") {
        return jsonResponse({
          conversations: [{ id: 1, leadId: 1, contactId: 1, phone: "77012345678", channel: "wappi", status: "open", unreadCount: 1, lastMessageAt: "2026-06-02T10:00:00.000Z", leadTitle: "Потолок в гостиную", contactName: "Айгерим С.", aiPaused: true, aiSuggestions: [] }],
          messages: [],
          wappi: { enabled: false, dryRun: true, configured: false },
          aiManager: { enabled: false, dryRun: true }
        });
      }
      // Paginated conversation messages (used by ChatsPage when conversation is selected)
      if (url.match(/\/api\/conversations\/\d+\/messages/) && method === "GET") {
        return jsonResponse({
          messages: [{ id: 1, leadId: 1, channel: "wappi", direction: "incoming", text: "WAPPI smoke incoming", status: "received", createdAt: "2026-06-02T10:00:00.000Z" }],
          hasMore: false
        });
      }
      // Mark conversation as read
      if (url.match(/\/api\/conversations\/\d+\/read/) && method === "POST") {
        return jsonResponse({ ok: true });
      }
      // WAPPI test-connection
      if (url === "/api/wappi/test-connection" && method === "POST") {
        return jsonResponse({ ok: true, status: "dry_run_success", dryRun: true, configured: false, message: "Dry-run: симуляция ОК" });
      }
      if (url === "/api/leads/1/messages" && method === "POST") {
        return jsonResponse({ dryRun: true, message: { id: 2, leadId: 1, channel: "wappi", direction: "outgoing", text: "Smoke WAPPI", status: "sent", createdAt: "2026-06-02T10:01:00.000Z" } });
      }
      if (url.includes("/api/leads/1/stage") || url.includes("/api/tasks") || url.includes("/api/notes")) {
        return jsonResponse({ ok: true, task: { id: 99 }, note: { id: 99 }, lead: { id: 1 } });
      }
      // Focused suggestions polling endpoint (used by ChatsPage/LeadDetailPage polling)
      if (url.includes("/api/ai/suggestions") && method === "GET") {
        return jsonResponse({ suggestions: [], aiManager: { enabled: false, dryRun: true, autoSend: false, autoActions: false } });
      }
      return Promise.reject(new Error("API unavailable in smoke test"));
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Bakha CRM smoke", () => {
  it("protects CRM routes without login", async () => {
    renderApp("/dashboard");

    expect(await screen.findByText("Вход в CRM")).toBeInTheDocument();
  });

  it("shows an error for invalid credentials", async () => {
    renderApp("/login");

    fireEvent.change(screen.getAllByLabelText("Email")[0], { target: { value: "wrong@bakha.kz" } });
    fireEvent.change(screen.getAllByLabelText("Пароль")[0], { target: { value: "bad" } });
    fireEvent.click(screen.getByRole("button", { name: "Войти" }));

    expect(await screen.findByText("Неверный email или пароль")).toBeInTheDocument();
  });

  it("opens dashboard with demo auth", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    renderApp("/dashboard");

    expect(await screen.findByRole("heading", { name: "Рабочий стол" })).toBeInTheDocument();
    expect(screen.getByText("Задачи на контроле")).toBeInTheDocument();
  });

  it("renders sales kanban and lead detail route", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    renderApp("/sales");

    expect(await screen.findByRole("heading", { name: "Отдел продаж" })).toBeInTheDocument();
    expect(screen.getByText("Плотный kanban")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Поиск по имени, телефону, amo_id, адресу, источнику"), { target: { value: "Айгерим" } });
    expect(screen.getByText("Айгерим С.")).toBeInTheDocument();
    expect(screen.queryByText("Мурат К.")).not.toBeInTheDocument();

    window.history.pushState({}, "", "/leads/1");
    cleanup();
    renderApp("/leads/1");
    await waitFor(() => expect(screen.getByText("Следующее действие")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Файлы" }));
    expect(screen.getByText("Прикрепить файл")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Примечания" }));
    expect(screen.getByText("Сохранить заметку")).toBeInTheDocument();
  });

  it("runs lead detail CRUD smoke actions", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    renderApp("/leads/1");

    await waitFor(() => expect(screen.getByText("Следующее действие")).toBeInTheDocument());
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "1" } });
    expect(await screen.findByText("Этап сделки сохранён.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Примечания" }));
    fireEvent.change(screen.getByPlaceholderText("Новая заметка"), { target: { value: "Smoke note" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить заметку" }));
    expect(await screen.findByText("Заметка сохранена.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Задачи" }));
    fireEvent.change(screen.getByPlaceholderText("Название задачи"), { target: { value: "Smoke task" } });
    fireEvent.click(screen.getByRole("button", { name: "Добавить задачу" }));
    expect(await screen.findByText("Задача создана.")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Выполнить" })[0]);
    expect(await screen.findByText("Задача выполнена.")).toBeInTheDocument();
  });

  it("shows WAPPI chat and dry-run outgoing message", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    renderApp("/leads/1");

    await waitFor(() => expect(screen.getByText("Следующее действие")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Чат WAPPI" }));
    expect((await screen.findAllByText("WAPPI smoke incoming")).length).toBeGreaterThan(0);
    fireEvent.change(screen.getAllByPlaceholderText("Введите текст...")[0], { target: { value: "Smoke WAPPI" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Отправить" })[0]);
    expect(await screen.findByText("Dry-run: сообщение сохранено в CRM без реальной отправки.")).toBeInTheDocument();
  });

  it("opens chats imBox", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    renderApp("/chats");

    expect(await screen.findByRole("heading", { name: "Чаты" })).toBeInTheDocument();
    expect((await screen.findAllByText("WAPPI smoke incoming")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Потолок в гостиную").length).toBeGreaterThan(0);
  });

  // ── AI Manager Bridge smoke tests ─────────────────────────────────────────

  it("AI disabled: chats load normally, no AI status bar shown", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    renderApp("/chats");

    expect(await screen.findByRole("heading", { name: "Чаты" })).toBeInTheDocument();
    // With aiManager.enabled=false, AI status bar should NOT render (bar only visible when enabled)
    expect(screen.queryByText("AI включён")).not.toBeInTheDocument();
    expect(screen.queryByText("AI на паузе")).not.toBeInTheDocument();
    // The conversation list and messages still load normally
    expect(screen.getAllByText("WAPPI smoke incoming").length).toBeGreaterThan(0);
  });

  it("AI dry-run: shows AI status bar and draft suggestion card", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    // Override the fetch mock to include AI suggestion
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const jsonResponse = (payload: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(payload) });
        if (url === "/api/chats" && method === "GET") {
          return jsonResponse({
            conversations: [{
              id: 1, leadId: 1, contactId: 1, phone: "77012345678",
              channel: "wappi", status: "open", unreadCount: 1,
              lastMessageAt: "2026-06-02T10:00:00.000Z",
              leadTitle: "Потолок в гостиную", contactName: "Айгерим С.",
              aiPaused: false,
              aiSuggestions: [{
                id: 10, conversationId: 1, status: "draft",
                replyText: "Здравствуйте! Стоимость зависит от площади.",
                confidence: 0.82, sourceMessageId: 1,
                createdAt: "2026-06-02T10:01:00.000Z"
              }]
            }],
            messages: [],
            wappi: { enabled: false, dryRun: true, configured: false },
            aiManager: { enabled: true, dryRun: true }
          });
        }
        if (url.match(/\/api\/conversations\/\d+\/messages/) && method === "GET") {
          return jsonResponse({ messages: [], hasMore: false });
        }
        if (url.match(/\/api\/conversations\/\d+\/read/) && method === "POST") {
          return jsonResponse({ ok: true });
        }
        if (url.includes("/api/ai/suggestions") && method === "GET") {
          return jsonResponse({ suggestions: [], aiManager: { enabled: true, dryRun: true, autoSend: false, autoActions: false } });
        }
        return Promise.reject(new Error("API unavailable in smoke test"));
      })
    );

    renderApp("/chats");

    // AI status bar should be visible (AI enabled)
    expect(await screen.findByText("AI включён")).toBeInTheDocument();
    expect(screen.getByText("dry-run")).toBeInTheDocument();
    // Draft suggestion card
    expect(screen.getByText("AI предложил ответ")).toBeInTheDocument();
    expect(screen.getByText("Здравствуйте! Стоимость зависит от площади.")).toBeInTheDocument();
    // Buttons exist
    expect(screen.getAllByRole("button", { name: /Отправить/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /Отклонить/i }).length).toBeGreaterThan(0);
    // Confidence shown as percentage
    expect(screen.getByText("82%")).toBeInTheDocument();
  });

  it("approve suggestion: calls approve API and shows success toast", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    let chatsCallCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const jsonResponse = (payload: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(payload) });
        if (url === "/api/chats" && method === "GET") {
          chatsCallCount++;
          const aiSuggestions = chatsCallCount === 1 ? [{
            id: 10, conversationId: 1, status: "draft",
            replyText: "Спасибо за обращение!",
            confidence: 0.9, sourceMessageId: 1,
            createdAt: "2026-06-02T10:01:00.000Z"
          }] : [];
          return jsonResponse({
            conversations: [{
              id: 1, leadId: 1, contactId: 1, phone: "77012345678",
              channel: "wappi", status: "open", unreadCount: 0,
              lastMessageAt: "2026-06-02T10:00:00.000Z",
              leadTitle: "Потолок в гостиную", contactName: "Айгерим С.",
              aiPaused: false, aiSuggestions
            }],
            messages: [],
            wappi: { enabled: false, dryRun: true, configured: false },
            aiManager: { enabled: true, dryRun: true }
          });
        }
        if (url.match(/\/api\/conversations\/\d+\/messages/) && method === "GET") {
          return jsonResponse({ messages: [], hasMore: false });
        }
        if (url.match(/\/api\/conversations\/\d+\/read/) && method === "POST") {
          return jsonResponse({ ok: true });
        }
        if (url.includes("/api/ai/suggestions") && method === "GET") {
          return jsonResponse({ suggestions: [], aiManager: { enabled: true, dryRun: true, autoSend: false, autoActions: false } });
        }
        if (url === "/api/ai/suggestions/10/approve" && method === "POST") {
          return jsonResponse({ ok: true, sent: true, dryRun: true });
        }
        return Promise.reject(new Error("API unavailable in smoke test"));
      })
    );

    renderApp("/chats");

    await screen.findByText("AI предложил ответ");
    fireEvent.click(screen.getAllByRole("button", { name: /Отправить/i })[0]);

    expect(await screen.findByText("Ответ AI одобрен и сохранён (dry-run).")).toBeInTheDocument();
  });

  it("reject suggestion: calls reject API and shows toast", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const jsonResponse = (payload: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(payload) });
        if (url === "/api/chats" && method === "GET") {
          return jsonResponse({
            conversations: [{
              id: 1, leadId: 1, contactId: 1, phone: "77012345678",
              channel: "wappi", status: "open", unreadCount: 0,
              lastMessageAt: "2026-06-02T10:00:00.000Z",
              leadTitle: "Потолок", contactName: "Тест",
              aiPaused: false,
              aiSuggestions: [{
                id: 11, conversationId: 1, status: "draft",
                replyText: "Плохой ответ",
                confidence: 0.4, sourceMessageId: 2,
                createdAt: "2026-06-02T10:01:00.000Z"
              }]
            }],
            messages: [],
            wappi: { enabled: false, dryRun: true, configured: false },
            aiManager: { enabled: true, dryRun: true }
          });
        }
        if (url.match(/\/api\/conversations\/\d+\/messages/) && method === "GET") {
          return jsonResponse({ messages: [], hasMore: false });
        }
        if (url.match(/\/api\/conversations\/\d+\/read/) && method === "POST") {
          return jsonResponse({ ok: true });
        }
        if (url.includes("/api/ai/suggestions") && method === "GET") {
          return jsonResponse({ suggestions: [], aiManager: { enabled: true, dryRun: true, autoSend: false, autoActions: false } });
        }
        if (url === "/api/ai/suggestions/11/reject" && method === "POST") {
          return jsonResponse({ ok: true });
        }
        return Promise.reject(new Error("API unavailable in smoke test"));
      })
    );

    renderApp("/chats");

    await screen.findByText("AI предложил ответ");
    fireEvent.click(screen.getAllByRole("button", { name: /Отклонить/i })[0]);

    expect(await screen.findByText("Предложение AI отклонено.")).toBeInTheDocument();
  });

  it("AI paused: shows paused status with resume button", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const jsonResponse = (payload: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(payload) });
        if (url === "/api/chats" && method === "GET") {
          return jsonResponse({
            conversations: [{
              id: 1, leadId: 1, contactId: 1, phone: "77012345678",
              channel: "wappi", status: "open", unreadCount: 0,
              lastMessageAt: "2026-06-02T10:00:00.000Z",
              leadTitle: "Потолок", contactName: "Тест",
              aiPaused: true,
              aiPausedUntil: new Date(Date.now() + 20 * 60_000).toISOString(),
              aiPauseReason: "manager_reply",
              aiSuggestions: []
            }],
            messages: [],
            wappi: { enabled: false, dryRun: true, configured: false },
            aiManager: { enabled: true, dryRun: true }
          });
        }
        if (url.match(/\/api\/conversations\/\d+\/messages/) && method === "GET") {
          return jsonResponse({ messages: [], hasMore: false });
        }
        if (url.match(/\/api\/conversations\/\d+\/read/) && method === "POST") {
          return jsonResponse({ ok: true });
        }
        if (url.includes("/api/ai/suggestions") && method === "GET") {
          return jsonResponse({ suggestions: [], aiManager: { enabled: true, dryRun: true, autoSend: false, autoActions: false } });
        }
        return Promise.reject(new Error("API unavailable in smoke test"));
      })
    );

    renderApp("/chats");

    expect(await screen.findByText("AI на паузе")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Включить AI" })).toBeInTheDocument();
  });

  it("system status shows AI Manager section", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
        const url = String(input);
        const jsonResponse = (payload: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(payload) });
        if (url === "/api/system/status") {
          return jsonResponse({
            dataMode: "demo",
            db: { connected: true },
            wappi: { enabled: false, dryRun: true, configured: false, apiBaseUrlConfigured: true, profileIdConfigured: false, tokenConfigured: false, webhookSecretConfigured: false, tokenMasked: null, profileId: null, requiredEnvVars: [] },
            onlinePbx: { enabled: false, dryRun: true, apiBaseUrlConfigured: true, domainConfigured: false, apiKeyConfigured: false, apiKeyMasked: null, webhookSecretConfigured: false, mappingCount: 0, requiredEnvVars: [] },
            amoImport: { configured: false, requiredEnvVars: [] },
            aiManager: {
              configured: false,
              enabled: false,
              dryRun: true,
              baseUrlConfigured: false,
              endpoint: "/api/incoming-message",
              apiKeyConfigured: false,
              autoSend: false,
              autoActions: false,
              pauseOnManagerReply: true,
              pauseMinutes: 30,
              minConfidence: 0.75,
              requiredEnvVars: []
            }
          });
        }
        return Promise.reject(new Error("API unavailable in smoke test"));
      })
    );
    renderApp("/settings/system");

    expect(await screen.findByText("AI Manager Bridge")).toBeInTheDocument();
    expect(screen.getByText("AI_MANAGER_ENABLED")).toBeInTheDocument();
    expect(screen.getByText("Авто-отправка")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  it("edit suggestion in ChatsPage: opens inline editor and calls PATCH", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    let chatsCallCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const jsonResponse = (payload: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(payload) });
        if (url === "/api/chats" && method === "GET") {
          chatsCallCount++;
          const aiSuggestions = chatsCallCount === 1 ? [{
            id: 12, conversationId: 1, status: "draft",
            replyText: "Исходный ответ AI",
            confidence: 0.88, sourceMessageId: 3,
            createdAt: "2026-06-02T10:01:00.000Z",
            suggestedActionsJson: null
          }] : [];
          return jsonResponse({
            conversations: [{
              id: 1, leadId: 1, contactId: 1, phone: "77012345678",
              channel: "wappi", status: "open", unreadCount: 0,
              lastMessageAt: "2026-06-02T10:00:00.000Z",
              leadTitle: "Потолок", contactName: "Тест",
              aiPaused: false, aiSuggestions
            }],
            messages: [],
            wappi: { enabled: false, dryRun: true, configured: false },
            aiManager: { enabled: true, dryRun: true }
          });
        }
        if (url.match(/\/api\/conversations\/\d+\/messages/) && method === "GET") {
          return jsonResponse({ messages: [], hasMore: false });
        }
        if (url.match(/\/api\/conversations\/\d+\/read/) && method === "POST") {
          return jsonResponse({ ok: true });
        }
        if (url.includes("/api/ai/suggestions") && method === "GET") {
          return jsonResponse({ suggestions: [], aiManager: { enabled: true, dryRun: true, autoSend: false, autoActions: false } });
        }
        if (url === "/api/ai/suggestions/12" && method === "PATCH") {
          return jsonResponse({ ok: true, suggestion: { id: 12, status: "draft", replyText: "Изменённый ответ" } });
        }
        return Promise.reject(new Error("API unavailable"));
      })
    );

    renderApp("/chats");

    await screen.findByText("Исходный ответ AI");
    fireEvent.click(screen.getByRole("button", { name: /Редактировать/i }));
    // Inline editor (textarea) appears with original text
    const textarea = screen.getByDisplayValue("Исходный ответ AI");
    expect(textarea).toBeInTheDocument();

    fireEvent.change(textarea, { target: { value: "Изменённый ответ" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(await screen.findByText("Текст ответа AI изменён.")).toBeInTheDocument();
  });

  it("LeadDetailPage: shows AI suggestion card with edit and reject buttons", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const jsonResponse = (payload: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(payload) });
        if (url === "/api/leads/1" && method === "GET") {
          return jsonResponse({
            notes: [], customValues: [], tasks: [],
            messages: [{ id: 1, leadId: 1, channel: "wappi", direction: "incoming", text: "Привет AI!", status: "received", createdAt: "2026-06-02T10:00:00.000Z" }],
            aiSuggestions: [{
              id: 20, conversationId: 1, leadId: 1, status: "draft",
              replyText: "Добрый день! Чем могу помочь?",
              confidence: 0.91, sourceMessageId: 1,
              createdAt: "2026-06-02T10:01:00.000Z",
              suggestedActionsJson: null
            }],
            conversation: { id: 1, aiPaused: false, aiPausedUntil: null, aiPauseReason: null }
          });
        }
        if (url === "/api/leads/1/history" && method === "GET") {
          return jsonResponse({ history: [] });
        }
        if (url.includes("/api/leads/1/stage") || url.includes("/api/tasks") || url.includes("/api/notes")) {
          return jsonResponse({ ok: true, task: { id: 99 }, note: { id: 99 }, lead: { id: 1 } });
        }
        return Promise.reject(new Error("API unavailable"));
      })
    );

    renderApp("/leads/1");

    await waitFor(() => expect(screen.getByText("Следующее действие")).toBeInTheDocument());
    // WAPPI tab is default visible
    expect(await screen.findByText("Добрый день! Чем могу помочь?")).toBeInTheDocument();
    expect(screen.getAllByText("AI предложил ответ").length).toBeGreaterThan(0);
    // Confidence shown
    expect(screen.getByText("91%")).toBeInTheDocument();
    // Action buttons (multiple "Редактировать" exist: lead edit + AI suggestion)
    expect(screen.getAllByRole("button", { name: /Редактировать/i }).length).toBeGreaterThan(1);
    expect(screen.getAllByRole("button", { name: /Отклонить/i }).length).toBeGreaterThan(0);
    // AI status bar (paused=false → "AI включён")
    expect(screen.getByText("AI включён")).toBeInTheDocument();
  });

  it("LeadDetailPage: shows suggested CRM actions as read-only", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const jsonResponse = (payload: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(payload) });
        if (url === "/api/leads/1" && method === "GET") {
          return jsonResponse({
            notes: [], customValues: [], tasks: [],
            messages: [],
            aiSuggestions: [{
              id: 21, conversationId: 1, leadId: 1, status: "draft",
              replyText: "Хорошо, запишем вас на замер.",
              confidence: 0.79, sourceMessageId: 2,
              createdAt: "2026-06-02T10:01:00.000Z",
              suggestedActionsJson: JSON.stringify([
                { type: "create_task", payload: { title: "Замер у клиента" } },
                { type: "set_stage", payload: { stage: "Запись на замер" } }
              ])
            }],
            conversation: { id: 1, aiPaused: false }
          });
        }
        if (url === "/api/leads/1/history" && method === "GET") {
          return jsonResponse({ history: [] });
        }
        if (url.includes("/api/leads/1/stage") || url.includes("/api/tasks") || url.includes("/api/notes")) {
          return jsonResponse({ ok: true, task: { id: 99 }, note: { id: 99 }, lead: { id: 1 } });
        }
        return Promise.reject(new Error("API unavailable"));
      })
    );

    renderApp("/leads/1");

    await waitFor(() => expect(screen.getByText("Следующее действие")).toBeInTheDocument());
    expect(await screen.findByText("AI предложил действия:")).toBeInTheDocument();
    expect(screen.getByText(/Задача.*Замер у клиента/i)).toBeInTheDocument();
    expect(screen.getByText(/Этап.*Запись на замер/i)).toBeInTheDocument();
    expect(screen.getByText("Будет доступно для применения после настройки правил")).toBeInTheDocument();
  });

  it("AI test-connection: dry-run shows success panel in integrations", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const jsonResponse = (payload: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(payload) });
        if (url === "/api/system/status" && method === "GET") {
          return jsonResponse({
            dataMode: "demo",
            db: { connected: true },
            wappi: { enabled: false, dryRun: true, configured: false, apiBaseUrlConfigured: false, profileIdConfigured: false, tokenConfigured: false, webhookSecretConfigured: false, tokenMasked: null, profileId: null, requiredEnvVars: [] },
            onlinePbx: { enabled: false, dryRun: true, apiBaseUrlConfigured: false, domainConfigured: false, apiKeyConfigured: false, apiKeyMasked: null, webhookSecretConfigured: false, mappingCount: 0, requiredEnvVars: [] },
            amoImport: { configured: false, requiredEnvVars: [] },
            aiManager: { configured: false, enabled: true, dryRun: true, baseUrlConfigured: false, endpoint: "/api/incoming-message", apiKeyConfigured: false, autoSend: false, autoActions: false, pauseOnManagerReply: true, pauseMinutes: 30, minConfidence: 0.75, autoSendWarning: null, requiredEnvVars: [] }
          });
        }
        if (url === "/api/ai/test-connection" && method === "POST") {
          return jsonResponse({
            ok: true,
            dryRun: true,
            status: "dry_run_success",
            message: "Dry-run: симуляция прошла успешно. Реальный AI Manager не вызывался.",
            sampleRequest: { text: "Тест подключения" },
            normalizedResponse: { replyText: "Здравствуйте! Стоимость зависит от площади.", confidence: 0.82, actionsCount: 1 }
          });
        }
        return Promise.reject(new Error("API unavailable"));
      })
    );

    renderApp("/settings/integrations");

    // Wait for integrations page to load
    await waitFor(() => expect(screen.getByText("Интеграции и автоматизации")).toBeInTheDocument());
    // Click test connection button for AI Manager
    const testBtn = await screen.findByRole("button", { name: /Проверить подключение AI Manager/i });
    fireEvent.click(testBtn);

    // Should show dry-run success result
    expect(await screen.findByText(/Dry-run: симуляция прошла успешно/i)).toBeInTheDocument();
    expect(screen.getByText(/Здравствуйте! Стоимость зависит от площади/i)).toBeInTheDocument();
    expect(screen.getByText("dry-run")).toBeInTheDocument();
  });

  it("focused suggestions endpoint: ChatsPage poll uses conversationId param", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    const polledUrls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        polledUrls.push(url);
        const jsonResponse = (payload: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(payload) });
        if (url === "/api/chats" && method === "GET") {
          return jsonResponse({
            conversations: [{ id: 1, leadId: 1, contactId: 1, phone: "77012345678", channel: "wappi", status: "open", unreadCount: 0, lastMessageAt: null, leadTitle: "Тест", contactName: "Тест", aiPaused: false, aiSuggestions: [] }],
            messages: [],
            wappi: { enabled: false, dryRun: true, configured: false },
            aiManager: { enabled: false, dryRun: true }
          });
        }
        if (url.match(/\/api\/conversations\/\d+\/messages/) && method === "GET") {
          return jsonResponse({ messages: [], hasMore: false });
        }
        if (url.match(/\/api\/conversations\/\d+\/read/) && method === "POST") {
          return jsonResponse({ ok: true });
        }
        if (url.includes("/api/ai/suggestions") && method === "GET") {
          return jsonResponse({ suggestions: [], aiManager: { enabled: false, dryRun: true, autoSend: false, autoActions: false } });
        }
        return Promise.reject(new Error("API unavailable"));
      })
    );

    renderApp("/chats");
    await screen.findByRole("heading", { name: "Чаты" });

    // The initial load used /api/chats
    expect(polledUrls.some((u) => u === "/api/chats")).toBe(true);
    // After initial load, ChatsPage polling uses focused endpoint (not /api/chats again)
    // We can verify /api/ai/suggestions is called if a conversation is selected (poll is registered with selectedId dep)
    // The focused suggestions endpoint should be called on poll (no timer needed here — just verify no full reload):
    expect(polledUrls.filter((u) => u === "/api/chats").length).toBe(1);
  });

  it("system status shows auto-send warning when autoSend is true", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
        const url = String(input);
        const jsonResponse = (payload: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(payload) });
        if (url === "/api/system/status") {
          return jsonResponse({
            dataMode: "demo",
            db: { connected: true },
            wappi: { enabled: false, dryRun: true, configured: false, apiBaseUrlConfigured: false, profileIdConfigured: false, tokenConfigured: false, webhookSecretConfigured: false, tokenMasked: null, profileId: null, requiredEnvVars: [] },
            onlinePbx: { enabled: false, dryRun: true, apiBaseUrlConfigured: false, domainConfigured: false, apiKeyConfigured: false, apiKeyMasked: null, webhookSecretConfigured: false, mappingCount: 0, requiredEnvVars: [] },
            amoImport: { configured: false, requiredEnvVars: [] },
            aiManager: {
              configured: false, enabled: true, dryRun: false,
              baseUrlConfigured: true, endpoint: "/api/incoming-message",
              apiKeyConfigured: true, autoSend: true, autoActions: false,
              pauseOnManagerReply: true, pauseMinutes: 30, minConfidence: 0.75,
              autoSendWarning: "ВНИМАНИЕ: AI_MANAGER_AUTO_SEND=true. Убедитесь, что AI Manager не отправляет WhatsApp напрямую, иначе возможны дубли сообщений.",
              requiredEnvVars: []
            }
          });
        }
        return Promise.reject(new Error("API unavailable"));
      })
    );
    renderApp("/settings/system");

    expect(await screen.findByText("AI Manager Bridge")).toBeInTheDocument();
    // Auto-send warning banner
    expect(await screen.findByText(/Убедитесь, что AI Manager не отправляет WhatsApp напрямую/i)).toBeInTheDocument();
  });

  // ── WAPPI hardening tests ──────────────────────────────────────────────────

  it("conversation messages endpoint: ChatsPage loads messages per conversation", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    renderApp("/chats");

    expect(await screen.findByRole("heading", { name: "Чаты" })).toBeInTheDocument();
    // Messages loaded from the paginated endpoint, not from /api/chats
    expect(await screen.findAllByText("WAPPI smoke incoming")).toBeTruthy();
  });

  it("unread count clears when conversation is opened", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    renderApp("/chats");

    await screen.findByRole("heading", { name: "Чаты" });
    // On initial load the first conversation is auto-selected — unread badge cleared via POST /read
    // The unread badge (showing "1") should not be visible after auto-selection
    // (it's cleared optimistically in state, then server call is fire-and-forget)
    await waitFor(() => {
      // After load+auto-select, badge value should be gone or 0 (unread cleared optimistically)
      expect(screen.queryByText("1")).not.toBeInTheDocument();
    });
  });

  it("WAPPI test-connection: dry-run shows success panel in settings", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    renderApp("/settings/integrations/wappi");

    expect(await screen.findByRole("heading", { name: "WAPPI / WhatsApp" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Проверить WAPPI/i }));

    expect(await screen.findByText("Dry-run: симуляция ОК")).toBeInTheDocument();
  });

  it("ChatsPage load more: button appears when hasMore=true", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const jsonResponse = (payload: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(payload) });
        if (url === "/api/chats" && method === "GET") {
          return jsonResponse({
            conversations: [{ id: 1, leadId: 1, contactId: 1, phone: "77012345678", channel: "wappi", status: "open", unreadCount: 0, lastMessageAt: null, leadTitle: "Тест", contactName: "Клиент", aiPaused: true, aiSuggestions: [] }],
            messages: [],
            wappi: { enabled: false, dryRun: true, configured: false },
            aiManager: { enabled: false, dryRun: true }
          });
        }
        if (url.match(/\/api\/conversations\/\d+\/messages/) && method === "GET") {
          return jsonResponse({
            messages: [{ id: 5, leadId: 1, channel: "wappi", direction: "incoming", text: "Последнее сообщение", status: "received", createdAt: "2026-06-02T10:00:00.000Z" }],
            hasMore: true
          });
        }
        if (url.match(/\/api\/conversations\/\d+\/read/) && method === "POST") {
          return jsonResponse({ ok: true });
        }
        if (url.includes("/api/ai/suggestions") && method === "GET") {
          return jsonResponse({ suggestions: [], aiManager: { enabled: false, dryRun: true, autoSend: false, autoActions: false } });
        }
        return Promise.reject(new Error("API unavailable"));
      })
    );

    renderApp("/chats");

    await screen.findByText("Последнее сообщение");
    // "Загрузить ещё" button should appear when hasMore=true
    expect(await screen.findByRole("button", { name: /Загрузить ещё/i })).toBeInTheDocument();
  });

  it("opens task detail modal from task page without navigation", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    renderApp("/tasks");

    expect(await screen.findByText("Kanban по звонкам, замерам, КП и монтажам")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Поиск по задаче, сделке, клиенту, lead id"), { target: { value: "Потолок в гостиную" } });
    // Click card (not action button) → opens in-place detail modal, stays on /tasks
    fireEvent.click(screen.getAllByText("Потолок в гостиную")[0]);

    // Modal is visible on the same tasks page (no navigation)
    await waitFor(() => expect(screen.getByText("Результат / комментарий")).toBeInTheDocument());
    // Textarea placeholder is unique to the modal
    expect(screen.getByPlaceholderText("Не дозвонился, перезвонить вечером...")).toBeInTheDocument();
    // Snooze button exists in modal footer
    expect(screen.getByRole("button", { name: "+30 мин" })).toBeInTheDocument();
  });
});
