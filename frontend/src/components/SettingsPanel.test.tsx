import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider, useI18n } from "../i18n/I18nProvider";
import { SettingsPanel } from "./SettingsPanel";

function LocaleSwitch() {
  const { locale, setLocale } = useI18n();
  return (
    <button onClick={() => setLocale(locale === "en" ? "zh-CN" : "en")}>
      {locale === "en" ? "Use Chinese" : "Use English"}
    </button>
  );
}

function renderLocalizedSettings(overrides: Partial<React.ComponentProps<typeof SettingsPanel>> = {}) {
  localStorage.clear();
  const props: React.ComponentProps<typeof SettingsPanel> = {
    profiles: [],
    selectedProfileId: null,
    servers: [],
    maxSources: 8,
    onSelectProfile: vi.fn(),
    onCreateProfile: vi.fn().mockResolvedValue(undefined),
    onTestProfile: vi.fn().mockResolvedValue({ ok: true, error: null }),
    onSaveMaxSources: vi.fn().mockResolvedValue(undefined),
    onCreateServer: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return render(
    <I18nProvider>
      <LocaleSwitch />
      <SettingsPanel {...props} />
    </I18nProvider>,
  );
}

describe("SettingsPanel", () => {
  it("renders async success feedback in the current locale and retranslates validation", async () => {
    const user = userEvent.setup();
    let resolveSave!: () => void;
    const onSaveMaxSources = vi.fn(
      () => new Promise<void>((resolve) => {
        resolveSave = resolve;
      }),
    );
    renderLocalizedSettings({ onSaveMaxSources });

    const input = screen.getByLabelText("Max sources");
    await user.clear(input);
    await user.type(input, "0");
    expect(screen.getByText("Enter a whole number from 1 to 50.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Use Chinese" }));
    expect(screen.getByText("请输入 1 到 50 的整数。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use English" }));

    await user.clear(input);
    await user.type(input, "12");
    await user.click(screen.getByRole("button", { name: "Save source limit" }));
    await user.click(screen.getByRole("button", { name: "Use Chinese" }));

    resolveSave();

    expect(await screen.findByText("来源限制已保存。")).toBeInTheDocument();
  });

  it("retranslates frontend failure feedback but preserves raw API errors", async () => {
    const user = userEvent.setup();
    const onSaveMaxSources = vi.fn().mockRejectedValue("unknown failure");
    renderLocalizedSettings({ onSaveMaxSources });

    const input = screen.getByLabelText("Max sources");
    await user.clear(input);
    await user.type(input, "12");
    await user.click(screen.getByRole("button", { name: "Save source limit" }));
    expect(await screen.findByText("Failed to save source limit.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Use Chinese" }));
    expect(screen.getByText("保存来源限制失败。")).toBeInTheDocument();

    const rawError = new Error("Backend detail stays raw");
    const secondInput = screen.getByLabelText("最大来源数");
    await user.clear(secondInput);
    await user.type(secondInput, "13");
    onSaveMaxSources.mockRejectedValueOnce(rawError);
    await user.click(screen.getByRole("button", { name: "保存来源限制" }));
    expect(await screen.findByText("Backend detail stays raw")).toBeInTheDocument();
  });

  it("creates a profile, clears the API key field, and does not render persisted masked keys", async () => {
    const user = userEvent.setup();
    const onCreateProfile = vi.fn().mockResolvedValue(undefined);

    render(
      <SettingsPanel
        profiles={[
          {
            id: 7,
            name: "Default profile",
            provider: "openai",
            base_url: null,
            model: "gpt-5",
            api_key: "sk-s****",
            params: null,
            is_default: true,
          },
        ]}
        selectedProfileId={7}
        servers={[]}
        maxSources={8}
        onSelectProfile={vi.fn()}
        onCreateProfile={onCreateProfile}
        onTestProfile={vi.fn().mockResolvedValue({ ok: true, error: null })}
        onSaveMaxSources={vi.fn().mockResolvedValue(undefined)}
        onCreateServer={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.queryByText("sk-s****")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Profile name"), "Local OpenAI");
    await user.clear(screen.getByLabelText("Provider"));
    await user.type(screen.getByLabelText("Provider"), "openai_compatible");
    await user.type(screen.getByLabelText("Model"), "qwen");
    await user.type(screen.getByLabelText("Base URL"), "http://localhost:11434/v1");
    await user.type(screen.getByLabelText("API key"), "sk-local");
    await user.click(screen.getByLabelText("Advanced params (JSON)"));
    await user.paste("{\"temperature\":0}");
    await user.click(screen.getByLabelText("Make backend default"));
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() =>
      expect(onCreateProfile).toHaveBeenCalledWith({
        name: "Local OpenAI",
        provider: "openai_compatible",
        base_url: "http://localhost:11434/v1",
        model: "qwen",
        api_key: "sk-local",
        params: { temperature: 0 },
        is_default: true,
      }),
    );
    expect(await screen.findByText("Profile saved.")).toBeInTheDocument();
    expect(screen.getByLabelText("API key")).toHaveValue("");
  });

  it("lets the user choose and test the research profile", async () => {
    const user = userEvent.setup();
    const onSelectProfile = vi.fn();
    const onTestProfile = vi.fn().mockResolvedValue({ ok: true, error: null });

    render(
      <SettingsPanel
        profiles={[
          {
            id: 7,
            name: "Default profile",
            provider: "openai",
            base_url: null,
            model: "gpt-5",
            api_key: "sk-s****",
            params: null,
            is_default: true,
          },
          {
            id: 8,
            name: "Local profile",
            provider: "openai_compatible",
            base_url: "http://localhost:11434/v1",
            model: "qwen",
            api_key: "sk-l****",
            params: null,
            is_default: false,
          },
        ]}
        selectedProfileId={7}
        servers={[]}
        maxSources={8}
        onSelectProfile={onSelectProfile}
        onCreateProfile={vi.fn().mockResolvedValue(undefined)}
        onTestProfile={onTestProfile}
        onSaveMaxSources={vi.fn().mockResolvedValue(undefined)}
        onCreateServer={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await user.click(screen.getByLabelText("Use Local profile for research"));
    expect(onSelectProfile).toHaveBeenCalledWith(8);

    await user.click(screen.getByRole("button", { name: "Test Local profile" }));
    await waitFor(() => expect(onTestProfile).toHaveBeenCalledWith(8));
    expect(await screen.findByText("Connection OK.")).toBeInTheDocument();
  });

  it("validates and saves max sources and creates an MCP server", async () => {
    const user = userEvent.setup();
    const onSaveMaxSources = vi.fn().mockResolvedValue(undefined);
    const onCreateServer = vi.fn().mockResolvedValue(undefined);

    render(
      <SettingsPanel
        profiles={[]}
        selectedProfileId={null}
        servers={[]}
        maxSources={8}
        onSelectProfile={vi.fn()}
        onCreateProfile={vi.fn().mockResolvedValue(undefined)}
        onTestProfile={vi.fn().mockResolvedValue({ ok: true, error: null })}
        onSaveMaxSources={onSaveMaxSources}
        onCreateServer={onCreateServer}
      />,
    );

    const maxSourcesInput = screen.getByLabelText("Max sources");
    await user.clear(maxSourcesInput);
    await user.type(maxSourcesInput, "0");
    expect(screen.getByText("Enter a whole number from 1 to 50.")).toBeInTheDocument();

    await user.clear(maxSourcesInput);
    await user.type(maxSourcesInput, "12");
    await user.click(screen.getByRole("button", { name: "Save source limit" }));
    await waitFor(() => expect(onSaveMaxSources).toHaveBeenCalledWith(12));
    expect(await screen.findByText("Source limit saved.")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("MCP server name"));
    await user.type(screen.getByLabelText("MCP server name"), "bocha");
    await user.type(screen.getByLabelText("Command"), "npx");
    await user.clear(screen.getByLabelText("Arguments (one per line)"));
    await user.type(screen.getByLabelText("Arguments (one per line)"), "-y{enter}@humansean/mcp-bocha");
    await user.type(screen.getByLabelText("Environment variables (KEY=value)"), "BOCHA_API_KEY=secret");
    await user.click(screen.getByRole("button", { name: "Save server" }));

    await waitFor(() =>
      expect(onCreateServer).toHaveBeenCalledWith({
        name: "bocha",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@humansean/mcp-bocha"],
        env: { BOCHA_API_KEY: "secret" },
        url: null,
        enabled: true,
      }),
    );
    expect(await screen.findByText("MCP server saved.")).toBeInTheDocument();
    expect(screen.getByLabelText("Environment variables (KEY=value)")).toHaveValue("");
  });

  it("sends the HTTP MCP payload with null command and args", async () => {
    const user = userEvent.setup();
    const onCreateServer = vi.fn().mockResolvedValue(undefined);

    render(
      <SettingsPanel
        profiles={[]}
        selectedProfileId={null}
        servers={[]}
        maxSources={8}
        onSelectProfile={vi.fn()}
        onCreateProfile={vi.fn().mockResolvedValue(undefined)}
        onTestProfile={vi.fn().mockResolvedValue({ ok: true, error: null })}
        onSaveMaxSources={vi.fn().mockResolvedValue(undefined)}
        onCreateServer={onCreateServer}
      />,
    );

    await user.type(screen.getByLabelText("MCP server name"), "remote-tools");
    await user.selectOptions(screen.getByLabelText("Transport"), "http");
    await user.type(screen.getByLabelText("URL"), "http://localhost:9000/mcp");
    await user.click(screen.getByRole("button", { name: "Save server" }));

    await waitFor(() =>
      expect(onCreateServer).toHaveBeenCalledWith({
        name: "remote-tools",
        transport: "http",
        command: null,
        args: null,
        env: null,
        url: "http://localhost:9000/mcp",
        enabled: true,
      }),
    );
  });
});
