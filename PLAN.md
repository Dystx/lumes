# Little Moments Full Stitch + Guide Implementation Plan

**Summary**
Build Little Moments into the full private, local-first child memory archive described by the guide and the 42-screen Stitch project. The implementation will keep the current Expo SDK 55 foundation, expand the data model, finish every core route, translate Stitch screens into native React Native components, and add media, family privacy, keepsakes, sync, prompts, reminders, payments, and AI-assist in gated phases.

The current repo already has a useful first pass under `src/app`, `src/components`, `src/data`, `src/domain`, `src/navigation`, and `src/theme`. This plan upgrades that prototype into a complete product while preserving working behavior after every phase.

Primary references:
[Little Moments guide](/Users/cheng/Downloads/LITTLE_MOMENTS_CODEX_DESIGN_GUIDE.md), [Stitch page map](/Users/cheng/Documents/New project/design-reference/stitch/pages.md), [Stitch design rules](/Users/cheng/Documents/New project/design-reference/stitch/DESIGN.md), [Expo SDK 55 docs](https://docs.expo.dev/versions/v55.0.0/), [Expo Router src directory docs](https://docs.expo.dev/router/reference/src-directory/), [Expo SQLite docs](https://docs.expo.dev/versions/latest/sdk/sqlite/), [Expo ImagePicker docs](https://docs.expo.dev/versions/latest/sdk/imagepicker/), [Expo Audio docs](https://docs.expo.dev/versions/latest/sdk/audio/), [Expo Notifications docs](https://docs.expo.dev/versions/latest/sdk/notifications/), [Supabase Expo guide](https://supabase.com/docs/guides/getting-started/tutorials/with-expo-react-native), [Expo Stripe docs](https://docs.expo.dev/versions/latest/sdk/stripe/).

**Non-Negotiables**
- Memories save locally before any cloud, media, AI, export, or family-sharing work runs.
- Every memory card, detail page, editor, timeline item, search result, recap item, and keepsake source shows visibility.
- No public profiles, followers, likes, popularity counts, public comments, trending feeds, or guilt-based reminder copy.
- Stitch is visual reference only; do not paste Stitch HTML, CSS, or Tailwind into production.
- Use Expo-aware installs; do not upgrade React, React Native, TypeScript, safe-area, screens, or Expo packages outside SDK 55 alignment just because npm-latest differs.
- Use `expo-sqlite` prepared statements for user data; never build SQL with interpolated user input.
- Use `expo-audio`, not `expo-av`; use `expo-image`, not raw `img`; use `expo-image-picker` for library/camera; use `expo-notifications` only after local reminder settings exist.
- Use Superpowers execution after approval: `superpowers:subagent-driven-development` for parallel ticket batches or `superpowers:executing-plans` for sequential execution.

**File Map**
| Area | Files |
| --- | --- |
| App shell | [src/app/_layout.tsx](/Users/cheng/Documents/New project/src/app/_layout.tsx), [src/app/(tabs)/_layout.tsx](/Users/cheng/Documents/New project/src/app/(tabs)/_layout.tsx), [src/navigation/routes.ts](/Users/cheng/Documents/New project/src/navigation/routes.ts) |
| Domain | [src/domain/moments.ts](/Users/cheng/Documents/New project/src/domain/moments.ts), planned `src/domain/stage-config.ts`, planned `src/domain/visibility.ts`, planned `src/domain/prompts.ts`, planned `src/domain/keepsakes.ts` |
| Data | [src/data/migrations.ts](/Users/cheng/Documents/New project/src/data/migrations.ts), [src/data/moments-provider.tsx](/Users/cheng/Documents/New project/src/data/moments-provider.tsx), planned `src/data/repositories/*`, planned `src/data/sync-queue.ts` |
| UI | [src/components/ui](/Users/cheng/Documents/New project/src/components/ui), [src/components/moments](/Users/cheng/Documents/New project/src/components/moments), planned `src/components/forms`, planned `src/components/media`, planned `src/components/privacy` |
| Features | planned `src/features/onboarding`, planned `src/features/today`, planned `src/features/capture`, planned `src/features/timeline`, planned `src/features/family`, planned `src/features/keepsakes`, planned `src/features/sync`, planned `src/features/ai` |
| Tests | planned `src/**/*.test.ts`, planned `e2e/*.spec.ts`, planned `playwright.config.ts`, planned `vitest.config.ts` |
| Docs | planned `src/docs/little-moments-roadmap.md`, planned `src/docs/stitch-screen-coverage.md`, planned `src/docs/qa-checklist.md` |

**Architecture**
Use Expo Router for screens, small feature modules for logic, SQLite repositories for persistence, and a single provider layer for app state. Keep route files thin: route files compose feature components, feature components call hooks/actions, actions call repositories, repositories own SQL.

Example route shape:
```tsx
import { CaptureScreen } from "@/features/capture/capture-screen";

export default function AddRoute() {
  return <CaptureScreen />;
}
```

Example repository shape:
```ts
export async function createMemory(db: SQLiteDatabase, input: CreateMemoryInput) {
  const now = new Date().toISOString();
  const memory = normalizeMemoryInput(input, now);

  await db.runAsync(
    `INSERT INTO memories
      (id, child_id, type, title, body, occurred_at, created_at, visibility, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    memory.id,
    memory.childId,
    memory.type,
    memory.title,
    memory.body,
    memory.occurredAt,
    memory.createdAt,
    memory.visibility,
    "local"
  );

  await enqueueSync(db, {
    entityType: "memory",
    entityId: memory.id,
    operation: "create",
    payloadJson: JSON.stringify(memory),
  });

  return memory;
}
```

Example UI rule:
```tsx
<MemoryCard
  memory={memory}
  primaryAction="open"
  showVisibility
  showAgeLabel
  showSyncStatus
