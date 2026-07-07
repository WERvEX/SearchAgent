# Phase 6 — React Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the local React web app for SearchAgent: conversation-driven research, plan confirmation, progress display, report preview/export, history browsing, and settings for LLM/MCP/search preferences.

**Architecture:** The frontend is a pure presentation and interaction layer. It talks to the FastAPI backend through REST endpoints and `/events` SSE, keeps only UI/session state in the browser, and derives persisted history from backend responses. The first implementation uses one cohesive app shell with small focused components instead of adding routing complexity before there are separate deployable screens.

**Tech Stack:** React 18, Vite 5, TypeScript 5, Tailwind CSS 3, lucide-react icons, markdown-to-jsx for report preview, Vitest, React Testing Library, jsdom.

## Global Constraints

- Frontend stack from spec: React with Vite and Tailwind.
- Realtime link from spec: SSE for streaming/progress/source/interrupt events; REST for user actions and CRUD.
- Frontend responsibility from spec: pure display and interaction through REST and SSE; no business logic.
- Local single-user app: no login or auth UI.
- Secret safety: API keys are submitted only to backend settings endpoints and never logged or persisted in frontend storage.
- UI must be the usable app on first screen, not a marketing landing page.
- Operational tool UI: restrained, dense, predictable navigation; use lucide-react icons for icon buttons; do not nest UI cards inside cards.
- Backend source of truth: use the Phase 5 API as implemented under `backend/app/api/` and schemas under `backend/app/schemas/`.

---

## File Structure

- Create `frontend/package.json`: npm scripts and exact frontend dependencies.
- Create `frontend/index.html`: Vite HTML entry.
- Create `frontend/tsconfig.json`, `frontend/tsconfig.node.json`, `frontend/vite.config.ts`: TypeScript and Vite configuration, including `/api` and `/events` dev proxy to FastAPI.
- Create `frontend/postcss.config.js`, `frontend/tailwind.config.ts`: Tailwind pipeline.
- Create `frontend/src/main.tsx`: React entry.
- Create `frontend/src/App.tsx`: app shell composition and top-level state.
- Create `frontend/src/styles.css`: Tailwind layers and base visual system.
- Create `frontend/src/api/types.ts`: TypeScript types matching backend schemas and JSON shapes.
- Create `frontend/src/api/client.ts`: typed REST client.
- Create `frontend/src/api/events.ts`: typed SSE subscription helper.
- Create `frontend/src/hooks/useEventStream.ts`: React hook for event history and connection state.
- Create `frontend/src/components/AppShell.tsx`: three-pane layout and top toolbar.
- Create `frontend/src/components/ConversationPanel.tsx`: conversation list, create, detail load.
- Create `frontend/src/components/ResearchWorkspace.tsx`: chat input, current state summary, start/resume controls.
- Create `frontend/src/components/PlanPanel.tsx`: plan option selection, approve, feedback/replan decision payload.
- Create `frontend/src/components/ProgressStream.tsx`: SSE/event timeline and current execution status.
- Create `frontend/src/components/ReportPanel.tsx`: markdown preview and `.md`/`.pdf` export actions.
- Create `frontend/src/components/SettingsPanel.tsx`: LLM profile form/list/test, search preference, MCP server form/list.
- Create `frontend/src/test/setup.ts`: Testing Library setup.
- Create tests beside implementation under `frontend/src/**/*.test.tsx` and `frontend/src/api/*.test.ts`.

---

## Task 1: Frontend Scaffold and App Shell

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/index.html`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tsconfig.node.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/postcss.config.js`
- Create: `frontend/tailwind.config.ts`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/styles.css`
- Create: `frontend/src/test/setup.ts`
- Create: `frontend/src/components/AppShell.tsx`
- Test: `frontend/src/components/AppShell.test.tsx`

**Interfaces:**
- Produces: `AppShell(props: AppShellProps): JSX.Element`
- Produces: `AppShellProps = { left: ReactNode; main: ReactNode; right: ReactNode; activePanel: "research" | "settings"; onPanelChange(panel): void }`

- [ ] **Step 1: Write the failing AppShell render test**

```tsx
// frontend/src/components/AppShell.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

