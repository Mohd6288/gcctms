#!/usr/bin/env node
// Phase 0 proof-of-concept: HTML certificate template -> PDF via headless
// Chromium, bilingual AR/EN with an embedded Arabic font (Noto Sans Arabic).
// Uses the real GCC Lab certificate letterhead + the field-position layout
// already calibrated against it (see docs/certificate-field-positions.md).
// The real Phase 8 certificate engine (modules/platform/pdf/) reuses this
// same technique against live request/certificate data.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outDir = join(root, "scripts", "output");
mkdirSync(outDir, { recursive: true });

function toDataUri(path, mime) {
  return `data:${mime};base64,${readFileSync(path).toString("base64")}`;
}

const bgImage = toDataUri(join(root, "public/certificates/gcc-lab-certificate-bg.png"), "image/png");
const notoRegular = toDataUri(
  join(root, "node_modules/@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-400-normal.woff2"),
  "font/woff2"
);
const notoBold = toDataUri(
  join(root, "node_modules/@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-700-normal.woff2"),
  "font/woff2"
);

// Field positions as % of the 2000x1414 background image — same calibration
// used by the validated prototype's CertificateDocument.tsx.
const FIELDS = {
  nameIdContractor: { top: 39, left: 8, width: 79 },
  courseName: { top: 66, left: 3, width: 76 },
  startDate: { top: 77.5, left: 21, width: 16 },
  endDate: { top: 77.5, left: 38, width: 16 },
  validTill: { top: 77.5, left: 65.5, width: 16 },
  organizedBy: { top: 89.5, left: 1.5, width: 42 },
  serialNo: { top: 89.5, left: 56, width: 30 },
};

const sampleData = {
  nameEn: "Abdulrahman Fahad Al-Dosari",
  nameAr: "عبدالرحمن فهد الدوسري",
  iqama: "2312345678",
  contractor: "Zamil Steel Buildings Co.",
  courseCode: "CSCC19",
  courseTitle: "Confined Space Entry Program",
  startDate: "21 Jul 2026",
  endDate: "22 Jul 2026",
  validTill: "21 Jul 2028",
  serial: "GCCLAB-CSCC19-20260721-0847",
};

const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<style>
  @font-face {
    font-family: 'Noto Sans Arabic';
    src: url('${notoRegular}') format('woff2');
    font-weight: 400;
  }
  @font-face {
    font-family: 'Noto Sans Arabic';
    src: url('${notoBold}') format('woff2');
    font-weight: 700;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 2000px; height: 1414px; position: relative; font-family: 'Noto Sans Arabic', Arial, sans-serif; }
  img.bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .field { position: absolute; text-align: center; color: #3a2e2e; font-weight: 600; direction: ltr; }
  .field.rtl-field { direction: rtl; }
  .name-block { display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 36px; }
  .course-name { font-size: 46px; }
  .date-field { font-size: 34px; }
  .serial-field { font-size: 30px; font-family: monospace; }
  .organized-field { font-size: 30px; }
  .arabic-name {
    font-size: 32px;
    font-weight: 700;
    color: #8b1538;
    direction: rtl;
  }
</style>
</head>
<body>
  <img class="bg" src="${bgImage}" alt="" />

  <div class="field name-block" style="top:${FIELDS.nameIdContractor.top}%; left:${FIELDS.nameIdContractor.left}%; width:${FIELDS.nameIdContractor.width}%;">
    <div>Name: ${sampleData.nameEn}</div>
    <!-- Arabic-rendering proof: real Arabic name + certificate phrase, RTL shaping, correct letterform joining -->
    <div class="arabic-name">${sampleData.nameAr} — شهادة إتمام تدريب</div>
    <div>ID: ${sampleData.iqama} &nbsp;·&nbsp; Contractor: ${sampleData.contractor}</div>
  </div>

  <div class="field course-name" style="top:${FIELDS.courseName.top}%; left:${FIELDS.courseName.left}%; width:${FIELDS.courseName.width}%;">
    ${sampleData.courseCode} · ${sampleData.courseTitle}
  </div>

  <div class="field date-field" style="top:${FIELDS.startDate.top}%; left:${FIELDS.startDate.left}%; width:${FIELDS.startDate.width}%;">${sampleData.startDate}</div>
  <div class="field date-field" style="top:${FIELDS.endDate.top}%; left:${FIELDS.endDate.left}%; width:${FIELDS.endDate.width}%;">${sampleData.endDate}</div>
  <div class="field date-field" style="top:${FIELDS.validTill.top}%; left:${FIELDS.validTill.left}%; width:${FIELDS.validTill.width}%;">${sampleData.validTill}</div>

  <div class="field organized-field" style="top:${FIELDS.organizedBy.top}%; left:${FIELDS.organizedBy.left}%; width:${FIELDS.organizedBy.width}%;">GCC Lab Development &amp; Certification Center</div>
  <div class="field serial-field" style="top:${FIELDS.serialNo.top}%; left:${FIELDS.serialNo.left}%; width:${FIELDS.serialNo.width}%;">${sampleData.serial}</div>
</body>
</html>`;

writeFileSync(join(outDir, "certificate-proof.html"), html);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2000, height: 1414 } });
await page.setContent(html, { waitUntil: "networkidle" });
await page.evaluate(async () => {
  await document.fonts.ready;
});

await page.screenshot({ path: join(outDir, "certificate-proof.png") });
await page.pdf({
  path: join(outDir, "certificate-proof.pdf"),
  width: "2000px",
  height: "1414px",
  printBackground: true,
  margin: { top: 0, bottom: 0, left: 0, right: 0 },
});

await browser.close();

console.log("Wrote:");
console.log(" -", join(outDir, "certificate-proof.pdf"));
console.log(" -", join(outDir, "certificate-proof.png"));
console.log(" -", join(outDir, "certificate-proof.html"));
