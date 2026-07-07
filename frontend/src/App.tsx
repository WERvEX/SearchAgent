import { useEffect, useMemo, useState } from "react";
import { api } from "./api/client";
import type { ConversationDetail, ConversationRead, LLMProfileRead, ResearchRunResponse } from "./api/types";
import { AppPanel, AppShell } from "./components/AppShell";
import { ConversationPanel } from "./components/ConversationPanel";
import { PlanPanel, type ResearchPlan } from "./components/PlanPanel";
import { ResearchWorkspace } from "./components/ResearchWorkspace";

export default function App() {
  const [activePanel, setActivePanel] = useState<AppPanel>("research");
  const [conversations, setConversations] = useState<ConversationRead[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [activeConversation, setActiveConversation] = useState<ConversationDetail | null>(null);
  const [profiles, setProfiles] = useState<LLMProfileRead[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [currentRun, setCurrentRun] = useState<ResearchRunResponse | null>(null);
  const [statusMessage, setStatusMessage] = useState("Loading workspace...");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialState() {
      try {
        setErrorMessage(null);
        const [conversationList, profileList] = await Promise.all([api.listConversations(), api.listLLMProfiles()]);
        if (cancelled) {
          return;
        }

        setConversations(conversationList);
        setProfiles(profileList);

        const defaultProfile = profileList.find((profile) => profile.is_default) ?? profileList[0] ?? null;
        setSelectedProfileId(defaultProfile?.id ?? null);

        if (conversationList[0]) {
          setActiveConversationId(conversationList[0].id);
        } else {
          setStatusMessage("Create a conversation to begin.");
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to load workspace.");
          setStatusMessage("Unable to load workspace.");
        }
      }
    }

    void loadInitialState();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (activeConversationId === null) {
      setActiveConversation(null);
      setCurrentRun(null);
      return;
    }

    const conversationId = activeConversationId;
    let cancelled = false;

    async function loadConversation() {
      try {
        setErrorMessage(null);
        const detail = await api.getConversation(conversationId);
        if (cancelled) {
          return;
        }
        setActiveConversation(detail);
        setCurrentRun(null);
        setStatusMessage("Ready for research.");
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to load conversation.");
        }
      }
    }

    void loadConversation();

    return () => {
      cancelled = true;
    };
  }, [activeConversationId]);

  const plan = useMemo(() => {
    const payload = currentRun?.interrupt_payload;
    if (!payload) {
      return null;
    }

    const summary = typeof payload.summary === "string" ? payload.summary : undefined;
    const rawOptions = Array.isArray(payload.options) ? payload.options : [];
    const options = rawOptions
      .map((option) => {
        if (!option || typeof option !== "object") {
          return null;
        }

        const id = "id" in option && typeof option.id === "string" ? option.id : null;
        const title = "title" in option && typeof option.title === "string" ? option.title : null;
        const description =
          "description" in option && typeof option.description === "string" ? option.description : undefined;

        return id && title ? { id, title, description } : null;
      })
      .filter((option): option is NonNullable<typeof option> => option !== null);

    const result: ResearchPlan = {};
    if (summary) {
      result.summary = summary;
    }
    if (options.length > 0) {
      result.options = options;
    }
    return result;
  }, [currentRun]);

  async function handleCreateConversation() {
    try {
      setErrorMessage(null);
      const created = await api.createConversation("Untitled");
      setConversations((current) => [created, ...current]);
      setActiveConversationId(created.id);
      setStatusMessage("Conversation created.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create conversation.");
    }
  }

  async function handleStartResearch(message: string) {
    if (!activeConversation || !selectedProfileId) {
      return;
    }

    try {
      setErrorMessage(null);
      const run = await api.startResearch({
        conversation_id: activeConversation.id,
        profile_id: selectedProfileId,
        user_message: message,
      });
      setCurrentRun(run);
      const detail = await api.getConversation(activeConversation.id);
      setActiveConversation(detail);
      setConversations((current) =>
        current.map((conversation) => (conversation.id === detail.id ? detail : conversation)),
      );
      setStatusMessage(run.interrupted ? "Plan decision required." : "Research started.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to start research.");
    }
  }

  async function handleResumeResearch(decision: { approved: true; chosen_option: string } | { approved: false; feedback: string }) {
    if (!currentRun || !selectedProfileId || !activeConversation) {
      return;
    }

    try {
      setErrorMessage(null);
      const run = await api.resumeResearch(currentRun.thread_id, {
        profile_id: selectedProfileId,
        decision,
      });
      setCurrentRun(run);
      const detail = await api.getConversation(activeConversation.id);
      setActiveConversation(detail);
      setConversations((current) =>
        current.map((conversation) => (conversation.id === detail.id ? detail : conversation)),
      );
      setStatusMessage(run.interrupted ? "Plan decision required." : "Research resumed.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to resume research.");
    }
  }

  return (
    <AppShell
      activePanel={activePanel}
      onPanelChange={setActivePanel}
      left={
        <ConversationPanel
          conversations={conversations}
          activeId={activeConversationId}
          onSelect={setActiveConversationId}
          onCreate={handleCreateConversation}
        />
      }
      main={
        activePanel === "settings" ? (
          <div className="p-6 text-sm text-zinc-600">Settings panel is not part of Task 3.</div>
        ) : (
          <div className="flex h-full flex-col">
            <div className="border-b border-zinc-200 bg-zinc-50 px-6 py-3 text-sm text-zinc-600">
              <div>{statusMessage}</div>
              {selectedProfileId ? (
                <div className="mt-1 text-xs text-zinc-500">
                  Profile: {profiles.find((profile) => profile.id === selectedProfileId)?.name ?? "Selected"}
                </div>
              ) : (
                <div className="mt-1 text-xs text-amber-700">No LLM profile available.</div>
              )}
              {errorMessage ? <div className="mt-1 text-xs text-red-600">{errorMessage}</div> : null}
            </div>
            <div className="min-h-0 flex-1">
              <ResearchWorkspace
                conversation={activeConversation}
                profileId={selectedProfileId}
                currentRun={currentRun}
                onStart={handleStartResearch}
              />
            </div>
          </div>
        )
      }
      right={
        activePanel === "settings" ? (
          <div className="p-4 text-sm text-zinc-600">Progress stream and reports are out of scope for Task 3.</div>
        ) : (
          <PlanPanel
            interrupted={currentRun?.interrupted ?? false}
            plan={plan}
            onApprove={handleResumeResearch}
            onReplan={handleResumeResearch}
          />
        )
      }
    />
  );
}
