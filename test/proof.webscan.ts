// test/proof.webscan.ts — the web scanner completes a scan.
//
// WHY THIS EXISTS. CompleteWebTester threw on EVERY web target, including a
// page as simple as example.com, because analyzeWCAG called $('*:focus') on
// Cheerio — a browser-only pseudo-class against a static parser. Nothing caught
// it, so the route turned it into a synthetic overall:'fail' result and still
// answered HTTP 200. The product did not work and nothing said so.
//
// It went unnoticed because nothing had ever run the scanner end to end. This
// closes that: it drives the real tester against pages it serves itself.
//
// It DOES make HTTP requests — to a server started in this process, on
// 127.0.0.1, needing no network and no third party. That is stated plainly
// because a neighbouring proof is grouped under a comment claiming "No HTTP
// requests" while reaching for example.com, and reports a network failure as an
// authorization defect (#67).
//
// CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-25

import http from 'node:http';
import { CompleteWebTester } from '../lib/complete-web-testing';

const PORT = 8117;

const PAGES: Record<string, string> = {
  // The shape that crashed: roughly example.com.
  '/minimal': '<!doctype html><html><head><title>Example Domain</title></head>'
    + '<body><div><h1>Example Domain</h1><p>Illustrative.</p></div></body></html>',
  // Semantic, labelled, with one deliberately unlabelled image.
  '/rich': '<!doctype html><html lang="en"><head><title>A Page</title>'
    + '<meta name="description" content="d"><meta name="viewport" content="width=device-width"></head>'
    + '<body><header><nav><a href="#main">Skip</a></nav></header><main id="main"><h1>H</h1>'
    + '<img src="/a.jpg" alt="described"><img src="/b.jpg">'
    + '<form><label for="q">Q</label><input id="q"></form></main><footer>f</footer></body></html>',
  // Nothing at all.
  '/bare': '<!doctype html><html><head></head><body></body></html>',
};

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) { console.log(`  ok   ${label}`); return; }
  console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  failures += 1;
}

async function main(): Promise<void> {
  console.log('proof.webscan');

  const server = http.createServer((req, res) => {
    const body = PAGES[(req.url ?? '').split('?')[0] ?? ''];
    if (body === undefined) { res.writeHead(404, { 'content-type': 'text/html' }); res.end('404'); return; }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(PORT, '127.0.0.1', resolve));

  try {
    for (const path of Object.keys(PAGES)) {
      let completed = false;
      let detail = '';
      let result: unknown = null;
      try {
        result = await new CompleteWebTester().testWebsite(`http://127.0.0.1:${PORT}${path}`);
        completed = true;
      } catch (error: unknown) {
        detail = error instanceof Error ? error.message : String(error);
      }
      // THE ASSERTION. Not "the score is right" — that a scan finishes at all.
      check(`${path} completes a scan without throwing`, completed, detail);

      if (completed) {
        const r = result as { issues?: unknown[]; score?: number };
        check(`${path} returns an issues array`, Array.isArray(r.issues));
        check(`${path} returns a numeric score`, typeof r.score === 'number');
      }
    }

    // The scan must actually look at the page, not merely survive it: the rich
    // page carries exactly one image without alt text and the scanner must say so.
    const rich = await new CompleteWebTester().testWebsite(`http://127.0.0.1:${PORT}/rich`) as {
      issues?: Array<{ message?: string }>;
    };
    const altFinding = (rich.issues ?? []).some((i) => /missing alt/i.test(i.message ?? ''));
    check('the rich page reports its one image missing alt text', altFinding);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  if (failures > 0) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
  console.log('\nall web-scan checks passed');
}

void main();
