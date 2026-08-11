// platform/pdf — HTML template -> PDF via headless Chromium (bilingual AR/EN certificates).
// Same technique proven in scripts/certificate-pdf-proof.mjs (Phase 0): the
// real GCC Lab letterhead background image + hand-calibrated field
// positions + embedded Noto Sans Arabic for correct RTL shaping. This is
// the live version driven by real certificate data, with a QR code added
// (the proof script predates that requirement).
import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import QRCode from "qrcode";

const ROOT = process.cwd();

function toDataUri(path: string, mime: string): string {
  return `data:${mime};base64,${readFileSync(path).toString("base64")}`;
}

/**
 * Noto Sans Arabic, inlined as data URIs.
 *
 * Headless Chromium has no system fonts to fall back on, so Arabic without
 * this renders as boxes — or worse, as unshaped disconnected letters that
 * look like text until someone who reads Arabic sees it. Every bilingual
 * document this platform generates needs these two faces.
 */
export function arabicFontFaces(): string {
  const regular = toDataUri(join(ROOT, "node_modules/@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-400-normal.woff2"), "font/woff2");
  const bold = toDataUri(join(ROOT, "node_modules/@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-700-normal.woff2"), "font/woff2");
  return `@font-face { font-family: 'Noto Sans Arabic'; src: url('${regular}') format('woff2'); font-weight: 400; }
  @font-face { font-family: 'Noto Sans Arabic'; src: url('${bold}') format('woff2'); font-weight: 700; }`;
}

// % of the 2000x1414 background image — same calibration as the Phase 0
// proof script for the pre-existing fields. qrCode is new here: placed in
// the top-right corner, clear of the letterhead content, which only starts
// around 39% down (see nameIdContractor below) — verified against a real
// rendered screenshot, not just guessed (see the render used to build
// this).
const FIELDS = {
  nameIdContractor: { top: 39, left: 8, width: 79 },
  courseName: { top: 66, left: 3, width: 76 },
  startDate: { top: 77.5, left: 21, width: 16 },
  endDate: { top: 77.5, left: 38, width: 16 },
  validTill: { top: 77.5, left: 65.5, width: 16 },
  organizedBy: { top: 89.5, left: 1.5, width: 42 },
  serialNo: { top: 89.5, left: 56, width: 30 },
  qrCode: { top: 3, left: 88, width: 9 },
};

