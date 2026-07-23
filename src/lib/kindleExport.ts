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

/** Print-area metrics used to size paragraphs for a trim. */
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

function isHeadingBlock(p: string): boolean {
  return isHeading(p);
}

/**
 * Reflow one page's text into paragraph lengths suited to the trim — keep
 * chapter headings intact, split walls of text at sentence boundaries.
 */
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
    if (isHeadingBlock(flat)) {
      out.push(flat);
      continue;
    }

    const words = flat.split(/\s+/).filter(Boolean);
    if (words.length <= softMax) {
      out.push(flat);
      continue;
    }

    // Split long blocks into ~target-word paragraphs at sentence ends.
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

/** Reflow every page (or a single page) for the given trim. */
export function formatPagesForTrim(
  pages: string[],
  trim: TrimSize,
  pageIndex?: number,
): string[] {
  if (pageIndex != null) {
    const copy = pages.slice();
    if (pageIndex >= 0 && pageIndex < copy.length) {
      copy[pageIndex] = formatPageForTrim(copy[pageIndex], trim);
    }
    return copy;
  }
  return pages.map((p) => formatPageForTrim(p, trim));
}

interface Block {
  heading: boolean;
  text: string;
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
