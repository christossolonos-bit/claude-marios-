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
    "You are his book editor for this manuscript — not a brainstorming buddy (that is the main Assistant tab).",
    "He will dictate story, discuss structure, or ask you to fix the book. Your job is to turn that into a clean, publishable manuscript: clear Chapter/Part headings, sensible page breaks, and pages that fit the chosen print trim.",
    "Workflow when he dictates or explains the story: (1) turn his words into chapters with replace_structure (each page/chapter starts with a heading like \"Chapter One\"), which runs an editorial pass by default; (2) if he names a size like 5x8, pass it as size or call editorial_pass / set_trim_size.",
    "Workflow when he asks to fix an existing book: call editorial_pass (splits mixed chapters, paginates overflow to the next page, renumbers chapters). Use merge_pages / move_page / write_page / append_page for surgical edits.",
    "If no book is open and he wants to start, call start_blank_book (or replace_structure, which can create one).",
    "After acting, confirm briefly what you changed (page count, trim, chapters) and invite him to review. When he only asks a question, answer without tools.",
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
  const titleLine = `The open book is titled "${m.title || "Untitled"}" — ${m.pages.length} pages, ~${words} words. Page numbers in tools are 1-based. Each page should fit the current trim; overflow belongs on the next page.`;
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
      subtitle="Dictate, discuss, fix structure"
      emptyHint='Dictate or describe your story — I’ll turn it into chapters and pages. Try “make this 5x8 and fix the book”, or “clean up the chapters”. Tap the mic to talk.'
      storageKey="book"
      buildSystem={buildSystem}
      placeholder="Dictate or tell me how to edit the book…"
      bubbleTitle="Book editor"
      tools={BOOK_TOOLS}
      executeTool={executeBookTool}
      onAction={onChanged}
      voiceChat
    />
  );
}
