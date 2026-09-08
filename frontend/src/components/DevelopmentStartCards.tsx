import { Check, Code2, FileJson, FileText, FolderSearch2, GitFork, RefreshCw, ShieldCheck } from "lucide-react";
import { useState } from "react";

export type DevelopmentPrompt = {
  phase?: string;
  problem_definition?: Record<string, unknown>;
  candidates?: Array<Record<string, unknown>>;
  repository_snapshot?: Record<string, unknown>;
  repository_snapshot_id?: number;
};

export function ProblemDefinitionCard({
  problem,
  onConfirm,
  onContinue,
}: {
  problem: Record<string, unknown>;
  onConfirm?: (confirmed: boolean, feedback?: string) => void;
  onContinue?: (message: string) => void;
}) {
  const [feedback, setFeedback] = useState("");
  const entries = Object.entries(problem).filter(([key, value]) => key !== "confirmed" && value);
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm" data-testid="problem-definition-card">
      <div className="flex items-center gap-2 text-sm font-semibold text-zinc-950"><Code2 className="h-4 w-4" />问题定义</div>
      <dl className="mt-3 space-y-2 text-sm">
        {entries.map(([key, value]) => <div key={key}><dt className="font-medium text-zinc-700">{key}</dt><dd className="text-zinc-600">{Array.isArray(value) ? value.join("、") : String(value)}</dd></div>)}
      </dl>
      <textarea className="mt-3 min-h-16 w-full rounded-md border border-zinc-300 p-2 text-sm outline-none transition focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900" value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="补充或修改问题定义" />
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="nav-button" onClick={() => onContinue?.(feedback)} disabled={!feedback.trim()}>继续梳理</button>
        <button type="button" className="nav-button-active" onClick={() => onConfirm?.(true, feedback)}><Check className="h-4 w-4" />确认问题</button>
      </div>
    </section>
  );
}

export function RepositoryContextCard({ onSubmit, pending = false }: {
  onSubmit?: (path: string | null, excludePatterns?: string[]) => void;
  pending?: boolean;
}) {
  const [path, setPath] = useState("");
  const [excludes, setExcludes] = useState("");
  const excludePatterns = excludes.split(",").map((item) => item.trim()).filter(Boolean);
  return <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm" data-testid="repository-context-card">
    <div className="flex items-center gap-2 text-sm font-semibold text-zinc-950"><FolderSearch2 className="h-4 w-4" />现有代码库</div>
    <p className="mt-2 text-sm leading-6 text-zinc-600">输入本机绝对路径进行只读扫描。StartSpec 不会执行仓库脚本、安装依赖或修改文件。</p>
    <div className="mt-3 flex items-center gap-2 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600"><ShieldCheck className="h-4 w-4" />自动忽略密钥、环境变量、依赖和构建目录</div>
    <input aria-label="代码库绝对路径" className="mt-3 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900" value={path} onChange={(event) => setPath(event.target.value)} placeholder="例如 D:\\Projects\\example" />
    <input aria-label="额外排除目录" className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900" value={excludes} onChange={(event) => setExcludes(event.target.value)} placeholder="额外排除目录，用逗号分隔（可选）" />
    <div className="mt-3 flex justify-end gap-2">
      <button type="button" className="nav-button" disabled={pending} onClick={() => onSubmit?.(null)}>跳过</button>
      <button type="button" className="nav-button-active" disabled={pending || !path.trim()} onClick={() => onSubmit?.(path.trim(), excludePatterns)}>{pending ? "扫描中" : "分析仓库"}</button>
    </div>
  </section>;
}