describe("AppShell", () => {
  it("renders the application work surface and switches panels", async () => {
    const onPanelChange = vi.fn();

    render(
      <AppShell
        activePanel="research"
        onPanelChange={onPanelChange}
        left={<div>History list</div>}
        main={<div>Research workspace</div>}
        right={<div>Event stream</div>}
      />,
    );

    expect(screen.getByRole("banner")).toHaveTextContent("SearchAgent");
    expect(screen.getByText("History list")).toBeInTheDocument();
    expect(screen.getByText("Research workspace")).toBeInTheDocument();
    expect(screen.getByText("Event stream")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /settings/i }));
    expect(onPanelChange).toHaveBeenCalledWith("settings");
  });
});
```

- [ ] **Step 2: Add frontend package and test configuration**

```json
{
  "name": "searchagent-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc -b && vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "lucide-react": "^0.468.0",
    "markdown-to-jsx": "^7.7.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.17",
    "@types/react-dom": "^18.3.5",
    "autoprefixer": "^10.4.20",
    "jsdom": "^25.0.1",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.7.2",
    "vite": "^5.4.11",
    "vitest": "^2.1.8"
  }
}
```

```ts
// frontend/vite.config.ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/events": "http://127.0.0.1:8000",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    globals: true,
  },
});
```

```ts
// frontend/src/test/setup.ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Run test to verify it fails before implementation**

Run: `cd frontend; npm install; npm test -- src/components/AppShell.test.tsx`

Expected: FAIL because `src/components/AppShell.tsx` does not exist.

- [ ] **Step 4: Implement shell, entry, and base styles**

```tsx
// frontend/src/components/AppShell.tsx
import type { ReactNode } from "react";
import { History, Settings, Telescope } from "lucide-react";

export type AppPanel = "research" | "settings";

export type AppShellProps = {
  left: ReactNode;
  main: ReactNode;
  right: ReactNode;
  activePanel: AppPanel;
  onPanelChange: (panel: AppPanel) => void;
};

export function AppShell({ left, main, right, activePanel, onPanelChange }: AppShellProps) {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950">
      <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-4" role="banner">
        <div className="flex items-center gap-2 font-semibold">
          <Telescope className="h-5 w-5 text-teal-700" aria-hidden="true" />
          <span>SearchAgent</span>
        </div>
        <nav className="flex items-center gap-1" aria-label="Primary">
          <button className={activePanel === "research" ? "nav-button-active" : "nav-button"} onClick={() => onPanelChange("research")}>
            <History className="h-4 w-4" aria-hidden="true" />
            <span>Research</span>
          </button>
          <button className={activePanel === "settings" ? "nav-button-active" : "nav-button"} onClick={() => onPanelChange("settings")}>
            <Settings className="h-4 w-4" aria-hidden="true" />
            <span>Settings</span>
          </button>
        </nav>
      </header>
      <div className="grid min-h-[calc(100vh-3.5rem)] grid-cols-[280px_minmax(0,1fr)_340px]">
        <aside className="border-r border-zinc-200 bg-white">{left}</aside>
        <main className="min-w-0 bg-zinc-50">{main}</main>
        <aside className="border-l border-zinc-200 bg-white">{right}</aside>
      </div>
    </div>
  );
}
```

```css
/* frontend/src/styles.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    margin: 0;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
}

@layer components {
  .nav-button {
    @apply inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950;
  }

  .nav-button-active {
    @apply inline-flex h-9 items-center gap-2 rounded-md bg-zinc-900 px-3 text-sm text-white;
  }
}
```

```tsx
// frontend/src/App.tsx
import { useState } from "react";
import { AppPanel, AppShell } from "./components/AppShell";

export default function App() {
  const [activePanel, setActivePanel] = useState<AppPanel>("research");
  return (
    <AppShell
      activePanel={activePanel}
      onPanelChange={setActivePanel}
      left={<div className="p-4 text-sm">No conversations yet</div>}
      main={<div className="p-6 text-sm">{activePanel === "settings" ? "Settings" : "Research workspace"}</div>}
      right={<div className="p-4 text-sm">Event stream</div>}
    />
  );
}
```

```tsx
// frontend/src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 5: Run verification**

Run: `cd frontend; npm test -- src/components/AppShell.test.tsx; npm run build`

Expected: both commands PASS.

- [ ] **Step 6: Commit**

```powershell
git add frontend
git commit -m "feat(frontend): add React app shell"
```

---

## Task 2: Typed API Client and SSE Hook

**Files:**
- Create: `frontend/src/api/types.ts`
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/api/events.ts`
- Create: `frontend/src/hooks/useEventStream.ts`
- Test: `frontend/src/api/client.test.ts`
- Test: `frontend/src/hooks/useEventStream.test.tsx`