/>
```

**Dependency Plan**
| Phase | Command | Reason |
| --- | --- | --- |
| Foundation | `pnpm exec expo install --check` | Verify SDK 55 package alignment before adding anything. |
| Tests | `pnpm add -D vitest @testing-library/react-native @testing-library/jest-native playwright @playwright/test` | Add unit and browser smoke tests. If React Native testing package has SDK 55 peer friction, use pure domain/repository Vitest first and Playwright for UI. |
| Media | `pnpm exec expo install expo-image-picker expo-file-system expo-document-picker` | Photo, video, file/document imports, and private local asset copy. |
| Voice | `pnpm exec expo install expo-audio` | Voice recording and playback with current Expo audio API. |
| Reminders | `pnpm exec expo install expo-notifications` | Local reminder scheduling first; push later only with dev build. |
| Export | `pnpm exec expo install expo-print expo-sharing` | PDF preview/export and native share sheet for keepsakes. |
| Sync | `pnpm add @supabase/supabase-js` | Supabase Auth, Postgres metadata, storage, and sync queue processing. Use `expo-sqlite/kv-store` or existing SQLite storage instead of adding AsyncStorage unless Supabase integration requires the exact package. |
| Payments | `pnpm exec expo install @stripe/stripe-react-native` | Install the Expo-compatible Stripe version, not npm-latest directly. |
| Avoid | No Zustand, Drizzle, TinyBase, bottom sheet, Reanimated, gesture-handler, FlashList in v1 unless a ticket proves the need. |

**Core Types**
Replace the narrow prototype enums with guide-complete types while preserving migration compatibility.

```ts
export type ChildStage =
  | "expecting"
  | "newborn"
  | "baby"
  | "toddler"
  | "child"
  | "teen"
  | "past_memories";

export type MomentType =
  | "photo"
  | "video"
  | "text"
  | "voice"
  | "milestone"
  | "quote"
  | "letter"
  | "care_log"
  | "document";

export type MemoryVisibility =
  | "private_parent"
  | "co_parents"
  | "family_circle"
  | "child_later"
  | "hidden_until_adult";

export type FamilyRole =
  | "parent_admin"
  | "co_parent"
  | "grandparent"
  | "caregiver"
  | "child"
  | "teen"
  | "adult_child";

export type SyncStatus = "local" | "queued" | "syncing" | "synced" | "failed";
```

Compatibility rule:
```ts
export function migrateLegacyVisibility(value: string): MemoryVisibility {
  if (value === "family") return "family_circle";
  if (value === "private") return "private_parent";
  if (isMemoryVisibility(value)) return value;
  return "private_parent";
}
```

**Database Schema**
| Entity | Required columns |
| --- | --- |
| `children` | `id`, `name`, `birth_date`, `due_date`, `stage`, `pronouns`, `avatar_color`, `created_at`, `updated_at`, `archived_at` |
| `memories` | `id`, `child_id`, `type`, `title`, `body`, `occurred_at`, `created_at`, `updated_at`, `visibility`, `sync_status`, `age_label`, `contributor_id`, `is_favorite`, `deleted_at` |
| `memory_assets` | `id`, `memory_id`, `kind`, `local_uri`, `remote_path`, `mime_type`, `width`, `height`, `duration_ms`, `file_size`, `sync_status`, `created_at` |
| `care_logs` | `id`, `child_id`, `kind`, `logged_at`, `amount`, `unit`, `duration_minutes`, `side`, `note`, `memory_id`, `created_at` |
| `milestones` | `id`, `child_id`, `memory_id`, `category`, `label`, `achieved_at`, `notes`, `created_at` |
| `family_members` | `id`, `display_name`, `role`, `relationship_label`, `status`, `email`, `avatar_color`, `created_at` |
| `memory_visibility` | `id`, `memory_id`, `visibility`, `allowed_member_ids_json`, `hidden_until`, `created_at`, `updated_at` |
| `keepsakes` | `id`, `child_id`, `type`, `title`, `description`, `status`, `source_memory_ids_json`, `preview_uri`, `export_uri`, `created_at`, `updated_at` |
| `sync_queue` | `id`, `entity_type`, `entity_id`, `operation`, `payload_json`, `attempt_count`, `last_error`, `created_at`, `updated_at` |
| `settings` | `key`, `value_json`, `updated_at` |

Migration rule:
```ts
const migrations: Record<number, string> = {
  1: `CREATE TABLE IF NOT EXISTS children (...);`,
  2: `ALTER TABLE memories ADD COLUMN updated_at TEXT;`,
  3: `CREATE TABLE IF NOT EXISTS memory_assets (...);`,
};

