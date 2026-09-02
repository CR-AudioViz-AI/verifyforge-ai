/**
 * lib/export/pdf.ts
 *
 * Full scan report as a PDF.
 *
 * 2026-09-02. SARIF already exists and is the right format for a pipeline —
 * GitHub code scanning ingests it, and a build can fail on it. It is not a format
 * anyone reads. A developer forwarding evidence to a client, or an agency
 * attaching findings to an invoice, needs a document.
 *
 * WHAT GOES IN, AND WHY ALL OF IT. Every finding carries its evidence, the
 * device profile it was measured under, the threshold it failed and where that
 * threshold came from. A report that says "LCP is poor" and stops is an
 * accusation. One that says "3,924ms on a mid-range Android throttled 4x, band
 * is 2,500ms per Google Core Web Vitals, here is what causes it" is something
 * the reader can act on or argue with.
 *
 * WHAT ALSO GOES IN, WHICH MOST TOOLS OMIT: every check's `whatItCannotCatch`.
 * A report that lists eleven problems reads as complete. Stating what was not
 * examined is the difference between a scan and a guarantee, and only one of
 * those is honest.
 *
 * BUILT WITH pdf-lib, NOT A HEADLESS BROWSER. The browser lab is busy measuring
 * customer sites; rendering our own PDFs through it would put report generation
 * in contention with the product's core work, and a slow scan because someone
 * downloaded a report is an absurd failure mode.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Finding, CheckResult, CheckModule } from '../modules/contract';
import { metric as findMetric, rate, bandsText, RATING_LABEL } from '../metrics/catalog';

// Brand palette as PDF colours. Referenced once so a change lands everywhere.
const INK = rgb(0.09, 0.1, 0.13);
const MUTED = rgb(0.42, 0.45, 0.5);
const FAINT = rgb(0.62, 0.65, 0.7);
const CYAN = rgb(0.02, 0.6, 0.7);
const ROSE = rgb(0.86, 0.2, 0.31);
const AMBER = rgb(0.85, 0.6, 0.09);
const EMERALD = rgb(0.02, 0.6, 0.42);
const RULE = rgb(0.88, 0.89, 0.91);

const SEVERITY_COLOR: Record<string, ReturnType<typeof rgb>> = {
  BLOCKER: ROSE,
  HIGH: ROSE,
  MEDIUM: AMBER,
  LOW: MUTED,
};

const PAGE_W = 595.28; // A4 portrait
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

export interface ReportInput {
  readonly target: string;
  readonly runId: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly verdict: string | null;
  readonly results: readonly CheckResult[];
  /** Measured values keyed by metric id, for the summary table. */
  readonly measurements?: Readonly<Record<string, number | null>>;
  /** Profiles the scan ran under, named so the reader knows the conditions. */
  readonly profiles?: readonly string[];
  /**
   * The modules that ran, by id. CheckResult carries only a moduleId, and the
   * blind-spot section needs the module itself — passing the registry map keeps
   * that section honest rather than dropping it because the type was awkward.
   */
  readonly modules?: ReadonlyMap<string, CheckModule>;
}

/** Wraps text to a width, honouring existing newlines. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (paragraph.trim() === '') {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        if (line) out.push(line);
        // A single word longer than the line would loop forever; break it.
        if (font.widthOfTextAtSize(word, size) > maxWidth) {
          let chunk = '';
          for (const ch of word) {
            if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
              out.push(chunk);
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          line = chunk;
        } else {
          line = word;
        }
      }
    }
    if (line) out.push(line);
  }
  return out;
}

/** Cursor that adds pages as content overflows, so nothing is silently clipped. */
class Cursor {
  page: PDFPage;
  y: number;
  private readonly pages: PDFPage[] = [];

  constructor(
    private readonly doc: PDFDocument,
    private readonly regular: PDFFont,
    private readonly bold: PDFFont,
  ) {
    this.page = doc.addPage([PAGE_W, PAGE_H]);
    this.pages.push(this.page);
    this.y = PAGE_H - MARGIN;
  }

  allPages(): readonly PDFPage[] {
    return this.pages;
  }

  private ensure(space: number): void {
    if (this.y - space < MARGIN + 28) {
      this.page = this.doc.addPage([PAGE_W, PAGE_H]);
      this.pages.push(this.page);
      this.y = PAGE_H - MARGIN;
    }
  }

  gap(px: number): void {
    this.y -= px;
  }

