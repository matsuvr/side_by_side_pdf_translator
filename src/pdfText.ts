import type { PDFPageProxy } from 'pdfjs-dist';

type Fragment = {
  text: string;
  x0: number;
  x1: number;
  y: number;
  height: number;
  font: string;
  leadingSpace: boolean;
};

type Line = {
  text: string;
  x0: number;
  x1: number;
  y: number;
  height: number;
  font: string;
};

const LIGATURES: Record<string, string> = {
  '\u00ad': '',
  '\uFB00': 'ff',
  '\uFB01': 'fi',
  '\uFB02': 'fl',
  '\uFB03': 'ffi',
  '\uFB04': 'ffl',
  '\uFB05': 'st',
  '\uFB06': 'st',
  '\u2010': '-',
  '\u2011': '-',
  '\u2012': '-',
  '\u2013': '-',
  '\u2212': '-',
};

function normaliseText(value: string): string {
  let result = value;
  for (const [from, to] of Object.entries(LIGATURES)) {
    result = result.split(from).join(to);
  }
  return result.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ');
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function mode(values: string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best = '';
  let bestCount = -1;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function isNumericNoise(text: string): boolean {
  return /^[\s\d.,;:()\-–—/]+$/.test(text);
}

function isPageNumber(text: string): boolean {
  return /^(?:[-–—]\s*)?(?:\d{1,4}|[ivxlcdm]{1,6})(?:\s*[-–—])?$/i.test(text.trim());
}

function isArxivStamp(text: string): boolean {
  return /^arXiv:\S+(?:\s+\[[^\]]+\])?(?:\s+\d{1,2}\s+\w+\s+\d{4})?$/i.test(text.trim());
}

function shouldDropLine(line: Line, pageHeight: number): boolean {
  const text = line.text.trim();
  if (!text) return true;
  if (isArxivStamp(text)) return true;
  if (/^[*†‡§¶∗·\s]+$/u.test(text)) return true;

  const nearEdge = line.y < pageHeight * 0.07 || line.y > pageHeight * 0.93;
  if (nearEdge && isPageNumber(text)) return true;
  if (nearEdge && /^page\s+\d+/i.test(text)) return true;

  if (line.height < 5.2) return true;
  if (text.length <= 3 && isNumericNoise(text)) return true;
  if (text.length < 90 && isNumericNoise(text) && line.height < 7) return true;

  return false;
}

function fragmentsToLines(fragments: Fragment[], pageHeight: number): Line[] {
  const sorted = [...fragments].sort((a, b) => {
    if (Math.abs(a.y - b.y) > 0.8) return b.y - a.y;
    return a.x0 - b.x0;
  });

  const rows: Fragment[][] = [];
  for (const fragment of sorted) {
    const row = rows.find((candidate) => {
      const reference = candidate[0];
      const tolerance = Math.max(2.6, reference.height * 0.38);
      return Math.abs(reference.y - fragment.y) <= tolerance;
    });
    if (row) row.push(fragment);
    else rows.push([fragment]);
  }

  const lines: Line[] = [];

  for (const row of rows) {
    row.sort((a, b) => a.x0 - b.x0);
    const rowHeight = median(row.map((fragment) => fragment.height));
    const maxGap = Math.max(13, rowHeight * 1.35);
    let current: Fragment[] = [];

    const flush = () => {
      if (current.length === 0) return;
      const line = buildLine(current);
      if (!shouldDropLine(line, pageHeight)) lines.push(line);
      current = [];
    };

    for (const fragment of row) {
      if (current.length === 0) {
        current.push(fragment);
        continue;
      }
      const previous = current[current.length - 1];
      const gap = fragment.x0 - previous.x1;
      if (gap > maxGap) {
        flush();
        current.push(fragment);
      } else {
        current.push(fragment);
      }
    }
    flush();
  }

  // Deduplicate identical overprinted lines that some PDF generators emit.
  const deduped: Line[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const key = `${line.text}@@${Math.round(line.y / 2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(line);
  }

  return deduped.sort((a, b) => {
    if (Math.abs(a.y - b.y) > 1.5) return b.y - a.y;
    return a.x0 - b.x0;
  });
}

function buildLine(fragments: Fragment[]): Line {
  let text = '';
  let previous: Fragment | null = null;

  for (const fragment of fragments) {
    if (!fragment.text) continue;
    if (previous) {
      const gap = fragment.x0 - previous.x1;
      const noSpaceBefore = /^[,.;:!?%)\]}、。，．）】」』]/u.test(fragment.text);
      const noSpaceAfter = /[(\[{（【「『\/-]$/u.test(previous.text);
      const needSpace =
        !noSpaceBefore &&
        !noSpaceAfter &&
        (fragment.leadingSpace || gap > Math.max(0.55, fragment.height * 0.07));
      if (needSpace && !text.endsWith(' ')) text += ' ';
    }
    text += fragment.text;
    previous = fragment;
  }

  return {
    text: text.replace(/\s+/g, ' ').trim(),
    x0: Math.min(...fragments.map((fragment) => fragment.x0)),
    x1: Math.max(...fragments.map((fragment) => fragment.x1)),
    y: median(fragments.map((fragment) => fragment.y)),
    height: median(fragments.map((fragment) => fragment.height)),
    font: mode(fragments.map((fragment) => fragment.font)),
  };
}

function isHeading(line: Line, bodyHeight: number, bodyFont: string): boolean {
  const text = line.text.trim();
  if (!text || text.length > 110) return false;
  if (/^\d+(\.\d+)*\s+\S/.test(text)) return true;
  if (/^(abstract|introduction|related work|background|method|methods|approach|experiments?|results?|discussion|conclusion|references|acknowledg)/i.test(text)) {
    return true;
  }
  if (line.height > bodyHeight * 1.12) return true;
  if (
    line.font !== bodyFont &&
    line.height >= bodyHeight * 0.98 &&
    text.length < 80 &&
    /[.!?。！？]$/.test(text) === false &&
    /^[A-Z0-9]/.test(text)
  ) {
    return true;
  }
  return false;
}

function joinLines(lines: Line[]): string {
  let text = '';
  for (const line of lines) {
    const piece = line.text.trim();
    if (!piece) continue;
    if (!text) {
      text = piece;
      continue;
    }
    const previous = text[text.length - 1];
    if (previous === '-' || previous === '/' || previous === '(' || previous === '[') {
      text += piece;
    } else if (/^[,.;:!?%)\]}、。，．）】」』]/u.test(piece)) {
      text += piece;
    } else {
      text += ` ${piece}`;
    }
  }
  return text;
}

function buildParagraphs(lines: Line[]): string[] {
  if (lines.length === 0) return [];

  const bodyHeight = median(lines.map((line) => line.height));
  const bodyFont = mode(
    lines.flatMap((line) => {
      const weight = Math.max(1, Math.min(12, Math.round(line.text.length / 20)));
      return Array.from({ length: weight }, () => line.font);
    })
  );

  const paragraphs: string[] = [];
  let current: Line[] = [];

  const flush = () => {
    if (current.length === 0) return;
    const text = joinLines(current);
    if (text) paragraphs.push(text);
    current = [];
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line.text) continue;

    const previous = current[current.length - 1];
    const heading = isHeading(line, bodyHeight, bodyFont);
    const previousHeading = previous ? isHeading(previous, bodyHeight, bodyFont) : false;
    const bullet = /^[•●▪◦‣·*\-]\s+/.test(line.text);
    const previousBullet = previous ? /^[•●▪◦‣·*\-]\s+/.test(previous.text) : false;

    if (current.length === 0) {
      current.push(line);
      continue;
    }

    const gap = previous.y - line.y;
    const sizeChanged = Math.abs(line.height - previous.height) > Math.max(1.2, bodyHeight * 0.1);
    const indent =
      line.x0 - previous.x0 > bodyHeight * 0.9 &&
      line.x0 > Math.min(...lines.map((candidate) => candidate.x0)) + bodyHeight * 0.6 &&
      previous.x1 > Math.max(...lines.map((candidate) => candidate.x1)) - bodyHeight * 2;

    const startsParagraph =
      heading ||
      previousHeading ||
      sizeChanged ||
      gap > Math.max(previous.height, line.height) * 1.52 ||
      (bullet && !previousBullet) ||
      (indent && !/^[a-z]/.test(line.text));

    if (startsParagraph) flush();
    current.push(line);
  }
  flush();

  return paragraphs;
}

function detectColumns(lines: Line[], pageWidth: number): { twoColumn: boolean; left: number; right: number } {
  if (lines.length < 10) return { twoColumn: false, left: 0, right: pageWidth };

  const contentLeft = Math.min(...lines.map((line) => line.x0));
  const contentRight = Math.max(...lines.map((line) => line.x1));
  const center = (contentLeft + contentRight) / 2;
  const width = contentRight - contentLeft;
  if (width < pageWidth * 0.45) return { twoColumn: false, left: contentLeft, right: contentRight };

  let left = 0;
  let right = 0;
  let full = 0;
  for (const line of lines) {
    if (line.x0 < center - 3 && line.x1 > center + 3) full++;
    else if (line.x1 <= center + 3) left++;
    else if (line.x0 >= center - 3) right++;
  }
  const total = lines.length;
  const balanced = left >= 4 && right >= 4 && Math.min(left, right) / total >= 0.16;
  const notMostlyFull = full / total <= 0.35;
  return {
    twoColumn: balanced && notMostlyFull,
    left: contentLeft,
    right: contentRight,
  };
}

function orderLines(lines: Line[], pageWidth: number): Line[][] {
  const { twoColumn, left, right } = detectColumns(lines, pageWidth);
  if (!twoColumn) {
    return [lines.sort((a, b) => (Math.abs(a.y - b.y) > 1.5 ? b.y - a.y : a.x0 - b.x0))];
  }

  const center = (left + right) / 2;
  const sorted = [...lines].sort((a, b) => {
    if (Math.abs(a.y - b.y) > 1.5) return b.y - a.y;
    return a.x0 - b.x0;
  });

  const blocks: Line[][] = [];
  let band: Line[] = [];

  const flushBand = () => {
    if (band.length === 0) return;
    const leftColumn = band.filter((line) => line.x1 <= center + 3);
    const rightColumn = band.filter((line) => line.x0 >= center - 3);
    const middle = band.filter((line) => line.x1 > center + 3 && line.x0 < center - 3);
    if (leftColumn.length > 0) blocks.push(leftColumn);
    if (middle.length > 0) blocks.push(middle);
    if (rightColumn.length > 0) blocks.push(rightColumn);
    band = [];
  };

  for (const line of sorted) {
    if (line.x0 < center - 3 && line.x1 > center + 3) {
      flushBand();
      blocks.push([line]);
    } else {
      band.push(line);
    }
  }
  flushBand();
  return blocks;
}

function continuesAbove(line: Line, previous: Line | null): boolean {
  if (!previous) return false;
  if (/[.!?:;。！？]$/.test(previous.text)) return false;
  const gap = previous.y - line.y;
  if (gap <= 0 || gap > Math.max(previous.height, line.height) * 1.75) return false;
  return Math.abs(line.x0 - previous.x0) <= Math.max(previous.height, line.height) * 0.6;
}

export async function extractPageText(page: PDFPageProxy): Promise<string> {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const fragments: Fragment[] = [];

  for (const item of content.items) {
    if (!('str' in item)) continue;
    const raw = item.str;
    if (!raw) continue;
    const text = normaliseText(raw).trim();
    if (!text) continue;

    const transform = item.transform;
    // Skip vertical/rotated running headers (for example the arXiv stamp).
    if (Math.abs(transform[1]) > 0.05 || Math.abs(transform[2]) > 0.05) continue;
    const x = transform[4];
    const y = transform[5];
    const height = Math.max(
      Math.abs(transform[3]) || 0,
      Math.abs(item.height) || 0,
      Math.hypot(transform[2], transform[3]) || 0
    );
    if (height < 1) continue;

    fragments.push({
      text,
      x0: x,
      x1: x + Math.abs(item.width),
      y,
      height,
      font: item.fontName,
      leadingSpace: /^\s/.test(raw),
    });
  }

  const allLines = fragmentsToLines(fragments, viewport.height);
  if (allLines.length === 0) return '';

  const bodyHeight = median(
    allLines.filter((line) => line.text.length >= 24).map((line) => line.height)
  );

  // Small type is usually noise (figure labels, formula debris), but a short
  // line that continues the paragraph right above it is real text. Dropping
  // those cut the last words off the page, which made the translation end
  // mid-sentence even when the model had translated everything it was given.
  const lineFloor = bodyHeight * 0.8;
  const lines: Line[] = [];
  let previousKept: Line | null = null;
  for (const line of allLines) {
    const keep =
      line.text.length >= 120 ||
      /^(figure|table)\b/i.test(line.text) ||
      bodyHeight <= 0 ||
      line.height >= lineFloor ||
      continuesAbove(line, previousKept);
    if (!keep) continue;
    lines.push(line);
    previousKept = line;
  }
  if (lines.length === 0) return '';

  const blocks = orderLines(lines, viewport.width);
  return blocks
    .map((block) => buildParagraphs(block))
    .flat()
    .filter(Boolean)
    .join('\n\n')
    .trim();
}