for (let version = currentVersion + 1; version <= targetVersion; version += 1) {
  await db.execAsync("BEGIN TRANSACTION;");
  try {
    await db.execAsync(migrations[version]);
    await db.execAsync(`PRAGMA user_version = ${version}`);
    await db.execAsync("COMMIT;");
  } catch (error) {
    await db.execAsync("ROLLBACK;");
    throw error;
  }
}
```

**Stitch Coverage**
| Stitch screen | Route or feature | Phase |
| --- | --- | --- |
| Splash Screen, Welcome Screen | `index`, onboarding welcome | Phase 2 |
| Create Child Profile, Choose Starting Stage, Private Family Space Setup | onboarding wizard | Phase 3 |
| Child Today Dashboard, Today Dashboard (Baby), Toddler Today Dashboard, Teen Today Dashboard | stage-aware Today | Phase 4 |
| Capture Hub, Quick Add Moment, Full Memory Editor, Add Milestone | Add flow and editor | Phase 5 |
| Feeding Tracker, Sleep Tracker, Diaper Tracker, Growth Tracker, Baby Tracker Hub | care trackers | Phase 6 |
| Timeline, Memory Detail Page, Gallery, Search & Filters | archive surfaces | Phase 7 |
| Child Switcher, Life Stages, Stage Transition | child/stage management | Phase 8 |
| Family Sharing, Invite Family Member | family/privacy | Phase 9 |
| Memory Book, Memory Book Builder, Memory Book Options, Premium Keepsake Options, Monthly Recap, Future Letters, Adult Archive, Parent Reflections, Stickers & Objects | keepsakes and emotional archive | Phase 10 |
| Reminder Settings, System & Sync States, Settings | settings, reminders, sync | Phase 11 |
| Guided Memory Prompts, Guided Memory Prompts Discovery | prompts and AI-gated suggestions | Phase 12 |
| Milestones Hub | milestone archive | Phase 13 |

**Ticket Format**
Each implementation ticket must finish with these commands:
```bash
pnpm exec tsc --noEmit
pnpm exec expo install --check
```

Each phase gate must finish with these commands:
```bash
pnpm exec tsc --noEmit
pnpm exec expo install --check
pnpm web
```

Each browser QA pass must verify:
```txt
No red screen.
No console errors except known React DevTools/deprecation noise.
Memory saves locally.
Visibility is visible.
Navigation back/forward works.
Empty states are gentle.
```

**Phase 0: Baseline And Safety**
| Ticket | Goal | Exact implementation | Correctness |
| --- | --- | --- | --- |
| LM-001 | Capture current state | Create `src/docs/little-moments-roadmap.md` with current architecture, Stitch source IDs, guide requirements, dependency policy, and risk list. | The doc names the current Expo SDK, local-first rule, 42 Stitch screens, and current gaps. |
| LM-002 | Add test harness | Add Vitest config for pure TypeScript tests and Playwright config for Expo web smoke tests. Use `jsdom` only if component tests prove stable; otherwise start with domain/repository tests. | `pnpm exec vitest run` starts and reports either passing tests or no tests found without config errors. |
| LM-003 | Add QA scripts | Add package scripts `typecheck`, `test`, `test:e2e`, `qa:deps`, and `qa`. Keep `pnpm web` unchanged. | `pnpm run qa` runs typecheck, dependency check, and tests in that order. |
| LM-004 | Document Stitch checklist | Create `src/docs/stitch-screen-coverage.md` with all 42 screens, route mapping, acceptance notes, and “translated, not pasted” rule. | Every Stitch screen from `pages.md` appears exactly once. |

**Phase 1: Design System Completion**
| Ticket | Goal | Exact implementation | Correctness |
| --- | --- | --- | --- |
| LM-005 | Normalize tokens | Expand `src/theme/tokens.ts` to expose `colors`, `spacing`, `radius`, `typography`, `shadows`, `motion`, `hitSlop`, and `stageTheme`. Keep Newsreader for headings and Manrope for body. | No screen hardcodes brand colors except rare one-off status shades added to tokens first. |
| LM-006 | Accessibility primitives | Update `AppText`, `Button`, `IconButton`, `Pill`, `Card`, `Screen`, `EmptyState`, `Avatar`, `VisibilityBadge` to support accessible labels, disabled states, selected states, and minimum 44px touch targets. | Manual inspection confirms all pressables have `accessibilityRole` and meaningful `accessibilityLabel`. |
| LM-007 | Forms package | Create `src/components/forms` with `TextField`, `TextArea`, `DateField`, `SegmentedChoice`, `FieldLabel`, `FormError`, and `SaveBar`. | Add flow and onboarding stop using raw duplicated `TextInput` styling. |
| LM-008 | Privacy components | Create `src/components/privacy` with `VisibilitySelector`, `PrivacyExplainerCard`, and `LocalFirstBadge`. | Every memory creation/edit path uses `VisibilitySelector`. |

Example `VisibilitySelector` contract:
```tsx
<VisibilitySelector
  value={visibility}
  onChange={setVisibility}
  options={visibilityOptions}
  helperText="Nothing is public. You can change this later."