**Interfaces:**
- Consumes: REST endpoints `/conversations`, `/research/start`, `/research/{thread_id}/resume`, `/settings/*`, `/mcp/servers`, `/reports/*`.
- Produces: `api.createConversation(title): Promise<ConversationRead>`
- Produces: `api.startResearch(payload): Promise<ResearchRunResponse>`
- Produces: `subscribeToEvents(options): () => void`
- Produces: `useEventStream(limit?: number): { status: "connecting" | "open" | "closed" | "error"; events: ServerEvent[] }`

- [ ] **Step 1: Write failing API client tests**

```ts
// frontend/src/api/client.test.ts
import { describe, expect, it, vi } from "vitest";
import { api } from "./client";

describe("api client", () => {
  it("creates conversations through the backend proxy", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 1, title: "Demo", status: "new", created_at: "2026-07-07T00:00:00", updated_at: "2026-07-07T00:00:00" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.createConversation("Demo");

    expect(fetchMock).toHaveBeenCalledWith("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Demo" }),
    });
    expect(result.title).toBe("Demo");
  });

  it("raises the backend detail when a request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ detail: "Conversation not found" }),
    }));

    await expect(api.getConversation(99)).rejects.toThrow("Conversation not found");
  });
});
```

- [ ] **Step 2: Implement backend-aligned types and REST client**

```ts
// frontend/src/api/types.ts
export type ConversationRead = {
  id: number;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type ConversationDetail = ConversationRead & {
  messages: Array<{ id: number; role: string; content: string; meta: Record<string, unknown> | null }>;
  projects: Array<{ id: number; topic: string; objective: string | null; status: string; created_at: string }>;
};

export type ResearchRunResponse = {
  thread_id: string;
  state: Record<string, unknown>;
  interrupted: boolean;
  interrupt_payload: Record<string, unknown> | null;
};

export type LLMProfile = {
  id: number;
  name: string;
  provider: string;
  base_url: string | null;
  model: string;
  api_key?: string | null;
  api_key_masked?: string | null;
  params: Record<string, unknown> | null;
  is_default: boolean;
};

export type MCPServer = {
  id: number;
  name: string;
  transport: string;
  command: string | null;
  args: string[] | null;
  env: Record<string, string> | null;
  url: string | null;
  enabled: boolean;
};

export type ReportRead = {
  id: number;
  project_id: number;
  version: number;
  format: string;
  content_md: string;
  file_path: string | null;
  created_at: string;
};

export type ServerEvent = {
  id?: string;
  event?: string;
  data: Record<string, unknown>;
};
```

```ts
// frontend/src/api/client.ts
import type { ConversationDetail, ConversationRead, LLMProfile, MCPServer, ReportRead, ResearchRunResponse } from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, init);
  if (!response.ok) {
    let message = `Request failed with ${response.status}`;
    try {
      const body = await response.json();
      message = typeof body.detail === "string" ? body.detail : message;
    } catch {
      message = `Request failed with ${response.status}`;
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export const api = {
  createConversation: (title: string) => request<ConversationRead>("/conversations", json("POST", { title })),
  listConversations: () => request<ConversationRead[]>("/conversations"),
  getConversation: (id: number) => request<ConversationDetail>(`/conversations/${id}`),
  startResearch: (payload: { conversation_id: number; profile_id: number; user_message: string }) =>
    request<ResearchRunResponse>("/research/start", json("POST", payload)),
  resumeResearch: (threadId: string, payload: { profile_id?: number; decision: Record<string, unknown> }) =>
    request<ResearchRunResponse>(`/research/${encodeURIComponent(threadId)}/resume`, json("POST", payload)),
  listLLMProfiles: () => request<LLMProfile[]>("/settings/llm-profiles"),
  createLLMProfile: (payload: Omit<LLMProfile, "id">) => request<LLMProfile>("/settings/llm-profiles", json("POST", payload)),
  testLLMProfile: (id: number) => request<{ ok: boolean; error: string | null }>(`/settings/llm-profiles/${id}/test`, { method: "POST" }),
  setPreference: (key: string, value: unknown) => request<{ key: string; value: unknown }>(`/settings/preferences/${key}`, json("PUT", { value })),
  getPreference: (key: string) => request<{ key: string; value: unknown }>(`/settings/preferences/${key}`),
  listMCPServers: () => request<MCPServer[]>("/mcp/servers"),
  createMCPServer: (payload: Omit<MCPServer, "id">) => request<MCPServer>("/mcp/servers", json("POST", payload)),
  getReport: (id: number) => request<ReportRead>(`/reports/${id}`),
  exportPdf: (id: number) => request<{ format: string; file_path: string }>(`/reports/${id}/export.pdf`, { method: "POST" }),
  markdownDownloadUrl: (id: number) => `/api/reports/${id}/download.md`,
};
```

