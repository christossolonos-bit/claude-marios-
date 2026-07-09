// Book manuscript — upload a PDF of the full book, extract its text locally
// (via pdf.js, lazy-loaded), clean up the usual PDF-extraction artifacts, and
// store it per page. Proofreading and Kindle-ready export build on this. The
// PDF never leaves the machine.

export interface Manuscript {
  title: string;
  pages: string[]; // cleaned text, one entry per PDF page
  createdAt: number;
  updatedAt: number;
}

const KEY = "authorhub.manuscript.v1";

export function getManuscript(): Manuscript | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Manuscript) : null;
  } catch {
    return null;
  }
}

export function saveManuscript(m: Manuscript): void {
  localStorage.setItem(KEY, JSON.stringify(m));
}

export function clearManuscript(): void {
  localStorage.removeItem(KEY);
}

export function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

// Clean one page of raw extracted text: repair hyphenation across line breaks,
// drop bare page-number lines, and join wrapped lines back into paragraphs.
function cleanPage(raw: string): string {
  // Repair words split by a hyphen at a line break: "exam-\nple" -> "example".
  let t = raw.replace(/\r/g, "").replace(/(\p{L})-\n(\p{Ll})/gu, "$1$2");

  const lines = t
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter((l) => !/^\d{1,4}$/.test(l)); // drop standalone page numbers

  let out = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    out += line;
    const next = lines[i + 1] ?? "";
    const endsSentence = /[.!?;:»”"')\]]$/.test(line);
    // A wrapped line (no sentence end, next starts lowercase) rejoins with a
    // space; otherwise treat it as a paragraph break.
    out += !endsSentence && /^\p{Ll}/u.test(next) ? " " : "\n\n";
  }

  return out.replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}

interface PdfTextItem {
  str?: string;
  hasEOL?: boolean;
}

/**
 * Extract text from a PDF, page by page, cleaned. onProgress reports
 * (pageDone, totalPages). pdf.js is imported lazily to keep it out of the
 * initial bundle.
 */
export async function extractPdf(
  file: File,
  onProgress?: (page: number, total: number) => void,
): Promise<string[]> {
  const pdfjsLib = await import("pdfjs-dist");
  const workerUrl = (
    await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
  ).default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let text = "";
    for (const item of content.items as PdfTextItem[]) {
      if (item.str === undefined) continue;
      text += item.str + (item.hasEOL ? "\n" : " ");
    }
    pages.push(cleanPage(text));
    onProgress?.(i, pdf.numPages);
  }
  return pages;
}