/>
```

**Phase 2: Data Layer And Migrations**
| Ticket | Goal | Exact implementation | Correctness |
| --- | --- | --- | --- |
| LM-009 | Upgrade domain types | Replace prototype `Visibility` with `MemoryVisibility`, update `MomentType`, add `FamilyRole`, `MemoryAsset`, `Milestone`, `FamilyMember`, `Keepsake`, `SyncQueueItem`, and typed create/update inputs. | TypeScript catches all old `"private"` and `"family"` usage until migrated. |
| LM-010 | Version migrations | Refactor migration code into ordered versions with transactions. Add compatibility columns without dropping current user data. | Existing v1 database opens and upgrades without losing current `children`, `memories`, or `care_logs`. |
| LM-011 | Repository split | Move SQL from provider into `children-repository`, `memories-repository`, `assets-repository`, `care-repository`, `family-repository`, `keepsakes-repository`, `settings-repository`, and `sync-queue-repository`. | Provider becomes orchestration only; all SQL is parameterized. |
| LM-012 | Seed and reset helpers | Add development-only seed helpers behind `__DEV__` for sample children, moments, care logs, and keepsakes. Add no production reset button. | Seed data never runs automatically in production. |
| LM-013 | Sync queue baseline | Every create/update/delete writes local row first and then enqueues sync metadata. Deletes become soft deletes until cloud sync exists. | Turning off internet cannot block memory creation. |

Example local-first action:
```ts
await memoriesRepository.create(db, input);
await syncQueueRepository.enqueue(db, {
  entityType: "memory",
  entityId: input.id,
  operation: "create",
  payloadJson: JSON.stringify(input),
});
await refresh();
```

**Phase 3: Onboarding**
| Ticket | Goal | Exact implementation | Correctness |
| --- | --- | --- | --- |
| LM-014 | Wizard shell | Replace single onboarding screen with a multi-step wizard: welcome, child profile, stage, family privacy, done. Use one route with internal step state unless deep links are needed later. | Browser reload on onboarding does not crash; incomplete wizard keeps data in local component state only. |
| LM-015 | Welcome screen | Translate Stitch Welcome Screen and Splash Screen into a calm hero with product promise, privacy badge, and “Start private archive.” | No social copy; screen says local/private before asking for child data. |
| LM-016 | Child profile | Implement name, birth date or due date, stage defaulting from date when possible, avatar color, optional pronouns. | Cannot finish without child name and stage. |
| LM-017 | Starting stage | Implement stage cards for expecting, newborn, baby, toddler, child, teen, past memories with guide-specific copy. | Selecting a stage changes the preview prompt and quick actions. |
| LM-018 | Family privacy setup | Explain visibility levels, default to `private_parent`, offer optional co-parent invite placeholder but do not require network. | Onboarding can finish fully offline. |
| LM-019 | First-run routing | `index` redirects to onboarding when no child exists and to Today when at least one child exists. | Reloading `/` chooses the correct destination. |

Example stage config:
```ts
export const stageConfigs = {
  newborn: {
    label: "Newborn",
    prompt: "What tiny thing changed today?",
    quickActions: ["feed", "sleep", "diaper", "medicine", "growth", "tiny_memory"],
  },
  teen: {
    label: "Teen",
    prompt: "What do you want to preserve with care and consent?",
    quickActions: ["parent_note", "shared_memory", "letter", "achievement", "private_until_later"],
  },
} satisfies Record<ChildStage, StageConfig>;
```

**Phase 4: Today Dashboards**
| Ticket | Goal | Exact implementation | Correctness |
| --- | --- | --- | --- |
| LM-020 | Stage-aware Today | Make Today render by `currentChild.stage`, translating Baby, Child, Toddler, Teen Stitch dashboards into one reusable dashboard layout. | Newborn quick actions differ from teen quick actions. |
| LM-021 | Child age hero | Upgrade `ChildAgeHero` to show exact age, due-date countdown, past-memory mode, moment count, care streak copy without guilt. | If birth date is missing, show stage-based copy instead of broken age. |
| LM-022 | Prompt card | Use stage prompt data and route prompt CTA to Add with preselected type/context. | Prompt never says “forgot,” “missed,” or “streak broken.” |
| LM-023 | Quick actions | Add quick action buttons that create care logs or open capture forms with selected type. | Tapping Quote opens quote form; tapping Feed opens feed tracker. |
| LM-024 | Today summary | Summarize care logs, today memories, sync state, and privacy state. | Summary appears even with zero memories using gentle empty state. |
| LM-025 | Recent memories | Show today’s memories with `MemoryCard`, visibility badge, age label, local/sync state, and detail link. | Cards remain readable on narrow mobile web. |

Example Today quick action:
```tsx
<QuickActionGrid
  actions={getStageQuickActions(currentChild.stage)}
  onAction={(action) => routeQuickAction(action, currentChild.id)}
