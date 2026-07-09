import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
	viewport: { width: 1440, height: 900 },
	serviceWorkers: "block",
});
const page = await ctx.newPage();

const errors = [];
const failed = [];
page.on("pageerror", (e) => errors.push("PAGE: " + e.message));
page.on("console", (msg) => {
	if (msg.type() === "error") errors.push("CONSOLE: " + msg.text());
});
page.on("response", (resp) => {
	if (resp.status() >= 400) failed.push(resp.status() + " " + resp.url());
});

const response = await page.goto("https://lumes.pt/?t=" + Date.now(), {
	waitUntil: "domcontentloaded",
	timeout: 30000,
});
console.log("Status:", response?.status());
await page.waitForTimeout(15000);
await page.screenshot({ path: "/tmp/site-fresh.png" });

console.log("\nJS errors:", errors.length);
errors.forEach((e) => console.log("  -", e.slice(0, 150)));
console.log("\nFailed requests:", failed.length);
failed.slice(0, 5).forEach((f) => console.log("  -", f));

await browser.close();
