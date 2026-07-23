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

export const BOOK_TOOLS = [
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
      name: "set_trim_size",
      description:
        'Set the book\'s print/trim size (KDP page size) and resize the on-screen pages. Accepts sizes like "5x8", "5*8", "6x9", "5.5x8.5", "8.5x11". Call this when he names a book size.',
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
              "If true (default), also reflow paragraph lengths to fit this trim.",
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
        "Reflow paragraph lengths so they fit the current (or given) trim size — shorter paragraphs for smaller books like 5x8, longer for larger. Keeps chapter headings. Use when he asks to fix paragraph size for the book size.",
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
              "Optional 1-based page to format. Omit to format the whole book.",
          },
        },
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
        "Replace the full text of one page (1-based). Prefer this when rewriting a single chapter.",
      parameters: {
        type: "object",
        properties: {
          page: { type: "integer", description: "Page number, starting at 1" },
          content: {
            type: "string",
            description:
              "Full page text. Start with a clear heading (e.g. Chapter One) when it is a chapter.",
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
      description: "Append text to the end of an existing page (1-based).",
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
        "Add a new page at the end of the book. Use for a new chapter or part.",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description:
              "Full page text. Start with a heading like Chapter Two or Part I.",
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
        "Move a page to a new position (both 1-based). Use to reorder chapters.",
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
        "Replace the entire book structure with a new ordered list of pages. Use when organizing a story into proper chapters/parts from what he described. Each item should be one chapter (or part opener), starting with a clear heading.",
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
    case "set_book_title": {
      const m = requireManuscript();
      if (!m) return { summary: "No book open yet — start a blank book first." };
      const title = str(args.title).trim() || "Untitled";
      persist({ ...m, title });
      return { summary: `Book title set to "${title}"` };
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
      const pages = alsoFormat
        ? formatPagesForTrim(m.pages, trim)
        : m.pages;
      persist({ ...m, pages, trimId: trim.id });
      const metrics = trimParagraphMetrics(trim);
      return {
        summary: alsoFormat
          ? `Set trim to ${trim.label} and reflowed paragraphs (~${metrics.wordsPerParagraph} words each, ~${metrics.wordsPerPage} words/page)`
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
            ? `Formatted page ${page} for ${trim.label} (~${metrics.wordsPerParagraph} words/paragraph)`
            : `Formatted all pages for ${trim.label} (~${metrics.wordsPerParagraph} words/paragraph, ~${metrics.wordsPerPage} words/page)`,
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
      const m = requireManuscript();
      if (!m) return { summary: "No book open yet." };
      const raw = args.pages;
      if (!Array.isArray(raw) || !raw.length)
        return { summary: "Need a non-empty pages array." };
      const pages = raw.map((p) => str(p));
      const title = str(args.title).trim();
      persist({
        ...m,
        pages,
        ...(title ? { title } : {}),
      });
      const preview = pages
        .slice(0, 8)
        .map((p, i) => `${i + 1}. ${headingOf(p, `Page ${i + 1}`)}`)
        .join("; ");
      const more = pages.length > 8 ? ` (+${pages.length - 8} more)` : "";
      return {
        summary: `Restructured book into ${pages.length} pages${
          title ? ` · titled "${title}"` : ""
        }: ${preview}${more}`,
      };
    }

    default:
      return { summary: `Unknown action: ${name}` };
  }
}
