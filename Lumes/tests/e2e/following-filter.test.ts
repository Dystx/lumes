import { chromium } from "playwright";

const baseUrl = process.env.LUMES_URL ?? "http://localhost:3000";
const FOLLOWED_STORAGE_KEY = "lumes.followed-incidents";
const FOLLOWED_READ_STATE_STORAGE_KEY = "lumes.followed-incidents-read-state";

interface IncidentResponse {
  incidents?: Array<{ id?: string }>;
}

async function resolveIncidentId(): Promise<string> {
  const response = await fetch(`${baseUrl}/api/incidents`);
  if (response.ok) {
    const payload = await response.json() as IncidentResponse;
    const id = payload.incidents?.find((incident) => typeof incident.id === "string")?.id;
    if (id) return id;
  }
  return "inc-monchique-2026";
}

async function openFollowingTab(page: import("playwright").Page): Promise<void> {
  await page.getByTestId("mobile-tablet-toolbar").getByRole("button", { name: /Incidentes|Incidents/ }).click();
  const tab = page.getByTestId("dashboard-following-tab");
  await tab.waitFor({ state: "visible", timeout: 10_000 });
  await tab.click();
}

async function openPhoneFollowing(page: import("playwright").Page): Promise<void> {
  await page
    .getByRole("navigation", { name: /Navegação principal|Primary navigation/ })
    .getByRole("button", { name: /Incêndios|Incidentes|Incidents/ })
    .click();
  const toggle = page.getByTestId("dashboard-following-mobile-toggle");
  await toggle.waitFor({ state: "visible", timeout: 10_000 });
  await toggle.click();
}

async function main(): Promise<void> {
  const incidentId = await resolveIncidentId();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 768, height: 1024 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(1_000);
    await page.evaluate(({ key, id }) => {
      window.localStorage.setItem(key, JSON.stringify([id]));
      window.localStorage.setItem("lumes.followed-incidents-read-state", JSON.stringify({
        [id]: "2020-01-01T00:00:00.000Z",
      }));
    }, { key: FOLLOWED_STORAGE_KEY, id: incidentId });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(1_000);
    await page.getByTestId("mobile-tablet-toolbar").getByRole("button", { name: /Incidentes|Incidents/ }).click();
    await page.getByTestId("dashboard-following-unread-count").waitFor({ state: "visible", timeout: 10_000 });
    await page.getByTestId("dashboard-following-tab").click();

    const row = page.getByTestId("dashboard-following-row");
    await row.first().waitFor({ state: "visible", timeout: 10_000 });
    if (await row.count() !== 1) throw new Error(`expected one followed row, got ${await row.count()}`);
    if (await row.first().getAttribute("data-incident-id") !== incidentId) {
      throw new Error("Following view rendered the wrong incident");
    }
    if (await page.getByTestId("dashboard-following-empty").count() !== 0) {
      throw new Error("Following view showed empty state with a followed incident");
    }
    if (await page.getByTestId("dashboard-following-unread-count").count() !== 0) {
      throw new Error("Following view did not mark visible followed updates as read");
    }
    const readState = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}") as Record<string, string>, FOLLOWED_READ_STATE_STORAGE_KEY);
    if (Number.isNaN(Date.parse(readState[incidentId] ?? "")) || Date.parse(readState[incidentId] ?? "") <= Date.parse("2020-01-01T00:00:00.000Z")) {
      throw new Error("Following view did not persist a valid read timestamp");
    }

    await page.getByRole("button", { name: /Explorar|Explore/ }).click();
    const explore = page.getByRole("dialog", { name: /Explorar mapa|Explore map/ });
    await explore.getByRole("textbox", { name: /Pesquisar localização|Search location/ }).fill("no-followed-match");
    await explore.getByRole("button", { name: /Fechar painel|Close panel/ }).click();
    await page.getByTestId("dashboard-following-no-match").waitFor({ state: "visible", timeout: 10_000 });
    if (await page.getByTestId("dashboard-following-empty").count() !== 0) {
      throw new Error("Following view mislabelled a filtered-out followed incident as no follows");
    }
    await page.getByTestId("dashboard-following-clear-filters").click();
    await row.first().waitFor({ state: "visible", timeout: 10_000 });

    await page.evaluate((key) => window.localStorage.removeItem(key), FOLLOWED_STORAGE_KEY);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(1_000);
    await openFollowingTab(page);
    await page.getByTestId("dashboard-following-empty").waitFor({ state: "visible", timeout: 10_000 });
    if (await page.getByTestId("dashboard-following-row").count() !== 0) {
      throw new Error("Following view rendered rows after local follow state was cleared");
    }

    const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    try {
      await phone.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await phone.waitForTimeout(1_000);
      await phone.evaluate(({ key, id }) => {
        window.localStorage.setItem(key, JSON.stringify([id]));
        window.localStorage.setItem("lumes.followed-incidents-read-state", JSON.stringify({
          [id]: "2020-01-01T00:00:00.000Z",
        }));
      }, { key: FOLLOWED_STORAGE_KEY, id: incidentId });
      await phone.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
      await phone.waitForTimeout(1_000);
      await phone
        .getByRole("navigation", { name: /Navegação principal|Primary navigation/ })
        .getByRole("button", { name: /Incêndios|Incidentes|Incidents/ })
        .click();
      await phone.getByTestId("dashboard-following-mobile-unread-count").waitFor({ state: "visible", timeout: 10_000 });
      await phone.getByTestId("dashboard-following-mobile-toggle").click();
      const phoneRow = phone.getByTestId("dashboard-following-row");
      await phoneRow.first().waitFor({ state: "visible", timeout: 10_000 });
      if (await phoneRow.count() !== 1) throw new Error(`expected one phone followed row, got ${await phoneRow.count()}`);

      await phone.evaluate((key) => window.localStorage.removeItem(key), FOLLOWED_STORAGE_KEY);
      await phone.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
      await phone.waitForTimeout(1_000);
      await openPhoneFollowing(phone);
      await phone.getByTestId("dashboard-following-empty").waitFor({ state: "visible", timeout: 10_000 });
      if (await phone.getByTestId("dashboard-following-row").count() !== 0) {
        throw new Error("phone Following view rendered rows after local follow state was cleared");
      }
    } finally {
      await phone.close();
    }

    console.log("✓ tablet and phone Following activity filters render followed rows and truthful empty states");
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
