import { useEffect, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import type { ToolPolicy } from "../api/types";

export function ToolPolicyPanel({
  policies,
  onCreate,
  onUpdate,
  onDelete,
}: {
  policies: ToolPolicy[];
  onCreate: (payload: Omit<ToolPolicy, "id" | "version" | "created_at">) => Promise<void>;
  onUpdate: (id: number, payload: Omit<ToolPolicy, "id" | "version" | "created_at">) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [role, setRole] = useState("retriever");
  const [tool, setTool] = useState("fetch_page");
  const [domains, setDomains] = useState("");
  const [approval, setApproval] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (editing === null) return;
    const current = policies.find((item) => item.id === editing);
    if (!current) return;
    setRole(current.agent_role); setTool(current.tool_name); setDomains(current.allowed_domains.join("\n")); setApproval(current.require_approval);
  }, [editing, policies]);

  async function save() {
    setBusy(true);
    const payload = { agent_role: role.trim(), tool_name: tool.trim(), allowed_domains: domains.split(/\r?\n/).map((item) => item.trim()).filter(Boolean), require_approval: approval, enabled: true };
    try { if (editing === null) await onCreate(payload); else await onUpdate(editing, payload); setEditing(null); } finally { setBusy(false); }
  }

  return (
    <section className="space-y-4 border border-zinc-200 bg-white p-4">
      <div><h2 className="text-sm font-semibold text-zinc-950">Agent 工具权限</h2><p className="mt-1 text-xs text-zinc-500">未声明的工具默认需要本次任务确认；域名限制只适用于带 URL 参数的调用。</p></div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm"><span>Agent 角色</span><select className="rounded-md border border-zinc-300 px-3 py-2" value={role} onChange={(event) => setRole(event.target.value)}><option value="retriever">检索</option><option value="verifier">核验</option><option value="planner">规划</option><option value="writer">写作</option></select></label>
        <label className="grid gap-1 text-sm"><span>工具名称</span><input className="rounded-md border border-zinc-300 px-3 py-2" value={tool} onChange={(event) => setTool(event.target.value)} placeholder="fetch_page" /></label>
      </div>
      <label className="grid gap-1 text-sm"><span>允许的域名（每行一个，留空表示不限制）</span><textarea className="min-h-16 rounded-md border border-zinc-300 px-3 py-2" value={domains} onChange={(event) => setDomains(event.target.value)} /></label>
      <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={approval} onChange={(event) => setApproval(event.target.checked)} />每次新参数请求确认</label>
      <div className="flex gap-2"><button type="button" className="nav-button-active" disabled={busy || !role.trim() || !tool.trim()} onClick={() => void save()}>{editing === null ? <Plus className="h-4 w-4" /> : <Save className="h-4 w-4" />} {editing === null ? "新增规则" : "保存规则"}</button>{editing !== null ? <button type="button" className="nav-button" onClick={() => setEditing(null)}>取消</button> : null}</div>
      <div className="divide-y divide-zinc-200 border-t border-zinc-200">
        {policies.length === 0 ? <p className="py-3 text-sm text-zinc-500">暂无权限规则。</p> : policies.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><div><span className="font-medium">{item.agent_role} · {item.tool_name}</span><span className="ml-2 text-xs text-zinc-500">{item.allowed_domains.length ? item.allowed_domains.join(", ") : "所有域名"}{item.require_approval ? " · 需确认" : ""}</span></div><div className="flex gap-1"><button type="button" className="nav-button" onClick={() => setEditing(item.id)}>编辑</button><button type="button" className="nav-button" aria-label={`删除 ${item.agent_role} ${item.tool_name}`} onClick={() => void onDelete(item.id)}><Trash2 className="h-4 w-4" /></button></div></div>)}
      </div>
    </section>
  );
}
