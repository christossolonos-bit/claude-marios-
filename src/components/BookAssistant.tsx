import { BOOK_TOOLS, executeBookTool, manuscriptOutline } from "@/lib/bookTools";
import { getManuscript, countWords } from "@/lib/manuscript";
import { getSettings } from "@/lib/settings";
import { listMemories, memoryContext } from "@/lib/coachMemory";
import FloatingAssistant from "@/components/FloatingAssistant";

async function buildSystem(): Promise<string> {
  const s = getSettings();
  const m = getManuscript();
  const memories = await listMemories();

  const roleLine =
    "You are his book organizer. He talks through what he wants in the story — plot, chapters, parts, scenes — and you structure the manuscript accordingly. Use your tools to add, rewrite, reorder, delete, or fully restructure pages. Each page is typically one chapter (or a part opener). Always start chapter pages with a clear heading line such as \"Chapter One\", \"Chapter 2\", \"Part I\", or \"Prologue\" so the book exports cleanly. After acting, confirm briefly what changed and invite him to review the pages. When he is only asking a question, just answer; don't call a tool. The main Assistant tab is for brainstorming only — here you act on the book.";

  if (!m) {
    return [s.persona, roleLine, "There is no book open yet."]
      .filter(Boolean)
      .join("\n\n");
  }

  const words = m.pages.reduce((n, p) => n + countWords(p), 0);
  const titleLine = `The open book is titled "${m.title || "Untitled"}" — ${m.pages.length} pages, ~${words} words. Page numbers in tools are 1-based.`;

  return [
    s.persona,
    roleLine,
    titleLine,
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
      subtitle="Organize chapters & pages"
      emptyHint='Try “turn what I just said into Chapter One and Two”, “add a Part II after chapter 4”, or “move the prologue to page 1”. Tap the mic to talk.'
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
