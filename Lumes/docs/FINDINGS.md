# Lumes.pt — Findings & Review

**Date**: 2026-07-06
**Reviewer**: Visual UX, a11y, code-level analysis
**Status**: Active document — updated as fixes land

This document captures every UX, design, accessibility, and code-level issue identified during comprehensive review of the live site on desktop (1440×900) and mobile (iPhone 13 390×844, iPhone SE 320×568, iPad 810×1080, landscape 844×390).

Each finding has:
- **ID** (F-XXX)
- **Severity** 🔴 high / 🟠 med / 🟡 low
- **Component / location**
- **Description**
- **Suggested fix**
- **Status** (open / in-progress / done)

---

## Section 1 — Accessibility (WCAG 2.1)

### A-01 🔴 Search input has no accessible label
- **Where**: Right sidebar search input (line ~1985 of `src/app/page.tsx`)
- **WCAG**: 1.3.1 (Info and Relationships), 4.1.2 (Name, Role, Value)
- **Issue**: `<input type="text" placeholder="Search location…  (/)" id="" name="" aria-label="">` — no `id`, no `name`, no `aria-label`, no associated `<label>`. Screen reader users hear "edit text, blank"
- **Fix**: Add `aria-label="Search locations on the map"`. Or use a proper `<label>` with `htmlFor` association.
- **Status**: ✅ fixed — `aria-label={t(lang, "sidebar.search")}` and `autoComplete="off"`

### A-02 🔴 No skip-link for keyboard users
- **Where**: Top of `<body>`
- **WCAG**: 2.4.1 (Bypass Blocks)
- **Issue**: Keyboard users must Tab through ~30 focusable elements to reach the map
- **Fix**: Add `<a href="#main-content" class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:bg-ember-accent focus:text-ember-bg focus:rounded">Skip to map</a>` at the top
- **Status**: ✅ fixed — `<a href="#main-content">` with `sr-only focus:not-sr-only` rendered at top; `<main id="main-content">` target

### A-03 🟠 Two `<aside>` elements have no `aria-label`
- **Where**: Left dashboard panel + right sidebar (in `src/app/page.tsx`)
- **WCAG**: 1.3.1, 4.1.2
- **Issue**: Screen reader users hear "navigation" or "complementary region" — no context about what region it is
- **Fix**: Add `aria-label={lang === "pt" ? "Painel de incêndios" : "Incidents dashboard"}` to left, and `aria-label="Filtros e camadas"` to right
- **Status**: ✅ fixed — both asides have `role="complementary"` and `aria-label` (left: "Situational Awareness"/"Painel de incêndios"; right: "Painel de filtros"/"Filters panel")

### A-04 🟠 Two "Notifications" bell buttons on same page (a11y name collision)
- **Where**: Header (desktop) + "Mais" tab Notifications row (mobile)
- **WCAG**: 2.5.3 (Label in Name) — duplicate accessible names
- **Issue**: Both labeled "Notifications" — assistive tech can disambiguate by context, but it's poor practice
- **Fix**: Make the desktop bell `aria-hidden="true"` on mobile, OR rename the Mais tab one to "View notifications" with explicit context
- **Status**: ✅ fixed — desktop bell uses `tFmt(header.notificationsWithUnread)` with count; mobile Mais tab uses `aria-label=tFmt(...)` + visible `t(header.viewNotifications)`

### A-05 🟠 Help button "?" has no accessible label or expanded state
- **Where**: Top header (line ~833 of `src/app/page.tsx`)
- **WCAG**: 4.1.2 (Name, Role, Value), 4.1.1 (Parsing)
- **Issue**: `<button>` with no `aria-label`, no `aria-expanded`. Screen reader users hear "button, ?" — meaningless
- **Fix**: Add `aria-label="Keyboard shortcuts"`, `aria-expanded={false}` (toggle to `true` when panel opens)
- **Status**: ✅ fixed — added `aria-label="Keyboard shortcuts"`, `aria-expanded`, `aria-haspopup="dialog"`, `focus:ring-2`

### A-06 🟡 Form input in Report Fire modal has no label
- **Where**: Report Fire modal (line ~1398 of `src/app/page.tsx`)
- **WCAG**: 1.3.1
- **Issue**: The "description" `<textarea>` has no `aria-label` or associated `<label>`
- **Fix**: Add `<label htmlFor="report-description" className="sr-only">Description</label>` and `aria-describedby="report-description-help"`
- **Status**: ✅ fixed — `htmlFor` + `id` wired up; `aria-describedby` points to sr-only help text

### A-07 🟡 `<input>` has no autocomplete attribute
- **Where**: Search input
- **WCAG**: 1.3.5 (Identify Input Purpose)
- **Issue**: `autocomplete=""` is empty — browser can't suggest prior searches
- **Fix**: Add `autoComplete="off"` (intentional, since search is for map locations not user data)
- **Status**: ✅ fixed — `autoComplete="off"` on search input; report name input uses `autoComplete="name"`

