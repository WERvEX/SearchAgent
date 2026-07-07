import { useState } from "react";
import { Send } from "lucide-react";
import type { ConversationDetail, ResearchRunResponse } from "../api/types";

type ResearchWorkspaceProps = {
  conversation: ConversationDetail | null;
  profileId: number | null;
  currentRun: ResearchRunResponse | null;
  onStart: (message: string) => void;
};

export function ResearchWorkspace({ conversation, profileId, currentRun, onStart }: ResearchWorkspaceProps) {
  const [message, setMessage] = useState("");
  const trimmed = message.trim();
  const disabled = !conversation || !profileId || trimmed.length === 0;

  return (
    <section className="flex h-full flex-col">
      <div className="border-b border-zinc-200 bg-white p-4">
        <h1 className="text-base font-semibold text-zinc-950">
          {conversation?.title ?? "Select or create a conversation"}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {currentRun?.interrupted ? "Plan decision required" : "Ready for research"}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {conversation?.messages.length ? (
          <div className="space-y-3">
            {conversation.messages.map((item) => (
              <div key={item.id} className="rounded-md border border-zinc-200 bg-white p-3 text-sm">
                <div className="mb-1 text-xs uppercase text-zinc-500">{item.role}</div>
                <div className="whitespace-pre-wrap text-zinc-900">{item.content}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-zinc-200 bg-white p-4 text-sm text-zinc-500">
            {conversation ? "No messages yet. Start a research request." : "Choose a conversation to view its activity."}
          </div>
        )}
      </div>

      <form
        className="flex gap-2 border-t border-zinc-200 bg-white p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (disabled) {
            return;
          }
          onStart(trimmed);
          setMessage("");
        }}
      >
        <textarea
          className="h-20 min-w-0 flex-1 rounded-md border border-zinc-300 p-3 text-sm"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          aria-label="Research request"
        />
        <button type="submit" className="nav-button-active self-end" disabled={disabled}>
          <Send className="h-4 w-4" aria-hidden="true" />
          Start
        </button>
      </form>
    </section>
  );
}
