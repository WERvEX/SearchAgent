import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationPanel } from "../components/ConversationPanel";
import { PlanPanel } from "../components/PlanPanel";
import { ProgressStream } from "../components/ProgressStream";
import { ReportPanel } from "../components/ReportPanel";
import { ResearchWorkspace } from "../components/ResearchWorkspace";
import { SettingsPanel } from "../components/SettingsPanel";
import { I18nProvider, LOCALE_STORAGE_KEY } from "./I18nProvider";

function renderInChinese(ui: React.ReactElement) {
  localStorage.setItem(LOCALE_STORAGE_KEY, "zh-CN");
  return render(<I18nProvider>{ui}</I18nProvider>);
}

describe("frontend localization", () => {
  beforeEach(() => localStorage.clear());

  it("localizes frontend-owned component copy while preserving backend content", () => {
    renderInChinese(
      <>
        <ConversationPanel
          conversations={[{ id: 1, title: "Backend title", status: "running", created_at: "", updated_at: "" }]}
          activeId={1}
          onSelect={vi.fn()}
          onCreate={vi.fn()}
          onRename={vi.fn()}
          onDelete={vi.fn()}
        />
        <ResearchWorkspace
          conversation={{
            id: 1,
            title: "Backend title",
            status: "running",
            created_at: "",
            updated_at: "",
            messages: [{ id: 2, role: "user", content: "Backend message", meta: null }],
            projects: [],
          }}
          profileId={1}
          runPhase="active"
          onStart={vi.fn()}
        />
        <PlanPanel awaitingDecision={false} pending={false} plan={null} onApprove={vi.fn()} onReplan={vi.fn()} />
        <ProgressStream
          status="connecting"
          events={[{ id: "event-1", event: "research.started", data: { thread_id: "thread-1" } }]}
        />
        <ReportPanel report={null} markdownUrl={null} pdfUrl={null} onLoadReport={vi.fn()} />
        <SettingsPanel
          profiles={[]}
          selectedProfileId={null}
          servers={[]}
          maxSources={8}
          onSelectProfile={vi.fn()}
          onCreateProfile={vi.fn()}
          onTestProfile={vi.fn().mockResolvedValue({ ok: true, error: null })}
          onSaveMaxSources={vi.fn()}
          onCreateServer={vi.fn()}
        />
      </>,
    );

    expect(screen.getAllByText("Backend title")).toHaveLength(2);
    expect(screen.getByText("Backend message")).toBeInTheDocument();
    expect(screen.getByText("进行中")).toBeInTheDocument();
    expect(screen.getByText("用户")).toBeInTheDocument();
    expect(screen.getByLabelText("研究请求")).toBeInTheDocument();
    expect(screen.getByText("暂无计划选项")).toBeInTheDocument();
    expect(screen.getByText("正在连接")).toBeInTheDocument();
    expect(screen.getByText("研究已启动")).toBeInTheDocument();
    expect(screen.getByText("尚未加载报告。")).toBeInTheDocument();
    expect(screen.getByLabelText("配置名称")).toBeInTheDocument();
  });
});
