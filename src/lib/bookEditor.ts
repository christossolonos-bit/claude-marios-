// Book-editor helpers: chapter structure, merges/splits, renumbering, and a
// full editorial pass that paginates to the chosen trim. Used by the Book
// assistant so the author can dictate or discuss and get a clean manuscript.

import {
  type TrimSize,
  getTrimById,
  formatPagesForTrim,
  resolveTrim,
} from "@/lib/kindleExport";

const CHAPTER_WORDS = [
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
  "Twenty",
];

export function isStructuralHeading(p: string): boolean {
  const t = p.trim();
  if (!t || t.length > 80) return false;
  if (
    /^(chapter|part|prologue|epilogue|introduction|foreword|preface|acknowledgements?|dedication|κεφάλαιο|μέρος|πρόλογος|επίλογος|εισαγωγή)\b/iu.test(
      t,
    )
  )
    return true;
  if (
    t.length <= 50 &&
    /\p{Lu}/u.test(t) &&
    t === t.toUpperCase() &&
    !/[.!?]$/.test(t)
  )
    return true;
  return false;
}

function isChapterHeading(p: string): boolean {
  return /^(chapter|κεφάλαιο)\b/iu.test(p.trim());
}

function chapterLabel(n: number, style: "words" | "digits"): string {
  if (style === "digits") return `Chapter ${n}`;
  if (n >= 1 && n <= CHAPTER_WORDS.length) return `Chapter ${CHAPTER_WORDS[n - 1]}`;
  return `Chapter ${n}`;
}

/** Split any page that contains multiple structural headings into chunks. */
export function splitAtHeadings(pages: string[]): string[] {
  const chunks: string[] = [];
  for (const page of pages) {
    const blocks = page
      .replace(/\r/g, "")
      .split(/\n\s*\n/)
      .map((b) => b.trim())
      .filter(Boolean);
    let current: string[] = [];
    for (const block of blocks) {
      const flat = block.replace(/\s*\n\s*/g, " ").trim();
      if (isStructuralHeading(flat) && current.length) {
        chunks.push(current.join("\n\n"));
        current = [flat];
      } else {
        current.push(flat);
      }
    }
    if (current.length) chunks.push(current.join("\n\n"));
  }
  return chunks.length ? chunks : [""];
}

/** Merge an inclusive 0-based page range into one page. */
export function mergePageRange(
  pages: string[],
  fromIndex: number,
  toIndex: number,
): string[] {
  if (
    fromIndex < 0 ||
    toIndex >= pages.length ||
    fromIndex > toIndex ||
    pages.length === 0
  ) {
    return pages.slice();
  }
  const merged = pages
    .slice(fromIndex, toIndex + 1)
    .map((p) => p.trim())
    .filter(Boolean)
    .join("\n\n");
  return [
    ...pages.slice(0, fromIndex),
    merged,
    ...pages.slice(toIndex + 1),
  ];
}

/**
 * Renumber chapter headings in order (first line of a page that looks like a
 * chapter). Part/prologue/etc. headings are left alone.
 */
export function renumberChapters(
  pages: string[],
  style: "words" | "digits" = "words",
): { pages: string[]; count: number } {
  let n = 0;
  const next = pages.map((page) => {
    const trimmed = page.replace(/^\s+/, "");
    const nl = trimmed.indexOf("\n");
    const first = (nl === -1 ? trimmed : trimmed.slice(0, nl)).trim();
    if (!isChapterHeading(first)) return page;
    n += 1;
    const rest = nl === -1 ? "" : trimmed.slice(nl);
    return chapterLabel(n, style) + rest;
  });
  return { pages: next, count: n };
}

export interface EditorialPassOptions {
  /** Trim id or "5x8" / "5*8" style size. Defaults to current trim. */
  size?: string;
  currentTrimId?: string;
  splitChapters?: boolean;
  renumber?: boolean;
  renumberStyle?: "words" | "digits";
  paginate?: boolean;
}

export interface EditorialPassResult {
  pages: string[];
  trimId: string;
  trim: TrimSize;
  chaptersRenumbered: number;
  pageCountBefore: number;
  pageCountAfter: number;
}

/** Full editorial pass: split chapters → paginate to trim → renumber. */
export function runEditorialPass(
  pages: string[],
  opts: EditorialPassOptions = {},
): EditorialPassResult {
  const pageCountBefore = pages.length;
  let working = pages.slice();

  if (opts.splitChapters !== false) {
    working = splitAtHeadings(working);
  }

  const trim =
    (opts.size ? resolveTrim(opts.size) : null) ??
    getTrimById(opts.currentTrimId);

  if (opts.paginate !== false) {
    working = formatPagesForTrim(working, trim);
  }

  let chaptersRenumbered = 0;
  if (opts.renumber !== false) {
    const r = renumberChapters(working, opts.renumberStyle ?? "words");
    working = r.pages;
    chaptersRenumbered = r.count;
  }

  return {
    pages: working,
    trimId: trim.id,
    trim,
    chaptersRenumbered,
    pageCountBefore,
    pageCountAfter: working.length,
  };
}