/>
```

**Phase 5: Capture And Editing**
| Ticket | Goal | Exact implementation | Correctness |
| --- | --- | --- | --- |
| LM-026 | Capture hub | Split Add route into capture hub plus type-specific form sections. Keep one-screen speed for text, quote, letter, milestone. | A text memory can be saved in under 10 seconds with title/body only. |
| LM-027 | Moment type forms | Create `TextMomentForm`, `QuoteMomentForm`, `LetterMomentForm`, `MilestoneForm`, `PhotoMomentForm`, `VoiceMomentForm`, `DocumentMomentForm`. | Each form saves through one shared `saveMemory` action. |
| LM-028 | Save confirmation | Replace blocking `Alert` with a warm inline toast or confirmation card and route to detail only when user taps “View.” | Saving does not interrupt fast repeated capture. |
| LM-029 | Full editor | Implement Stitch Full Memory Editor at `memory/[id]/edit` with title, body, date, type, visibility, tags placeholder, assets, delete. | Edit preserves existing fields when form fields are unchanged. |
| LM-030 | Milestone hub link | Add `milestones` route and milestone creation linked to memories. | Milestone creates both a memory and a milestone row. |
| LM-031 | Validation | Add local validation functions for empty title/body, invalid date, missing child, unsupported media, visibility fallback. | Validation messages are gentle and displayed inline. |

Example shared save action:
```ts
const memory = await createMemory({
  childId,
  type,
  title: title.trim() || defaultTitleFor(type),
  body: body.trim(),
  occurredAt,
  visibility,
  assets,
});
showToast("Moment saved locally.");
```

**Phase 6: Care Trackers**
| Ticket | Goal | Exact implementation | Correctness |
| --- | --- | --- | --- |
| LM-032 | Baby tracker hub | Implement Baby Tracker Hub with Feed, Sleep, Diaper, Growth, Medicine, Note cards. | Hub appears for newborn/baby and stays reachable for other stages through Today. |
| LM-033 | Feeding tracker | Add feed tracker with side, amount, unit, duration, note, logged time. | Save creates `care_logs` row and optional linked `care_log` memory if user adds note. |
| LM-034 | Sleep tracker | Add sleep tracker with start, end, duration, quality note. | Duration calculates correctly and handles in-progress sleep as local draft. |
| LM-035 | Diaper tracker | Add diaper tracker with wet/dirty/both, rash note, time. | Today summary updates immediately after save. |
| LM-036 | Growth tracker | Add growth entries for weight, height, head circumference, notes. | Growth entry can be viewed in child profile history. |
| LM-037 | Medicine note | Add lightweight medicine care log with name, dose, time, note. | Copy includes “not medical advice” where needed and avoids dosage recommendations. |

Care log example:
```ts
await careRepository.create(db, {
  childId,
  kind: "feed",
  loggedAt,
  amount,
  unit,
  side,
  note,
});
```

**Phase 7: Media, Voice, Documents**
| Ticket | Goal | Exact implementation | Correctness |
| --- | --- | --- | --- |
| LM-038 | Asset model UI | Add `MemoryAssetPreview`, `AssetPickerButton`, `AssetGrid`, and `AttachmentCard`. | Memory detail displays assets without breaking text-only memories. |
| LM-039 | Photo/video picker | Install and use `expo-image-picker`; request permission only after user taps photo/video action. Copy selected asset into app storage where supported. | Denied permission shows helpful copy and still allows text memory. |
| LM-040 | Camera capture | Add camera option through ImagePicker launch camera, configured in app config with clear permission copy. | Camera cancellation returns to form without losing typed text. |
| LM-041 | Voice recording | Install and use `expo-audio`; add record, stop, playback, duration, and save. | Recording creates `voice` memory with local asset row. |
| LM-042 | Document import | Install and use `expo-document-picker`; add document memory and optional note. | Picked documents use `copyToCacheDirectory: true` and never upload before local save. |

Example media save:
```ts
const result = await ImagePicker.launchImageLibraryAsync({
  mediaTypes: ["images", "videos"],
  quality: 0.9,
});

