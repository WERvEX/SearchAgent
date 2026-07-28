import { useState } from "react";
import { Check, MessageSquare, PanelLeftClose, Pencil, Plus, Trash2, X } from "lucide-react";
import type { ConversationRead } from "../api/types";
import { useI18n } from "../i18n/I18nProvider";
import { translateStatus } from "../i18n/messages";

type ConversationPanelProps = {
  conversations: ConversationRead[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onRename: (id: number, title: string) => Promise<void> | void;
  onDelete: (id: number) => Promise<boolean> | boolean;
  onCollapse?: () => void;
  collapsed?: boolean;
};

export function ConversationPanel({ conversations, activeId, onSelect, onCreate, onRename, onDelete, onCollapse, collapsed = false }: ConversationPanelProps) {
  const { t } = useI18n();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [titleInput, setTitleInput] = useState("");

  async function submitRename(id: number) {
    const title = titleInput.trim();
    if (!title) {
      return;
    }
    await onRename(id, title);
    setEditingId(null);
  }

  async function confirmDelete(id: number) {
    if (await onDelete(id)) {
      setDeletingId(null);
    }
  }

  return (
    <section className="flex h-full flex-col bg-white">
      <div className={`border-b border-zinc-200 ${collapsed ? "p-2" : "p-3"}`}>
        {collapsed ? null : (
          <div className="flex items-center justify-between px-1 pb-3">
            <h2 className="text-sm font-semibold text-zinc-950">{t("conversation.history")}</h2>
            <button
              type="button"
              className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950"
              aria-label={t("conversation.collapse")}
              onClick={onCollapse}
            >
              <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
        <button
          type="button"
          className={`flex items-center rounded-xl border border-zinc-300 bg-zinc-50 text-left text-sm font-medium text-zinc-900 hover:border-zinc-400 hover:bg-white ${
            collapsed ? "h-10 w-10 justify-center" : "h-12 w-full gap-3 px-4"
          }`}
          aria-label={t("conversation.new")}
          onClick={onCreate}
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current" aria-hidden="true">
            <Plus className="h-3.5 w-3.5" />
          </span>
          {collapsed ? null : t("conversation.new")}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {conversations.length > 0 ? (
          <div className="space-y-2">
            {conversations.map((conversation) => {
              const active = conversation.id === activeId;
              return (
                <div key={conversation.id} className={active ? "rounded-md bg-zinc-900 p-2 text-white" : "rounded-md p-2 text-zinc-700 hover:bg-zinc-100"}>
                  {deletingId === conversation.id ? (
                    <div className="space-y-2 p-1 text-sm">
                      <p>{t("conversation.deleteConfirm", { title: conversation.title })}</p>
                      <div className="flex gap-2">
                        <button type="button" className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700" onClick={() => void confirmDelete(conversation.id)}>
                          {t("conversation.confirmDelete")}
                        </button>
                        <button type="button" className="rounded border border-current px-2 py-1 text-xs" onClick={() => setDeletingId(null)}>
                          {t("conversation.cancelDelete")}
                        </button>
                      </div>
                    </div>
                  ) : editingId === conversation.id ? (
                    <form className="flex items-center gap-1" onSubmit={(event) => { event.preventDefault(); void submitRename(conversation.id); }}>
                      <input
                        autoFocus
                        aria-label={t("conversation.rename")}
                        className="min-w-0 flex-1 rounded border border-zinc-300 px-2 py-1 text-sm text-zinc-950"
                        value={titleInput}
                        onChange={(event) => setTitleInput(event.target.value)}
                      />
                      <button type="submit" aria-label={t("conversation.saveTitle")} className="rounded p-1 hover:bg-white/20"><Check className="h-4 w-4" /></button>
                      <button type="button" aria-label={t("conversation.cancelRename")} className="rounded p-1 hover:bg-white/20" onClick={() => setEditingId(null)}><X className="h-4 w-4" /></button>
                    </form>
                  ) : (
                    <div className="flex items-start gap-1">
                      <button
                        type="button"
                        aria-current={active ? "page" : undefined}
                        className={`min-w-0 flex-1 p-1 text-sm ${collapsed ? "text-center" : "text-left"}`}
                        onClick={() => onSelect(conversation.id)}
                      >
                        {collapsed ? <MessageSquare className="mx-auto h-4 w-4" aria-hidden="true" /> : (
                          <>
                            <span className="block truncate font-medium">{conversation.title}</span>
                            <span className="block text-xs opacity-70">{translateStatus(t, conversation.status)}</span>
                          </>
                        )}
                      </button>
                      {collapsed ? null : (
                        <>
                      <button
                        type="button"
                        aria-label={t("conversation.renameTitle", { title: conversation.title })}
                        className="rounded p-1 opacity-70 hover:bg-white/20 hover:opacity-100"
                        onClick={() => { setEditingId(conversation.id); setTitleInput(conversation.title); }}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={t("conversation.deleteTitle", { title: conversation.title })}
                        className="rounded p-1 opacity-70 hover:bg-red-600 hover:text-white hover:opacity-100"
                        onClick={() => setDeletingId(conversation.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-3 text-sm text-zinc-500">{t("conversation.empty")}</div>
        )}
      </div>
    </section>
  );
}
