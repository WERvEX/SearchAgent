import { useEffect, useMemo, useState } from "react";
import { Check, PlugZap, Save } from "lucide-react";
import type { LLMProfileCreate, LLMProfileRead, MCPServer } from "../api/types";

type SettingsPanelProps = {
  profiles: LLMProfileRead[];
  selectedProfileId: number | null;
  servers: MCPServer[];
  maxSources: number;
  onSelectProfile: (profileId: number) => void;
  onCreateProfile: (payload: LLMProfileCreate) => Promise<void> | void;
  onTestProfile: (profileId: number) => Promise<{ ok: boolean; error: string | null }>;
  onSaveMaxSources: (value: number) => Promise<void> | void;
  onCreateServer: (payload: Omit<MCPServer, "id">) => Promise<void> | void;
};

type Feedback = {
  tone: "success" | "error";
  message: string;
};

function feedbackClassName(tone: Feedback["tone"]) {
  return tone === "error" ? "text-red-600" : "text-emerald-700";
}

function parseObjectJson(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { value: null as Record<string, unknown> | null, error: null };
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { value: null, error: "Params JSON must be an object." };
    }
    return { value: parsed as Record<string, unknown>, error: null };
  } catch {
    return { value: null, error: "Params JSON must be valid JSON." };
  }
}

function parseLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parseEnvText(value: string) {
  const env: Record<string, string> = {};

  for (const line of parseLines(value)) {
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      return { value: null as Record<string, string> | null, error: "Each environment line must use KEY=value." };
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1);
    if (key.length === 0) {
      return { value: null, error: "Environment variable keys cannot be empty." };
    }

    env[key] = rawValue;
  }

  return { value: Object.keys(env).length > 0 ? env : null, error: null };
}

function parseMaxSources(value: string) {
  if (value.trim().length === 0) {
    return { value: null as number | null, error: "Enter a whole number from 1 to 50." };
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
    return { value: null, error: "Enter a whole number from 1 to 50." };
  }

  return { value: parsed, error: null };
}

