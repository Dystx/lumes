import { chromium } from "playwright";
import { RESPONSIVE_INCIDENTS_FIXTURE } from "./fixtures/incident-fixtures";

const baseUrl = process.env.LUMES_URL ?? "http://localhost:3000";
const viewports = [
  { name: "small-mobile", width: 320, height: 568 },
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "landscape-tablet", width: 1024, height: 768 },
  { name: "desktop", width: 1280, height: 800 },
  { name: "wide-desktop", width: 1440, height: 900 },
];

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  let failures = 0;

  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, reducedMotion: "reduce", serviceWorkers: "block" });
    const page = await context.newPage();
    try {
      await page.route("**/api/incidents**", async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        if (route.request().method() !== "GET" || pathname !== "/api/incidents") {
          await route.continue();
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(RESPONSIVE_INCIDENTS_FIXTURE),
        });
      });
      await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForTimeout(1_000);
      // Exercise the same interaction contract with motion reduced. The
      // normal-motion path remains covered by the existing visual waits.
      const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      if (horizontalOverflow) throw new Error("horizontal overflow");

      if (viewport.width < 1280) {
        if (viewport.width <= 1024) {
          const expandMap = page.getByRole("button", { name: /Expandir resumo de incêndios|Expand fire summary/ });
          await expandMap.click();
          const sheet = page.getByTestId("mobile-map-sheet");
          await sheet.waitFor({ state: "visible" });
          const sheetBox = await sheet.boundingBox();
          const controlsBox = await page.getByTestId("mobile-map-controls").boundingBox();
          if (!sheetBox || !controlsBox) throw new Error("mobile map chrome bounds unavailable");
          if (controlsBox.bottom > sheetBox.top) throw new Error("mobile map controls overlap expanded sheet");
          const controlHeights = await page.getByTestId("mobile-map-controls").locator("button").evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
          if (controlHeights.some((height) => height < 44)) throw new Error("mobile map control target is below 44px");

          if (viewport.width === 390) {
            const dragHandle = sheet.locator(".cursor-grab").first();
            const handleBox = await dragHandle.boundingBox();
            if (!handleBox) throw new Error("mobile sheet drag handle bounds unavailable");
            await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
            await page.mouse.down();
            await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + 260, { steps: 6 });
            await page.mouse.up();
            await page.waitForTimeout(350);
            const collapsedSheet = await sheet.boundingBox();
            if (!collapsedSheet || collapsedSheet.height > 120) throw new Error("downward sheet drag did not collapse the map sheet");
          }

          const toolbar = page.getByTestId("mobile-tablet-toolbar");
          if (viewport.width >= 768) {
            const toolbarBox = await toolbar.boundingBox();
            if (!toolbarBox) throw new Error("tablet toolbar bounds unavailable");
            const overlaps = (a: NonNullable<typeof toolbarBox>, b: NonNullable<typeof toolbarBox>) =>
              a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
            for (const testId of ["mobile-attribution", "mobile-legend-toggle", "mobile-filter-pill"]) {
              const candidate = page.getByTestId(testId);
              if (await candidate.count() === 0) continue;
              const candidateBox = await candidate.boundingBox();
              if (candidateBox && overlaps(toolbarBox, candidateBox)) throw new Error(`${testId} overlaps tablet toolbar`);
            }
          }
        }

        const explore = page.getByRole("button", { name: /Explorar mapa|Explore map/ });
        await explore.click();
        const dialog = page.getByRole("dialog", { name: /Explorar mapa|Explore map/ });
        await dialog.waitFor({ state: "visible" });
        if (viewport.width < 768 && await page.getByTestId("mobile-map-controls").count() > 0) {
          throw new Error("phone map controls remain mounted under the Explore drawer");
        }
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });

        if (viewport.width === 390) {
          await page.getByRole("button", { name: /Mais|More/ }).click();
          const reportOpener = page.getByRole("button", { name: /Comunicar Incêndio|Report Fire/ });
          await reportOpener.click();
          const report = page.getByRole("dialog", { name: /Comunicar Incêndio|Report Fire/ });
          await report.waitFor({ state: "visible" });
          const reportFocusInside = await report.evaluate((dialog) => dialog.contains(document.activeElement));
          if (!reportFocusInside) throw new Error("report dialog did not receive focus");
          if (viewport.width === 390) {
            await context.grantPermissions(["geolocation"], { origin: baseUrl });
            await context.setGeolocation({ latitude: 38.7223, longitude: -9.1393 });
            await page.route("**/api/reports", (route) => route.fulfill({
              status: 503,
              contentType: "application/json",
              body: JSON.stringify({ error: "Reports are temporarily unavailable." }),
            }));
            const captureLocation = report.getByRole("button", { name: /Capturar(?: a minha)? localização|Capture(?: my)? location/ });
            await captureLocation.click();
            const submitReport = report.getByRole("button", { name: /Enviar|Submit/ });
            await submitReport.waitFor({ state: "visible" });
            await submitReport.click();
            const reportFailureToast = page.locator("[data-sonner-toast]:visible").last();
            await reportFailureToast.waitFor({ state: "visible" });
            if (!(await reportFailureToast.textContent())?.trim()) throw new Error("report failure toast was empty");
            await page.unroute("**/api/reports");
          }
          await page.keyboard.press("Escape");
          await report.waitFor({ state: "hidden" });
          const reportFocusReturned = await reportOpener.evaluate((element) => document.activeElement === element);
          if (!reportFocusReturned) throw new Error("report dialog did not restore opener focus");

          const alertsTab = page.getByRole("button", { name: /Alertas|Alerts/ }).first();
          const alertsTabLabel = await alertsTab.getAttribute("aria-label");
          if (!alertsTabLabel || !/3 (não lidas|unread)/.test(alertsTabLabel)) {
            throw new Error(`mobile alerts tab did not expose the unread count: ${alertsTabLabel ?? "missing label"}`);
          }
          await alertsTab.click();
          await page.waitForTimeout(400);
          if (await page.getByTestId("mobile-content-sheet").count() !== 1) {
            throw new Error("mobile sheet transition left duplicate content sheets");
          }
          const notificationsButton = page.getByRole("button", { name: /Notificações|Notifications/ });
          await notificationsButton.scrollIntoViewIfNeeded();
          await notificationsButton.click();
          const notifications = page.getByRole("dialog", { name: /Ver notificações|View notifications/ });
          await notifications.waitFor({ state: "visible" });
          const notificationFocusInside = await notifications.evaluate((dialog) => dialog.contains(document.activeElement));
          if (!notificationFocusInside) throw new Error("notifications drawer did not receive focus");
          const markAllRead = notifications.getByRole("button", { name: /Marcar tudo como lido|Mark all read/ });
          await markAllRead.click();
          if (!(await markAllRead.isDisabled())) throw new Error("mark-all notifications remained enabled after clearing unread state");
          const clearedAlertsTabLabel = await alertsTab.getAttribute("aria-label");
          if (clearedAlertsTabLabel && /3 (não lidas|unread)/.test(clearedAlertsTabLabel)) {
            throw new Error("mobile alerts badge remained after marking notifications read");
          }
          await page.keyboard.press("Escape");
          await notifications.waitFor({ state: "hidden" });
          const notificationFocusReturned = await notificationsButton.evaluate((element) => document.activeElement === element);
          if (!notificationFocusReturned) throw new Error("notifications drawer did not restore opener focus");

          const primaryNav = page.getByRole("navigation", { name: /Navegação principal|Primary navigation/ });
          await primaryNav.getByRole("button", { name: /Incidentes|Incidents/ }).click();
          const incidentSheet = page.getByTestId("mobile-content-sheet");
          await incidentSheet.waitFor({ state: "visible" });
          const scrollOwners = incidentSheet.locator(".ember-scroll");
          if (await scrollOwners.count() !== 1) throw new Error("mobile incidents sheet has multiple vertical scroll owners");
          const scrollMetrics = await scrollOwners.first().evaluate((element) => ({
            clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight,
          }));
          if (scrollMetrics.scrollHeight > scrollMetrics.clientHeight) {
            await scrollOwners.first().evaluate((element) => { element.scrollTop = Math.min(160, element.scrollHeight); });
            const scrollTop = await scrollOwners.first().evaluate((element) => element.scrollTop);
            if (scrollTop <= 0) throw new Error("mobile incidents sheet did not scroll its sole owner");
          }
        }
      } else {
        await page.getByTestId("map-attribution").waitFor({ state: "visible", timeout: 10_000 });
        await page.waitForTimeout(1_000);
        if (viewport.width === 1280) {
        // Marker -> Inspector: use the same initial map camera as the
        // production map and project one live incident onto the canvas.
        // Wait for the client incident source, not merely the static map
        // attribution, so the projected click cannot race source.setData().
        await page.locator('[data-testid="ember-map"][data-map-ready="true"][data-incident-source-ready="true"]').waitFor({ state: "visible", timeout: 15_000 });
        await page.getByTestId("situation-incident").first().waitFor({ state: "visible", timeout: 15_000 });
        // The readiness attributes are published when the source is attached;
        // give MapLibre one settled render frame before projecting a canvas
        // coordinate so the test never races source.setData()/idle.
        await page.waitForTimeout(1_500);
        const markerPoints = await page.evaluate(() => {
          const visibleIncidents = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="situation-incident"][data-incident-lon][data-incident-lat]'))
            .map((element) => ({
              longitude: Number(element.dataset.incidentLon),
              latitude: Number(element.dataset.incidentLat),
            }))
            .filter(({ longitude, latitude }) => Number.isFinite(longitude) && Number.isFinite(latitude));
          const canvas = document.querySelector<HTMLCanvasElement>(".maplibregl-canvas");
          if (!canvas) return [];
          const rect = canvas.getBoundingClientRect();
          const zoom = 6.2;
          const world = 512 * (2 ** zoom);
          const projectX = (longitude: number) => ((longitude + 180) / 360) * world;
          const projectY = (latitude: number) => {
            const radians = latitude * Math.PI / 180;
            return (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2 * world;
          };
          const points: Array<{ x: number; y: number }> = [];
          for (const { longitude, latitude } of visibleIncidents) {
            const x = rect.width / 2 + projectX(longitude) - projectX(-8);
            const y = rect.height / 2 + projectY(latitude) - projectY(39.5);
            if (x > 0 && x < rect.width && y > 0 && y < rect.height) points.push({ x, y });
          }
          // Prefer points near the viewport centre: edge points are more often
          // cluster centroids at the national overview zoom, and clicking a
          // centroid changes the camera before the next candidate is tried.
          return points.sort((a, b) => Math.abs(a.y - rect.height / 2) - Math.abs(b.y - rect.height / 2));
        });
        if (markerPoints.length === 0) throw new Error("no visible incident marker point");
        const canvas = page.locator(".maplibregl-canvas").first();
        const markerInspector = page.getByRole("dialog", { name: /Inspector/ });
        let markerOpened = false;
        for (const markerPoint of markerPoints) {
          for (let attempt = 0; attempt < 2 && !markerOpened; attempt += 1) {
            await canvas.click({ position: markerPoint });
            markerOpened = await markerInspector.isVisible().catch(() => false);
            if (!markerOpened) await page.waitForTimeout(500);
          }
          if (markerOpened) break;
        }
        if (!markerOpened) {
          // A cluster can absorb the projected click while the source finishes
          // loading; use the stable nearest-feature tolerance point once.
          await canvas.click({ position: { x: 400, y: 165 } });
          await markerInspector.waitFor({ state: "visible", timeout: 8_000 });
        }
        await markerInspector.getByRole("button", { name: /Fechar painel|Close panel/ }).first().click();
        await markerInspector.waitFor({ state: "hidden" });
        const markerFocusReturned = await canvas.evaluate((element) => document.activeElement === element);
        if (!markerFocusReturned) throw new Error("marker Inspector close did not restore map focus");
        }

        await page.getByRole("button", { name: /Explorar|Explore/ }).click();
        // Explore is a non-modal accessible drawer; its semantic role is a
        // dialog so focus/escape behavior can be tested consistently.
        const drawer = page.getByTestId("right-sidebar-drawer");
        await page.getByRole("dialog", { name: /Explorar|Explore/ }).waitFor({ state: "visible" });
        await drawer.waitFor({ state: "visible" });
        // The drawer and map-chrome inset update together, but the drawer has
        // a 280ms entrance transition. Sample geometry only after that
        // transition settles so the contract tests the stable layout rather
        // than an intentional intermediate animation frame.
        await page.waitForTimeout(350);

        if (viewport.width >= 1280) {
          const quickFilterOwners = page.locator('[data-query-owner="quick-filter"]:visible');
          if (await quickFilterOwners.count() !== 1) throw new Error("desktop query controls have multiple or missing owners");
          if (await page.getByText("Critical only", { exact: true }).count() > 0) {
            throw new Error("legacy Critical only query control is still rendered");
          }
        }

        const map = page.locator(".maplibregl-canvas").first();
        const mapBox = await map.boundingBox();
        const drawerBox = await drawer.boundingBox();
        if (!mapBox || !drawerBox) throw new Error("map/drawer bounds unavailable");
        if (drawerBox.x - mapBox.x < 500) throw new Error("Explore drawer leaves less than 500px of map");

        const boxesOverlap = (a: NonNullable<typeof mapBox>, b: NonNullable<typeof mapBox>) =>
          a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
        for (const testId of ["map-controls", "map-attribution", "map-legend-chrome"]) {
          const chromeBox = await page.getByTestId(testId).boundingBox();
          if (!chromeBox) throw new Error(`${testId} bounds unavailable`);
          if (boxesOverlap(chromeBox, drawerBox)) throw new Error(`${testId} overlaps Explore drawer`);
        }

        // Feedback must sit outside the map chrome corridor. Trigger a
        // normal action toast so this also covers the same Sonner surface
        // used by live-data recovery feedback.
        await page.getByRole("button", { name: /Reset view to Portugal/ }).click();
        const toast = page.locator("[data-sonner-toast]:visible").last();
        await toast.waitFor({ state: "visible" });
        const toastBox = await toast.boundingBox();
        if (!toastBox) throw new Error("toast bounds unavailable");
        for (const testId of ["map-attribution", "map-controls", "map-legend-chrome", "right-sidebar-drawer"]) {
          const chromeBox = await page.getByTestId(testId).boundingBox();
          if (!chromeBox) throw new Error(`${testId} bounds unavailable for toast check`);
          if (boxesOverlap(toastBox, chromeBox)) throw new Error(`toast overlaps ${testId}`);
        }

        const playback = page.getByTestId("playback-bar");
        const playbackBox = await playback.boundingBox();
        if (!playbackBox) throw new Error("playback bounds unavailable");
        if (boxesOverlap(playbackBox, drawerBox)) throw new Error("playback overlaps Explore drawer");

        // A list selection opens the Inspector and closing it must return
        // focus to the control that initiated the selection.
        await page.keyboard.press("Escape");
        await drawer.waitFor({ state: "hidden" });
        const listOpener = page.getByTestId("situation-incident").first();
        await listOpener.focus();
        await listOpener.click();
        const inspector = page.getByRole("dialog", { name: /Inspector/ });
        await inspector.waitFor({ state: "visible" });
        const followButton = inspector.getByRole("button", { name: /Seguir este incêndio|Follow this incident|A seguir/ }).first();
        await followButton.waitFor({ state: "visible" });
        if (await followButton.isEnabled()) {
          await followButton.click();
          await inspector.getByRole("button", { name: /A seguir|Following/ }).first().waitFor({ state: "visible" });
        }
        const shareButton = inspector.getByRole("button", { name: "Share incident" });
        await shareButton.click();
        const shareTitle = await shareButton.getAttribute("title");
        if (shareTitle && !/copiada|copied|Copy share link/.test(shareTitle)) {
          throw new Error(`unexpected share action state: ${shareTitle}`);
        }
        await inspector.getByRole("button", { name: /Fechar painel|Close panel/ }).first().click();
        await inspector.waitFor({ state: "hidden" });
        const focusReturned = await listOpener.evaluate((element) => document.activeElement === element);
        if (!focusReturned) throw new Error("Inspector close did not restore list focus");

        if (viewport.width === 1280) {
          const themeToggle = page.getByRole("button", { name: "Toggle theme" }).first();
          await themeToggle.click();
          await page.waitForFunction(() => document.documentElement.classList.contains("light"), undefined, { timeout: 5_000 });
          await page.locator('[data-testid="ember-map"][data-map-ready="true"]').waitFor({ state: "visible", timeout: 15_000 });
          if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) {
            throw new Error("light theme introduced horizontal overflow");
          }
          await themeToggle.click();
          await page.waitForFunction(() => document.documentElement.classList.contains("dark"), undefined, { timeout: 5_000 });
          await page.locator('[data-testid="ember-map"][data-map-ready="true"]').waitFor({ state: "visible", timeout: 15_000 });
        }
      }
      console.log(`  ✓ ${viewport.name}`);
    } catch (error) {
      failures += 1;
      console.error(`  ✗ ${viewport.name}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await context.close();
    }
  }

  await browser.close();
  if (failures > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