export interface CertificatePdfData {
  employeeNameEn: string;
  employeeNameAr: string;
  iqama: string;
  contractorName: string;
  courseCode: string;
  courseTitleEn: string;
  courseTitleAr: string;
  startDateLabel: string;
  endDateLabel: string;
  validTillLabel: string;
  serial: string;
  verifyUrl: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

async function buildHtml(data: CertificatePdfData): Promise<string> {
  const bgImage = toDataUri(join(ROOT, "public/certificates/gcc-lab-certificate-bg.png"), "image/png");

  const qrDataUri = await QRCode.toDataURL(data.verifyUrl, { margin: 1, width: 300 });

  const nameEn = escapeHtml(data.employeeNameEn);
  const nameAr = escapeHtml(data.employeeNameAr);
  const iqama = escapeHtml(data.iqama);
  const contractor = escapeHtml(data.contractorName);
  // Two separate lines, each with its own explicit direction, rather than
  // one mixed English/Arabic paragraph — combining both languages in a
  // single bidi run caused the browser's bidi algorithm to badly misjudge
  // line length and overflow into the date row below (verified via a real
  // render before landing on this fix; see the two-line name-block above
  // for the same working pattern).
  const courseLineEn = escapeHtml(`${data.courseCode} · ${data.courseTitleEn}`);
  const courseLineAr = escapeHtml(data.courseTitleAr);
  const serial = escapeHtml(data.serial);

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<style>
  ${arabicFontFaces()}
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 2000px; height: 1414px; position: relative; font-family: 'Noto Sans Arabic', Arial, sans-serif; }
  img.bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .field { position: absolute; text-align: center; color: #3a2e2e; font-weight: 600; direction: ltr; }
  .name-block { display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 36px; }
  .course-name { display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 36px; white-space: nowrap; }
  .course-name-ar { font-size: 30px; font-weight: 700; color: #8b1538; direction: rtl; }
  .date-field { font-size: 34px; }
  .serial-field { font-size: 30px; font-family: monospace; }
  .organized-field { font-size: 30px; }
  .arabic-name { font-size: 32px; font-weight: 700; color: #8b1538; direction: rtl; }
  .qr-block { position: absolute; display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .qr-block img { width: 100%; height: auto; }
  .qr-label { font-size: 16px; color: #3a2e2e; }
</style>
</head>
<body>
  <img class="bg" src="${bgImage}" alt="" />

  <div class="field name-block" style="top:${FIELDS.nameIdContractor.top}%; left:${FIELDS.nameIdContractor.left}%; width:${FIELDS.nameIdContractor.width}%;">
    <div>Name: ${nameEn}</div>
    <div class="arabic-name">${nameAr} — شهادة إتمام تدريب</div>
    <div>ID: ${iqama} &nbsp;·&nbsp; Contractor: ${contractor}</div>
  </div>

  <div class="field course-name" style="top:${FIELDS.courseName.top}%; left:${FIELDS.courseName.left}%; width:${FIELDS.courseName.width}%;">
    <div>${courseLineEn}</div>
    <div class="course-name-ar">${courseLineAr}</div>
  </div>

  <div class="field date-field" style="top:${FIELDS.startDate.top}%; left:${FIELDS.startDate.left}%; width:${FIELDS.startDate.width}%;">${escapeHtml(data.startDateLabel)}</div>
  <div class="field date-field" style="top:${FIELDS.endDate.top}%; left:${FIELDS.endDate.left}%; width:${FIELDS.endDate.width}%;">${escapeHtml(data.endDateLabel)}</div>
  <div class="field date-field" style="top:${FIELDS.validTill.top}%; left:${FIELDS.validTill.left}%; width:${FIELDS.validTill.width}%;">${escapeHtml(data.validTillLabel)}</div>

  <div class="field organized-field" style="top:${FIELDS.organizedBy.top}%; left:${FIELDS.organizedBy.left}%; width:${FIELDS.organizedBy.width}%;">GCC Lab Development &amp; Certification Center</div>
  <div class="field serial-field" style="top:${FIELDS.serialNo.top}%; left:${FIELDS.serialNo.left}%; width:${FIELDS.serialNo.width}%;">${serial}</div>

  <div class="qr-block" style="top:${FIELDS.qrCode.top}%; left:${FIELDS.qrCode.left}%; width:${FIELDS.qrCode.width}%;">
    <img src="${qrDataUri}" alt="" />
    <span class="qr-label">Scan to verify</span>
  </div>
</body>
</html>`;
}

// Serverless runtimes ship no browser, so the certificate renderer brings
// its own: @sparticuz/chromium is a Chromium build packaged for Lambda-style
// filesystems, which playwright-core then drives. Locally and in CI we use
// the browser `playwright install` already downloaded — same rendering
// engine, no 50MB binary to inflate on every run.
//
// Both are imported inside this function, never at module scope.
// certification/service.ts imports this file and the admin class screen
// imports that, so a top-level browser import put a driver in the module
// graph of a page that only enrols candidates — and when it failed to
// resolve on Vercel it took the whole route down with a minified React 441
// rather than failing only the PDF it exists for.
async function launchBrowser() {
  const onServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  if (!onServerless) {
    const { chromium } = await import("playwright");
    return chromium.launch();
  }

  const { default: lambdaChromium } = await import("@sparticuz/chromium");
  const { chromium } = await import("playwright-core");
  // The certificate embeds its fonts as data URIs (see buildHtml), so the
  // graphics stack buys nothing here and costs memory and inflate time.
  lambdaChromium.setGraphicsMode = false;
  return chromium.launch({
    args: lambdaChromium.args,
    executablePath: await lambdaChromium.executablePath(),
    headless: true,
  });
}

/**
 * HTML to PDF. The certificate is one caller; the card pass list is another.
 *
 * Waiting on document.fonts.ready is not optional — page.pdf() will happily
 * snapshot before the inlined Arabic face has loaded, producing a document
 * that renders correctly on screen and as fallback glyphs on paper.
 */
export async function renderPdf(
  html: string,
  page: { width: string; height: string; viewport: { width: number; height: number } }
): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    const tab = await browser.newPage({ viewport: page.viewport });
    await tab.setContent(html, { waitUntil: "networkidle" });
    await tab.evaluate(async () => {
      await document.fonts.ready;
    });
    return await tab.pdf({
      width: page.width,
      height: page.height,
      printBackground: true,
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
    });
  } finally {
    await browser.close();
  }
}

export async function renderCertificatePdf(data: CertificatePdfData): Promise<Buffer> {
  const html = await buildHtml(data);
  return renderPdf(html, { width: "2000px", height: "1414px", viewport: { width: 2000, height: 1414 } });
}
