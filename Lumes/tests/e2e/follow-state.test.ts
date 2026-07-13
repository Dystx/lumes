import { chromium, type Locator, type Page } from "playwright";

const baseUrl = process.env.LUMES_URL ?? "http://localhost:3000";
const FOLLOWED_STORAGE_KEY = "lumes.followed-incidents";
const followLabel = /Seguir este incêndio|Follow this incident/;
const followingLabel = /A seguir|Following/;

async function openFirstIncident(page: Page): Promise<{ followButton: Locator; incidentId: string }> {
  const incident = page.getByTestId("situation-incident").first();
  await incident.waitFor({ state: "visible", timeout: 15_000 });
  const incidentId = await incident.getAttribute("data-incident-id");
  if (!incidentId) throw new Error("first incident did not expose an ID");
  await incident.click();
  const inspector = page.getByRole("dialog", { name: /Inspector/ });
  await inspector.waitFor({ state: "visible", timeout: 10_000 });
  const followButton = page.getByTestId("incident-follow-toggle").first();
  await followButton.waitFor({ state: "visible", timeout: 10_000 });
  return { followButton, incidentId };
}

async function resetFollowStorage(page: Page): Promise<void> {
  await page.evaluate((key) => window.localStorage.removeItem(key), FOLLOWED_STORAGE_KEY);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(700);
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  let failures = 0;

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(700);

    await resetFollowStorage(page);
    const first = await openFirstIncident(page);
    await first.followButton.getByText(followLabel).click();
    await first.followButton.getByText(followingLabel).waitFor({ state: "visible", timeout: 5_000 });
    const storedAfterFollow = await page.evaluate((key) => {
      const value = window.localStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    }, FOLLOWED_STORAGE_KEY);
    if (!Array.isArray(storedAfterFollow) || !storedAfterFollow.includes(first.incidentId)) {
      throw new Error("follow state was not persisted to localStorage");
    }

    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(700);
    const afterReload = await openFirstIncident(page);
    await afterReload.followButton.getByText(followingLabel).waitFor({ state: "visible", timeout: 5_000 });
    console.log("  ✓ follow persists across reload");

    await resetFollowStorage(page);
    const rapid = await openFirstIncident(page);
    const initialToastCount = await page.locator("[data-sonner-toast]:visible").count();
    await rapid.followButton.evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
    await rapid.followButton.getByText(followingLabel).waitFor({ state: "visible", timeout: 5_000 });
    await page.waitForTimeout(150);
    const appliedToasts = page.locator("[data-sonner-toast]:visible").filter({ hasText: /guardado neste dispositivo|saved on this device/ });
    if (await appliedToasts.count() !== 1) {
      throw new Error(`rapid duplicate clicks emitted ${await appliedToasts.count()} follow toasts (initial ${initialToastCount})`);
    }
    const storedAfterRapid = await page.evaluate((key) => window.localStorage.getItem(key), FOLLOWED_STORAGE_KEY);
    if (storedAfterRapid !== JSON.stringify([rapid.incidentId])) {
      throw new Error(`rapid duplicate clicks persisted unexpected state: ${storedAfterRapid}`);
    }
    console.log("  ✓ rapid duplicate clicks apply once");

    await resetFollowStorage(page);
    const failed = await openFirstIncident(page);
    await page.evaluate((key) => {
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function setItem(storageKey: string, value: string): void {
        if (storageKey === key) throw new Error("follow storage blocked");
        originalSetItem.call(this, storageKey, value);
      };
    }, FOLLOWED_STORAGE_KEY);
    await failed.followButton.getByText(followLabel).click();
    const failureToast = page.locator("[data-sonner-toast]:visible").filter({ hasText: /Não foi possível atualizar|Unable to update/ });
    await failureToast.waitFor({ state: "visible", timeout: 5_000 });
    await failed.followButton.getByText(followLabel).waitFor({ state: "visible", timeout: 5_000 });
    if (await page.evaluate((key) => window.localStorage.getItem(key), FOLLOWED_STORAGE_KEY) !== null) {
      throw new Error("failed follow write left localStorage populated");
    }
    console.log("  ✓ failed writes roll back and surface a localized error");
  } catch (error) {
    failures += 1;
    console.error(`  ✗ follow state: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await context.close();
    await browser.close();
  }

  if (failures > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