export function SettingsPanel({
  profiles,
  selectedProfileId,
  servers,
  maxSources,
  onSelectProfile,
  onCreateProfile,
  onTestProfile,
  onSaveMaxSources,
  onCreateServer,
}: SettingsPanelProps) {
  const [profileForm, setProfileForm] = useState({
    name: "",
    provider: "openai",
    base_url: "",
    model: "",
    api_key: "",
    paramsJson: "",
    is_default: profiles.length === 0,
  });
  const [serverForm, setServerForm] = useState({
    name: "",
    transport: "stdio",
    command: "",
    argsText: "",
    envText: "",
    url: "",
  });
  const [maxSourcesInput, setMaxSourcesInput] = useState(String(maxSources));
  const [profileFeedback, setProfileFeedback] = useState<Feedback | null>(null);
  const [profileTestFeedback, setProfileTestFeedback] = useState<Feedback | null>(null);
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
      ? "Profile name is required."
      : profileForm.provider.trim().length === 0
        ? "Provider is required."
        : profileForm.model.trim().length === 0
          ? "Model is required."
          : profileParams.error;

  const serverValidation =
    serverForm.name.trim().length === 0
      ? "Server name is required."
      : serverForm.transport === "stdio" && serverForm.command.trim().length === 0
        ? "Command is required for stdio servers."
        : serverForm.transport !== "stdio" && serverForm.url.trim().length === 0
          ? "URL is required for non-stdio servers."
          : serverEnv.error;

  const canSubmitProfile = !profileSubmitting && profileValidation === null;
  const canSaveMaxSources =
    !maxSourcesSubmitting && maxSourcesState.error === null && maxSourcesState.value !== null && maxSourcesState.value !== maxSources;
  const canSubmitServer = !serverSubmitting && serverValidation === null;

  async function handleProfileSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileFeedback(null);
    setProfileTestFeedback(null);

    if (profileValidation !== null) {
      setProfileFeedback({ tone: "error", message: profileValidation });
      return;
    }

    setProfileSubmitting(true);
    try {
      await onCreateProfile({
        name: profileForm.name.trim(),
        provider: profileForm.provider.trim(),
        base_url: profileForm.base_url.trim() || null,
        model: profileForm.model.trim(),
        api_key: profileForm.api_key.trim() || null,
        params: profileParams.value,
        is_default: profiles.length === 0 ? true : profileForm.is_default,
      });
      setProfileFeedback({ tone: "success", message: "Profile saved." });
      setProfileForm({
        name: "",
        provider: "openai",
        base_url: "",
        model: "",
        api_key: "",
        paramsJson: "",
        is_default: false,
      });
    } catch (error) {
      setProfileFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to save profile.",
      });
    } finally {
      setProfileSubmitting(false);
    }
  }

  async function handleProfileTest(profileId: number) {
    setProfileFeedback(null);
    setProfileTestFeedback(null);
    setProfileTestingId(profileId);
    try {
      const result = await onTestProfile(profileId);
      setProfileTestFeedback(result.ok ? { tone: "success", message: "Connection OK." } : { tone: "error", message: result.error ?? "Connection failed." });
    } catch (error) {
      setProfileTestFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to test profile.",
      });
    } finally {
      setProfileTestingId(null);
    }
  }

  async function handleMaxSourcesSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMaxSourcesFeedback(null);

    if (maxSourcesState.error !== null || maxSourcesState.value === null) {
      setMaxSourcesFeedback({ tone: "error", message: "Enter a whole number from 1 to 50." });
      return;
    }

    setMaxSourcesSubmitting(true);
    try {
      await onSaveMaxSources(maxSourcesState.value);
      setMaxSourcesFeedback({ tone: "success", message: "Source limit saved." });
    } catch (error) {
      setMaxSourcesFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to save source limit.",
      });
    } finally {
      setMaxSourcesSubmitting(false);
    }
  }

  async function handleServerSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServerFeedback(null);

    if (serverValidation !== null) {
      setServerFeedback({ tone: "error", message: serverValidation });
      return;
    }

    setServerSubmitting(true);
    try {
      const args = serverForm.transport === "stdio" ? parseLines(serverForm.argsText) : [];
      await onCreateServer({
        name: serverForm.name.trim(),
        transport: serverForm.transport,
        command: serverForm.transport === "stdio" ? serverForm.command.trim() : null,
        args: serverForm.transport === "stdio" && args.length > 0 ? args : null,
        env: serverEnv.value,
        url: serverForm.transport === "stdio" ? null : serverForm.url.trim(),
        enabled: true,
      });
      setServerFeedback({ tone: "success", message: "MCP server saved." });
      setServerForm({
        name: "",
        transport: "stdio",
        command: "",
        argsText: "",
        envText: "",
        url: "",
      });
    } catch (error) {
      setServerFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to save MCP server.",
      });
    } finally {
      setServerSubmitting(false);
    }
  }

  return (
    <section className="h-full overflow-auto p-6">
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section className="space-y-6">
          <header>
            <h1 className="text-base font-semibold text-zinc-950">Settings</h1>
            <p className="mt-1 text-sm text-zinc-600">Manage research profiles, source limits, and MCP servers.</p>
          </header>

          <form className="space-y-4 border border-zinc-200 bg-white p-4" onSubmit={handleProfileSubmit} aria-busy={profileSubmitting}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-zinc-950">LLM profiles</h2>
                <p className="mt-1 text-xs text-zinc-500">Create new profiles and choose which one research runs use.</p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm text-zinc-700">
                <span>Profile name</span>
                <input
                  aria-label="Profile name"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  value={profileForm.name}
                  onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))}
                />
              </label>
              <label className="grid gap-1 text-sm text-zinc-700">
                <span>Provider</span>
                <input
                  aria-label="Provider"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  value={profileForm.provider}
                  onChange={(event) => setProfileForm((current) => ({ ...current, provider: event.target.value }))}
                />
              </label>
              <label className="grid gap-1 text-sm text-zinc-700">
                <span>Model</span>
                <input
                  aria-label="Model"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  value={profileForm.model}
                  onChange={(event) => setProfileForm((current) => ({ ...current, model: event.target.value }))}
                />
              </label>
              <label className="grid gap-1 text-sm text-zinc-700">
                <span>Base URL</span>
                <input
                  aria-label="Base URL"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  value={profileForm.base_url}
                  onChange={(event) => setProfileForm((current) => ({ ...current, base_url: event.target.value }))}
                />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <label className="grid gap-1 text-sm text-zinc-700">
                <span>API key</span>
                <input
                  aria-label="API key"
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
                  aria-label="Make backend default"
                  checked={profiles.length === 0 ? true : profileForm.is_default}
                  disabled={profiles.length === 0}
                  onChange={(event) => setProfileForm((current) => ({ ...current, is_default: event.target.checked }))}
                />
                <span>{profiles.length === 0 ? "First profile becomes backend default" : "Make backend default"}</span>
              </label>
            </div>

            <label className="grid gap-1 text-sm text-zinc-700">
              <span>Advanced params (JSON)</span>
              <textarea
                aria-label="Advanced params (JSON)"
                className="min-h-24 rounded-md border border-zinc-300 px-3 py-2 text-sm"
                value={profileForm.paramsJson}
                onChange={(event) => setProfileForm((current) => ({ ...current, paramsJson: event.target.value }))}
              />
            </label>

            {profileFeedback ? (
              <p role={profileFeedback.tone === "error" ? "alert" : "status"} className={`text-sm ${feedbackClassName(profileFeedback.tone)}`}>
                {profileFeedback.message}
              </p>
            ) : null}
            {profileTestFeedback ? (
              <p role={profileTestFeedback.tone === "error" ? "alert" : "status"} className={`text-sm ${feedbackClassName(profileTestFeedback.tone)}`}>
                {profileTestFeedback.message}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" className="nav-button-active" disabled={!canSubmitProfile}>
                <Save className="h-4 w-4" aria-hidden="true" />
                {profileSubmitting ? "Saving..." : "Save profile"}
              </button>
              {profileValidation ? <span className="text-xs text-zinc-500">{profileValidation}</span> : null}
            </div>
          </form>

          <section className="border border-zinc-200 bg-white">
            <div className="border-b border-zinc-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-zinc-950">Available research profiles</h2>
            </div>
            <div className="divide-y divide-zinc-200">
              {profiles.length === 0 ? (
                <p className="px-4 py-4 text-sm text-zinc-500">No profiles configured yet.</p>
              ) : (
                profiles.map((profile) => (
                  <div key={profile.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                    <label className="flex min-w-0 flex-1 items-start gap-3">
                      <input
                        type="radio"
                        name="research-profile"
                        aria-label={`Use ${profile.name} for research`}
                        checked={selectedProfileId === profile.id}
                        onChange={() => onSelectProfile(profile.id)}
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium text-zinc-950">{profile.name}</span>
                          {profile.is_default ? (
                            <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">Backend default</span>
                          ) : null}
                          {selectedProfileId === profile.id ? (
                            <span className="rounded bg-teal-50 px-2 py-0.5 text-xs text-teal-700">Active</span>
                          ) : null}
                          {profile.api_key ? (
                            <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">Key stored</span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">
                          {profile.provider} · {profile.model}
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
                      {profileTestingId === profile.id ? "Testing..." : `Test ${profile.name}`}
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </section>

        <section className="space-y-6">
          <form className="space-y-4 border border-zinc-200 bg-white p-4" onSubmit={handleMaxSourcesSubmit} aria-busy={maxSourcesSubmitting}>
            <div>
              <h2 className="text-sm font-semibold text-zinc-950">Search preference</h2>
              <p className="mt-1 text-xs text-zinc-500">Control how many sources a research run can collect.</p>
            </div>

            <label className="grid max-w-40 gap-1 text-sm text-zinc-700">
              <span>Max sources</span>
              <input
                aria-label="Max sources"
                type="number"
                min={1}
                max={50}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                value={maxSourcesInput}
                onChange={(event) => setMaxSourcesInput(event.target.value)}
              />
            </label>

            {maxSourcesState.error ? <p className="text-sm text-red-600">{maxSourcesState.error}</p> : null}
            {maxSourcesFeedback ? (
              <p role={maxSourcesFeedback.tone === "error" ? "alert" : "status"} className={`text-sm ${feedbackClassName(maxSourcesFeedback.tone)}`}>
                {maxSourcesFeedback.message}
              </p>
            ) : null}

            <button type="submit" className="nav-button-active" disabled={!canSaveMaxSources}>
              <Check className="h-4 w-4" aria-hidden="true" />
              {maxSourcesSubmitting ? "Saving..." : "Save source limit"}
            </button>
          </form>

          <form className="space-y-4 border border-zinc-200 bg-white p-4" onSubmit={handleServerSubmit} aria-busy={serverSubmitting}>
            <div>
              <h2 className="text-sm font-semibold text-zinc-950">MCP servers</h2>
              <p className="mt-1 text-xs text-zinc-500">Register MCP servers for research tools without exposing stored secrets.</p>
            </div>

            <div className="grid gap-3">
              <label className="grid gap-1 text-sm text-zinc-700">
                <span>MCP server name</span>
                <input
                  aria-label="MCP server name"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  value={serverForm.name}
                  onChange={(event) => setServerForm((current) => ({ ...current, name: event.target.value }))}
                />
              </label>

              <label className="grid gap-1 text-sm text-zinc-700">
                <span>Transport</span>
                <select
                  aria-label="Transport"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  value={serverForm.transport}
                  onChange={(event) => setServerForm((current) => ({ ...current, transport: event.target.value }))}
                >
                  <option value="stdio">stdio</option>
                  <option value="http">http</option>
                </select>
              </label>

              {serverForm.transport === "stdio" ? (
                <>
                  <label className="grid gap-1 text-sm text-zinc-700">
                    <span>Command</span>
                    <input
                      aria-label="Command"
                      className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                      value={serverForm.command}
                      onChange={(event) => setServerForm((current) => ({ ...current, command: event.target.value }))}
                    />
                  </label>
                  <label className="grid gap-1 text-sm text-zinc-700">
                    <span>Arguments (one per line)</span>
                    <textarea
                      aria-label="Arguments (one per line)"
                      className="min-h-24 rounded-md border border-zinc-300 px-3 py-2 text-sm"
                      value={serverForm.argsText}
                      onChange={(event) => setServerForm((current) => ({ ...current, argsText: event.target.value }))}
                    />
                  </label>
                </>
              ) : (
                <label className="grid gap-1 text-sm text-zinc-700">
                  <span>URL</span>
                  <input
                    aria-label="URL"
                    className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                    value={serverForm.url}
                    onChange={(event) => setServerForm((current) => ({ ...current, url: event.target.value }))}
                  />
                </label>
              )}

              <label className="grid gap-1 text-sm text-zinc-700">
                <span>Environment variables (KEY=value)</span>
                <textarea
                  aria-label="Environment variables (KEY=value)"
                  className="min-h-24 rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  value={serverForm.envText}
                  onChange={(event) => setServerForm((current) => ({ ...current, envText: event.target.value }))}
                />
              </label>
            </div>

            {serverValidation ? <p className="text-sm text-zinc-500">{serverValidation}</p> : null}
            {serverFeedback ? (
              <p role={serverFeedback.tone === "error" ? "alert" : "status"} className={`text-sm ${feedbackClassName(serverFeedback.tone)}`}>
                {serverFeedback.message}
              </p>
            ) : null}

            <button type="submit" className="nav-button-active" disabled={!canSubmitServer}>
              <Save className="h-4 w-4" aria-hidden="true" />
              {serverSubmitting ? "Saving..." : "Save server"}
            </button>
          </form>

          <section className="border border-zinc-200 bg-white">
            <div className="border-b border-zinc-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-zinc-950">Registered servers</h2>
            </div>
            <div className="divide-y divide-zinc-200">
              {servers.length === 0 ? (
                <p className="px-4 py-4 text-sm text-zinc-500">No MCP servers configured yet.</p>
              ) : (
                servers.map((server) => (
                  <div key={server.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-zinc-950">{server.name}</span>
                      <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">{server.transport}</span>
                      {!server.enabled ? <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">Disabled</span> : null}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {server.transport === "stdio"
                        ? [server.command, server.args?.join(" ")].filter(Boolean).join(" ")
                        : server.url ?? "No URL configured"}
                    </div>
                    {server.env ? (
                      <div className="mt-1 text-xs text-zinc-500">Env keys: {Object.keys(server.env).join(", ")}</div>
                    ) : null}
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
