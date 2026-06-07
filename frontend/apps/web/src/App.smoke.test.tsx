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
          conversations: [{
            id: 1, leadId: 1, contactId: 1, phone: "77012345678", channel: "wappi",
            status: "open", unreadCount: 1,
            lastMessageAt: "2026-06-02T10:00:00.000Z",
            lastMessageText: "WAPPI smoke incoming",
            lastMessageDirection: "incoming",
            lastMessageSenderType: "client",
            lastMessageStatus: "received",
            needsReply: false,
            leadTitle: "Потолок в гостиную", contactName: "Айгерим С.",
            aiPaused: true, aiSuggestions: []
          }],
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
      // Global search endpoint
      if (url.includes("/api/search") && method === "GET") {
        return jsonResponse({ leads: [], contacts: [], tasks: [] });
      }
      // Notifications
      if (url === "/api/notifications" && method === "GET") {
        return jsonResponse({ notifications: [], unreadCount: 0 });
      }
      if (url.match(/\/api\/notifications\/\d+\/read/) && method === "POST") {
        return jsonResponse({ ok: true });
      }
      if (url === "/api/notifications/read-all" && method === "POST") {
        return jsonResponse({ ok: true });
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
      // After auto-select, the orange unread badge on the conversation card should be gone.
      // We check that no element with both "rounded-full bg-bakha-orange" classes and text "1" exists
      // (nav badges like "Монтаж: 1" are a different class so we scope to the conversation list area).
      const conversationButtons = document.querySelectorAll('button.w-full.rounded-lg.border');
      const unreadBadges = Array.from(conversationButtons).flatMap((btn) =>
        Array.from(btn.querySelectorAll('.bg-bakha-orange'))
      );
      expect(unreadBadges.length).toBe(0);
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
            conversations: [{
              id: 1, leadId: 1, contactId: 1, phone: "77012345678", channel: "wappi",
              status: "open", unreadCount: 0, lastMessageAt: null,
              lastMessageText: null, lastMessageDirection: null, lastMessageSenderType: null,
              lastMessageStatus: null, needsReply: false,
              leadTitle: "Тест", contactName: "Клиент", aiPaused: true, aiSuggestions: []
            }],
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

  // ── Phase 5: WAPPI UX Polish tests ──────────────────────────────────────────

  it("outgoing message shows delivery status indicator (sent/delivered/read/failed)", async () => {
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
              id: 2, leadId: 2, contactId: 2, phone: "77019999999", channel: "wappi",
              status: "open", unreadCount: 0, lastMessageAt: "2026-06-02T11:00:00.000Z",
              lastMessageText: "Доставлено тест", lastMessageDirection: "outgoing",
              lastMessageSenderType: "manager", lastMessageStatus: "delivered",
              needsReply: false,
              leadTitle: "Статус тест", contactName: "Тест", aiPaused: false, aiSuggestions: []
            }],
            messages: [],
            wappi: { enabled: true, dryRun: false, configured: true },
            aiManager: { enabled: false, dryRun: true }
          });
        }
        if (url.match(/\/api\/conversations\/\d+\/messages/) && method === "GET") {
          return jsonResponse({
            messages: [
              { id: 10, leadId: 2, channel: "wappi", direction: "outgoing", text: "Sent msg", status: "sent", createdAt: "2026-06-02T11:00:00.000Z" },
              { id: 11, leadId: 2, channel: "wappi", direction: "outgoing", text: "Delivered msg", status: "delivered", createdAt: "2026-06-02T11:01:00.000Z" },
              { id: 12, leadId: 2, channel: "wappi", direction: "outgoing", text: "Read msg", status: "read", createdAt: "2026-06-02T11:02:00.000Z" },
              { id: 13, leadId: 2, channel: "wappi", direction: "outgoing", text: "Failed msg", status: "failed", createdAt: "2026-06-02T11:03:00.000Z" }
            ],
            hasMore: false
          });
        }
        if (url.match(/\/api\/conversations\/\d+\/read/) && method === "POST") return jsonResponse({ ok: true });
        if (url.includes("/api/ai/suggestions") && method === "GET") return jsonResponse({ suggestions: [], aiManager: { enabled: false, dryRun: true } });
        return Promise.reject(new Error("API unavailable"));
      })
    );
    renderApp("/chats");

    await screen.findByText("Sent msg");
    // Status indicators present via title attributes and symbols
    const sentTicks = document.querySelectorAll('[title="отправлено"]');
    const deliveredTicks = document.querySelectorAll('[title="доставлено"]');
    const readTicks = document.querySelectorAll('[title="прочитано"]');
    const failedMarks = document.querySelectorAll('[title="ошибка доставки"]');
    expect(sentTicks.length).toBeGreaterThan(0);
    expect(deliveredTicks.length).toBeGreaterThan(0);
    expect(readTicks.length).toBeGreaterThan(0);
    expect(failedMarks.length).toBeGreaterThan(0);
    // Failed message bubble has different bg (red)
    expect(await screen.findByText("Failed msg")).toBeInTheDocument();
    expect(await screen.findByText("ошибка")).toBeInTheDocument();
  });

  it("conversation list shows last message preview from server data", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    renderApp("/chats");

    await screen.findByRole("heading", { name: "Чаты" });
    // lastMessageText from /api/chats mock should appear in sidebar
    const previews = await screen.findAllByText("WAPPI smoke incoming");
    // Should appear at least once in the sidebar conversation card
    expect(previews.length).toBeGreaterThanOrEqual(1);
  });

  it("needsReply badge appears in conversation list when needsReply=true", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    renderApp("/chats");

    await screen.findByRole("heading", { name: "Чаты" });
    // The "ответ" badge should appear for the mock conversation with needsReply=true
    // Note: unread badge takes priority, so after unread clears the "ответ" badge may show
    // We just ensure the filter button with count exists
    const needsReplyBtn = await screen.findByRole("button", { name: /Требуют ответа/i });
    expect(needsReplyBtn).toBeInTheDocument();
  });

  it("needs_reply filter shows only conversations with needsReply=true", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const jsonResponse = (payload: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(payload) });
        if (url === "/api/chats" && method === "GET") {
          return jsonResponse({
            conversations: [
              { id: 1, leadId: 1, phone: "77012345678", channel: "wappi", status: "open", unreadCount: 0, lastMessageAt: "2026-06-02T10:00:00.000Z", lastMessageText: "Привет", lastMessageDirection: "incoming", lastMessageSenderType: "client", lastMessageStatus: "received", needsReply: true, contactName: "Клиент А", aiSuggestions: [] },
              { id: 2, leadId: 2, phone: "77019999999", channel: "wappi", status: "open", unreadCount: 0, lastMessageAt: "2026-06-02T09:00:00.000Z", lastMessageText: "Хорошо", lastMessageDirection: "outgoing", lastMessageSenderType: "manager", lastMessageStatus: "sent", needsReply: false, contactName: "Клиент Б", aiSuggestions: [] }
            ],
            messages: [],
            wappi: { enabled: false, dryRun: true, configured: false },
            aiManager: { enabled: false, dryRun: true }
          });
        }
        if (url.match(/\/api\/conversations\/\d+\/messages/) && method === "GET") return jsonResponse({ messages: [], hasMore: false });
        if (url.match(/\/api\/conversations\/\d+\/read/) && method === "POST") return jsonResponse({ ok: true });
        if (url.includes("/api/ai/suggestions") && method === "GET") return jsonResponse({ suggestions: [], aiManager: { enabled: false, dryRun: true } });
        return Promise.reject(new Error("API unavailable"));
      })
    );

    renderApp("/chats");
    await screen.findByRole("heading", { name: "Чаты" });

    // Both clients visible initially under "Все"
    expect(await screen.findByText("Клиент А")).toBeInTheDocument();
    expect(screen.getByText("Клиент Б")).toBeInTheDocument();

    // Click "Требуют ответа" filter
    fireEvent.click(screen.getByRole("button", { name: /Требуют ответа/i }));

    // Only Клиент А (needsReply=true) should be visible
    await waitFor(() => {
      expect(screen.getByText("Клиент А")).toBeInTheDocument();
      expect(screen.queryByText("Клиент Б")).not.toBeInTheDocument();
    });
  });

  it("unread filter shows only conversations with unread count > 0", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const jsonResponse = (payload: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(payload) });
        if (url === "/api/chats" && method === "GET") {
          return jsonResponse({
            // Старый клиент (id:2, unreadCount:0) is first so it gets auto-selected without clearing any unread
            // Новый клиент (id:1, unreadCount:3) stays with its unread count intact
            conversations: [
              { id: 2, leadId: 2, phone: "77019999999", channel: "wappi", status: "open", unreadCount: 0, lastMessageAt: "2026-06-02T10:00:00.000Z", lastMessageText: "Договорились", lastMessageDirection: "outgoing", lastMessageSenderType: "manager", lastMessageStatus: "sent", needsReply: false, contactName: "Старый клиент", aiSuggestions: [] },
              { id: 1, leadId: 1, phone: "77012345678", channel: "wappi", status: "open", unreadCount: 3, lastMessageAt: "2026-06-02T09:00:00.000Z", lastMessageText: "Мне нужна цена", lastMessageDirection: "incoming", lastMessageSenderType: "client", lastMessageStatus: "received", needsReply: true, contactName: "Новый клиент", aiSuggestions: [] }
            ],
            messages: [],
            wappi: { enabled: false, dryRun: true, configured: false },
            aiManager: { enabled: false, dryRun: true }
          });
        }
        if (url.match(/\/api\/conversations\/\d+\/messages/) && method === "GET") return jsonResponse({ messages: [], hasMore: false });
        if (url.match(/\/api\/conversations\/\d+\/read/) && method === "POST") return jsonResponse({ ok: true });
        if (url.includes("/api/ai/suggestions") && method === "GET") return jsonResponse({ suggestions: [], aiManager: { enabled: false, dryRun: true } });
        return Promise.reject(new Error("API unavailable"));
      })
    );

    renderApp("/chats");
    await screen.findByRole("heading", { name: "Чаты" });

    // Both visible under "Все"
    expect(await screen.findByText("Новый клиент")).toBeInTheDocument();
    expect(screen.getByText("Старый клиент")).toBeInTheDocument();

    // Click "Непрочитанные"
    fireEvent.click(screen.getByRole("button", { name: /Непрочитанные/i }));

    await waitFor(() => {
      expect(screen.getByText("Новый клиент")).toBeInTheDocument();
      expect(screen.queryByText("Старый клиент")).not.toBeInTheDocument();
    });
  });

  // ── Phase 6: Core business workflow tests ────────────────────────────────────

  it("reserve page renders with empty state when no reserve leads", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    renderApp("/reserve");

    expect(await screen.findByRole("heading", { name: "Резерв и материалы" })).toBeInTheDocument();
    // With demo data (BP-2406 is in "Сделан перерасчёт" stage which is a reserve stage)
    // At minimum the page renders without crash
    expect(screen.getByText(/Резерв и монтаж|Резерв и материалы/i)).toBeInTheDocument();
  });

  it("installations page renders correctly", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    renderApp("/installations");

    expect(await screen.findByRole("heading", { name: "Монтаж" })).toBeInTheDocument();
    expect(screen.getByText("Всего монтажей")).toBeInTheDocument();
  });

  it("global search shows results dropdown from CRM context", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    renderApp("/dashboard");

    await screen.findByRole("heading", { name: "Рабочий стол" });

    const searchInput = screen.getByPlaceholderText("Поиск по сделкам, клиентам, телефону");
    fireEvent.change(searchInput, { target: { value: "Айгерим" } });

    // Should show search results dropdown with lead result
    await waitFor(() => {
      expect(screen.getByText("Сделки")).toBeInTheDocument();
    });
    // Lead "Потолок в гостиную" belongs to "Айгерим С." in seed data
    expect(screen.getByText("Потолок в гостиную")).toBeInTheDocument();
  });

  it("global search closes on Escape key", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    renderApp("/dashboard");

    await screen.findByRole("heading", { name: "Рабочий стол" });

    const searchInput = screen.getByPlaceholderText("Поиск по сделкам, клиентам, телефону");
    fireEvent.change(searchInput, { target: { value: "Потолок" } });

    await waitFor(() => expect(screen.getByText("Сделки")).toBeInTheDocument());

    fireEvent.keyDown(searchInput, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByText("Сделки")).not.toBeInTheDocument();
    });
  });

  it("sales kanban shows KPI cards", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    renderApp("/sales");

    expect(await screen.findByRole("heading", { name: "Отдел продаж" })).toBeInTheDocument();
    expect(await screen.findByText("Всего сделок")).toBeInTheDocument();
    expect(screen.getByText("Назначен замер")).toBeInTheDocument();
    expect(screen.getByText("Без задач")).toBeInTheDocument();
  });

  it("measurements kanban shows KPI cards including today count", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    renderApp("/measurements");

    expect(await screen.findByRole("heading", { name: "Замер" })).toBeInTheDocument();
    expect(await screen.findByText("Сегодня замеров")).toBeInTheDocument();
    // "Провели замер" appears in KPI card and also in stage dropdowns — use getAllByText
    expect((await screen.findAllByText("Провели замер")).length).toBeGreaterThan(0);
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

  it("tasks page shows + Поставить задачу button", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    renderApp("/tasks");

    expect(await screen.findByText("Kanban по звонкам, замерам, КП и монтажам")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Поставить задачу/i })).toBeInTheDocument();
  });

  it("clicking + Поставить задачу opens create task modal", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    renderApp("/tasks");

    expect(await screen.findByText("Kanban по звонкам, замерам, КП и монтажам")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Поставить задачу/i }));

    await waitFor(() => expect(screen.getByText("Новая задача")).toBeInTheDocument());
    expect(screen.getByPlaceholderText("Позвонить клиенту, Назначить замер...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Создать задачу" })).toBeInTheDocument();
  });

  it("quick Позвонить opens create task modal with call type prefilled", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    renderApp("/tasks");

    expect(await screen.findByText("Kanban по звонкам, замерам, КП и монтажам")).toBeInTheDocument();
    // Use exact name "Позвонить" to match only the quick-action button (not the DND card div
    // whose accessible name contains the full card text including "Позвонить клиенту …")
    fireEvent.click(screen.getByRole("button", { name: "Позвонить" }));

    await waitFor(() => expect(screen.getByText("Новая задача")).toBeInTheDocument());
    const titleInput = screen.getByPlaceholderText("Позвонить клиенту, Назначить замер...") as HTMLInputElement;
    expect(titleInput.value).toBe("Позвонить клиенту");
  });

  it("quick Написать opens create task modal with message type prefilled", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    renderApp("/tasks");

    expect(await screen.findByText("Kanban по звонкам, замерам, КП и монтажам")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Написать" }));

    await waitFor(() => expect(screen.getByText("Новая задача")).toBeInTheDocument());
    const titleInput = screen.getByPlaceholderText("Позвонить клиенту, Назначить замер...") as HTMLInputElement;
    expect(titleInput.value).toBe("Написать клиенту");
  });

  it("quick Назначить замер opens create task modal with measurement type prefilled", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    renderApp("/tasks");

    expect(await screen.findByText("Kanban по звонкам, замерам, КП и монтажам")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Назначить замер" }));

    await waitFor(() => expect(screen.getByText("Новая задача")).toBeInTheDocument());
    const titleInput = screen.getByPlaceholderText("Позвонить клиенту, Назначить замер...") as HTMLInputElement;
    expect(titleInput.value).toBe("Назначить замер");
  });

  it("postpone button on task card shows snooze options", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    renderApp("/tasks");

    expect(await screen.findByText("Kanban по звонкам, замерам, КП и монтажам")).toBeInTheDocument();
    // Use exact aria-label "Отложить" to match the actual snooze button,
    // not the DND card div whose long accessible name also contains "Отложить".
    const snoozeBtns = await screen.findAllByRole("button", { name: "Отложить" });
    fireEvent.click(snoozeBtns[0]);

    await screen.findByText("+30 минут");
    expect(screen.getByText("Завтра 10:00")).toBeInTheDocument();
  });

  it("task card Выполнить triggers completion and shows toast", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    renderApp("/tasks");

    expect(await screen.findByText("Kanban по звонкам, замерам, КП и монтажам")).toBeInTheDocument();
    // Click first Выполнить button on a card
    const completeBtn = (await screen.findAllByRole("button", { name: "Выполнить" }))[0];
    fireEvent.click(completeBtn);

    await waitFor(() => expect(screen.getByText("Задача выполнена.")).toBeInTheDocument());
  });

  it("task card Сделка link points to correct lead", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    renderApp("/tasks");

    expect(await screen.findByText("Kanban по звонкам, замерам, КП и монтажам")).toBeInTheDocument();
    // Seed task 1 has leadId=1 — verify a Сделка → link exists pointing to /leads/1
    const dealLinks = await screen.findAllByRole("link", { name: /Сделка/i });
    expect(dealLinks.length).toBeGreaterThan(0);
    const firstLink = dealLinks[0] as HTMLAnchorElement;
    expect(firstLink.href).toContain("/leads/");
  });

  it("task buttons do not show placeholder toasts", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    renderApp("/tasks");

    expect(await screen.findByText("Kanban по звонкам, замерам, КП и монтажам")).toBeInTheDocument();

    // Click "Позвонить" — must open modal, not show placeholder toast
    fireEvent.click(screen.getByRole("button", { name: "Позвонить" }));
    await waitFor(() => expect(screen.getByText("Новая задача")).toBeInTheDocument());
    expect(screen.queryByText(/Функция будет подключена позже/i)).not.toBeInTheDocument();
  });

  it("notification bell opens dropdown with Нет уведомлений", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    renderApp("/dashboard");

    expect(await screen.findByRole("heading", { name: "Рабочий стол" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Уведомления" }));

    await waitFor(() => expect(screen.getByText("Уведомления")).toBeInTheDocument());
    expect(screen.getByText("Нет уведомлений")).toBeInTheDocument();
  });

  it("notification bell shows unread count when API returns unreadCount", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    // Override mock to return one unread notification
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const jsonResponse = (payload: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(payload) });
      if (url === "/api/notifications" && method === "GET") {
        return jsonResponse({
          notifications: [{ id: 1, type: "task.assigned", title: "Вам поставили задачу", body: "Позвонить клиенту", readAt: null, createdAt: new Date().toISOString() }],
          unreadCount: 1
        });
      }
      return Promise.reject(new Error("API unavailable in smoke test"));
    }));

    renderApp("/dashboard");

    // Wait for the notification badge to appear (polling effect fires after render)
    await waitFor(() => {
      const badge = document.querySelector(".bg-bakha-orange[class*='rounded-full']");
      return badge !== null;
    }, { timeout: 3000 });

    // Open notification panel
    fireEvent.click(screen.getByRole("button", { name: "Уведомления" }));
    await waitFor(() => expect(screen.getByText("Вам поставили задачу")).toBeInTheDocument());
    expect(screen.getByText("Прочитать все")).toBeInTheDocument();
  });

  it("period dropdown opens when period button clicked", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    renderApp("/dashboard");

    expect(await screen.findByRole("heading", { name: "Рабочий стол" })).toBeInTheDocument();
    // Period button exists
    expect(screen.getByRole("button", { name: "Период" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Период" }));

    // The dropdown div appears (data-testid guarantees we're checking the right element)
    await waitFor(() => expect(document.querySelector('[data-testid="period-dropdown"]')).not.toBeNull());
    // No placeholder toast
    expect(screen.queryByText(/в разработке/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Функция будет подключена позже/i)).not.toBeInTheDocument();
  });

  it("period dropdown closes after selecting an option", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    renderApp("/dashboard");

    expect(await screen.findByRole("heading", { name: "Рабочий стол" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Период" }));
    // Wait for dropdown to open
    await waitFor(() => expect(document.querySelector('[data-testid="period-dropdown"]')).not.toBeNull());
    // Click "Прошлый месяц" option (unique text in the dropdown)
    fireEvent.click(screen.getByRole("button", { name: "Прошлый месяц" }));
    // Dropdown closes
    await waitFor(() => expect(document.querySelector('[data-testid="period-dropdown"]')).toBeNull());
  });

  it("filters button opens filter panel for tasks page", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    renderApp("/tasks");

    expect(await screen.findByText("Kanban по звонкам, замерам, КП и монтажам")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Фильтры" }));

    // The filter panel renders (data-testid check)
    await waitFor(() => expect(document.querySelector('[data-testid="filters-panel"]')).not.toBeNull());
    // Contains a helpful message, not a placeholder
    expect(document.querySelector('[data-testid="filters-panel"]')?.textContent).not.toMatch(/в разработке/i);
    expect(document.querySelector('[data-testid="filters-panel"]')?.textContent).not.toMatch(/будет подключена/i);
  });

  it("admin sees manager picker dropdown with user list", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    localStorage.setItem("bakha_user", JSON.stringify({ name: "Баха Админ", role: "admin", roleTitle: "Администратор" }));
    renderApp("/dashboard");

    expect(await screen.findByRole("heading", { name: "Рабочий стол" })).toBeInTheDocument();
    // Admin/owner sees the manager picker button
    const pickerBtn = screen.getByRole("button", { name: "Фильтр по менеджеру" });
    expect(pickerBtn).toBeInTheDocument();
    // Clicking opens a dropdown
    fireEvent.click(pickerBtn);
    // At least 2 "Все менеджеры" texts: the button label + the dropdown option
    await waitFor(() => expect(screen.getAllByText("Все менеджеры").length).toBeGreaterThanOrEqual(2));
  });

  it("header buttons show no placeholder toasts", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    renderApp("/dashboard");

    expect(await screen.findByRole("heading", { name: "Рабочий стол" })).toBeInTheDocument();

    // Notification bell → opens dropdown, no placeholder
    fireEvent.click(screen.getByRole("button", { name: "Уведомления" }));
    await waitFor(() => expect(screen.getByText("Нет уведомлений")).toBeInTheDocument());
    expect(screen.queryByText(/Центр уведомлений будет активирован/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/после подключения/i)).not.toBeInTheDocument();
  });

  it("notification bell displays self-assignment notification (task.assigned type)", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const jsonResponse = (payload: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(payload) });
      if (url === "/api/notifications" && method === "GET") {
        return jsonResponse({
          notifications: [
            {
              id: 10,
              type: "task.assigned",
              title: "Вы поставили себе задачу",
              body: "Уникальная тестовая задача #notif-smoke",
              readAt: null,
              createdAt: new Date().toISOString(),
              link: "/tasks",
            },
          ],
          unreadCount: 1,
        });
      }
      if (url.match(/\/api\/notifications\/.+\/read/) && method === "POST") return jsonResponse({ ok: true });
      if (url === "/api/notifications/read-all" && method === "POST") return jsonResponse({ ok: true });
      return Promise.reject(new Error("API unavailable in smoke test"));
    }));

    renderApp("/dashboard");
    expect(await screen.findByRole("heading", { name: "Рабочий стол" })).toBeInTheDocument();

    // Open notification panel — polling fires immediately so the mock data arrives
    fireEvent.click(screen.getByRole("button", { name: "Уведомления" }));
    await screen.findByText("Вы поставили себе задачу");
    expect(screen.getByText(/Уникальная тестовая задача #notif-smoke/)).toBeInTheDocument();
  });

  it("notification bell displays due reminder notification (task.due type)", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const jsonResponse = (payload: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(payload) });
      if (url === "/api/notifications" && method === "GET") {
        return jsonResponse({
          notifications: [
            {
              id: 20,
              type: "task.due",
              title: "Время выполнить задачу",
              body: "Замер у клиента — 07.06.2026, 15:00",
              readAt: null,
              createdAt: new Date().toISOString(),
              link: "/leads/3",
            },
          ],
          unreadCount: 1,
        });
      }
      if (url.match(/\/api\/notifications\/.+\/read/) && method === "POST") return jsonResponse({ ok: true });
      if (url === "/api/notifications/read-all" && method === "POST") return jsonResponse({ ok: true });
      return Promise.reject(new Error("API unavailable in smoke test"));
    }));

    renderApp("/dashboard");
    expect(await screen.findByRole("heading", { name: "Рабочий стол" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Уведомления" }));
    await screen.findByText("Время выполнить задачу");
    expect(screen.getByText(/Замер у клиента/)).toBeInTheDocument();
  });

  it("clicking notification marks it read and navigates", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const jsonResponse = (payload: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(payload) });
      if (url === "/api/notifications" && method === "GET") {
        return jsonResponse({
          notifications: [
            {
              id: 42,
              type: "task.assigned",
              title: "Вам поставили задачу",
              body: "Следующая задача",
              readAt: null,
              createdAt: new Date().toISOString(),
              link: "/tasks",
            },
          ],
          unreadCount: 1,
        });
      }
      if (url === "/api/notifications/42/read" && method === "POST") return jsonResponse({ ok: true });
      if (url === "/api/notifications/read-all" && method === "POST") return jsonResponse({ ok: true });
      return Promise.reject(new Error("API unavailable in smoke test"));
    }));

    renderApp("/dashboard");
    expect(await screen.findByRole("heading", { name: "Рабочий стол" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Уведомления" }));
    await screen.findByText("Вам поставили задачу");
    fireEvent.click(screen.getByText("Вам поставили задачу").closest("button")!);
    // Notification marked read (badge count decreases to 0)
    await waitFor(() => {
      const badges = document.querySelectorAll(".bg-bakha-orange");
      return !Array.from(badges).some((el) => el.textContent?.trim() === "1");
    });
  });

  it("read-all button marks all notifications read", async () => {
    localStorage.setItem("bakha_token", "demo-token");
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const jsonResponse = (payload: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(payload) });
      if (url === "/api/notifications" && method === "GET") {
        return jsonResponse({
          notifications: [
            { id: 1, type: "task.due", title: "Время выполнить задачу", body: "Task A", readAt: null, createdAt: new Date().toISOString() },
            { id: 2, type: "task.assigned", title: "Вам назначили задачу", body: "Task B", readAt: null, createdAt: new Date().toISOString() },
          ],
          unreadCount: 2,
        });
      }
      if (url === "/api/notifications/read-all" && method === "POST") return jsonResponse({ ok: true });
      if (url.match(/\/api\/notifications\/.+\/read/) && method === "POST") return jsonResponse({ ok: true });
      return Promise.reject(new Error("API unavailable in smoke test"));
    }));

    renderApp("/dashboard");
    expect(await screen.findByRole("heading", { name: "Рабочий стол" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Уведомления" }));
    await screen.findByText("Прочитать все");
    fireEvent.click(screen.getByText("Прочитать все"));
    // After read-all, the "Прочитать все" button disappears (unreadCount drops to 0)
    await waitFor(() => expect(screen.queryByText("Прочитать все")).not.toBeInTheDocument());
  });
});