if (!result.canceled) {
  await addLocalAssetDraft(result.assets[0]);
}
```

**Phase 8: Timeline, Search, Gallery**
| Ticket | Goal | Exact implementation | Correctness |
| --- | --- | --- | --- |
| LM-043 | Timeline grouping | Group reverse chronological memories by age/month and render `TimelineGroupHeader`. | Memories without birth date group by calendar month. |
| LM-044 | Timeline filters | Add filter chips for type, visibility, child, contributor, favorites, date range. | Filters combine predictably and can be cleared. |
| LM-045 | Search route | Implement search over title, body, tags placeholder, type labels, contributor names. | Search never mutates data and works offline. |
| LM-046 | Gallery route | Add media-only gallery with photo/video/document/voice tiles. | Text-only archive remains in Timeline, not Gallery. |
| LM-047 | Memory detail | Complete detail as keepsake card with content, date, age, type, visibility, contributor, assets, edit, delete, add to keepsake. | Delete confirmation is required. |
| LM-048 | Favorite and tags | Add local favorite toggle and tag placeholder editing. | Favorites appear in search filter and keepsake builder. |

Example timeline grouping:
```ts
export function groupMemories(memories: Memory[], child?: ChildProfile) {
  return memories.reduce<TimelineGroup[]>((groups, memory) => {
    const label = memory.ageLabel ?? formatMonth(memory.occurredAt);
    return appendToGroup(groups, label, memory);
  }, []);
}
```

**Phase 9: Child Management**
| Ticket | Goal | Exact implementation | Correctness |
| --- | --- | --- | --- |
| LM-049 | Child switcher | Implement Stitch Child Switcher with active child, add child, edit child, archive child. | Switching child changes Today, Timeline, Capture default, and Keepsakes. |
| LM-050 | Child detail | Add `src/app/child/[id].tsx` with profile, stage, age, growth history, privacy summary. | Direct URL to missing child shows gentle not-found state. |
| LM-051 | Life stages | Implement Life Stages screen with all stages and current stage marker. | Stage copy matches guide. |
| LM-052 | Stage transition | Upgrade Stage Transition screen with suggested changes and confirmation. | Stage changes do not alter existing memories. |
| LM-053 | Past memories mode | Add import-oriented prompts and timeline grouping for older child/adult archive setup. | Parent can add old memories without exact dates using approximate date copy. |

**Phase 10: Family And Privacy**
| Ticket | Goal | Exact implementation | Correctness |
| --- | --- | --- | --- |
| LM-054 | Family tab | Implement private family circle overview with roles, permissions, invite placeholder, and privacy explainer. | Copy says “family circle,” not followers or audience. |
| LM-055 | Family member model | Add local family members with role, status, relationship label, and avatar color. | Family member creation works offline as pending invite. |
| LM-056 | Invite flow | Implement Invite Family Member screen with email, role, allowed actions, and local pending state. | No email is sent until Supabase phase; UI says pending setup. |
| LM-057 | Visibility editor | Add memory visibility change flow with explanation of each visibility level. | Default stays `private_parent`; no public option exists. |
| LM-058 | Contribution placeholders | Add allowed private interactions: “Loved this,” “I remember this,” “Add a memory,” “Send voice note,” “Birthday message.” | No counts or popularity mechanics appear. |

Example visibility options:
```ts
export const visibilityOptions = [
  { value: "private_parent", label: "Only parents", description: "Just you and parent admins." },
  { value: "co_parents", label: "Co-parents", description: "Shared with parent caregivers." },
  { value: "family_circle", label: "Family circle", description: "Visible to invited family." },
  { value: "child_later", label: "Child later", description: "Saved for your child when ready." },
  { value: "hidden_until_adult", label: "Hidden until adult", description: "Private until age 18." },
] satisfies VisibilityOption[];
```

**Phase 11: Keepsakes**
| Ticket | Goal | Exact implementation | Correctness |
| --- | --- | --- | --- |
| LM-059 | Keepsakes tab | Replace placeholder with Monthly Recap, First Year Book, Letters to You, Toddler Quotes, Time Capsule, Adult Archive. | Each card has status, preview, create/export CTA, and warm description. |
| LM-060 | Monthly recap | Build local monthly recap from saved memories and care highlights. | Recap never invents events; it only summarizes saved rows. |
| LM-061 | Memory book | Implement Memory Book route with selected memories, cover preview, sections, and local draft state. | User can add/remove source memories before export. |
| LM-062 | Book builder | Implement Stitch Memory Book Builder and Options screens. | Builder works with text-only memories and media memories. |
| LM-063 | Future letters | Add letter archive and hidden-until date support. | Hidden letters show visibility state clearly. |
| LM-064 | PDF export | Install `expo-print` and `expo-sharing`; generate simple PDF from selected memories. | Local images are handled as base64 for iOS print compatibility or omitted with clear copy. |
| LM-065 | Premium placeholders | Implement Premium Keepsake Options with Stripe-gated “coming soon” until payments phase. | No fake purchase flow before Stripe is configured. |

Example keepsake generation:
```ts
const html = renderMemoryBookHtml({
  child,
  memories,
  theme: "warm-ivory",
});

