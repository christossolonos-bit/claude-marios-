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

  const roleLine =
    "You are his book organizer. He talks through what he wants in the story — plot, chapters, parts, scenes — and you structure the manuscript accordingly. Use your tools to add, rewrite, reorder, delete, or fully restructure pages. Each page is typically one chapter (or a part opener). Always start chapter pages with a clear heading line such as \"Chapter One\", \"Chapter 2\", \"Part I\", or \"Prologue\" so the book exports cleanly. When he names a print/trim size (e.g. \"5x8\", \"5*8\", \"6x9\"), call set_trim_size — that resizes the on-screen pages and by default reflows paragraphs to fit that size. Use format_paragraphs_for_trim when he only wants paragraph lengths fixed for the current size. After acting, confirm briefly what changed and invite him to review. When he is only asking a question, just answer; don't call a tool. The main Assistant tab is for brainstorming only — here you act on the book.";

  const sizesLine = `Available trim sizes: ${TRIM_SIZES.map((t) => t.id).join(", ")}.`;

  if (!m) {
    return [s.persona, roleLine, sizesLine, "There is no book open yet."]
      .filter(Boolean)
      .join("\n\n");
  }

  const trim = getTrimById(m.trimId);
  const metrics = trimParagraphMetrics(trim);
  const words = m.pages.reduce((n, p) => n + countWords(p), 0);
  const titleLine = `The open book is titled "${m.title || "Untitled"}" — ${m.pages.length} pages, ~${words} words. Page numbers in tools are 1-based.`;
  const trimLine = `Current trim: ${trim.label} (id ${trim.id}). Target ~${metrics.wordsPerParagraph} words per paragraph, ~${metrics.wordsPerPage} words per printed page.`;

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
 * Book-tab floating assistant — organizes chapters and pages from conversation.
 * Leaves the main Assistant tab as brainstorm-only.
 */
export default function BookAssistant({ onChanged }: BookAssistantProps) {
  return (
    <FloatingAssistant
      title="Book assistant"
      subtitle="Organize chapters, pages & trim"
      emptyHint='Try “make this 5x8 and fix the paragraphs”, “turn what I said into Chapter One”, or “move the prologue to page 1”. Tap the mic to talk.'
      storageKey="book"
      buildSystem={buildSystem}
      placeholder="Tell me how to structure the book…"
      bubbleTitle="Book assistant"
      tools={BOOK_TOOLS}
      executeTool={executeBookTool}
      onAction={onChanged}
      voiceChat
    />
  );
}
