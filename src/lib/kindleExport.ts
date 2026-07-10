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

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