export function RepositoryAnalysisCard({ snapshot, onReview, pending = false }: {
  snapshot: Record<string, unknown>;
  onReview?: (confirmed: boolean, excludePatterns?: string[]) => void;
  pending?: boolean;
}) {
  const frameworks = Array.isArray(snapshot.frameworks) ? snapshot.frameworks.map(String) : [];
  const relevant = Array.isArray(snapshot.relevant_files) ? snapshot.relevant_files as Array<Record<string, unknown>> : [];
  const languages = Array.isArray(snapshot.languages) ? snapshot.languages as Array<Record<string, unknown>> : [];
  const warnings = Array.isArray(snapshot.warnings) ? snapshot.warnings.map(String) : [];
  const [excludes, setExcludes] = useState("");
  const excludePatterns = excludes.split(",").map((item) => item.trim()).filter(Boolean);
  return <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm" data-testid="repository-analysis-card">
    <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2 text-sm font-semibold text-zinc-950"><FolderSearch2 className="h-4 w-4" />仓库扫描结果</div><span className={`rounded-full px-2 py-1 text-xs ${snapshot.scan_status === "partial" ? "bg-amber-100 text-amber-800" : "bg-zinc-900 text-white"}`}>{String(snapshot.scan_status ?? "complete")}</span></div>
    <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-zinc-500">仓库 / 分支</dt><dd className="font-medium text-zinc-900">{String(snapshot.repository_name ?? "-")} / {String(snapshot.branch ?? "-")}</dd></div><div><dt className="text-zinc-500">技术栈</dt><dd className="font-medium text-zinc-900">{frameworks.join("、") || "待进一步识别"}</dd></div></dl>
    <div className="mt-3 flex flex-wrap gap-1">{languages.slice(0, 8).map((item) => <span key={String(item.extension)} className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-600">{String(item.extension)} · {String(item.files)}</span>)}</div>
    {relevant.length ? <div className="mt-3"><div className="text-xs font-medium text-zinc-500">与目标相关的文件</div><ul className="mt-1 space-y-1 text-xs text-zinc-700">{relevant.slice(0, 8).map((item) => <li key={String(item.id)}><code>{String(item.path)}</code></li>)}</ul></div> : null}
    {warnings.length ? <p className="mt-3 text-xs text-amber-700">扫描未完全覆盖：{warnings.join("、")}</p> : null}
    <input aria-label="重新扫描排除目录" className="mt-3 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900" value={excludes} onChange={(event) => setExcludes(event.target.value)} placeholder="重新扫描时额外排除目录（可选）" />
    <div className="mt-3 flex justify-end gap-2"><button type="button" className="nav-button" disabled={pending} onClick={() => onReview?.(false, excludePatterns)}><RefreshCw className="h-4 w-4" />重新扫描</button><button type="button" className="nav-button-active" disabled={pending} onClick={() => onReview?.(true)}><Check className="h-4 w-4" />确认上下文</button></div>
  </section>;
}

export function CandidateDecisionCard({
  candidates,
  onSubmit,
}: {
  candidates: Array<Record<string, unknown>>;
  onSubmit?: (selections: Array<{ candidate_key: string; decision: "reference" | "adopt" }>) => void;
}) {
  const [decisions, setDecisions] = useState<Record<string, "reference" | "adopt">>({});
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm" data-testid="candidate-decision-card">
      <div className="flex items-center gap-2 text-sm font-semibold text-zinc-950"><GitFork className="h-4 w-4" />候选项目与服务</div>
      <div className="mt-3 space-y-3">
        {candidates.map((candidate, index) => {
          const key = String(candidate.candidate_key ?? candidate.url ?? index);
          const decision = decisions[key];
          return <article key={key} className="rounded-md border border-zinc-200 p-3 transition-colors hover:border-zinc-300">
            <a className="font-medium text-zinc-900 underline" href={String(candidate.url ?? "")} target="_blank" rel="noreferrer">{String(candidate.title ?? candidate.url ?? "候选")}</a>
            <p className="mt-1 text-sm text-zinc-600">{String(candidate.description ?? "暂无简介")}</p>
            <div className="segmented-control mt-3" role="group" aria-label={`${String(candidate.title ?? "候选")} 的决策`}>
              <button type="button" className={`segmented-control-option ${decision === "reference" ? "segmented-control-option-active" : ""}`} aria-pressed={decision === "reference"} onClick={() => setDecisions((current) => ({ ...current, [key]: "reference" }))}>参考</button>
              <button type="button" className={`segmented-control-option ${decision === "adopt" ? "segmented-control-option-active" : ""}`} aria-pressed={decision === "adopt"} onClick={() => setDecisions((current) => ({ ...current, [key]: "adopt" }))}>采用</button>
            </div>
          </article>;
        })}
      </div>
      <div className="mt-3 flex justify-end"><button type="button" className="nav-button-active" disabled={Object.keys(decisions).length !== candidates.length} onClick={() => onSubmit?.(Object.entries(decisions).map(([candidate_key, decision]) => ({ candidate_key, decision })))}>确认候选决策</button></div>
    </section>
  );
}

export function OutputModeCard({ onSubmit, pending = false }: { onSubmit?: (modes: Array<"human" | "ai">) => void; pending?: boolean }) {
  const [human, setHuman] = useState(true);
  const [ai, setAi] = useState(false);
  return <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm" data-testid="output-mode-card">
    <div className="text-sm font-semibold text-zinc-950">选择输出格式</div>
    <div className="mt-3 grid gap-2 sm:grid-cols-2 text-sm">
      <label className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 transition-colors ${human ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400"}`}><input className="accent-zinc-900" type="checkbox" checked={human} onChange={(event) => setHuman(event.target.checked)} /><FileText className="h-4 w-4" />人类 Markdown</label>
      <label className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 transition-colors ${ai ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400"}`}><input className="accent-zinc-900" type="checkbox" checked={ai} onChange={(event) => setAi(event.target.checked)} /><FileJson className="h-4 w-4" />AI JSON</label>
    </div>
    <button type="button" className="nav-button-active mt-3" disabled={pending || (!human && !ai)} onClick={() => onSubmit?.([...(human ? ["human" as const] : []), ...(ai ? ["ai" as const] : [])])}>{pending ? "执行中" : "确认并执行"}</button>
  </section>;
}
