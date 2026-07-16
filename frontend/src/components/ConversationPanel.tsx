import type { ConversationRead } from "../api/types";
import { useI18n } from "../i18n/I18nProvider";
import { translateStatus } from "../i18n/messages";

type ConversationPanelProps = {
  conversations: ConversationRead[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onCreate: () => void;
};

export function ConversationPanel({ conversations, activeId, onSelect, onCreate }: ConversationPanelProps) {
  const { t } = useI18n();

  return (
    <section className="flex h-full flex-col bg-white">
      <div className="flex items-center justify-between border-b border-zinc-200 p-4">
        <h2 className="text-sm font-semibold text-zinc-950">{t("conversation.history")}</h2>
        <button type="button" className="nav-button" onClick={onCreate}>
          {t("conversation.new")}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {conversations.length > 0 ? (
          <div className="space-y-2">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                aria-current={conversation.id === activeId ? "page" : undefined}
                className={
                  conversation.id === activeId
                    ? "w-full rounded-md bg-zinc-900 p-3 text-left text-sm text-white"
                    : "w-full rounded-md p-3 text-left text-sm text-zinc-700 hover:bg-zinc-100"
                }
                onClick={() => onSelect(conversation.id)}
              >
                <span className="block truncate font-medium">{conversation.title}</span>
                <span className="block text-xs opacity-70">{translateStatus(t, conversation.status)}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="p-3 text-sm text-zinc-500">{t("conversation.empty")}</div>
        )}
      </div>
    </section>
  );
}
