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

/** True when his message likely contains story/content to put on the pages. */
function likelyWantsManuscriptWrite(userMessage: string): boolean {
  const t = userMessage.trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  // Short pure questions → allow chat-only.
  if (
    t.length < 50 &&
    /^(how|what|why|when|where|who|which|is |are |do |does |did |can |could |should |would |\?)/i.test(
      lower,
    ) &&
    !/\b(write|chapter|prologue|page|book|story|scene)\b/i.test(lower)
  ) {
    return false;
  }
  if (t.length >= 80) return true;
  return /\b(chapter|prologue|epilogue|part |story|scene|write|dictate|page|book|character|plot|then |said |happened)\b/i.test(
    lower,
  );
}

async function buildSystem(): Promise<string> {
  const s = getSettings();
  const m = getManuscript();
  const memories = await listMemories();

  const roleLine = [
    "You are his BOOK EDITOR — you write the manuscript while you talk with him. This is NOT the brainstorming Assistant tab.",
    "CORE RULE: When he describes the story, dictates prose, explains what happens in the prologue/chapters, or tells you what he wants on the page — you MUST call tools and put that content onto the manuscript immediately. Never only reply with a chat summary of what he said. If you talk without writing, you have failed.",
    "How to capture his words:",
    "1) Turn what he meant into proper book prose (clear paragraphs, his voice/intent). Use headings: Prologue, Chapter One, Chapter Two, Part I, etc.",
    "2) Call replace_structure to set/rebuild the book from Prologue through chapters, OR write_page / append_page / add_page for incremental updates to what is already there.",
    "3) Prefer replace_structure when he lays out several sections at once; prefer append_page/write_page when he continues one chapter.",
    "4) After writing, you may call editorial_pass so pages fill evenly for the trim. Then confirm briefly what you put on the pages and invite him to keep dictating.",
    "Also available: edit_page, continue_writing, expand_page, rewrite_tone, suggest_title, set_trim_size, merge/move/delete pages.",
    "Skip tools ONLY for pure questions with no new manuscript content (e.g. “how many pages do I have?”).",
  ].join(" ");

  const sizesLine = `Available trim sizes: ${TRIM_SIZES.map((t) => t.id).join(", ")}.`;

  if (!m) {
    return [
      s.persona,
      roleLine,
      sizesLine,
      "There is no book open yet. As soon as he shares story content, call replace_structure (it can create the book) or start_blank_book then write. Do not wait for him to say “please write it down”.",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  const trim = getTrimById(m.trimId);
  const metrics = trimParagraphMetrics(trim);
  const words = m.pages.reduce((n, p) => n + countWords(p), 0);
  const titleLine = `The open book is titled "${m.title || "Untitled"}" — ${m.pages.length} pages, ~${words} words. Page numbers are 1-based. Fill pages in order (~${metrics.wordsPerPage} words each).`;
  const trimLine = `Current trim: ${trim.label} (id ${trim.id}). ~${metrics.wordsPerParagraph} words/paragraph.`;

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
 * Book-tab floating assistant — writes the manuscript from conversation/dictation.
 */
export default function BookAssistant({ onChanged }: BookAssistantProps) {
  return (
    <FloatingAssistant
      title="Book editor"
      subtitle="I write while you talk"
      emptyHint="Tell me your prologue or chapter — I’ll write it onto the pages. Or ask to fix grammar, continue, or make it 5x8. Tap the mic to dictate."
      storageKey="book"
      buildSystem={buildSystem}
      placeholder="Dictate the story or tell me what to write…"
      bubbleTitle="Book editor"
      tools={BOOK_TOOLS}
      executeTool={executeBookTool}
      onAction={onChanged}
      voiceChat
      nudgeIfNoTools={likelyWantsManuscriptWrite}
      toolNudge="You only replied in chat — you did not update the manuscript. Call replace_structure, write_page, append_page, or add_page NOW to put his words on the pages as Prologue/chapters. Shape them into proper book prose. Do not answer with only a summary."
    />
  );
}