  text(
    content: string,
    opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; indent?: number } = {},
  ): void {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.bold : this.regular;
    const color = opts.color ?? INK;
    const indent = opts.indent ?? 0;
    const lines = wrap(content, font, size, CONTENT_W - indent);
    const lineHeight = size * 1.45;

    for (const line of lines) {
      this.ensure(lineHeight);
      if (line !== '') {
        this.page.drawText(line, {
          x: MARGIN + indent,
          y: this.y - size,
          size,
          font,
          color,
        });
      }
      this.y -= lineHeight;
    }
  }

  rule(): void {
    this.ensure(12);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y - 6 },
      end: { x: PAGE_W - MARGIN, y: this.y - 6 },
      thickness: 0.5,
      color: RULE,
    });
    this.y -= 14;
  }

  /** Severity or rating bar down the left of a block. */
  bar(height: number, color: ReturnType<typeof rgb>): void {
    this.ensure(height);
    this.page.drawRectangle({
      x: MARGIN - 8,
      y: this.y - height,
      width: 3,
      height,
      color,
    });
  }
}

function fmtValue(metricId: string, value: number): string {
  const def = findMetric(metricId);
  if (!def) return String(value);
  if (def.unit === 'bytes') {
    return value >= 1048576 ? `${(value / 1048576).toFixed(2)} MB` : `${(value / 1024).toFixed(0)} KB`;
  }
  const rounded = Math.round(value * 1000) / 1000;
  return def.unit === 'score' || def.unit === 'count' ? String(rounded) : `${rounded} ${def.unit}`;
}

