import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

/** Hard cap on extracted text length to stay within model context limits. */
const MAX_CHARS = 60_000;

/**
 * Extract plain text from a PDF buffer using pdf.js (legacy build, Node-friendly).
 * Pages are concatenated in order with form-feed separators. Output is truncated
 * to {@link MAX_CHARS} characters.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const data = new Uint8Array(buffer);
  const loadingTask = getDocument({ data, useSystemFonts: true });
  const doc = await loadingTask.promise;

  const pages: string[] = [];
  try {
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/[ \t]+/g, ' ')
        .trim();
      pages.push(text);
      page.cleanup();

      if (pages.join('\n').length >= MAX_CHARS) break;
    }
  } finally {
    await loadingTask.destroy();
  }

  const joined = pages.join('\n\n').trim();
  return joined.length > MAX_CHARS ? joined.slice(0, MAX_CHARS) : joined;
}
