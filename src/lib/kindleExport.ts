// Kindle/KDP export. Turns the cleaned manuscript into a reflowable .docx that
// Amazon KDP accepts for both ebooks (it reflows — no page numbers/headers, real
// chapter headings for the table of contents) and print (the page size is set to
// a KDP trim, default 6"x9"). docx is imported lazily to stay out of the bundle.

export interface TrimSize {
  id: string;
  label: string;
  width: number; // inches
  height: number; // inches
}

// KDP paperback trim sizes; 6x9 is the standard/most popular. A larger size is
// offered for manuscripts/workbooks.
export const TRIM_SIZES: TrimSize[] = [
  { id: "6x9", label: '6" × 9" — standard (novels, non-fiction)', width: 6, height: 9 },
  { id: "5x8", label: '5" × 8"', width: 5, height: 8 },
  { id: "5.25x8", label: '5.25" × 8"', width: 5.25, height: 8 },
  { id: "5.5x8.5", label: '5.5" × 8.5"', width: 5.5, height: 8.5 },
  { id: "8.5x11", label: '8.5" × 11" — large', width: 8.5, height: 11 },
];

/** Resolve sizes like "5x8", "5*8", "5 × 8", or a TRIM_SIZES id. */
export function resolveTrim(input: string): TrimSize | null {
  const raw = input.trim().toLowerCase();
  if (!raw) return null;
  const byId = TRIM_SIZES.find((t) => t.id === raw);
  if (byId) return byId;

  const normalized = raw
    .replace(/["'″′]/g, "")
    .replace(/\s+/g, "")
    .replace(/[×*✕]/g, "x")
    .replace(/inches?|in\.?/g, "");

  const exact = TRIM_SIZES.find((t) => t.id === normalized);
  if (exact) return exact;

  const m = normalized.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  return (
    TRIM_SIZES.find(
      (t) => Math.abs(t.width - w) < 0.02 && Math.abs(t.height - h) < 0.02,
    ) ?? null
  );
}

export function getTrimById(id: string | undefined | null): TrimSize {
  return TRIM_SIZES.find((t) => t.id === id) ?? TRIM_SIZES[0];
}

function isHeading(p: string): boolean {
  const t = p.trim();
  if (!t || t.length > 60) return false;
  if (
    /^(chapter|part|prologue|epilogue|introduction|foreword|preface|κεφάλαιο|μέρος|πρόλογος|επίλογος|εισαγωγή)\b/iu.test(
      t,
    )
  )
    return true;
  // A short line in all caps reads as a heading.
  if (t.length <= 50 && /\p{Lu}/u.test(t) && t === t.toUpperCase() && !/[.!?]$/.test(t))
    return true;
  return false;
}

function countWordsLocal(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).filter(Boolean).length : 0;
}

/** Print-area metrics used to size paragraphs and fill pages for a trim. */
export function trimParagraphMetrics(trim: TrimSize) {
  const margin = 0.75; // same as export margins
  const textW = Math.max(2, trim.width - 2 * margin);
  const textH = Math.max(3, trim.height - 2 * margin);
  // ~11pt body with ~1.45 leading ≈ 0.22" per line; ~10 chars per inch of width.
  const charsPerLine = Math.max(28, Math.round(textW * 10));
  const linesPerPage = Math.max(14, Math.round(textH / 0.22));
  const wordsPerPage = Math.round((charsPerLine * linesPerPage) / 5);
  // Aim for a few readable paragraphs per printed page.
  const wordsPerParagraph = Math.max(40, Math.round(wordsPerPage / 4));
  return { charsPerLine, linesPerPage, wordsPerPage, wordsPerParagraph };
}

interface TextBlock {
  heading: boolean;
  text: string;
}

type PageUnit =
  | { kind: "heading"; text: string; words: number }
  | { kind: "sentence"; text: string; words: number };

/** Reflow walls of text into paragraph lengths suited to the trim. */
export function formatPageForTrim(text: string, trim: TrimSize): string {
  const { wordsPerParagraph } = trimParagraphMetrics(trim);
  const target = wordsPerParagraph;
  const softMax = Math.round(target * 1.45);

  const blocks = text
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  const out: string[] = [];

  for (const block of blocks) {
    const flat = block.replace(/\s*\n\s*/g, " ").replace(/[ \t]{2,}/g, " ").trim();
    if (!flat) continue;
    if (isHeading(flat)) {
      out.push(flat);
      continue;
    }

    const words = flat.split(/\s+/).filter(Boolean);
    if (words.length <= softMax) {
      out.push(flat);
      continue;
    }

    // Split long blocks into ~target-word paragraphs at sentence boundaries.
    const sentences = flat.match(/[^.!?…]+(?:[.!?…]+["”']?|$)/g) ?? [flat];
    let buf: string[] = [];
    let count = 0;
    const flush = () => {
      if (!buf.length) return;
      out.push(buf.join(" ").replace(/\s+/g, " ").trim());
      buf = [];
      count = 0;
    };
    for (const raw of sentences) {
      const s = raw.trim();
      if (!s) continue;
      const n = s.split(/\s+/).filter(Boolean).length;
      if (count > 0 && count + n > softMax) flush();
      buf.push(s);
      count += n;
      if (count >= target) flush();
    }
    flush();
  }

  return out.join("\n\n");
}

function textToBlocks(text: string): TextBlock[] {
  return text
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((t) => {
      const flat = t.replace(/\s*\n\s*/g, " ").replace(/[ \t]{2,}/g, " ").trim();
      return { heading: isHeading(flat), text: flat };
    })
    .filter((b) => b.text);
}

function splitSentences(text: string): string[] {
  return (text.match(/[^.!?…]+(?:[.!?…]+["”']?|$)/g) ?? [text])
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Flatten blocks into a heading/sentence stream for even page packing. */
function blocksToUnits(blocks: TextBlock[]): PageUnit[] {
  const units: PageUnit[] = [];
  for (const b of blocks) {
    if (b.heading) {
      units.push({
        kind: "heading",
        text: b.text,
        words: countWordsLocal(b.text),
      });
      continue;
    }
    for (const s of splitSentences(b.text)) {
      units.push({ kind: "sentence", text: s, words: countWordsLocal(s) });
    }
  }
  return units;
}

function unitsWordCount(units: PageUnit[]): number {
  return units.reduce((n, u) => n + u.words, 0);
}

/** Render a packed page: heading first, then body paragraphs of target length. */
function renderPackedPage(
  units: PageUnit[],
  wordsPerParagraph: number,
): string {
  const parts: string[] = [];
  let para: string[] = [];
  let paraWords = 0;
  const softPara = Math.round(wordsPerParagraph * 1.35);

  const flushPara = () => {
    if (!para.length) return;
    parts.push(para.join(" ").replace(/\s+/g, " ").trim());
    para = [];
    paraWords = 0;
  };

  for (const u of units) {
    if (u.kind === "heading") {
      flushPara();
      parts.push(u.text);
      continue;
    }
    if (paraWords > 0 && paraWords + u.words > softPara) flushPara();
    para.push(u.text);
    paraWords += u.words;
    if (paraWords >= wordsPerParagraph) flushPara();
  }
  flushPara();
  return parts.join("\n\n");
}

/** Hard-split an oversized sentence into word chunks that fit a page. */
function chunkWords(text: string, maxWords: number): PageUnit[] {
  const parts = text.split(/\s+/).filter(Boolean);
  const out: PageUnit[] = [];
  for (let i = 0; i < parts.length; i += maxWords) {
    const slice = parts.slice(i, i + maxWords).join(" ");
    out.push({ kind: "sentence", text: slice, words: countWordsLocal(slice) });
  }
  return out.length ? out : [{ kind: "sentence", text, words: countWordsLocal(text) }];
}

/**
 * Pack content into print pages that fill in order for the trim.
 * Chapter/part headings start a new page; body sentences fill each page near
 * capacity so we don't leave a sparse page before a full one.
 */
export function paginateBlocksForTrim(
  blocks: TextBlock[],
  trim: TrimSize,
): string[] {
  const { wordsPerPage, wordsPerParagraph } = trimParagraphMetrics(trim);
  // Prefer a slightly full page over a nearly empty one.
  const softMax = Math.max(wordsPerPage, Math.round(wordsPerPage * 1.08));
  const minFill = Math.round(wordsPerPage * 0.62);

  const rawUnits = blocksToUnits(blocks);
  // Expand monster sentences so packing stays predictable.
  const units: PageUnit[] = [];
  for (const u of rawUnits) {
    if (u.kind === "sentence" && u.words > softMax) {
      units.push(...chunkWords(u.text, wordsPerPage));
    } else {
      units.push(u);
    }
  }

  const packed: PageUnit[][] = [];
  let current: PageUnit[] = [];
  let words = 0;

  const flush = () => {
    if (!current.length) return;
    packed.push(current);
    current = [];
    words = 0;
  };

  for (const u of units) {
    if (u.kind === "heading") {
      if (current.length) flush();
      current.push(u);
      words += u.words;
      continue;
    }

    if (current.length && words + u.words > softMax) {
      flush();
    }
    current.push(u);
    words += u.words;
  }
  flush();

  // Pull sentences forward onto under-filled pages (stop at chapter headings).
  for (let p = 0; p < packed.length - 1; ) {
    let w = unitsWordCount(packed[p]);
    if (w >= minFill) {
      p += 1;
      continue;
    }
    const next = packed[p + 1];
    if (!next.length || next[0]?.kind === "heading") {
      p += 1;
      continue;
    }
    const take = next.shift()!;
    if (w + take.words > softMax && w >= Math.round(minFill * 0.75)) {
      next.unshift(take);
      p += 1;
      continue;
    }
    packed[p].push(take);
    if (!next.length) packed.splice(p + 1, 1);
    // stay on p to keep filling
  }

  // Drop empties; render paragraphs for the trim.
  return packed
    .filter((page) => page.length > 0)
    .map((page) => renderPackedPage(page, wordsPerParagraph));
}

/**
 * Reflow paragraphs for the trim, then split into print pages so each page
 * fills in order — overflow continues on the next page, no sparse gaps.
 * If pageIndex is set, only that page is split (inserted in place).
 */
export function formatPagesForTrim(
  pages: string[],
  trim: TrimSize,
  pageIndex?: number,
): string[] {
  if (pageIndex != null) {
    if (pageIndex < 0 || pageIndex >= pages.length) return pages.slice();
    const formatted = formatPageForTrim(pages[pageIndex], trim);
    const split = paginateBlocksForTrim(textToBlocks(formatted), trim);
    return [
      ...pages.slice(0, pageIndex),
      ...split,
      ...pages.slice(pageIndex + 1),
    ];
  }

  // Whole book: reflow, then pack as one continuous manuscript (chapter
  // headings still force a page break).
  const blocks: TextBlock[] = [];
  for (const page of pages) {
    const formatted = formatPageForTrim(page, trim);
    blocks.push(...textToBlocks(formatted));
  }
  return paginateBlocksForTrim(blocks, trim);
}

interface Block {
  heading: boolean;
  text: string;
}

/** Split the manuscript pages into heading/paragraph blocks. */
export function manuscriptToBlocks(pages: string[]): Block[] {
  const combined = pages.join("\n\n");
  return combined
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => ({ heading: isHeading(p), text: p.replace(/\s*\n\s*/g, " ") }));
}

/** Build a reflowable .docx sized to the chosen KDP trim. */
export async function exportDocx(opts: {
  title: string;
  pages: string[];
  trim: TrimSize;
}): Promise<Blob> {
  const {
    Document,
    Packer,
    Paragraph,
    HeadingLevel,
    AlignmentType,
    convertInchesToTwip,
  } = await import("docx");

  const blocks = manuscriptToBlocks(opts.pages);
  const children = [
    new Paragraph({
      text: opts.title.trim() || "Untitled",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    }),
  ];

  let sawHeading = false;
  for (const b of blocks) {
    if (b.heading) {
      children.push(
        new Paragraph({
          text: b.text,
          heading: HeadingLevel.HEADING_1,
          pageBreakBefore: sawHeading, // each chapter starts on a new page
        }),
      );
      sawHeading = true;
    } else {
      children.push(new Paragraph({ text: b.text }));
    }
  }

  const doc = new Document({
    creator: "AuthorHub",
    title: opts.title.trim() || "Untitled",
    sections: [
      {
        properties: {
          page: {
            size: {
              width: convertInchesToTwip(opts.trim.width),
              height: convertInchesToTwip(opts.trim.height),
            },
            margin: {
              top: convertInchesToTwip(0.75),
              bottom: convertInchesToTwip(0.75),
              left: convertInchesToTwip(0.75),
              right: convertInchesToTwip(0.75),
            },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBlob(doc);
}

function inTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    (window as unknown as { __TAURI_INTERNALS__?: unknown })
      .__TAURI_INTERNALS__ !== undefined
  );
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// Save an exported blob. In the packaged app the webview can't trigger a real
// download, so we write the bytes to disk via Rust and return the saved path.
// In the browser preview we fall back to a normal download (returns null).
export async function saveBlob(
  blob: Blob,
  filename: string,
): Promise<string | null> {
  if (inTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    const data = await blobToBase64(blob);
    return invoke<string>("save_export", { filename, data });
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return null;
}
