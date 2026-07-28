export type ReportReference = {
  id: number;
  title: string;
  url: string;
};

export type ReportSection = {
  id: string;
  title: string;
  level: number;
  markdown: string;
};

export type ParsedReport = {
  title: string;
  objective: ReportSection | null;
  summary: ReportSection | null;
  sections: ReportSection[];
  references: ReportReference[];
};

const referencePattern = /^\[\^(\d+)\]:\s+\[([^\]]+)\]\(([^)]+)\)\s*$/;
const headingPattern = /^(#{1,3})\s+(.+?)\s*$/;

function slug(value: string, index: number) {
  const normalized = value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
  return normalized || `section-${index}`;
}

function normalizeCitations(markdown: string, referenceIds: Set<number>) {
  return markdown
    .replace(/\[\^(\d+)\]/g, (raw, id) => (
      referenceIds.has(Number(id)) ? `[${id}](#source-${id})` : `[${id}]`
    ))
    .replace(/(?<![\^!])\[(\d+)\](?!\()/g, (raw, id) => (
      referenceIds.has(Number(id)) ? `[${id}](#source-${id})` : raw
    ));
}

export function parseReportMarkdown(markdown: string): ParsedReport {
  const references: ReportReference[] = [];
  const contentLines: string[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const reference = line.trim().match(referencePattern);
    if (reference) {
      references.push({ id: Number(reference[1]), title: reference[2].trim(), url: reference[3].trim() });
    } else {
      contentLines.push(line);
    }
  }
  references.sort((a, b) => a.id - b.id);
  const referenceIds = new Set(references.map((item) => item.id));

  let title = "";
  const sections: ReportSection[] = [];
  let current: { title: string; level: number; lines: string[] } | null = null;
  for (const line of contentLines) {
    const heading = line.match(headingPattern);
    if (heading) {
      const level = heading[1].length;
      const headingTitle = heading[2].trim();
      if (level === 1 && !title) {
        title = headingTitle;
        current = { title: headingTitle, level, lines: [] };
        continue;
      }
      if (current) {
        const sectionMarkdown = normalizeCitations(current.lines.join("\n").trim(), referenceIds);
        if (sectionMarkdown) {
          sections.push({
            id: slug(current.title, sections.length),
            title: current.title,
            level: current.level,
            markdown: sectionMarkdown,
          });
        }
      }
      current = { title: headingTitle, level, lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) {
    const sectionMarkdown = normalizeCitations(current.lines.join("\n").trim(), referenceIds);
    if (sectionMarkdown) {
      sections.push({
        id: slug(current.title, sections.length),
        title: current.title,
        level: current.level,
        markdown: sectionMarkdown,
      });
    }
  }

  const isObjective = (value: string) => /^(研究目标|research objective)$/i.test(value.trim());
  const isSummary = (value: string) => /^(执行摘要|摘要|executive summary|summary)$/i.test(value.trim());
  const isReferences = (value: string) => /^(参考来源|参考文献|references)$/i.test(value.trim());
  const objective = sections.find((section) => isObjective(section.title)) ?? null;
  const summary = sections.find((section) => isSummary(section.title)) ?? null;
  return {
    title: title || "Research Report",
    objective,
    summary,
    sections: sections.filter((section) => (
      section !== objective && section !== summary && !isReferences(section.title)
    )),
    references,
  };
}
