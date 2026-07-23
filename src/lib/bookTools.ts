// Tools the Book-tab assistant uses to organize the manuscript: add, rewrite,
// reorder, restructure pages/chapters, and size paragraphs for a KDP trim.
// All changes stay on this machine.

import {
  getManuscript,
  saveManuscript,
  countWords,
  type Manuscript,
} from "@/lib/manuscript";
import type { ToolResult } from "@/lib/assistantTools";
import {
  TRIM_SIZES,
  resolveTrim,
  getTrimById,
  formatPagesForTrim,
  trimParagraphMetrics,
} from "@/lib/kindleExport";
import {
  mergePageRange,
  renumberChapters,
  runEditorialPass,
  splitAtHeadings,
} from "@/lib/bookEditor";

export const BOOK_TOOLS = [
  {
    type: "function",
    function: {
      name: "start_blank_book",
      description:
        "Create a new blank book manuscript if none is open. Call this before writing when he wants to start from dictation or discussion.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Optional book title" },
          size: {
            type: "string",
            description: 'Optional trim like "5x8" or "6x9"',
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_book_title",
      description: "Set or rename the book's title.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "New book title" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "editorial_pass",
      description:
        "Full book-editor pass: split mixed chapters apart, reflow paragraphs, paginate so each page fits the trim (overflow → next page), and renumber Chapter headings. Use when he asks to fix, clean up, or properly format the book after dictating or discussing — or when he names a trim size and wants the manuscript fixed for it.",
      parameters: {
        type: "object",
        properties: {
          size: {
            type: "string",
            description: 'Optional trim like "5x8". Defaults to current trim.',
          },
          renumber: {
            type: "boolean",
            description: "Renumber chapters in order (default true).",
          },
          style: {
            type: "string",
            enum: ["words", "digits"],
            description:
              'Chapter style: "Chapter One" (words) or "Chapter 1" (digits). Default words.',
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_trim_size",
      description:
        'Set the book\'s print/trim size (KDP page size) and resize the on-screen pages. Accepts sizes like "5x8", "5*8", "6x9", "5.5x8.5", "8.5x11". By default also reflows paragraphs and splits overflow onto the next page so each page fits the trim. Prefer editorial_pass when he also wants chapters fixed/renumbered.',
      parameters: {
        type: "object",
        properties: {
          size: {
            type: "string",
            description: 'Trim size, e.g. "5x8" or "6x9"',
          },
          format_paragraphs: {
            type: "boolean",
            description:
              "If true (default), reflow paragraphs and paginate so no page is longer than this trim — overflow continues on the next page.",
          },
        },
        required: ["size"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "format_paragraphs_for_trim",
      description:
        "Reflow paragraph lengths for the current (or given) trim, then split pages so each one fits that print size. Extra words move to the next page. Chapter/part headings start a new page.",
      parameters: {
        type: "object",
        properties: {
          size: {
            type: "string",
            description:
              'Optional trim like "5x8". Defaults to the book\'s current trim.',
          },
          page: {
            type: "integer",
            description:
              "Optional 1-based page to paginate. Omit to format and paginate the whole book.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "split_at_headings",
      description:
        "Split pages wherever Chapter/Part/Prologue headings appear mid-page, so each section starts cleanly. Often followed by editorial_pass or format_paragraphs_for_trim.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "renumber_chapters",
      description:
        'Renumber chapter headings in reading order as "Chapter One", "Chapter Two", … (or Chapter 1, 2, …). Leaves Part/Prologue headings alone.',
      parameters: {
        type: "object",
        properties: {
          style: {
            type: "string",
            enum: ["words", "digits"],
            description: 'Default "words" → Chapter One; "digits" → Chapter 1.',
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "merge_pages",
      description:
        "Merge an inclusive range of pages into one page (e.g. after a bad split). Use 1-based page numbers.",
      parameters: {
        type: "object",
        properties: {
          from_page: { type: "integer" },
          to_page: { type: "integer" },
        },
        required: ["from_page", "to_page"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_page",
      description:
        "Read the full text of one page (1-based). Use when you need more than the outline excerpt.",
      parameters: {
        type: "object",
        properties: {
          page: { type: "integer", description: "Page number, starting at 1" },
        },
        required: ["page"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_page",
      description:
        "Replace the full text of one page (1-based). Prefer this when rewriting a single chapter or page.",
      parameters: {
        type: "object",
        properties: {
          page: { type: "integer", description: "Page number, starting at 1" },
          content: {
            type: "string",
            description:
              "Full page text. Start with a clear heading (e.g. Chapter One) when it begins a chapter.",
          },
        },
        required: ["page", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "append_page",
      description:
        "Append text to the end of an existing page (1-based). Good for adding dictated prose onto a chapter before an editorial_pass.",
      parameters: {
        type: "object",
        properties: {
          page: { type: "integer", description: "Page number, starting at 1" },
          content: { type: "string", description: "Text to append" },
        },
        required: ["page", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_page",
      description:
        "Add a new page at the end of the book. Use for a new chapter or continued text.",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description:
              "Full page text. Start with a heading like Chapter Two or Part I when appropriate.",
          },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "insert_page",
      description:
        "Insert a new page before a given page number (1-based). Existing pages shift down.",
      parameters: {
        type: "object",
        properties: {
          before_page: {
            type: "integer",
            description: "Insert before this page number (1-based)",
          },
          content: { type: "string", description: "Full page text" },
        },
        required: ["before_page", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_page",
      description: "Delete one page (1-based).",
      parameters: {
        type: "object",
        properties: {
          page: { type: "integer", description: "Page number, starting at 1" },
        },
        required: ["page"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "move_page",
      description:
        "Move a page to a new position (both 1-based). Use to reorder chapters or pages.",
      parameters: {
        type: "object",
        properties: {
          from_page: { type: "integer", description: "Current page number" },
          to_page: { type: "integer", description: "Destination page number" },
        },
        required: ["from_page", "to_page"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "replace_structure",
      description:
        "Replace the entire book with a new ordered list of pages/chapters. Primary tool after he dictates or explains the story: turn his words into proper Chapter/Part pages (each item starts with a heading), then usually follow with editorial_pass so pages fit the trim.",
      parameters: {
        type: "object",
        properties: {
          pages: {
            type: "array",
            items: { type: "string" },
            description:
              'Ordered pages. Example: ["Chapter One\\n\\n…", "Chapter Two\\n\\n…"]',
          },
          title: {
            type: "string",
            description: "Optional new book title",
          },
          editorial_pass: {
            type: "boolean",
            description:
              "If true (default), run a full editorial pass afterward (paginate to trim, renumber chapters).",
          },
          size: {
            type: "string",
            description: 'Optional trim for the follow-up pass, e.g. "5x8".',
          },
        },
        required: ["pages"],
      },
    },
  },
];

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function int(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function requireManuscript(): Manuscript | null {
  return getManuscript();
}

function persist(m: Manuscript): void {
  saveManuscript({ ...m, updatedAt: Date.now() });
}

function pageIndex(pageNum: number, length: number): number | null {
  if (pageNum < 1 || pageNum > length) return null;
  return pageNum - 1;
}

function headingOf(text: string, fallback: string): string {
  const line = text.trim().split(/\n/)[0]?.trim() ?? "";
  return (line.slice(0, 72) || fallback).replace(/\s+/g, " ");
}

function trimListLine(): string {
  return TRIM_SIZES.map((t) => t.id).join(", ");
}

/** Compact outline for the system prompt — one line per page. */
export function manuscriptOutline(m: Manuscript): string {
  if (!m.pages.length) return "The book has no pages yet.";
  const lines = m.pages.map((p, i) => {
    const words = countWords(p);
    const head = headingOf(p, `(empty page ${i + 1})`);
    const body = p.trim();
    const excerpt =
      body.length > 180
        ? `${body.slice(0, 180).replace(/\s+/g, " ")}…`
        : body.replace(/\s+/g, " ");
    return `Page ${i + 1} (${words} words) — ${head}${
      excerpt && excerpt !== head ? `\n  ${excerpt}` : ""
    }`;
  });
  return `Book outline (${m.pages.length} pages):\n${lines.join("\n")}`;
}

export async function executeBookTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  switch (name) {
    case "start_blank_book": {
      if (requireManuscript()) {
        return { summary: "A book is already open — use it, or clear it from the Book tab first." };
      }
      const title = str(args.title).trim() || "Untitled";
      const trim = resolveTrim(str(args.size)) ?? getTrimById("6x9");
      const m: Manuscript = {
        title,
        pages: ["Chapter One\n\n"],
        trimId: trim.id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      persist(m);
      return {
        summary: `Started blank book "${title}" at ${trim.label}`,
      };
    }

    case "set_book_title": {
      const m = requireManuscript();
      if (!m) return { summary: "No book open yet — start a blank book first." };
      const title = str(args.title).trim() || "Untitled";
      persist({ ...m, title });
      return { summary: `Book title set to "${title}"` };
    }

    case "editorial_pass": {
      const m = requireManuscript();
      if (!m) return { summary: "No book open yet — start a blank book first." };
      const style =
        str(args.style) === "digits" ? "digits" : "words";
      const result = runEditorialPass(m.pages, {
        size: str(args.size).trim() || undefined,
        currentTrimId: m.trimId,
        renumber: args.renumber !== false,
        renumberStyle: style,
      });
      persist({
        ...m,
        pages: result.pages,
        trimId: result.trimId,
      });
      return {
        summary: `Editorial pass for ${result.trim.label}: ${result.pageCountBefore} → ${result.pageCountAfter} pages${
          result.chaptersRenumbered
            ? `, ${result.chaptersRenumbered} chapters renumbered`
            : ""
        }`,
      };
    }

    case "set_trim_size": {
      const m = requireManuscript();
      if (!m) return { summary: "No book open yet — start a blank book first." };
      const trim = resolveTrim(str(args.size));
      if (!trim) {
        return {
          summary: `Unknown trim size "${str(args.size)}". Use one of: ${trimListLine()}.`,
        };
      }
      const alsoFormat = args.format_paragraphs !== false;
      const before = m.pages.length;
      const pages = alsoFormat
        ? formatPagesForTrim(m.pages, trim)
        : m.pages;
      persist({ ...m, pages, trimId: trim.id });
      const metrics = trimParagraphMetrics(trim);
      return {
        summary: alsoFormat
          ? `Set trim to ${trim.label}, reflowed paragraphs, and paginated to fit (~${metrics.wordsPerPage} words/page): ${before} → ${pages.length} pages`
          : `Set trim to ${trim.label}`,
      };
    }

    case "format_paragraphs_for_trim": {
      const m = requireManuscript();
      if (!m) return { summary: "No book open yet." };
      const sizeArg = str(args.size).trim();
      const trim = sizeArg ? resolveTrim(sizeArg) : getTrimById(m.trimId);
      if (!trim) {
        return {
          summary: `Unknown trim size "${sizeArg}". Use one of: ${trimListLine()}.`,
        };
      }
      const page = int(args.page);
      const before = m.pages.length;
      let pages: string[];
      if (page != null) {
        const i = pageIndex(page, m.pages.length);
        if (i == null)
          return {
            summary: `Page ${page} doesn't exist (book has ${m.pages.length} pages).`,
          };
        pages = formatPagesForTrim(m.pages, trim, i);
      } else {
        pages = formatPagesForTrim(m.pages, trim);
      }
      persist({ ...m, pages, trimId: trim.id });
      const metrics = trimParagraphMetrics(trim);
      return {
        summary:
          page != null
            ? `Paginated page ${page} for ${trim.label} (~${metrics.wordsPerPage} words/page): book now ${pages.length} pages`
            : `Formatted and paginated for ${trim.label} (~${metrics.wordsPerParagraph} words/paragraph, ~${metrics.wordsPerPage} words/page): ${before} → ${pages.length} pages`,
      };
    }

    case "split_at_headings": {
      const m = requireManuscript();
      if (!m) return { summary: "No book open yet." };
      const before = m.pages.length;
      const pages = splitAtHeadings(m.pages);
      persist({ ...m, pages });
      return {
        summary: `Split at chapter/part headings: ${before} → ${pages.length} pages`,
      };
    }

    case "renumber_chapters": {
      const m = requireManuscript();
      if (!m) return { summary: "No book open yet." };
      const style = str(args.style) === "digits" ? "digits" : "words";
      const { pages, count } = renumberChapters(m.pages, style);
      persist({ ...m, pages });
      return {
        summary:
          count > 0
            ? `Renumbered ${count} chapters (${style === "digits" ? "Chapter 1…" : "Chapter One…"})`
            : "No chapter headings found to renumber.",
      };
    }

    case "merge_pages": {
      const m = requireManuscript();
      if (!m) return { summary: "No book open yet." };
      const from = int(args.from_page);
      const to = int(args.to_page);
      if (from == null || to == null)
        return { summary: "Need from_page and to_page (1-based)." };
      if (from < 1 || to < from || to > m.pages.length)
        return {
          summary: `Invalid range ${from}–${to} (book has ${m.pages.length} pages).`,
        };
      const pages = mergePageRange(m.pages, from - 1, to - 1);
      persist({ ...m, pages });
      return {
        summary: `Merged pages ${from}–${to} into page ${from} (${pages.length} pages total)`,
      };
    }

    case "read_page": {
      const m = requireManuscript();
      if (!m) return { summary: "No book open yet." };
      const page = int(args.page);
      if (page == null)
        return { summary: "Need a page number (starting at 1)." };
      const i = pageIndex(page, m.pages.length);
      if (i == null)
        return {
          summary: `Page ${page} doesn't exist (book has ${m.pages.length} pages).`,
        };
      const text = m.pages[i] || "(empty)";
      return {
        summary: `Read page ${page}`,
        content: `Page ${page}:\n"""\n${text}\n"""`,
      };
    }

    case "write_page": {
      const m = requireManuscript();
      if (!m) return { summary: "No book open yet." };
      const page = int(args.page);
      if (page == null)
        return { summary: "Need a page number (starting at 1)." };
      const i = pageIndex(page, m.pages.length);
      if (i == null)
        return {
          summary: `Page ${page} doesn't exist (book has ${m.pages.length} pages).`,
        };
      const content = str(args.content);
      const pages = m.pages.slice();
      pages[i] = content;
      persist({ ...m, pages });
      return {
        summary: `Wrote page ${page}: ${headingOf(content, `Page ${page}`)}`,
      };
    }

    case "append_page": {
      const m = requireManuscript();
      if (!m) return { summary: "No book open yet." };
      const page = int(args.page);
      if (page == null)
        return { summary: "Need a page number (starting at 1)." };
      const i = pageIndex(page, m.pages.length);
      if (i == null)
        return {
          summary: `Page ${page} doesn't exist (book has ${m.pages.length} pages).`,
        };
      const add = str(args.content);
      if (!add.trim()) return { summary: "Nothing to append." };
      const pages = m.pages.slice();
      const cur = pages[i] ?? "";
      const sep = !cur ? "" : /\n\s*$/.test(cur) ? "\n" : "\n\n";
      pages[i] = cur + sep + add;
      persist({ ...m, pages });
      return { summary: `Appended to page ${page}` };
    }

    case "add_page": {
      const m = requireManuscript();
      if (!m) return { summary: "No book open yet." };
      const content = str(args.content);
      const pages = [...m.pages, content];
      persist({ ...m, pages });
      const n = pages.length;
      return {
        summary: `Added page ${n}: ${headingOf(content, `Page ${n}`)}`,
      };
    }

    case "insert_page": {
      const m = requireManuscript();
      if (!m) return { summary: "No book open yet." };
      const before = int(args.before_page);
      if (before == null)
        return { summary: "Need before_page (starting at 1)." };
      if (before < 1 || before > m.pages.length + 1)
        return {
          summary: `before_page must be 1–${m.pages.length + 1}.`,
        };
      const content = str(args.content);
      const pages = m.pages.slice();
      pages.splice(before - 1, 0, content);
      persist({ ...m, pages });
      return {
        summary: `Inserted page ${before}: ${headingOf(content, `Page ${before}`)}`,
      };
    }

    case "delete_page": {
      const m = requireManuscript();
      if (!m) return { summary: "No book open yet." };
      const page = int(args.page);
      if (page == null)
        return { summary: "Need a page number (starting at 1)." };
      const i = pageIndex(page, m.pages.length);
      if (i == null)
        return {
          summary: `Page ${page} doesn't exist (book has ${m.pages.length} pages).`,
        };
      if (m.pages.length === 1)
        return {
          summary:
            "Can't delete the only page — write over it or replace the structure.",
        };
      const label = headingOf(m.pages[i], `Page ${page}`);
      const pages = m.pages.slice();
      pages.splice(i, 1);
      persist({ ...m, pages });
      return { summary: `Deleted page ${page}: ${label}` };
    }

    case "move_page": {
      const m = requireManuscript();
      if (!m) return { summary: "No book open yet." };
      const from = int(args.from_page);
      const to = int(args.to_page);
      if (from == null || to == null)
        return { summary: "Need from_page and to_page (starting at 1)." };
      const fromI = pageIndex(from, m.pages.length);
      const toI = pageIndex(to, m.pages.length);
      if (fromI == null || toI == null)
        return {
          summary: `Pages must be between 1 and ${m.pages.length}.`,
        };
      if (fromI === toI) return { summary: `Page ${from} is already there.` };
      const pages = m.pages.slice();
      const [item] = pages.splice(fromI, 1);
      pages.splice(toI, 0, item);
      persist({ ...m, pages });
      return {
        summary: `Moved page ${from} → ${to}: ${headingOf(item, `Page ${to}`)}`,
      };
    }

    case "replace_structure": {
      let m = requireManuscript();
      if (!m) {
        const title = str(args.title).trim() || "Untitled";
        const trim = resolveTrim(str(args.size)) ?? getTrimById("6x9");
        m = {
          title,
          pages: [""],
          trimId: trim.id,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      }
      const raw = args.pages;
      if (!Array.isArray(raw) || !raw.length)
        return { summary: "Need a non-empty pages array." };
      let pages = raw.map((p) => str(p));
      const title = str(args.title).trim();
      const doPass = args.editorial_pass !== false;
      let passNote = "";
      if (doPass) {
        const result = runEditorialPass(pages, {
          size: str(args.size).trim() || undefined,
          currentTrimId: m.trimId,
        });
        pages = result.pages;
        persist({
          ...m,
          pages,
          trimId: result.trimId,
          ...(title ? { title } : {}),
        });
        passNote = ` · editorial pass → ${result.pageCountAfter} pages (${result.trim.label})`;
      } else {
        persist({
          ...m,
          pages,
          ...(title ? { title } : {}),
        });
      }
      const preview = pages
        .slice(0, 8)
        .map((p, i) => `${i + 1}. ${headingOf(p, `Page ${i + 1}`)}`)
        .join("; ");
      const more = pages.length > 8 ? ` (+${pages.length - 8} more)` : "";
      return {
        summary: `Restructured book${
          title ? ` · titled "${title}"` : ""
        }${passNote}: ${preview}${more}`,
      };
    }

    default:
      return { summary: `Unknown action: ${name}` };
  }
}