- [ ] **Step 3: Implement SSE helper and hook**

```ts
// frontend/src/api/events.ts
import type { ServerEvent } from "./types";

export function subscribeToEvents(options: {
  limit?: number;
  onOpen?: () => void;
  onEvent: (event: ServerEvent) => void;
  onError?: () => void;
}): () => void {
  const query = options.limit === undefined ? "" : `?limit=${options.limit}`;
  const source = new EventSource(`/events${query}`);
  source.onopen = () => options.onOpen?.();
  source.onerror = () => options.onError?.();
  source.onmessage = (message) => {
    const data = JSON.parse(message.data) as Record<string, unknown>;
    options.onEvent({ id: message.lastEventId || undefined, event: message.type, data });
  };
  return () => source.close();
}
```

```tsx
// frontend/src/hooks/useEventStream.ts
import { useEffect, useState } from "react";
import { subscribeToEvents } from "../api/events";
import type { ServerEvent } from "../api/types";

export function useEventStream(limit = 50) {
  const [status, setStatus] = useState<"connecting" | "open" | "closed" | "error">("connecting");
  const [events, setEvents] = useState<ServerEvent[]>([]);

  useEffect(() => {
    setStatus("connecting");
    const unsubscribe = subscribeToEvents({
      limit,
      onOpen: () => setStatus("open"),
      onError: () => setStatus("error"),
      onEvent: (event) => setEvents((current) => [event, ...current].slice(0, limit)),
    });
    return () => {
      unsubscribe();
      setStatus("closed");
    };
  }, [limit]);

  return { status, events };
}
```

- [ ] **Step 4: Run verification**

Run: `cd frontend; npm test -- src/api/client.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/api frontend/src/hooks
git commit -m "feat(frontend): add backend API and event clients"
```

---

## Task 3: Conversation and Research Workflow UI

**Files:**
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/components/ConversationPanel.tsx`
- Create: `frontend/src/components/ResearchWorkspace.tsx`
- Create: `frontend/src/components/PlanPanel.tsx`
- Test: `frontend/src/components/ConversationPanel.test.tsx`
- Test: `frontend/src/components/ResearchWorkspace.test.tsx`
- Test: `frontend/src/components/PlanPanel.test.tsx`

**Interfaces:**
- Consumes: `api.createConversation`, `api.listConversations`, `api.getConversation`, `api.startResearch`, `api.resumeResearch`.
- Produces: `ConversationPanel`, `ResearchWorkspace`, and `PlanPanel` props-driven components.
- Produces decision payloads for resume: `{ approved: true, chosen_option: string }` and `{ approved: false, feedback: string }`.

- [ ] **Step 1: Write failing PlanPanel tests**

```tsx
// frontend/src/components/PlanPanel.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PlanPanel } from "./PlanPanel";

