import { useEffect, useMemo, useState } from "react";
import { Check, Pencil, PlugZap, Save, X } from "lucide-react";
import type { LLMProfileCreate, LLMProfileRead, MCPServer, ToolPolicy } from "../api/types";
import { ToolPolicyPanel } from "./ToolPolicyPanel";
import { useI18n } from "../i18n/I18nProvider";
import {
  localizedMessage,
  messageFromError,
  rawMessage,
  renderLocalizedMessage,
  type LocalizedMessage,
  type MessageKey,
} from "../i18n/messages";

export type SettingsLoadErrors = {
  profiles: LocalizedMessage | null;
  maxSources: LocalizedMessage | null;
  servers: LocalizedMessage | null;
};

type SettingsPanelProps = {
  profiles: LLMProfileRead[];
  selectedProfileId: number | null;
  servers: MCPServer[];
  maxSources: number;
  loadErrors?: SettingsLoadErrors;
  onSelectProfile: (profileId: number) => void;
  onCreateProfile: (payload: LLMProfileCreate) => Promise<void> | void;
  onUpdateProfile?: (profileId: number, payload: LLMProfileCreate) => Promise<void> | void;
  onTestProfile: (profileId: number) => Promise<{ ok: boolean; error: string | null }>;
  onSaveMaxSources: (value: number) => Promise<void> | void;
  onCreateServer: (payload: Omit<MCPServer, "id">) => Promise<void> | void;
  onUpdateServer?: (serverId: number, payload: Omit<MCPServer, "id">) => Promise<void> | void;
  policies?: ToolPolicy[];
  onCreatePolicy?: (payload: Omit<ToolPolicy, "id" | "version" | "created_at">) => Promise<void>;
  onUpdatePolicy?: (id: number, payload: Omit<ToolPolicy, "id" | "version" | "created_at">) => Promise<void>;
  onDeletePolicy?: (id: number) => Promise<void>;
};

type Feedback = {
  tone: "success" | "error";
  message: LocalizedMessage;
};

type ParseResult<T> = { value: T; error: MessageKey | null };

type Compatibility = "openai_compatible" | "anthropic";

const API_PROVIDER_PRESETS = [
  {
    id: "openai",
    label: "OpenAI",
    compatibility: "openai_compatible" as Compatibility,
    urls: { openai_compatible: "https://api.openai.com/v1" },
    model: "",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    compatibility: "anthropic" as Compatibility,
    urls: { anthropic: "https://api.anthropic.com" },
    model: "",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    compatibility: "openai_compatible" as Compatibility,
    urls: {
      openai_compatible: "https://api.deepseek.com",
      anthropic: "https://api.deepseek.com/anthropic",
    },
    model: "deepseek-v4-flash",
  },
  {
    id: "mimo",
    label: "Xiaomi MiMo",
    compatibility: "openai_compatible" as Compatibility,
    urls: { openai_compatible: "https://api.xiaomimimo.com/v1" },
    model: "mimo-v2.5-pro",
  },
  {
    id: "qwen",
    label: "Alibaba Qwen",
    compatibility: "openai_compatible" as Compatibility,
    urls: {
      openai_compatible: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      anthropic: "https://dashscope.aliyuncs.com/apps/anthropic",
    },
    model: "",
  },
  {
    id: "custom",
    label: "Custom",
    compatibility: "openai_compatible" as Compatibility,
    urls: {},
    model: "",
  },
] as const;

function normalizeCompatibility(provider: string): Compatibility {
  return provider === "anthropic" ? "anthropic" : "openai_compatible";
}

function inferProviderPreset(profile: Pick<LLMProfileRead, "provider" | "base_url">): string {
  const compatibility = normalizeCompatibility(profile.provider);
  return API_PROVIDER_PRESETS.find((preset) =>
    preset.id !== "custom" && preset.urls[compatibility as keyof typeof preset.urls] === profile.base_url
  )?.id ?? "custom";
}

function emptyServerForm() {
  return {
    name: "",
    transport: "http",
    command: "",
    argsText: "",
    envText: "",
    url: "",
    enabled: true,
  };
}

function feedbackClassName(tone: Feedback["tone"]) {
  return tone === "error" ? "text-red-600" : "text-emerald-700";
}

