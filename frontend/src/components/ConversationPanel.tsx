import type { ConversationRead } from "../api/types";

type ConversationPanelProps = {
  conversations: ConversationRead[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onCreate: () => void;
};

export function ConversationPanel({ conversations, activeId, onSelect, onCreate }: ConversationPanelProps) {
  return (
    <section className="flex h-full flex-col bg-white">
      <div className="flex items-center justify-between border-b border-zinc-200 p-4">
        <h2 className="text-sm font-semibold text-zinc-950">History</h2>
        <button type="button" className="nav-button" onClick={onCreate}>
          New
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {conversations.length > 0 ? (
          <div className="space-y-2">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                className={
                  conversation.id === activeId
                    ? "w-full rounded-md bg-zinc-900 p-3 text-left text-sm text-white"
                    : "w-full rounded-md p-3 text-left text-sm text-zinc-700 hover:bg-zinc-100"
                }
                onClick={() => onSelect(conversation.id)}
              >
                <span className="block truncate font-medium">{conversation.title}</span>
                <span className="block text-xs opacity-70">{conversation.status}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="p-3 text-sm text-zinc-500">No conversations yet</div>
        )}
      </div>
    </section>
  );
}