export async function buildReportPdf(input: ReportInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Javari Verify — ${input.target}`);
  doc.setProducer('Javari Verify · CR AudioViz AI, LLC');
  doc.setCreationDate(new Date());

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const c = new Cursor(doc, regular, bold);

  // ---- Header -------------------------------------------------------------
  c.text('Javari Verify', { size: 22, bold: true, color: CYAN });
  c.text('Integrity scan report', { size: 11, color: MUTED });
  c.gap(10);
  c.text(input.target, { size: 14, bold: true });
  c.gap(4);

  const when = input.completedAt ?? input.startedAt;
  c.text(
    `Run ${input.runId}${when ? ` · ${new Date(when).toISOString().replace('T', ' ').slice(0, 19)} UTC` : ''}`,
    { size: 9, color: FAINT },
  );
  if (input.profiles && input.profiles.length > 0) {
    c.text(`Device profiles: ${input.profiles.join(', ')}`, { size: 9, color: FAINT });
  }
  c.rule();

  // ---- Summary ------------------------------------------------------------
  const allFindings: Finding[] = input.results.flatMap((r) =>
    r.outcome.status === 'fail' ? [...r.outcome.findings] : [],
  );
  const bySeverity = allFindings.reduce<Record<string, number>>((acc, f) => {
    acc[f.severity] = (acc[f.severity] ?? 0) + 1;
    return acc;
  }, {});
  const inconclusive = input.results.filter((r) => r.outcome.status === 'inconclusive');

  c.text('Summary', { size: 15, bold: true });
  c.gap(4);
  c.text(
    allFindings.length === 0
      ? 'No findings. Read the limitations section before treating that as a clean bill of health.'
      : `${allFindings.length} finding${allFindings.length === 1 ? '' : 's'} across ` +
        `${input.results.length} check${input.results.length === 1 ? '' : 's'}: ` +
        Object.entries(bySeverity)
          .map(([s, n]) => `${n} ${s.toLowerCase()}`)
          .join(', ') +
        '.',
    { size: 10 },
  );

  if (inconclusive.length > 0) {
    c.gap(4);
    // Inconclusive is not a pass and must never be summarised as one.
    c.text(
      `${inconclusive.length} check${inconclusive.length === 1 ? '' : 's'} could not complete and returned no verdict. ` +
        'Those are listed with their reasons at the end of this report.',
      { size: 10, color: AMBER },
    );
  }
  c.gap(8);
  c.rule();

  // ---- Measurements -------------------------------------------------------
  const measured = Object.entries(input.measurements ?? {}).filter(
    ([id, v]) => findMetric(id) && v !== null && v !== undefined,
  );

  if (measured.length > 0) {
    c.text('Measurements', { size: 15, bold: true });
    c.gap(6);

    for (const [id, value] of measured) {
      const def = findMetric(id);
      if (!def || value === null || value === undefined) continue;
      const rating = rate(id, value);
      const color = rating === 'good' ? EMERALD : rating === 'poor' ? ROSE : rating === 'unrated' ? FAINT : AMBER;

      c.bar(30, color);
      c.text(`${def.label}   ${fmtValue(id, value)}   —   ${RATING_LABEL[rating]}`, {
        size: 10,
        bold: true,
        color,
      });
      c.text(bandsText(def), { size: 8, color: FAINT });
      c.text(`Threshold source: ${def.source}`, { size: 8, color: FAINT });
      c.gap(6);
    }
    c.rule();
  }

  // ---- Findings -----------------------------------------------------------
  if (allFindings.length > 0) {
    c.text('Findings', { size: 15, bold: true });
    c.gap(6);

    // Worst first. A reader scanning the first page should see the worst thing.
    const order: Record<string, number> = { BLOCKER: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    const sorted = [...allFindings].sort(
      (a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9),
    );

    for (const f of sorted) {
      const color = SEVERITY_COLOR[f.severity] ?? MUTED;
      c.gap(4);
      c.bar(18, color);
      c.text(`${f.severity}   ${f.title}`, { size: 11, bold: true, color });
      c.text(f.ruleId, { size: 8, color: FAINT });
      c.gap(3);
      c.text(f.description, { size: 9.5 });

      if (f.subject) {
        c.gap(2);
        c.text(`Subject: ${f.subject}`, { size: 8.5, color: MUTED });
      }

      // Evidence, in full. A finding without evidence is an opinion, and a
      // report that omits it asks the reader to take our word for it.
      if (f.evidence.length > 0) {
        c.gap(3);
        c.text('Evidence', { size: 9, bold: true, color: MUTED });
        for (const e of f.evidence) {
          if (e.kind === 'measurement') {
            c.text(
              `· ${e.metric} = ${e.value} ${e.unit}${e.estimated ? ' (estimated)' : ' (measured)'}\n  Method: ${e.method}`,
              { size: 8.5, color: MUTED, indent: 8 },
            );
          } else if (e.kind === 'http_response') {
            c.text(`· ${e.method} ${e.url} → HTTP ${e.status}`, { size: 8.5, color: MUTED, indent: 8 });
          } else if (e.kind === 'source_location') {
            c.text(`· ${e.repo}/${e.path}:${e.line}\n  ${e.excerpt}`, { size: 8.5, color: MUTED, indent: 8 });
          } else if (e.kind === 'query_result') {
            c.text(`· ${e.statement}`, { size: 8.5, color: MUTED, indent: 8 });
          } else {
            c.text(`· artifact ${e.path} (${e.contentType}, ${e.byteLength} bytes)`, {
              size: 8.5,
              color: MUTED,
              indent: 8,
            });
          }
        }
      }

      if (f.recommendedFix) {
        c.gap(3);
        c.text('How to fix', { size: 9, bold: true, color: EMERALD });
        c.text(f.recommendedFix, { size: 9, indent: 8 });
      }

      c.gap(6);
      c.rule();
    }
  }

  // ---- Limitations --------------------------------------------------------
  //
  // The section most tools omit. A report listing eleven problems reads as
  // complete; stating what was NOT examined is the difference between a scan and
  // a guarantee, and only one of those is honest.
  c.gap(4);
  c.text('What this scan did not check', { size: 15, bold: true });
  c.gap(4);
  c.text(
    'Every check declares its blind spots. A clean result above means these specific defects were not found ' +
      'under these specific conditions — it is not evidence that nothing is wrong.',
    { size: 9.5, color: MUTED },
  );
  c.gap(6);

  for (const r of input.results) {
    const mod = input.modules?.get(r.moduleId);
    const blind = mod?.whatItCannotCatch ?? [];
    if (blind.length === 0) continue;
    c.text(mod?.title ?? r.moduleId, { size: 10, bold: true });
    for (const b of blind) {
      c.text(`· ${b}`, { size: 9, color: MUTED, indent: 8 });
    }
    c.gap(6);
  }

  // ---- Inconclusive -------------------------------------------------------
  if (inconclusive.length > 0) {
    c.rule();
    c.text('Checks that could not complete', { size: 15, bold: true });
    c.gap(4);
    c.text(
      'These returned no verdict. They are neither a pass nor a failure, and the reason is stated so the ' +
        'gap can be closed rather than assumed away.',
      { size: 9.5, color: MUTED },
    );
    c.gap(6);
    for (const r of inconclusive) {
      if (r.outcome.status !== 'inconclusive') continue;
      const im = input.modules?.get(r.moduleId);
      c.text(im?.title ?? r.moduleId, { size: 10, bold: true, color: AMBER });
      c.text(r.outcome.reason, { size: 9, color: MUTED, indent: 8 });
      c.gap(5);
    }
  }

  // ---- Footer on every page ----------------------------------------------
  const pages = c.allPages();
  pages.forEach((p, i) => {
    p.drawText(
      `Javari Verify · CR AudioViz AI, LLC · ${input.target} · page ${i + 1} of ${pages.length}`,
      { x: MARGIN, y: MARGIN - 18, size: 7.5, font: regular, color: FAINT },
    );
  });

  return doc.save();
}