function parseObjectJson(value: string): ParseResult<Record<string, unknown> | null> {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { value: null as Record<string, unknown> | null, error: null };
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { value: null, error: "validation.paramsObject" };
    }
    return { value: parsed as Record<string, unknown>, error: null };
  } catch {
    return { value: null, error: "validation.paramsJson" };
  }
}

function parseLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parseEnvText(value: string): ParseResult<Record<string, string> | null> {
  const env: Record<string, string> = {};

  for (const line of parseLines(value)) {
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      return { value: null, error: "validation.envFormat" };
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1);
    if (key.length === 0) {
      return { value: null, error: "validation.envKey" };
    }

    env[key] = rawValue;
  }

  return { value: Object.keys(env).length > 0 ? env : null, error: null };
}

function parseMaxSources(value: string): ParseResult<number | null> {
  if (value.trim().length === 0) {
    return { value: null, error: "validation.maxSources" };
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
    return { value: null, error: "validation.maxSources" };
  }

  return { value: parsed, error: null };
}

export function SettingsPanel({
  profiles,
  selectedProfileId,
  servers,
  maxSources,
  loadErrors,
  onSelectProfile,
  onCreateProfile,
  onUpdateProfile,
  onTestProfile,
  onSaveMaxSources,
  onCreateServer,
  onUpdateServer,
  policies = [], onCreatePolicy, onUpdatePolicy, onDeletePolicy,
}: SettingsPanelProps) {
  const { t } = useI18n();
  const [profileForm, setProfileForm] = useState({
    name: "",
    provider: "openai_compatible" as Compatibility,
    base_url: "https://api.openai.com/v1",
    model: "",
    api_key: "",
    paramsJson: "",
    is_default: profiles.length === 0,
  });
  const [providerPresetId, setProviderPresetId] = useState("openai");
  const [serverForm, setServerForm] = useState(emptyServerForm);
  const [maxSourcesInput, setMaxSourcesInput] = useState(String(maxSources));
  const [profileFeedback, setProfileFeedback] = useState<Feedback | null>(null);
  const [profileTestFeedback, setProfileTestFeedback] = useState<Record<number, Feedback>>({});
  const [editingProfileId, setEditingProfileId] = useState<number | null>(null);
  const [editingServerId, setEditingServerId] = useState<number | null>(null);
  const [maxSourcesFeedback, setMaxSourcesFeedback] = useState<Feedback | null>(null);
  const [serverFeedback, setServerFeedback] = useState<Feedback | null>(null);
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [profileTestingId, setProfileTestingId] = useState<number | null>(null);
  const [maxSourcesSubmitting, setMaxSourcesSubmitting] = useState(false);
  const [serverSubmitting, setServerSubmitting] = useState(false);

  useEffect(() => {
    setMaxSourcesInput(String(maxSources));
  }, [maxSources]);

  useEffect(() => {
    if (profiles.length === 0) {
      setProfileForm((current) => ({ ...current, is_default: true }));
    }
  }, [profiles.length]);

  const profileParams = useMemo(() => parseObjectJson(profileForm.paramsJson), [profileForm.paramsJson]);
  const serverEnv = useMemo(() => parseEnvText(serverForm.envText), [serverForm.envText]);
  const maxSourcesState = useMemo(() => parseMaxSources(maxSourcesInput), [maxSourcesInput]);

  const profileValidation =
    profileForm.name.trim().length === 0
      ? "validation.profileName"
      : profileForm.provider.trim().length === 0
        ? "validation.provider"
        : profileForm.model.trim().length === 0
          ? "validation.model"
          : profileParams.error;

  const serverValidation =
    serverForm.name.trim().length === 0
      ? "validation.serverName"
      : serverForm.transport === "stdio" && serverForm.command.trim().length === 0
        ? "validation.command"
        : serverForm.transport !== "stdio" && serverForm.url.trim().length === 0
          ? "validation.url"
          : serverEnv.error;

  const canSubmitProfile = !profileSubmitting && profileValidation === null;
  const canSaveMaxSources =
    !maxSourcesSubmitting && maxSourcesState.error === null && maxSourcesState.value !== null && maxSourcesState.value !== maxSources;
  const canSubmitServer = !serverSubmitting && serverValidation === null;

  async function handleProfileSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileFeedback(null);

    if (profileValidation !== null) {
      setProfileFeedback({ tone: "error", message: localizedMessage(profileValidation) });
      return;
    }

    setProfileSubmitting(true);
    try {
      const payload = {
        name: profileForm.name.trim(),
        provider: profileForm.provider.trim(),
        base_url: profileForm.base_url.trim() || null,
        model: profileForm.model.trim(),
        api_key: profileForm.api_key.trim() || null,
        params: profileParams.value,
        is_default: profiles.length === 0 ? true : profileForm.is_default,
      };
      if (editingProfileId === null) {
        await onCreateProfile(payload);
      } else {
        if (!onUpdateProfile) {
          throw new Error("Profile editing is unavailable")
        }
        await onUpdateProfile(editingProfileId, payload);
      }
      setProfileFeedback({ tone: "success", message: localizedMessage("feedback.profileSaved") });
      setProfileForm({
        name: "",
        provider: "openai_compatible",
        base_url: "https://api.openai.com/v1",
        model: "",
        api_key: "",
        paramsJson: "",
        is_default: false,
      });
      setProviderPresetId("openai");
      setEditingProfileId(null);
    } catch (error) {
      setProfileFeedback({
        tone: "error",
        message: messageFromError(error, "feedback.failedSaveProfile"),
      });
    } finally {
      setProfileSubmitting(false);
    }
  }

  async function handleProfileTest(profileId: number) {
    setProfileFeedback(null);
    setProfileTestFeedback((current) => {
      const next = { ...current };
      delete next[profileId];
      return next;
    });
    setProfileTestingId(profileId);
    try {
      const result = await onTestProfile(profileId);
      setProfileTestFeedback((current) => ({
        ...current,
        [profileId]: result.ok
          ? { tone: "success", message: localizedMessage("feedback.connectionOk") }
          : {
              tone: "error",
              message: result.error ? rawMessage(result.error) : localizedMessage("feedback.connectionFailed"),
            },
      }));
    } catch (error) {
      setProfileTestFeedback((current) => ({
        ...current,
        [profileId]: { tone: "error", message: messageFromError(error, "feedback.failedTestProfile") },
      }));
    } finally {
      setProfileTestingId(null);
    }
  }

  function handleEditProfile(profile: LLMProfileRead) {
    setEditingProfileId(profile.id);
    setProfileFeedback(null);
    setProfileForm({
      name: profile.name,
      provider: normalizeCompatibility(profile.provider),
      base_url: profile.base_url ?? "",
      model: profile.model,
      api_key: "",
      paramsJson: profile.params ? JSON.stringify(profile.params, null, 2) : "",
      is_default: profile.is_default,
    });
    setProviderPresetId(inferProviderPreset(profile));
  }

  function cancelProfileEdit() {
    setEditingProfileId(null);
    setProfileFeedback(null);
    setProviderPresetId("openai");
    setProfileForm({ name: "", provider: "openai_compatible", base_url: "https://api.openai.com/v1", model: "", api_key: "", paramsJson: "", is_default: false });
  }

  function handleProviderPresetChange(presetId: string) {
    const preset = API_PROVIDER_PRESETS.find((item) => item.id === presetId) ?? API_PROVIDER_PRESETS.at(-1)!;
    setProviderPresetId(preset.id);
    setProfileForm((current) => ({
      ...current,
      provider: preset.compatibility,
      base_url: preset.urls[preset.compatibility as keyof typeof preset.urls] ?? "",
      model: preset.model,
    }));
  }

  function handleCompatibilityChange(compatibility: Compatibility) {
    const preset = API_PROVIDER_PRESETS.find((item) => item.id === providerPresetId);
    const presetUrl = preset?.urls[compatibility as keyof typeof preset.urls];
    if (preset && preset.id !== "custom" && !presetUrl) {
      setProviderPresetId("custom");
    }
    setProfileForm((current) => ({
      ...current,
      provider: compatibility,
      base_url: preset?.id === "custom" ? current.base_url : presetUrl ?? "",
    }));
  }

  async function handleMaxSourcesSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMaxSourcesFeedback(null);

    if (maxSourcesState.error !== null || maxSourcesState.value === null) {
      setMaxSourcesFeedback({ tone: "error", message: localizedMessage("validation.maxSources") });
      return;
    }

    setMaxSourcesSubmitting(true);
    try {
      await onSaveMaxSources(maxSourcesState.value);
      setMaxSourcesFeedback({ tone: "success", message: localizedMessage("feedback.sourceLimitSaved") });
    } catch (error) {
      setMaxSourcesFeedback({
        tone: "error",
        message: messageFromError(error, "feedback.failedSaveSourceLimit"),
      });
    } finally {
      setMaxSourcesSubmitting(false);
    }
  }

  async function handleServerSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServerFeedback(null);

    if (serverValidation !== null) {
      setServerFeedback({ tone: "error", message: localizedMessage(serverValidation) });
      return;
    }

    setServerSubmitting(true);
    try {
      const args = serverForm.transport === "stdio" ? parseLines(serverForm.argsText) : [];
      const payload = {
        name: serverForm.name.trim(),
        transport: serverForm.transport,
        command: serverForm.transport === "stdio" ? serverForm.command.trim() : null,
        args: serverForm.transport === "stdio" && args.length > 0 ? args : null,
        env: serverEnv.value,
        url: serverForm.transport === "stdio" ? null : serverForm.url.trim(),
        enabled: serverForm.enabled,
      };
      if (editingServerId === null) {
        await onCreateServer(payload);
      } else {
        if (!onUpdateServer) {
          throw new Error("MCP server editing is unavailable");
        }
        await onUpdateServer(editingServerId, payload);
      }
      setServerFeedback({ tone: "success", message: localizedMessage("feedback.serverSaved") });
      setServerForm(emptyServerForm());
      setEditingServerId(null);
    } catch (error) {
      setServerFeedback({
        tone: "error",
        message: messageFromError(error, "feedback.failedSaveServer"),
      });
    } finally {
      setServerSubmitting(false);
    }
  }

  function handleEditServer(server: MCPServer) {
    setEditingServerId(server.id);
    setServerFeedback(null);
    setServerForm({
      name: server.name,
      transport: server.transport === "stdio" ? "stdio" : "http",
      command: server.command ?? "",
      argsText: server.args?.join("\n") ?? "",
      envText: "",
      url: server.url ?? "",
      enabled: server.enabled,
    });
  }

  function cancelServerEdit() {
    setEditingServerId(null);
    setServerFeedback(null);
    setServerForm(emptyServerForm());
  }

  return (
    <section className="h-full overflow-auto p-6">
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section className="space-y-6">
          <header>
            <h1 className="text-base font-semibold text-zinc-950">{t("settings.title")}</h1>
            <p className="mt-1 text-sm text-zinc-600">{t("settings.description")}</p>
          </header>

          <form className="space-y-4 border border-zinc-200 bg-white p-4" onSubmit={handleProfileSubmit} aria-busy={profileSubmitting}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-zinc-950">{editingProfileId === null ? t("settings.profiles") : t("settings.editProfile")}</h2>
                <p className="mt-1 text-xs text-zinc-500">{t("settings.profilesDescription")}</p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm text-zinc-700">
                <span>{t("settings.profileName")}</span>
                <input
                  aria-label={t("settings.profileName")}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  value={profileForm.name}
                  onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))}
                />
              </label>
              <label className="grid gap-1 text-sm text-zinc-700">
                <span>{t("settings.apiProvider")}</span>
                <select
                  aria-label={t("settings.apiProvider")}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  value={providerPresetId}
                  onChange={(event) => handleProviderPresetChange(event.target.value)}
                >
                  {API_PROVIDER_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.id === "custom" ? t("settings.customProvider") : preset.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm text-zinc-700">
                <span>{t("settings.compatibility")}</span>
                <select
                  aria-label={t("settings.compatibility")}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  value={profileForm.provider}
                  onChange={(event) => handleCompatibilityChange(event.target.value as Compatibility)}
                >
                  <option value="openai_compatible">{t("settings.openaiCompatible")}</option>
                  <option value="anthropic">{t("settings.anthropicCompatible")}</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm text-zinc-700">
                <span>{t("settings.model")}</span>
                <input
                  aria-label={t("settings.model")}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  value={profileForm.model}
                  onChange={(event) => setProfileForm((current) => ({ ...current, model: event.target.value }))}
                />
              </label>
              <label className="grid gap-1 text-sm text-zinc-700">
                <span>{t("settings.baseUrl")}</span>
                <input
                  aria-label={t("settings.baseUrl")}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  value={profileForm.base_url}
                  onChange={(event) => setProfileForm((current) => ({ ...current, base_url: event.target.value }))}
                />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <label className="grid gap-1 text-sm text-zinc-700">
                <span>{t("settings.apiKey")}</span>
                <input
                  aria-label={t("settings.apiKey")}
                  type="password"
                  autoComplete="new-password"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  value={profileForm.api_key}
                  onChange={(event) => setProfileForm((current) => ({ ...current, api_key: event.target.value }))}
                />
              </label>
              <label className="mt-6 inline-flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  aria-label={t("settings.makeDefault")}
                  checked={profiles.length === 0 ? true : profileForm.is_default}
                  disabled={profiles.length === 0}
                  onChange={(event) => setProfileForm((current) => ({ ...current, is_default: event.target.checked }))}
                />
                <span>{profiles.length === 0 ? t("settings.firstProfileDefault") : t("settings.makeDefault")}</span>
              </label>
            </div>

            <details className="rounded-md border border-zinc-200 px-3 py-2">
              <summary className="cursor-pointer text-sm text-zinc-700">{t("settings.advancedOptions")}</summary>
              <label className="mt-3 grid gap-1 text-sm text-zinc-700">
                <span>{t("settings.advancedParams")}</span>
                <textarea
                  aria-label={t("settings.advancedParams")}
                  className="min-h-24 rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  value={profileForm.paramsJson}
                  onChange={(event) => setProfileForm((current) => ({ ...current, paramsJson: event.target.value }))}
                />
              </label>
            </details>

            {profileFeedback ? (
              <p role={profileFeedback.tone === "error" ? "alert" : "status"} className={`text-sm ${feedbackClassName(profileFeedback.tone)}`}>
                {renderLocalizedMessage(t, profileFeedback.message)}
              </p>
            ) : null}
            {loadErrors?.profiles ? <p role="alert" className="text-sm text-red-600">{renderLocalizedMessage(t, loadErrors.profiles)}</p> : null}
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" className="nav-button-active" disabled={!canSubmitProfile}>
                <Save className="h-4 w-4" aria-hidden="true" />
                {profileSubmitting ? t("settings.saving") : t("settings.saveProfile")}
              </button>
              {editingProfileId !== null ? (
                <button type="button" className="nav-button" onClick={cancelProfileEdit}>
                  <X className="h-4 w-4" aria-hidden="true" />
                  {t("settings.cancelEdit")}
                </button>
              ) : null}
              {profileValidation ? <span className="text-xs text-zinc-500">{t(profileValidation)}</span> : null}
            </div>
          </form>

          <section className="border border-zinc-200 bg-white">
            <div className="border-b border-zinc-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-zinc-950">{t("settings.availableProfiles")}</h2>
            </div>
            <div className="divide-y divide-zinc-200">
              {profiles.length === 0 ? (
                <p className="px-4 py-4 text-sm text-zinc-500">{t("settings.noProfiles")}</p>
              ) : (
                profiles.map((profile) => (
                  <div key={profile.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                    <label className="flex min-w-0 flex-1 items-start gap-3">
                      <input
                        type="radio"
                        name="research-profile"
                        aria-label={t("settings.useProfile", { name: profile.name })}
                        checked={selectedProfileId === profile.id}
                        onChange={() => onSelectProfile(profile.id)}
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium text-zinc-950">{profile.name}</span>
                          {profile.is_default ? (
                            <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">{t("settings.backendDefault")}</span>
                          ) : null}
                          {selectedProfileId === profile.id ? (
                            <span className="rounded bg-teal-50 px-2 py-0.5 text-xs text-teal-700">{t("settings.active")}</span>
                          ) : null}
                          {profile.api_key ? (
                            <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">{t("settings.keyStored")}</span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">
                          {t(normalizeCompatibility(profile.provider) === "anthropic"
                            ? "settings.anthropicCompatible"
                            : "settings.openaiCompatible")} · {profile.model}
                          {profile.base_url ? ` · ${profile.base_url}` : ""}
                        </div>
                      </div>
                    </label>
                    <button
                      type="button"
                      className="nav-button"
                      disabled={profileTestingId === profile.id}
                      onClick={() => {
                        void handleProfileTest(profile.id);
                      }}
                    >
                      <PlugZap className="h-4 w-4" aria-hidden="true" />
                      {profileTestingId === profile.id ? t("settings.testing") : t("settings.testProfile", { name: profile.name })}
                    </button>
                    <button type="button" className="nav-button" onClick={() => handleEditProfile(profile)}>
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                      {t("settings.editProfile", { name: profile.name })}
                    </button>
                    {profileTestFeedback[profile.id] ? (
                      <p role={profileTestFeedback[profile.id].tone === "error" ? "alert" : "status"} className={`w-full text-sm ${feedbackClassName(profileTestFeedback[profile.id].tone)}`}>
                        {renderLocalizedMessage(t, profileTestFeedback[profile.id].message)}
                      </p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </section>
        </section>

        <section className="space-y-6">
          <form className="space-y-4 border border-zinc-200 bg-white p-4" onSubmit={handleMaxSourcesSubmit} aria-busy={maxSourcesSubmitting}>
            <div>
              <h2 className="text-sm font-semibold text-zinc-950">{t("settings.searchPreference")}</h2>
              <p className="mt-1 text-xs text-zinc-500">{t("settings.sourceLimitDescription")}</p>
            </div>

            <label className="grid max-w-40 gap-1 text-sm text-zinc-700">
              <span>{t("settings.maxSources")}</span>
              <input
                aria-label={t("settings.maxSources")}
                type="number"
                min={1}
                max={50}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                value={maxSourcesInput}
                onChange={(event) => setMaxSourcesInput(event.target.value)}
              />
            </label>

            {maxSourcesState.error ? <p className="text-sm text-red-600">{t(maxSourcesState.error)}</p> : null}
            {loadErrors?.maxSources ? <p role="alert" className="text-sm text-red-600">{renderLocalizedMessage(t, loadErrors.maxSources)}</p> : null}
            {maxSourcesFeedback ? (
              <p role={maxSourcesFeedback.tone === "error" ? "alert" : "status"} className={`text-sm ${feedbackClassName(maxSourcesFeedback.tone)}`}>
                {renderLocalizedMessage(t, maxSourcesFeedback.message)}
              </p>
            ) : null}

            <button type="submit" className="nav-button-active" disabled={!canSaveMaxSources}>
              <Check className="h-4 w-4" aria-hidden="true" />
              {maxSourcesSubmitting ? t("settings.saving") : t("settings.saveSourceLimit")}
            </button>
          </form>

          {onCreatePolicy && onUpdatePolicy && onDeletePolicy ? <ToolPolicyPanel policies={policies} onCreate={onCreatePolicy} onUpdate={onUpdatePolicy} onDelete={onDeletePolicy} /> : null}

          <form className="space-y-4 border border-zinc-200 bg-white p-4" onSubmit={handleServerSubmit} aria-busy={serverSubmitting}>
            <div>
              <h2 className="text-sm font-semibold text-zinc-950">
                {editingServerId === null ? t("settings.mcpServers") : t("settings.editServer")}
              </h2>
              <p className="mt-1 text-xs text-zinc-500">{t("settings.mcpDescription")}</p>
            </div>

            <div className="grid gap-3">
              <label className="grid gap-1 text-sm text-zinc-700">
                <span>{t("settings.serverName")}</span>
                <input
                  aria-label={t("settings.serverName")}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  value={serverForm.name}
                  onChange={(event) => setServerForm((current) => ({ ...current, name: event.target.value }))}
                />
              </label>

              <label className="grid gap-1 text-sm text-zinc-700">
                <span>{t("settings.connectionType")}</span>
                <select
                  aria-label={t("settings.connectionType")}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  value={serverForm.transport}
                  onChange={(event) => setServerForm((current) => ({ ...current, transport: event.target.value }))}
                >
                  <option value="http">{t("settings.remoteUrl")}</option>
                  <option value="stdio">{t("settings.localCommand")}</option>
                </select>
              </label>

              {serverForm.transport === "stdio" ? (
                <>
                  <label className="grid gap-1 text-sm text-zinc-700">
                    <span>{t("settings.command")}</span>
                    <input
                      aria-label={t("settings.command")}
                      className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                      value={serverForm.command}
                      onChange={(event) => setServerForm((current) => ({ ...current, command: event.target.value }))}
                    />
                  </label>
                </>
              ) : (
                <label className="grid gap-1 text-sm text-zinc-700">
                  <span>{t("settings.url")}</span>
                  <input
                    aria-label={t("settings.url")}
                    className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                    value={serverForm.url}
                    onChange={(event) => setServerForm((current) => ({ ...current, url: event.target.value }))}
                  />
                </label>
              )}

              {serverForm.transport === "stdio" ? (
                <details className="rounded-md border border-zinc-200 px-3 py-2">
                  <summary className="cursor-pointer text-sm text-zinc-700">{t("settings.advancedOptions")}</summary>
                  <div className="mt-3 grid gap-3">
                    <label className="grid gap-1 text-sm text-zinc-700">
                      <span>{t("settings.arguments")}</span>
                      <textarea
                        aria-label={t("settings.arguments")}
                        className="min-h-20 rounded-md border border-zinc-300 px-3 py-2 text-sm"
                        value={serverForm.argsText}
                        onChange={(event) => setServerForm((current) => ({ ...current, argsText: event.target.value }))}
                      />
                    </label>
                    <label className="grid gap-1 text-sm text-zinc-700">
                      <span>{t("settings.environment")}</span>
                      <textarea
                        aria-label={t("settings.environment")}
                        className="min-h-20 rounded-md border border-zinc-300 px-3 py-2 text-sm"
                        value={serverForm.envText}
                        onChange={(event) => setServerForm((current) => ({ ...current, envText: event.target.value }))}
                      />
                      {editingServerId !== null ? (
                        <span className="text-xs text-zinc-500">{t("settings.keepStoredSecrets")}</span>
                      ) : null}
                    </label>
                  </div>
                </details>
              ) : null}

              <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  aria-label={t("settings.serverEnabled")}
                  checked={serverForm.enabled}
                  onChange={(event) => setServerForm((current) => ({ ...current, enabled: event.target.checked }))}
                />
                <span>{t("settings.serverEnabled")}</span>
              </label>
            </div>

            {serverValidation ? <p className="text-sm text-zinc-500">{t(serverValidation)}</p> : null}
            {loadErrors?.servers ? <p role="alert" className="text-sm text-red-600">{renderLocalizedMessage(t, loadErrors.servers)}</p> : null}
            {serverFeedback ? (
              <p role={serverFeedback.tone === "error" ? "alert" : "status"} className={`text-sm ${feedbackClassName(serverFeedback.tone)}`}>
                {renderLocalizedMessage(t, serverFeedback.message)}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <button type="submit" className="nav-button-active" disabled={!canSubmitServer}>
                <Save className="h-4 w-4" aria-hidden="true" />
                {serverSubmitting ? t("settings.saving") : t("settings.saveServer")}
              </button>
              {editingServerId !== null ? (
                <button type="button" className="nav-button" onClick={cancelServerEdit}>
                  <X className="h-4 w-4" aria-hidden="true" />
                  {t("settings.cancelEdit")}
                </button>
              ) : null}
            </div>
          </form>

          <section className="border border-zinc-200 bg-white">
            <div className="border-b border-zinc-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-zinc-950">{t("settings.registeredServers")}</h2>
            </div>
            <div className="divide-y divide-zinc-200">
              {servers.length === 0 ? (
                <p className="px-4 py-4 text-sm text-zinc-500">{t("settings.noServers")}</p>
              ) : (
                servers.map((server) => (
                  <div key={server.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-zinc-950">{server.name}</span>
                        <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                          {server.transport === "stdio" ? t("settings.localCommand") : t("settings.remoteUrl")}
                        </span>
                        {!server.enabled ? <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">{t("settings.disabled")}</span> : null}
                      </div>
                      <div className="mt-1 break-all text-xs text-zinc-500">
                        {server.transport === "stdio"
                          ? [server.command, server.args?.join(" ")].filter(Boolean).join(" ")
                          : server.url ?? t("settings.noUrl")}
                      </div>
                      {server.env ? (
                        <div className="mt-1 text-xs text-zinc-500">{t("settings.envKeys", { keys: Object.keys(server.env).join(", ") })}</div>
                      ) : null}
                    </div>
                    <button type="button" className="nav-button shrink-0" onClick={() => handleEditServer(server)}>
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                      {t("settings.editServer")}
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </section>
      </div>
    </section>
  );
}
