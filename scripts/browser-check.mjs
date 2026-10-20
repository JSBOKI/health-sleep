import puppeteer from "puppeteer-core";
import fs from "node:fs";

const base = "http://127.0.0.1:4179/";
const outDir = "/opt/cursor/artifacts";
fs.mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const page = await browser.newPage();
page.setDefaultTimeout(120000);
const logs = [];
page.on("console", (msg) => logs.push(`${msg.type()}: ${msg.text()}`));
page.on("pageerror", (err) => logs.push(`pageerror: ${err.message}`));

async function overflow() {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
await page.goto(base, { waitUntil: "networkidle0" });
await page.waitForSelector("text/Load demo data");
await page.click("text/Load demo data");
await page.waitForFunction(() => document.body.innerText.includes("vs prior 30 days"), { timeout: 30000 });
const demoOverflow = await overflow();
await page.screenshot({ path: `${outDir}/overview.png`, fullPage: true });

await page.goto(`${base}#/metric/spo2`, { waitUntil: "networkidle0" });
await page.waitForSelector("canvas");
await page.waitForFunction(() => document.body.innerText.includes("Readings under 92%"));
await page.screenshot({ path: `${outDir}/spo2.png`, fullPage: true });

await page.goto(`${base}#/sleep`, { waitUntil: "networkidle0" });
await page.waitForSelector("canvas");
await page.waitForFunction(() => document.body.innerText.includes("Stages each night"));
await page.screenshot({ path: `${outDir}/sleep.png`, fullPage: true });

await page.goto(`${base}#/trends`, { waitUntil: "networkidle0" });
await page.waitForFunction(() => document.body.innerText.includes("Mann–Kendall") || document.body.innerText.includes("What the numbers"));
const buttons = await page.$$("button");
for (const button of buttons) {
  const label = await button.evaluate((el) => el.textContent?.trim());
  if (label === "1y") {
    await button.click();
    break;
  }
}
await page.waitForFunction(() => document.body.innerText.includes("Watch6,18"));
await page.screenshot({ path: `${outDir}/trends.png`, fullPage: true });

await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await page.goto(`${base}#/`, { waitUntil: "networkidle0" });
await page.waitForFunction(() => document.body.innerText.includes("Blood oxygen"));
const mobileOverflow = await overflow();
await page.screenshot({ path: `${outDir}/overview_mobile.png` });
await page.goto(`${base}#/metric/spo2`, { waitUntil: "networkidle0" });
await page.waitForSelector("canvas");
await page.screenshot({ path: `${outDir}/spo2_mobile.png` });

const text = await page.evaluate(() => document.body.innerText);
if (!text.includes("95%")) throw new Error("SpO2 reference line label missing");

await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
await page.goto(`${base}#/data`, { waitUntil: "networkidle0" });
const input = await page.$('input[type="file"]');
if (!input) throw new Error("file input missing");
const started = Date.now();
await input.uploadFile("/tmp/jeremy-health-export.zip");
await page.waitForFunction(
  () => document.body.innerText.includes("Added ") && document.body.innerText.includes("samples from"),
  { timeout: 120000 },
);
const after = await page.evaluate(() => document.body.innerText);
const elapsed = ((Date.now() - started) / 1000).toFixed(1);
if (after.includes("worker stopped") || after.includes("No Health records")) {
  throw new Error(after.slice(0, 500));
}
console.log("import seconds", elapsed);
console.log(after.split("\n").filter((line) => line.includes("Added ") || line.includes("Skipped") || line.includes("nights")).slice(0, 5));
console.log("overflow desktop", demoOverflow, "mobile", mobileOverflow);
const bad = logs.filter((line) => /error|pageerror/i.test(line) && !/favicon/i.test(line));
if (bad.length) console.log("console", bad.slice(0, 10));
if (demoOverflow > 2 || mobileOverflow > 2) throw new Error(`horizontal overflow desktop ${demoOverflow} mobile ${mobileOverflow}`);
await browser.close();
console.log("browser checks passed");