describe("PlanPanel", () => {
  it("submits an approval decision with the selected option", async () => {
    const onApprove = vi.fn();
    render(
      <PlanPanel
        interrupted
        plan={{ summary: "Compare search APIs", options: [{ id: "A", title: "Pricing focus" }, { id: "B", title: "Quality focus" }] }}
        onApprove={onApprove}
        onReplan={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByLabelText("Quality focus"));
    await userEvent.click(screen.getByRole("button", { name: /approve plan/i }));

    expect(onApprove).toHaveBeenCalledWith({ approved: true, chosen_option: "B" });
  });
});
```

- [ ] **Step 2: Implement PlanPanel**

```tsx
// frontend/src/components/PlanPanel.tsx
import { useState } from "react";
import { Check, RefreshCcw } from "lucide-react";

export type PlanOption = { id: string; title: string; description?: string };
export type ResearchPlan = { summary?: string; options?: PlanOption[] };

export function PlanPanel({
  interrupted,
  plan,
  onApprove,
  onReplan,
}: {
  interrupted: boolean;
  plan: ResearchPlan | null;
  onApprove: (decision: { approved: true; chosen_option: string }) => void;
  onReplan: (decision: { approved: false; feedback: string }) => void;
}) {
  const options = plan?.options ?? [];
  const [chosen, setChosen] = useState(options[0]?.id ?? "A");
  const [feedback, setFeedback] = useState("");

  return (
    <section className="border-b border-zinc-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-950">Plan confirmation</h2>
        <span className="text-xs text-zinc-500">{interrupted ? "Waiting for decision" : "No pending decision"}</span>
      </div>
      <p className="mb-3 text-sm text-zinc-700">{plan?.summary ?? "Start a research request to generate a plan."}</p>
      <div className="space-y-2">
        {options.map((option) => (
          <label key={option.id} className="flex cursor-pointer items-start gap-2 rounded-md border border-zinc-200 p-3 text-sm">
            <input type="radio" name="plan-option" checked={chosen === option.id} onChange={() => setChosen(option.id)} />
            <span>
              <span className="block font-medium">{option.title}</span>
              {option.description ? <span className="block text-zinc-500">{option.description}</span> : null}
            </span>
          </label>
        ))}
      </div>
      <textarea className="mt-3 h-20 w-full rounded-md border border-zinc-300 p-2 text-sm" value={feedback} onChange={(event) => setFeedback(event.target.value)} aria-label="Replan feedback" />
      <div className="mt-3 flex gap-2">
        <button className="nav-button-active" disabled={!interrupted || options.length === 0} onClick={() => onApprove({ approved: true, chosen_option: chosen })}>
          <Check className="h-4 w-4" aria-hidden="true" />
          Approve plan
        </button>
        <button className="nav-button" disabled={!interrupted} onClick={() => onReplan({ approved: false, feedback })}>
          <RefreshCcw className="h-4 w-4" aria-hidden="true" />
          Replan
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Implement ConversationPanel and ResearchWorkspace**

```tsx
// frontend/src/components/ConversationPanel.tsx
import type { ConversationRead } from "../api/types";

export function ConversationPanel({
  conversations,
  activeId,
  onSelect,
  onCreate,
}: {
  conversations: ConversationRead[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onCreate: () => void;
}) {
  return (
    <section className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-200 p-4">
        <h2 className="text-sm font-semibold">History</h2>
        <button className="nav-button" onClick={onCreate}>New</button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {conversations.map((conversation) => (
          <button key={conversation.id} className={conversation.id === activeId ? "w-full rounded-md bg-zinc-900 p-3 text-left text-sm text-white" : "w-full rounded-md p-3 text-left text-sm hover:bg-zinc-100"} onClick={() => onSelect(conversation.id)}>
            <span className="block truncate font-medium">{conversation.title}</span>
            <span className="text-xs opacity-70">{conversation.status}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
```

```tsx
// frontend/src/components/ResearchWorkspace.tsx
import { useState } from "react";
import { Send } from "lucide-react";
import type { ConversationDetail, ResearchRunResponse } from "../api/types";

export function ResearchWorkspace({
  conversation,
  profileId,
  currentRun,
  onStart,
}: {
  conversation: ConversationDetail | null;
  profileId: number | null;
  currentRun: ResearchRunResponse | null;
  onStart: (message: string) => void;
}) {
  const [message, setMessage] = useState("");
  const disabled = !conversation || !profileId || message.trim().length === 0;
  return (
    <section className="flex h-full flex-col">
      <div className="border-b border-zinc-200 bg-white p-4">
        <h1 className="text-base font-semibold">{conversation?.title ?? "Select or create a conversation"}</h1>
        <p className="text-sm text-zinc-500">{currentRun?.interrupted ? "Plan decision required" : "Ready for research"}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {(conversation?.messages ?? []).map((item) => (
          <div key={item.id} className="mb-3 rounded-md border border-zinc-200 bg-white p-3 text-sm">
            <div className="mb-1 text-xs uppercase text-zinc-500">{item.role}</div>
            <div>{item.content}</div>
          </div>
        ))}
      </div>
      <form className="flex gap-2 border-t border-zinc-200 bg-white p-4" onSubmit={(event) => { event.preventDefault(); onStart(message.trim()); setMessage(""); }}>
        <textarea className="h-20 min-w-0 flex-1 rounded-md border border-zinc-300 p-3 text-sm" value={message} onChange={(event) => setMessage(event.target.value)} aria-label="Research request" />
        <button className="nav-button-active self-end" disabled={disabled} type="submit">
          <Send className="h-4 w-4" aria-hidden="true" />
          Start
        </button>
      </form>
    </section>
  );
}
```

- [ ] **Step 4: Wire components in `App.tsx`**

Use `useEffect` to load conversations and profiles on mount. On `New`, call `api.createConversation("Untitled")`, append the returned item, and load detail. On research start, call `api.startResearch({ conversation_id: active.id, profile_id: selectedProfileId, user_message })`. On plan approval or replan, call `api.resumeResearch(currentRun.thread_id, { profile_id: selectedProfileId, decision })`.

- [ ] **Step 5: Run verification**

Run: `cd frontend; npm test -- src/components/PlanPanel.test.tsx src/components/ConversationPanel.test.tsx src/components/ResearchWorkspace.test.tsx; npm run build`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/App.tsx frontend/src/components
git commit -m "feat(frontend): add conversation research workflow"
```

---

## Task 4: Progress Stream and Report Preview

**Files:**
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/components/ProgressStream.tsx`
- Create: `frontend/src/components/ReportPanel.tsx`
- Test: `frontend/src/components/ProgressStream.test.tsx`
- Test: `frontend/src/components/ReportPanel.test.tsx`

**Interfaces:**
- Consumes: `useEventStream()`, `api.getReport(id)`, `api.exportPdf(id)`, `api.markdownDownloadUrl(id)`.
- Produces: `ProgressStream({ status, events })`.
- Produces: `ReportPanel({ report, onLoadReport, onExportPdf })`.

- [ ] **Step 1: Write failing report preview test**

```tsx
// frontend/src/components/ReportPanel.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReportPanel } from "./ReportPanel";

describe("ReportPanel", () => {
  it("renders markdown and triggers PDF export", async () => {
    const onExportPdf = vi.fn();
    render(
      <ReportPanel
        report={{ id: 7, project_id: 2, version: 1, format: "md", content_md: "# Findings\n\n- Source [1]", file_path: null, created_at: "2026-07-07T00:00:00" }}
        markdownUrl="/api/reports/7/download.md"
        onLoadReport={vi.fn()}
        onExportPdf={onExportPdf}
      />,
    );

    expect(screen.getByRole("heading", { name: "Findings" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /export pdf/i }));
    expect(onExportPdf).toHaveBeenCalledWith(7);
  });
});
```

- [ ] **Step 2: Implement ProgressStream**

```tsx
// frontend/src/components/ProgressStream.tsx
import { Activity } from "lucide-react";
import type { ServerEvent } from "../api/types";

export function ProgressStream({ status, events }: { status: string; events: ServerEvent[] }) {
  return (
    <section className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-200 p-4">
        <h2 className="text-sm font-semibold">Progress</h2>
        <span className="text-xs text-zinc-500">{status}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {events.length === 0 ? (
          <p className="text-sm text-zinc-500">No events yet</p>
        ) : (
          events.map((event, index) => (
            <div key={`${event.id ?? "event"}-${index}`} className="mb-2 rounded-md border border-zinc-200 p-3 text-sm">
              <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase text-zinc-500">
                <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                {event.event ?? "message"}
              </div>
              <pre className="whitespace-pre-wrap break-words text-xs text-zinc-700">{JSON.stringify(event.data, null, 2)}</pre>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Implement ReportPanel**

```tsx
// frontend/src/components/ReportPanel.tsx
import Markdown from "markdown-to-jsx";
import { Download, FileDown, RefreshCw } from "lucide-react";
import type { ReportRead } from "../api/types";

export function ReportPanel({
  report,
  markdownUrl,
  onLoadReport,
  onExportPdf,
}: {
  report: ReportRead | null;
  markdownUrl: string | null;
  onLoadReport: () => void;
  onExportPdf: (reportId: number) => void;
}) {
  return (
    <section className="border-t border-zinc-200 bg-white">
      <div className="flex items-center justify-between border-b border-zinc-200 p-4">
        <h2 className="text-sm font-semibold">Report</h2>
        <div className="flex gap-2">
          <button className="nav-button" onClick={onLoadReport}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Load
          </button>
          {markdownUrl ? (
            <a className="nav-button" href={markdownUrl}>
              <Download className="h-4 w-4" aria-hidden="true" />
              Markdown
            </a>
          ) : null}
          <button className="nav-button-active" disabled={!report} onClick={() => report && onExportPdf(report.id)}>
            <FileDown className="h-4 w-4" aria-hidden="true" />
            Export PDF
          </button>
        </div>
      </div>
      <article className="prose prose-zinc max-w-none p-5 text-sm">
        {report ? <Markdown>{report.content_md}</Markdown> : <p>No report loaded.</p>}
      </article>
    </section>
  );
}
```

- [ ] **Step 4: Wire event stream and report panel in `App.tsx`**

Use `const eventStream = useEventStream(80)` and render `ProgressStream` in the right pane. Add a `report` state. When a current research run state includes `report_id` as a number, call `api.getReport(report_id)` and show `ReportPanel` below the plan panel or below the workspace content.

- [ ] **Step 5: Run verification**

Run: `cd frontend; npm test -- src/components/ProgressStream.test.tsx src/components/ReportPanel.test.tsx; npm run build`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/App.tsx frontend/src/components/ProgressStream.tsx frontend/src/components/ReportPanel.tsx frontend/src/components/*.test.tsx
git commit -m "feat(frontend): add progress stream and report preview"
```

---

## Task 5: Settings UI for LLM Profiles, Search Preference, and MCP Servers

**Files:**
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/components/SettingsPanel.tsx`
- Test: `frontend/src/components/SettingsPanel.test.tsx`

**Interfaces:**
- Consumes: `api.listLLMProfiles`, `api.createLLMProfile`, `api.testLLMProfile`, `api.setPreference`, `api.getPreference`, `api.listMCPServers`, `api.createMCPServer`.
- Produces: `SettingsPanel` with controlled submit callbacks and selected default profile.

- [ ] **Step 1: Write failing SettingsPanel test**

```tsx
// frontend/src/components/SettingsPanel.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SettingsPanel } from "./SettingsPanel";

describe("SettingsPanel", () => {
  it("submits a new LLM profile without exposing stored secrets", async () => {
    const onCreateProfile = vi.fn();
    render(
      <SettingsPanel
        profiles={[]}
        servers={[]}
        maxSources={8}
        onCreateProfile={onCreateProfile}
        onTestProfile={vi.fn()}
        onSetMaxSources={vi.fn()}
        onCreateServer={vi.fn()}
      />,
    );

    await userEvent.type(screen.getByLabelText("Profile name"), "Local OpenAI");
    await userEvent.type(screen.getByLabelText("Provider"), "openai");
    await userEvent.type(screen.getByLabelText("Model"), "gpt-4.1-mini");
    await userEvent.type(screen.getByLabelText("API key"), "sk-local");
    await userEvent.click(screen.getByRole("button", { name: /save profile/i }));

    expect(onCreateProfile).toHaveBeenCalledWith(expect.objectContaining({
      name: "Local OpenAI",
      provider: "openai",
      model: "gpt-4.1-mini",
      api_key: "sk-local",
    }));
  });
});
```

- [ ] **Step 2: Implement SettingsPanel**

```tsx
// frontend/src/components/SettingsPanel.tsx
import { useState } from "react";
import { PlugZap, Save } from "lucide-react";
import type { LLMProfile, MCPServer } from "../api/types";

export function SettingsPanel({
  profiles,
  servers,
  maxSources,
  onCreateProfile,
  onTestProfile,
  onSetMaxSources,
  onCreateServer,
}: {
  profiles: LLMProfile[];
  servers: MCPServer[];
  maxSources: number;
  onCreateProfile: (payload: Omit<LLMProfile, "id">) => void;
  onTestProfile: (id: number) => void;
  onSetMaxSources: (value: number) => void;
  onCreateServer: (payload: Omit<MCPServer, "id">) => void;
}) {
  const [profile, setProfile] = useState({ name: "", provider: "openai", base_url: "", model: "", api_key: "" });
  const [server, setServer] = useState({ name: "Bocha", transport: "stdio", command: "npx", args: "@humansean/mcp-bocha", url: "" });

  return (
    <section className="h-full overflow-auto p-6">
      <h1 className="mb-4 text-base font-semibold">Settings</h1>
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-md border border-zinc-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold">LLM profiles</h2>
          <div className="grid gap-2">
            <input aria-label="Profile name" className="rounded-md border border-zinc-300 p-2 text-sm" value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} />
            <input aria-label="Provider" className="rounded-md border border-zinc-300 p-2 text-sm" value={profile.provider} onChange={(event) => setProfile({ ...profile, provider: event.target.value })} />
            <input aria-label="Model" className="rounded-md border border-zinc-300 p-2 text-sm" value={profile.model} onChange={(event) => setProfile({ ...profile, model: event.target.value })} />
            <input aria-label="Base URL" className="rounded-md border border-zinc-300 p-2 text-sm" value={profile.base_url} onChange={(event) => setProfile({ ...profile, base_url: event.target.value })} />
            <input aria-label="API key" type="password" className="rounded-md border border-zinc-300 p-2 text-sm" value={profile.api_key} onChange={(event) => setProfile({ ...profile, api_key: event.target.value })} />
          </div>
          <button className="nav-button-active mt-3" onClick={() => onCreateProfile({ ...profile, base_url: profile.base_url || null, params: null, is_default: profiles.length === 0 })}>
            <Save className="h-4 w-4" aria-hidden="true" />
            Save profile
          </button>
          <div className="mt-4 space-y-2">
            {profiles.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-md border border-zinc-200 p-3 text-sm">
                <span>{item.name} · {item.model}</span>
                <button className="nav-button" onClick={() => onTestProfile(item.id)}>
                  <PlugZap className="h-4 w-4" aria-hidden="true" />
                  Test
                </button>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-md border border-zinc-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold">Search and MCP</h2>
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-600">Max sources</span>
            <input type="number" className="w-28 rounded-md border border-zinc-300 p-2" value={maxSources} min={1} max={50} onChange={(event) => onSetMaxSources(Number(event.target.value))} />
          </label>
          <div className="mt-4 grid gap-2">
            <input aria-label="MCP server name" className="rounded-md border border-zinc-300 p-2 text-sm" value={server.name} onChange={(event) => setServer({ ...server, name: event.target.value })} />
            <input aria-label="MCP command" className="rounded-md border border-zinc-300 p-2 text-sm" value={server.command} onChange={(event) => setServer({ ...server, command: event.target.value })} />
            <input aria-label="MCP args" className="rounded-md border border-zinc-300 p-2 text-sm" value={server.args} onChange={(event) => setServer({ ...server, args: event.target.value })} />
          </div>
          <button className="nav-button-active mt-3" onClick={() => onCreateServer({ name: server.name, transport: server.transport, command: server.command, args: server.args.split(" ").filter(Boolean), env: null, url: server.url || null, enabled: true })}>
            <Save className="h-4 w-4" aria-hidden="true" />
            Save server
          </button>
          <div className="mt-4 space-y-2">
            {servers.map((item) => (
              <div key={item.id} className="rounded-md border border-zinc-200 p-3 text-sm">{item.name} · {item.transport}</div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Wire settings in `App.tsx`**

On mount, call `api.listLLMProfiles()`, `api.listMCPServers()`, and `api.getPreference("max_sources")`. If the preference returns 404, use `8` in state and do not show an error. When a profile is created, refresh the profile list and set the first profile as the selected profile for research starts.

- [ ] **Step 4: Run verification**

Run: `cd frontend; npm test -- src/components/SettingsPanel.test.tsx; npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/App.tsx frontend/src/components/SettingsPanel.tsx frontend/src/components/SettingsPanel.test.tsx
git commit -m "feat(frontend): add settings UI"
```

---

## Task 6: Integration Verification and Developer Handoff

**Files:**
- Modify: `docs/HANDOVER.md` only if the user asks for handover refresh.
- Verify: backend and frontend commands.

**Interfaces:**
- Consumes: completed frontend tasks and existing FastAPI backend.
- Produces: verified local app at `http://127.0.0.1:5173` with backend proxy to `http://127.0.0.1:8000`.

- [ ] **Step 1: Run backend tests**

```powershell
$env:PYTHONIOENCODING='utf-8'
$base = Join-Path $env:TEMP 'searchagent_pytest_phase6'
C:\Users\74511\miniconda3\envs\searchagent\python.exe -m pytest -q --basetemp=$base
```

Expected: PASS, with the known FastAPI/Starlette TestClient deprecation warning acceptable.

- [ ] **Step 2: Run frontend tests and build**

```powershell
cd C:\Workspace\SearchAgent\frontend
npm test
npm run build
```

Expected: PASS.

- [ ] **Step 3: Run local smoke test**

Terminal A:

```powershell
cd C:\Workspace\SearchAgent\backend
C:\Users\74511\miniconda3\envs\searchagent\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Terminal B:

```powershell
cd C:\Workspace\SearchAgent\frontend
npm run dev
```

Open `http://127.0.0.1:5173`. Verify that the first viewport is the app shell, history pane is visible, settings can be opened, and no text overlaps at desktop width. If Playwright browser tools are available, capture screenshots at `1440x900` and `390x844`.

- [ ] **Step 4: Final commit if integration fixes were needed**

```powershell
git add frontend
git commit -m "fix(frontend): polish integrated app flow"
```

---

## Self-Review

1. **Spec coverage:** This plan covers the React/Vite/Tailwind frontend, REST control, SSE subscription, conversation dialogue, plan confirmation, research progress, report preview/export controls, history list, and settings for LLM/MCP/search preferences. It intentionally does not change backend endpoints, authentication, deployment packaging, or visualization graphs because those are outside Phase 6.
2. **Placeholder scan:** Avoided empty placeholders and vague implementation directions; each task includes concrete files, interfaces, commands, expected results, and code snippets for the key implementation surface.
3. **Type consistency:** Frontend types match the implemented backend schemas in `backend/app/schemas/` and route paths match `backend/app/api/`.

Plan complete and saved to `docs/superpowers/plans/2026-07-07-phase6-react-frontend.md`. Two execution options:

1. **Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints.