### A-08 🟡 Map markers have awkward aria-label
- **Where**: Each fire marker (`src/components/ember-map.tsx`)
- **Issue**: `aria-label="Total: 33 (fires)"` — "fires" suffix in English on Portuguese page
- **Fix**: `aria-label={lang === "pt" ? \`Total: ${count} incêndios\` : \`Total: ${count} fires\`}`
- **Status**: ✅ fixed — HeroCounter uses `t(lang, "map.totalLabel")` for "incêndios"/"fires"

### A-09 🟡 Notification badge "3" not announced
- **Where**: Header bell
- **Issue**: Red "3" badge has no `aria-label`; screen reader just hears "Notifications, 3" (the number is fine, but context is implicit)
- **Fix**: Add `aria-label="3 unread notifications"`
- **Status**: ✅ fixed — count is in the button's `aria-label`; inner span marked `aria-hidden="true"`

### A-10 🟡 Color contrast — secondary text
- **Where**: `var(--ember-text-faint)` (subtitles, captions)
- **WCAG**: 1.4.3 (Contrast Minimum), AA = 4.5:1 for body text
- **Issue**: "9px text-faint" text on dark bg may fail contrast — needs audit
- **Fix**: Run automated contrast check; bump `--ember-text-faint` to `#5a6b62` (light) / `#85958e` (dark) if needed
- **Status**: ✅ fixed — bumped light `#7a8f88→#5a6b62` (now 5.4:1) and dark `#6a8078→#85958e` (now 5.2:1); both pass WCAG AA body-text

### A-11 🟡 Tab focus indicators unclear
- **Where**: All interactive elements
- **WCAG**: 2.4.7 (Focus Visible)
- **Issue**: Custom focus ring might be missing on some elements (e.g., toggles, fire markers)
- **Fix**: Audit with Tab navigation; ensure `focus-visible:ring-2` is consistent
- **Status**: ✅ verified — a11y tests pass with 0 violations across all viewports; all interactive elements have focus-visible ring via focus-visible:ring-2

---

## Section 2 — Layout & Responsive Design

### L-01 🔴 iPhone 14 Pro (393×852) — HeroCounter pill is too wide
- **Where**: Mobile map tab, `MapPeek` component
- **Issue**: `min-w-[180px]` + hint + "X" + counter + critical badge = renders as pill taking 80% of 393px viewport
- **Fix**: Remove `min-w-[180px]` for mobile context. Use `flex-1` to fill space. Or use `<span>` without `min-w` for the inner stat
- **Status**: ✅ fixed — `min-w-0 max-w-full overflow-hidden truncate` on the hero pill

### L-02 🔴 iPhone SE (320×568) layout unusable
- **Where**: Mobile layout (no small-screen breakpoint)
- **Issue**: Layout assumes ≥360px; on 320px, "37 incêndios" overlaps map top, controls squished
- **Fix**: Add a `clamp()` to peek bar width, or commit to 360px min with "device too small" message
- **Status**: ✅ fixed — layout actually fits at 320×568 after L-01 hero pill fix; 4-tab nav (80px each), attribution pill, legend, and bottom sheet all render without overflow

### L-03 🔴 Tablet (810×1080) is broken
- **Where**: Desktop 3-panel layout
- **Issue**: 3-panel design (360/792/288) designed for 1440px; at 810px, map area is only ~280px wide
- **Fix**: Add `lg:` breakpoint — at <1024px, render the mobile tab nav instead of 3 panels
- **Status**: ✅ fixed — `md:` → `lg:` (768→1024) on 14 layout-shell classes; iPad now uses mobile tab nav

### L-04 🟠 Landscape mode (844×390) breaks 3-panel
- **Where**: Mobile layout doesn't apply to landscape
- **Issue**: Map is only ~150px wide, sidebar overlaps with map
- **Fix**: Force mobile tab nav in landscape (orientation media query)
- **Status**: ✅ fixed — automatic consequence of L-03 (md→lg breakpoint switch); landscape 844px is now below 1024px and u
---

## Summary Stats

| Metric | Count |
|--------|-------|
| Total findings | 88 |
| ✅ Fixed | 80 |
| ✅ By-design / verified | 8 |
| 🔴 High severity (all closed) | 14 |
| 🟠 Medium (all closed) | 36 |
| 🟡 Low (all closed) | 24 |
| 🟢 Polish (all closed) | 14 |

| Category | Closed |
|----------|--------|
| A11y | 11/11 |
| Layout | 20/20 |
| Visual | 20/20 |
| Content | 10/10 |
| Performance | 5/5 |
| i18n | 5/5 |
| Security | 4/4 |
| Code Quality | 8/8 |
| Refactor | 9/9 |

**Verification:**
- 10/10 vitest unit tests pass
- 0/0 axe-core a11y violations across 3 viewports × 4 pages
- CSRF protection verified (cross-origin POST returns 403)
- Cron secret now via `x-cron-secret` header (no longer in URL logs)
- WCAG AA contrast: 5.2:1 dark, 5.4:1 light
- Skip link, progressbar, modal close buttons, notification aria-labels all pass axe-core audit
