import { chromium } from "playwright";

const BASE = "https://gcctms.vercel.app";
const email = `live-smoke-${Date.now()}@test.com`;

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
});

console.log("1. Registering a test contractor company on LIVE...");
await page.goto(`${BASE}/en/register`, { waitUntil: "networkidle" });
await page.fill("#name", "Live Smoke Test Co.");
await page.fill("#crNumber", String(Date.now()).slice(-10));
await page.fill("#contactName", "Live Smoke Tester");
await page.fill("#contactEmail", email);
await page.fill("#contactPhone", "+966500000001");
await page.fill("#city", "Jeddah");
await page.fill("#sector", "Electrical");
await page.selectOption("#region", "West");
await page.selectOption("#contractorCategory", "Transmission");
await page.fill("#password", "LiveSmoke123!");
await page.click('button[type="submit"]');
await page.waitForURL(/dashboard/, { timeout: 20000 });
console.log("   -> registered + signed in, at", page.url());

console.log("2. Opening new request wizard on LIVE...");
await page.goto(`${BASE}/en/dashboard/requests/new`, { waitUntil: "networkidle" });
const courseOptions = await page.locator("#courseId option").allTextContents();
console.log(`   -> course dropdown has ${courseOptions.length} options (Transmission + universal courses)`);
if (courseOptions.length < 10) errors.push(`Expected 20+ Transmission courses, got ${courseOptions.length}`);

const target = courseOptions.find((c) => c.includes("Work at Heights")) ?? courseOptions[1];
await page.selectOption("#courseId", { label: target });
console.log("   -> selected course:", target);
await page.click('button:has-text("Next")');
await page.waitForTimeout(1500);

console.log("3. Adding an employee inline on LIVE...");
await page.click('button:has-text("Add employee")');
await page.waitForTimeout(500);
await page.fill("#wiz-fullNameEn", "Live Test Employee");
await page.fill("#wiz-fullNameAr", "موظف اختبار حي");
await page.fill("#wiz-nationalId", "9876543210");
const roleOptions = await page.locator("#wiz-jobRoleId option").allTextContents();
console.log(`   -> job role dropdown has ${roleOptions.length} options`);
await page.selectOption("#wiz-jobRoleId", { label: roleOptions.find((r) => r.includes("Transmission Lineman")) ?? roleOptions[0] });
await page.locator('form button[type="submit"]').click();
await page.waitForTimeout(2500);
await page.waitForLoadState("networkidle");
await page.waitForTimeout(2000);

console.log("4. Checking employee list + eligibility badge on LIVE...");
const bodyText = await page.locator("body").innerText();
const hasEmployee = bodyText.includes("Live Test Employee");
const hasBadge = bodyText.includes("Role not eligible") || bodyText.includes("Eligible") || bodyText.includes("Missing prerequisite");
console.log(`   -> employee visible: ${hasEmployee}`);
console.log(`   -> some eligibility badge visible: ${hasBadge}`);
if (!hasEmployee) errors.push("Newly created employee did not appear in the list");

await page.screenshot({ path: "/tmp/claude-1000/-home-mk-tms-prototype/f87e94c5-4ac0-49d7-95b4-685dba815e3f/scratchpad/live-step2.png", fullPage: true });

console.log("\n=== ERRORS ===");
console.log(errors.length === 0 ? "none" : errors.join("\n"));

await browser.close();
process.exit(errors.length > 0 ? 1 : 0);