const { uri } = await Print.printToFileAsync({ html });
await keepsakesRepository.markExported(db, keepsakeId, uri);
```

**Phase 12: Settings, Reminders, Sync States**
| Ticket | Goal | Exact implementation | Correctness |
| --- | --- | --- | --- |
| LM-066 | Settings home | Implement Settings with child profiles, reminders, privacy, export, sync, system info, support copy. | Settings has no destructive action without confirmation. |
| LM-067 | Reminder settings | Install `expo-notifications`; add local reminders for daily prompt and care logs. | If permission denied, settings remain saved but scheduling is disabled with clear copy. |
| LM-068 | System sync states | Implement System & Sync States with local DB status, queue count, failed sync rows, retry button. | Failed sync never deletes local data. |
| LM-069 | Data export | Add local JSON export of children, memories, assets metadata, care logs, family, keepsakes. | Export excludes private files unless user explicitly includes media. |
| LM-070 | Privacy settings | Add default visibility, family invite rules, hidden-until-adult explanation, local data copy. | Changing default visibility affects new memories only. |

**Phase 13: Supabase Auth And Sync**
| Ticket | Goal | Exact implementation | Correctness |
| --- | --- | --- | --- |
| LM-071 | Supabase client | Add `src/lib/supabase.ts`, environment guards, and a disabled state when env vars are absent. | App runs without Supabase env vars. |
| LM-072 | Auth shell | Add sign in/up/out screens behind settings/sync, not required for local use. | Local memories remain accessible when signed out. |
| LM-073 | Remote schema | Add `supabase/schema.sql` with tables matching local model, RLS policies by owner/family membership, private storage bucket notes. | Schema review confirms no public read policy. |
| LM-074 | Sync processor | Process `sync_queue` sequentially with retry count, last error, and local status updates. | Sync failure sets `failed` and preserves local row. |
| LM-075 | Conflict policy | Use `updated_at` and local-wins for v1 conflicts; later server changes show review state instead of overwriting silently. | Sync never overwrites newer local edits. |
| LM-076 | Media upload | Upload `memory_assets` to private Supabase Storage only after metadata memory exists remotely. | Asset upload failure leaves memory synced or queued with asset failed; no data loss. |

Example guarded Supabase client:
```ts
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseKey!, {
      auth: {
        storage: SQLiteAuthStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;
```

**Phase 14: Prompts And AI Assist**
| Ticket | Goal | Exact implementation | Correctness |
| --- | --- | --- | --- |
| LM-077 | Guided prompts | Implement prompt discovery and prompt detail screens with stage-aware prompts. | Prompts are local templates and work offline. |
| LM-078 | Prompt-to-capture | Prompt CTA opens Add with prefilled prompt context but empty parent-authored memory body. | App never writes generated memory text without user input. |
| LM-079 | AI action interface | Add `src/features/ai/ai-actions.ts` with disabled provider by default and explicit user-triggered actions. | No AI network call happens on screen load. |
| LM-080 | Suggest title | Add optional “Suggest title” action that proposes a title from user text and requires approval. | Suggestion appears as draft; Save still requires user confirmation. |
| LM-081 | Clean up text | Add optional grammar cleanup action with before/after preview. | Original text remains recoverable until user accepts. |
| LM-082 | Monthly recap draft | Add AI-assisted recap only from selected saved memories. | Prompt includes “do not invent details”; UI requires approval before saving. |

AI rule example:
```ts
const suggestion = await ai.suggestTitle({
  sourceText: memoryDraft.body,
  instruction: "Suggest a concise title. Do not add facts not present in the source.",
});

setPendingSuggestion(suggestion);
```

**Phase 15: Payments**
| Ticket | Goal | Exact implementation | Correctness |
| --- | --- | --- | --- |
| LM-083 | Payment boundary | Add `src/features/payments` with provider abstraction and disabled configuration state. | App builds without Stripe keys. |
| LM-084 | Stripe install | Install `@stripe/stripe-react-native` using Expo install and configure app plugin only when merchant config exists. | `pnpm exec expo install --check` passes after install. |
| LM-085 | Premium checkout | Add premium keepsake checkout flow using PaymentSheet with backend endpoint placeholder. | No client-only charge creation; app explains setup if backend absent. |
| LM-086 | Purchase state | Store entitlement locally only after confirmed backend response. | Failed/canceled payment does not unlock premium export. |

**Phase 16: Launch Hardening**
| Ticket | Goal | Exact implementation | Correctness |
| --- | --- | --- | --- |
| LM-087 | Unit tests | Add tests for stage config, visibility migration, age labels, timeline grouping, validation, repositories, sync queue. | `pnpm exec vitest run` passes. |
| LM-088 | E2E tests | Add Playwright smoke tests for onboarding, save memory, edit memory, timeline, search, tracker, keepsake preview, settings. | `pnpm exec playwright test` passes against `pnpm web`. |
| LM-089 | Accessibility audit | Add manual QA checklist for labels, contrast, text size, keyboard forms, touch targets. | Checklist completed for every primary route. |
| LM-090 | Performance pass | Check large timeline rendering, image preview sizing, provider refresh patterns, and avoid unnecessary full reloads. | 200 sample memories remain usable on web and simulator. |
| LM-091 | Error states | Add gentle error cards for DB migration failure, media permission denial, sync failure, missing child, missing memory. | No raw exception text is shown to parent except dev mode. |
| LM-092 | Privacy copy pass | Audit every screen for non-social, non-guilt, private-first copy. | No banned copy patterns remain. |
| LM-093 | Final Stitch QA | Compare implemented routes against all 42 Stitch screens using `src/docs/stitch-screen-coverage.md`. | Every Stitch screen is marked implemented, intentionally merged, or deferred with reason. |
| LM-094 | Release checklist | Add release checklist for Expo build, env vars, app config permissions, local data export, privacy policy, testing devices. | Checklist has no unchecked critical item before release. |

**Testing Matrix**
| Area | Tests |
| --- | --- |
| Domain | `ChildStage` config returns correct prompts/actions; visibility labels match guide; age labels handle due dates, missing dates, and past memories. |
| SQLite | Migrations upgrade v1 to latest; repository create/update/delete uses prepared statements; soft delete hides memories but preserves rows. |
| Capture | Text, quote, letter, milestone, photo, voice, document, and care log save locally with visibility. |
| Today | Stage changes alter quick actions and prompt copy; empty states are gentle; care logs update summary. |
| Timeline | Memories group by age/month; filters combine; search works offline; memory cards always show visibility. |
| Detail/Edit | Edit updates local row; delete confirms; visibility can change; missing ID shows not-found. |
| Family | Invites save as pending local members; role labels are correct; no public sharing appears. |
| Keepsakes | Recap uses only saved memories; PDF export generates a URI; premium flow is gated when Stripe absent. |
| Sync | Queue enqueues every mutation; failed sync preserves data; retry updates status; missing Supabase config shows disabled state. |
| Accessibility | Pressables have labels; text contrast is readable; forms are keyboard friendly; touch targets are comfortable. |

**Manual QA Script**
Run:
```bash
pnpm install
pnpm exec expo install --check
pnpm exec tsc --noEmit
pnpm exec vitest run
pnpm web
```

Then verify:
```txt
1. Fresh app opens welcome and onboarding.
2. Create a child profile with stage newborn.
3. Today shows newborn quick actions: Feed, Sleep, Diaper, Medicine, Growth, Tiny memory.
4. Add a text memory with default Only parents visibility.
5. Memory appears on Today and Timeline.
6. Detail opens by ID and shows date, age, type, visibility, sync/local status.
7. Edit changes title and visibility.
8. Delete asks for confirmation.
9. Add feed, sleep, diaper, and growth logs.
10. Switch child stage to toddler and confirm Today quick actions change.
11. Search finds the edited memory.
12. Keepsake monthly recap includes the memory without inventing facts.
13. Settings shows reminders, sync state, privacy, and export.
14. Turning off network does not block memory creation.
15. No screen uses likes, followers, public comments, trending, or guilt copy.
```

**Definition Of Correct**
- `pnpm exec tsc --noEmit` passes after every ticket.
- `pnpm exec expo install --check` passes after every dependency change.
- `pnpm exec vitest run` passes after each data/domain phase.
- `pnpm exec playwright test` passes at each phase gate once E2E exists.
- Browser smoke has no red screen or unexpected console errors.
- Existing user data survives migrations.
- Every memory path shows visibility.
- Every create path saves locally first.
- Every cloud, AI, media upload, reminder, payment, and export feature has a safe disabled or permission-denied state.
- `src/docs/stitch-screen-coverage.md` reaches 42/42 covered by implementation, merged route, or explicit intentional deferral.

**Assumptions**
- The app remains Expo SDK 55 with React 19.2 and React Native 0.83 alignment.
- `src/app` remains the router root, consistent with Expo’s supported top-level `src` structure.
- Supabase, Stripe, push notifications, and AI are implemented as gated features that do not block local-first use.
- If env vars or backend endpoints are missing, the UI shows “not configured” states instead of failing.
- Media files are private by default and upload only after local metadata exists.
- The first execution branch should be `codex/little-moments-full-roadmap`.
