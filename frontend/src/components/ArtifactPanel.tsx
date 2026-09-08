import { Copy, Download, FileJson, FileText } from "lucide-react";
import { api } from "../api/client";
import type { ProjectArtifactSummary } from "../api/types";

export function ArtifactPanel({ artifacts }: { artifacts: ProjectArtifactSummary[] }) {
  if (!artifacts.length) return null;
  async function copyArtifact(id: number) {
    const artifact = await api.getArtifact(id);
    await navigator.clipboard.writeText(artifact.content_text);
  }
  return <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm" data-testid="artifact-panel">
    <h3 className="text-sm font-semibold text-zinc-950">开发交付物</h3>
    <p className="mt-1 text-xs text-zinc-500">可直接交给开发者或编码 Agent，命令仅作建议，不会由 StartSpec 执行。</p>
    <div className="mt-3 grid gap-2 sm:grid-cols-2">{artifacts.map((artifact) => <article key={artifact.id} className="rounded-lg border border-zinc-200 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-zinc-900">{artifact.format === "json" ? <FileJson className="h-4 w-4" /> : <FileText className="h-4 w-4" />}{artifact.format === "json" ? "plan.json" : "STARTSPEC.md"}</div>
      <div className="mt-3 flex gap-2"><button type="button" className="nav-button" onClick={() => void copyArtifact(artifact.id)}><Copy className="h-4 w-4" />复制</button><a className="nav-button" href={api.artifactDownloadUrl(artifact.id)}><Download className="h-4 w-4" />下载</a></div>
    </article>)}</div>
  </section>;
}
