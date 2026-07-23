import { BOOK_TOOLS, executeBookTool, manuscriptOutline } from "@/lib/bookTools";
import { getManuscript, countWords } from "@/lib/manuscript";
import { getSettings } from "@/lib/settings";
import { listMemories, memoryContext } from "@/lib/coachMemory";
import {
  TRIM_SIZES,
  getTrimById,
  trimParagraphMetrics,
} from "@/lib/kindleExport";
import FloatingAssistant from "@/components/FloatingAssistant";

async function buildSystem(): Promise<string> {
  const s = getSettings();
  const m = getManuscript();
  const memories = await listMemories();

  const roleLine = [
    "You are his book editor and writing partner for this manuscript — not a brainstorming buddy (that is the main Assistant tab).",
    "He will dictate story, discuss structure, or ask you to write and polish. Your job: clean chapters/pages, even print pagination for the trim, and the prose tools from writing (grammar, tighten, rephrase, continue, expand, tone, title).",
    "CRITICAL page layout: never leave a nearly empty page followed by a packed page. After writing or restructuring, always run editorial_pass (or replace_structure with its default pass) so sentences fill each page to capacity. Do not invent sparse one-paragraph pages mid-chapter.",
    "Writing help: edit_page (grammar|tighten|rephrase), continue_writing, expand_page, rewrite_tone, suggest_title — same capabilities the old Writing tab had, applied to book pages.",
    "Workflow when he dictates: replace_structure into chapters, then editorial_pass / size if needed. When pages look uneven: editorial_pass.",
    "If no book is open, start_blank_book or replace_structure. After acting, confirm briefly and invite review. Questions only → no tools.",
  ].join(" ");

  const sizesLine = `Available trim sizes: ${TRIM_SIZES.map((t) => t.id).join(", ")}.`;

  if (!m) {
    return [
      s.persona,
      roleLine,
      sizesLine,
      "There is no book open yet. Start one with start_blank_book, or build it from what he says with replace_structure.",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  const trim = getTrimById(m.trimId);
  const metrics = trimParagraphMetrics(trim);
  const words = m.pages.reduce((n, p) => n + countWords(p), 0);
  const titleLine = `The open book is titled "${m.title || "Untitled"}" — ${m.pages.length} pages, ~${words} words. Page numbers in tools are 1-based. Fill pages in reading order to ~${metrics.wordsPerPage} words each; overflow goes to the next page — no sparse mid-chapter pages.`;
  const trimLine = `Current trim: ${trim.label} (id ${trim.id}). Capacity ~${metrics.wordsPerPage} words / ~${metrics.linesPerPage} lines per page; target ~${metrics.wordsPerParagraph} words per paragraph.`;

  return [
    s.persona,
    roleLine,
    sizesLine,
    titleLine,
    trimLine,
    manuscriptOutline(m),
    memoryContext(memories),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export interface BookAssistantProps {
  /** Called after a tool changes the manuscript so the editor can refresh. */
  onChanged: () => void;
}

/**
 * Book-tab floating assistant — the author's book editor via chat/voice.
 * Leaves the main Assistant tab as brainstorm-only.
 */
export default function BookAssistant({ onChanged }: BookAssistantProps) {
  return (
    <FloatingAssistant
      title="Book editor"
      subtitle="Write, structure & polish"
      emptyHint='Dictate a chapter, ask to “fix grammar on page 2”, “continue writing”, “make this 5x8”, or “fix uneven pages”. Tap the mic to talk.'
      storageKey="book"
      buildSystem={buildSystem}
      placeholder="Write, dictate, or tell me how to edit…"
      bubbleTitle="Book editor"
      tools={BOOK_TOOLS}
      executeTool={executeBookTool}
      onAction={onChanged}
      voiceChat
    />
  );
}
