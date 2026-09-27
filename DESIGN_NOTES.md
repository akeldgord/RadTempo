# RadTempo Design Notes

## 1. Audit (before)

### Tokens (`src/app/globals.css`)

All design tokens live in one 11-color palette, redefined wholesale for dark mode under `:root[data-theme="dark"]` (lines 3–48):

- Colors: `--background`, `--foreground`, `--card`, `--card-foreground`, `--border`, `--muted`, `--muted-bg`, `--primary` (`#0f5f4f` teal / `#35b28f` dark), `--primary-foreground`, `--accent`, `--danger` (`#b42318` / `#f2867a`), `--ring`.
- No `--radius` token: every rounded element hardcodes `rounded-md`/`rounded-lg`/`rounded-full` per component (e.g. `src/components/ui/card.tsx:6`, `src/components/ui/button.tsx:7`).
- No shadow token beyond Tailwind's default `shadow-sm` applied once in `Card` (`src/components/ui/card.tsx:6`) and reused everywhere — no elevation scale.
- Font: `--font-sans: var(--font-geist-sans)` — stock Next.js/Geist, no custom type family, no display/serif pairing.
- No type-scale variables; type sizes are ad hoc Tailwind utilities (see below).
- Contrast is technically fine (`--muted` #64748b on #f8fafc ≈ 4.55:1, dark-mode muted ≈ 6.3:1, `--danger` ≈ 6.3:1) — not a WCAG failure, but everything sits at minimum-passing gray, contributing to the flat look.

No hardcoded hex/`rgb()` found outside `globals.css` (checked `grep -rnE "#[0-9a-f]{3,6}|rgb\("` across `src/components` and `src/app`); chart strokes in `src/components/analytics/trend-chart.tsx:47-97` and `sparkline.tsx:35` correctly reference `var(--primary)`/`var(--muted)`/`var(--border)`. One Tailwind arbitrary value: `src/components/ui/switch.tsx:18` (`translate-x-[18px]`). Token discipline is good; the flatness comes from having only one card/shadow/radius treatment, not from ad hoc styling.

### Type scale in use

`grep -rohE "text-(xs|sm|base|lg|xl|2xl|3xl|4xl)"`: 163× `text-sm`, 69× `text-xs`, 21× `text-2xl`, 10× `text-lg`, 4× `text-xl`, 1× `text-base`. There is effectively a 3-step scale (xs/sm/2xl) with almost nothing in between — every page `<h1>` **and** every stat-tile number use the identical `text-2xl font-semibold` (e.g. `src/app/(app)/dashboard/page.tsx:48` vs. `:123,133,143,155`), so page titles and data values are visually indistinguishable in weight/size.

### Generic/template patterns

- **One Card style everywhere**: `src/components/ui/card.tsx` (`rounded-lg border border-border bg-card shadow-sm`, `p-6` header/content) is imported by 26 files — dashboard cards, stat tiles, achievement rows, settings sections, admin sections, analytics tiles all render as the same white rounded rectangle. Confirmed visually: `docs/design/before/dashboard-desktop.png`, `settings-desktop.png`, `admin-desktop.png` all show stacks of identical boxes with no visual hierarchy between primary content and metadata panels.
- **Eyebrow labels**: `text-xs ... uppercase tracking-wide text-muted` repeated in `dashboard/page.tsx:120-188`, `analytics/[studyTypeId]/page.tsx:101-150`, `achievements/page.tsx:30-59`, `history-client.tsx:170`, `studies-client.tsx:324,356` — the classic templated-SaaS stat-tile label.
- **Uniform 6-card grid** on `dashboard/page.tsx` and repeated 3-column browse grid on `start-page-client.tsx` (see `docs/design/before/start-desktop.png`) — every study-type card is the same size regardless of importance/recency.
- Every `<h1>` across all 9 top-level pages is byte-identical: `text-2xl font-semibold text-foreground` (grep list spans admin, history, start, settings, settings/data, studies, achievements, dashboard, analytics, login/register). No page has a distinct identity.
- Admin page (`docs/design/before/admin-desktop.png`) stacks 6 nearly identical white sections and uses the same solid red `danger` button for every destructive/irreversible action (Disable, Delete, Restore from backup, Turn on maintenance) with no visual distinction by severity.

### Weak hierarchy per page

- **Dashboard**: 6 uniform study cards → "Overview" stat row → "Personal records" → "Recent achievements" — all sections use the same heading weight (`text-sm font-semibold` or default `<h2>`), so the eye has no anchor; the hero metric (streak, recent improvement) doesn't stand out from secondary metadata.
- **Start**: `Favorites → Frequently used → Recent → Browse` renders 5+ full grids on one screen at default zoom (`docs/design/before/start-desktop.png`), all cards identical, no visual priority for favorites over the full 18-item browse tree underneath.
- **Analytics detail**: 4 stat tiles of equal weight (`analytics/[studyTypeId]/page.tsx:101-150`) mix the headline metric (recent pace) with secondary ones (cases/hour) at identical size.

### Spacing inconsistencies

- Page containers mix `gap-6` top-level with `p-6` card padding and `px-4 py-8 sm:px-6` on `<main>` (`src/app/(app)/layout.tsx:70`) — no single spacing rhythm documented; every page re-derives its own `gap-3`/`gap-4`/`gap-6` combination ad hoc.
- Filter rows use `gap-3` (`history-client.tsx:102`) while card grids use `gap-4`/`gap-6` elsewhere — no shared scale.

### Mobile problems at 375px

- **Horizontal overflow on data tables**: `history-mobile.png` and `admin-mobile.png` both render wider than the 375px viewport (actual screenshot widths 685px and 739px respectively) despite `overflow-x-auto` on the table wrapper (`history-client.tsx:166`). Root cause: `src/app/(app)/layout.tsx:59-61` nests `<main>` inside two `flex` containers with no `min-width: 0`/`min-w-0`, so flex children never shrink below their content's intrinsic min-width — the `overflow-x-auto` div can't do its job because its ancestors refuse to shrink first. Same pattern will affect any future wide content.
- **Filter row min-width**: `history-client.tsx:311` sets `min-w-36` per `<select>`; four selects + two date inputs in a `flex flex-wrap` row (`history-client.tsx:102`) still wrap individually, but combined with the flex-shrink bug above they contribute to the page-level overflow rather than the intended internal table scroll.
- **Header/button overlap**: `studies-client.tsx:227-237` uses `flex items-center justify-between` with no wrap for the "Studies" title/subtitle vs. the "New study type" button — at 375px the button visually collides with the description text (see `docs/design/before/studies-mobile.png`, top-right).
- Otherwise mobile nav, timer bar, and card stacks reflow acceptably (`start-timer-running-mobile.png`, `dashboard-mobile.png`).

### Empty / loading / error state gaps

- Only two empty-state strings exist in the whole app: `"No cases match these filters."` (`history-client.tsx:194`) and `"No cases match these filters yet."` (`analytics/[studyTypeId]/page.tsx:281`) — plain text, no illustration, no differentiated guidance for "no data yet" vs. "filtered to nothing."
- No skeleton/shimmer loading components found anywhere (`grep -i "skeleton\|spinner"` only matches a couple of inline "Loading…" button-label strings in `login-form.tsx`, `import-section.tsx`, `export-section.tsx`) — page transitions and data fetches have no loading treatment beyond disabled buttons.
- Error states are unstyled `role="alert"` red text with no icon/affordance (`text-sm text-danger` pattern repeated in `studies-client.tsx`, `timer-bar.tsx`).

### Focus / contrast

- Global `:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px }` (`globals.css:60-63`) is applied uniformly and works in both themes — good baseline, nothing to fix functionally, but it's the only interactive-state treatment; no custom hover/active elevation beyond `hover:opacity-90` / `hover:bg-muted-bg`.
- Contrast ratios pass AA (computed above) but sit close to the 4.5:1 floor for body/muted text in light mode — little headroom.

## Constraints to keep (from `docs/SPEC.md`)

- Calm, non-competitive, "personal instrument" tone — never compares the user to other radiologists (explicit copy on Dashboard/Achievements pages already reflects this).
- Timer must stay quiet: **no countdown, no red/urgency color, no "behind" warnings**; feedback only after Finish (`docs/SPEC.md:13`, enforced in code — see comment at `src/components/timer/timer-bar.tsx:33-34`).
- No color-only information; semantic + textual indicators required (`docs/SPEC.md:168`).
- Reduced-motion respected (already global via `globals.css:65-74`); no aggressive timer animation.
- Both light and dark themes must remain fully supported and remembered per user.
- Overall tone: "professional, calm, radiologist-built instrument; not a fitness app" (`docs/SPEC.md:168`) — rules out gamified badges/confetti/leaderboard styling even though there is an achievements system.

## Screenshots captured (`docs/design/before/`)

Desktop (1440×900) + mobile (375×812), light theme unless noted:
`login`, `setup` (fresh DB, pre-admin), `onboarding` (favorites step, pre-completion — desktop via first admin, mobile via a second invited user), `start`, `start-timer-running`, `post-case-panel`, `dashboard`, `analytics` (CT A/P +C detail), `history`, `studies`, `achievements`, `settings`, `settings-data`, `admin`.
Plus dark theme at desktop only: `dashboard-desktop-dark`, `start-desktop-dark`.

## 2. Directions (awaiting pick)

Subject: a personal instrument a radiologist keeps open beside PACS, often in a dim reading room, to answer one question: am I getting faster at the exams I actually read? Both directions keep the spec's calm, non-competitive tone and ship light + dark via tokens.

### A. "Reading Room": the dashboard as a hanging protocol

- **Idea:** borrow the radiologist's own screen. Studies sit in a viewport grid separated by thin gutters (like a PACS hanging protocol), with facts in the four corners of each viewport the way DICOM overlays annotate an image. No cards.
- **Palette (dark-first, light equally supported):**
  graphite `#1B2127` (film base) · viewport `#222A31` · gutter `#34404A` · bone `#E3E7EA` (text) · overlay grey `#9AA6B0` (secondary) · caliper amber `#E2B65B` (the benchmark only; `#8A5D00` in light mode for AA).
  Light mode = light box: `#EEF2F5` background, white viewports, graphite text.
- **Type:** Atkinson Hyperlegible Next for all UI (built for legibility; unmistakable 0/O and 1/l, good at low ambient light) + Atkinson Hyperlegible Mono only where digits must not shift: the running timer and durations.
- **Signature element:** the benchmark drawn as a caliper, a ruled scale with tick marks where your previous pace, recent pace and this read are marked like a measurement annotation.
- **Layout:**
  ```
  ┌ rail ┐┌──────────────┬──────────────┐
  │ Start││CT A/P +C  65 │CT C/A/P +C 51│
  │ Dash ││              │              │
  │ Hist ││ ├──┼──┼──◆──┤│ ├──┼──◆──┼──┤│   ◆ = recent pace on the caliper
  │ …    ││06:18    ↓10% │08:12     ↓8% │
  └──────┘└──────────────┴──────────────┘
  ```
  Left-aligned; corners carry text, the middle carries the one graphic.
- **Motion:** one moment only. After Finish, the caliper marker slides from your recent pace to this read (≈300ms ease-out); instant under reduced motion. The timer never animates.

### B. "Tempo": pace as a quiet metronome track

- **Idea:** each study is a horizontal track, like a line in a score. Recent reads sit on it as small marks drifting left as you get faster; your benchmark is written as a tempo marking beside it. Rows, not boxes.
- **Palette (light-first, dark equally supported):**
  cold daylight `#F2F5F7` · paper `#FFFFFF` · ink `#15212B` · slate `#52606B` (secondary) · track `#D5DDE3` · cobalt `#2450B8` (your pace only; `#8FB0FF` in dark mode). Dark mode = slate `#18212A` background.
- **Type:** Recursive, one variable family: Linear Sans for UI; its Mono axis for the timer and durations, so figures and text feel related while staying tabular.
- **Signature element:** oversized durations. The benchmark `06:18` is the largest thing on the page, set in the display cut, with study names small beside it.
- **Layout:**
  ```
  CT Abdomen/Pelvis +C      06:18   ·········•••••|•••    65 reads, 10% faster
  CT Chest + A/P +C         08:12   ···········••|••      51 reads, 8% faster
  MRI Abdomen W/WO          12:40   ········•|•           13 reads, building
  ```
  Left-aligned rows with generous vertical rhythm; radius only on controls.
- **Motion:** one moment only. After Finish, the new read drops onto its track; instant under reduced motion. The timer never animates.

### Self-check against generic defaults

- A risked "near-black + one bright accent". Revised to a blue-graphite (not #111), a muted amber used only for measurement, and a light mode of equal standing; the identity comes from the viewport-and-corner layout, not the accent.
- B risked the SaaS stat-card kit. Revised to rows and tracks with no card chrome, and a single cobalt reserved for "your pace".
- Neither uses all-caps eyebrow labels, cream backgrounds, terracotta, or identical rounded cards.

**Chosen: A, "Reading Room"** (picked from the dashboard mockups; mockup reference: dark desktop grid of viewports with corner overlays and the amber caliper).

## 5–7. Polish, accessibility, motion

### Step 5 — Polish (`baseline-ui`)

- **Leftover old accent tokens (globals.css):** `--primary`/`--ring` were still the pre-redesign teal/green hex values (`#0f5f4f` light / `#35b28f` dark) even though every other token had moved to the Reading Room palette — the exact bug behind the "View all" link (and every other `text-primary`/`bg-primary` element) still reading as the old default-SaaS teal. Replaced with a calm PACS-annotation blue (`#2b5c82` light / `#6fa8d8` dark), kept distinct from `--caliper` (amber), which stays reserved for the benchmark measurement only. Fixed in the `:root`, the `data-theme="dark"` override, and the `prefers-color-scheme: dark` fallback block, so every consumer (Button, links, focus rings, achievement toast icon) picked it up automatically.
- **Achievement copy (`src/features/achievements/definitions.ts`):** titles read awkwardly once the UI appends `" for {studyName}"` — e.g. "50 of one study type for CT Abdomen/Pelvis". Reworded `study_50` ("50 reads"), `first_established_benchmark` ("Established benchmark"), `improvement_5`/`improvement_10` (dropped the redundant "this study type" now implied by the join) so the combined string reads naturally. Keys unchanged; no achievement logic touched.
- **States:** History's single empty-state string now distinguishes "no history yet" (action: Start a case) from "filtered to nothing" (action: Clear filters) — each with one clear next action. Added `src/app/(app)/loading.tsx` + `error.tsx` (app-segment skeleton and a plain-explanation/retry boundary, no apology copy) and a heavier `analytics/[studyTypeId]/loading.tsx` skeleton for the study-detail page's charts/tables. All built from a new token-only `Skeleton` primitive (static `bg-muted-bg`, no shimmer — matches the calm tone and honors `prefers-reduced-motion` through the existing global rule).
- **Floating timer bar at 375px:** the timer bar is `sticky`, not `fixed`, and sits in normal flow above `<main>` with an `mb-3` gutter, so it was not actually overlapping content; added `pb-[max(2rem,env(safe-area-inset-bottom))]` to `<main>` as a safe-area/spacing guard for notched phones regardless.
- **No all-caps eyebrows:** removed the two remaining instances (Studies "Archived" toggle, Import preview table header), matching the rest of the app.

### Step 6 — Accessibility (`fixing-accessibility`)

- **Skip link:** added a "Skip to main content" link (visually hidden until focused) at the top of the app shell, targeting a focusable `#main-content` landmark on `<main>`, so keyboard users can bypass the sidebar/mobile-nav header on every page.
- **Tables:** added a visually-hidden `<caption>` and/or `th scope="col"` to every data table that was missing them — History (desktop table), Study analytics "Recent cases", Admin "Pending invites" and "All users". (Import preview and the trend-data table already had captions from earlier work.)
- **Form-control contrast:** added an `--input-border` token (`#7c8994` light, `#707d88` dark) applied to the shared `Input` component and every raw `<input>`/`<select>` field, since the existing `--border` hairline (`~1.4:1`) is far below the WCAG 1.4.11 3:1 non-text-contrast floor needed when a border is the only boundary indicator for an interactive control. `--border` itself is left soft — it's used for decorative dividers/table rules, not control boundaries.
- **Verified already in place** from earlier Reading Room work, not changed further: global `:focus-visible` ring on every interactive element in both themes; `aria-label` on every icon-only button (delete/close/menu/minimize/expand); Radix `Dialog`/`AlertDialog` primitives for focus trapping and focus return; one `<h1>` per page (via `PageHeader`, `auth-header`, or a page-owned heading — onboarding's 4 step headings are mutually exclusive, never more than one in the DOM); `Caliper` (`role="img"` + a computed `aria-label` describing every plotted value) and `Sparkline`/trend chart (`sr-only` text summary + a full accessible data table) as text alternatives for the two custom SVG/Recharts visualizations; no color-only meaning anywhere (every colored indicator — trend arrows, excluded-from-benchmark, complexity bars — pairs color with an icon/arrow or text label).

#### Contrast table (computed from `src/app/globals.css` token values, WCAG 2.1 relative-luminance formula; script in `DESIGN_NOTES.md`-adjacent scratch, reproducible from the hex values below)

| Pair                                                 | Light        | Dark         |
| ---------------------------------------------------- | ------------ | ------------ |
| Body text / background                               | 14.42:1 PASS | 13.05:1 PASS |
| Body text / card                                     | 16.24:1 PASS | 11.70:1 PASS |
| Muted text / background                              | 5.56:1 PASS  | 6.54:1 PASS  |
| Muted text / card                                    | 6.26:1 PASS  | 5.86:1 PASS  |
| Caliper (benchmark) text / background                | 5.12:1 PASS  | 8.56:1 PASS  |
| Caliper (benchmark) text / card                      | 5.76:1 PASS  | 7.67:1 PASS  |
| Primary/link text / background                       | 6.31:1 PASS  | 6.39:1 PASS  |
| Primary/link text / card                             | 7.10:1 PASS  | 5.73:1 PASS  |
| Primary button text / primary fill                   | 7.10:1 PASS  | 7.45:1 PASS  |
| Danger text / background                             | 5.84:1 PASS  | 6.55:1 PASS  |
| Danger text / card                                   | 6.57:1 PASS  | 5.87:1 PASS  |
| Danger button text / danger fill                     | 6.57:1 PASS  | 7.49:1 PASS  |
| Success text / background                            | 4.72:1 PASS  | 9.37:1 PASS  |
| Body text / muted hover surface                      | 13.28:1 PASS | 10.78:1 PASS |
| Input/select border / card (UI boundary, 3:1 target) | 3.58:1 PASS  | 3.45:1 PASS  |

All text pairs clear the 4.5:1 AA floor with headroom in both themes; the one UI (non-text) pair — form-control borders — clears the 3:1 floor after the `--input-border` fix above. `--border` (decorative dividers, table rules, card/viewport hairlines: ~1.4:1) intentionally does not target 3:1, since those are not the sole means of identifying an interactive component's boundary.

### Step 7 — Motion (`fixing-motion-performance`)

- **`src/components/caliper-marker.tsx`:** was animating the SVG `cx` attribute directly (`style={{ transition: "cx 280ms ease-out" }}`), a geometry property that forces layout/paint every frame. Changed to a compositor-only `transform: translateX(...)`: the circle is drawn at its resting `cx={toX}` and given an initial `translateX(fromX - toX)` offset, which then animates to `translateX(0)`. Confirmed the existing global `prefers-reduced-motion` rule (`transition-duration: 0.01ms !important`) still makes it instant, since it targets `transition-duration` generically rather than the `cx` property specifically.
- **Audit of all other transitions/animations** (`grep` across `src` for `transition`, `animate-`, `@keyframes`): everything else was already compositor-safe or paint-limited-to-small-surfaces — `transition-colors` on buttons/list rows/nav links/viewport-panel hover (small, isolated elements, not full-page repaints), `transition-transform` on a chevron rotate, Radix dialog overlay `fade-in` (opacity only, no content-panel animation), and Recharts' `isAnimationActive={false}` already set on every chart. No scroll-linked motion, no unbounded rAF loops, no animated layout properties (width/height/top/left/margin/padding) found. The single post-case caliper slide remains the only orchestrated motion moment in the app; the timer itself never animates, per spec.

## 8. Verification

Fresh production build (`pnpm build`) against a clean `radtempo_demo_final` Postgres database, seeded deterministically (fixed `mulberry32` seed, `USER_ID`/study-type/tag UUIDs pinned after a real setup+onboarding run) so the headline **CT Abdomen/Pelvis with contrast is exactly 10.0% faster** (comparison median 07:00, recent median 06:18) with an 8-day reading streak and every other favorited study type also trending faster. All 14 pages named in `docs/design/before/` were recaptured at desktop (1440×900) and mobile (375×812), `deviceScaleFactor: 1`, full page, in both light and dark, via Playwright/Chromium, and written to `docs/design/after/<page>-<desktop|mobile>-<light|dark>.png` (56 files, overwritten in place). `start-timer-running` and `post-case-panel` were captured against a live running/just-finished timer (a non-headline study, so the CT A/P +C numbers above stay exact); `setup` was captured against a separate, disposable pre-setup database/instance since `/setup` is unreachable once an admin exists.

Every one of the 56 captures was loaded with `console`/`pageerror` listeners attached and checked for `document.documentElement.scrollWidth > window.innerWidth`.

| Page                | Desktop console errs | Desktop overflow | Mobile console errs | Mobile overflow |
| ------------------- | -------------------- | ---------------- | ------------------- | --------------- |
| login               | 0                    | no               | 0                   | no              |
| setup               | 0                    | no               | 0                   | no              |
| onboarding          | 0                    | no               | 0                   | no              |
| start               | 0                    | no               | 0                   | no              |
| start-timer-running | 0                    | no               | 0                   | no              |
| post-case-panel     | 0                    | no               | 0                   | no              |
| dashboard           | 0                    | no               | 0                   | no              |
| analytics           | 0                    | no               | 0                   | no              |
| history             | 0                    | no               | 0                   | no              |
| studies             | 0                    | no               | 0                   | no              |
| achievements        | 0                    | no               | 0                   | no              |
| settings            | 0                    | no               | 0                   | no              |
| settings-data       | 0                    | no               | 0                   | no              |
| admin               | 0                    | no               | 0                   | no              |

**Zero console errors and zero horizontal overflow across all 56 desktop/mobile × light/dark combinations.**

Before/after comparisons (`docs/design/compare/<page>-<desktop|mobile>.png`, light vs. light, 28 files, all under 700KB) were built with ffmpeg: crop each full-page shot to the first 1800px (desktop) / 1600px (mobile), pad shorter ones to that height, `hstack`.

Every after screenshot was reviewed directly (all 14 pages at both widths in light, plus dark spot-checks on dashboard, achievements, setup and the timer/post-case states). None looked broken, cramped, low-contrast, or inconsistent with the Reading Room direction. Minor, non-blocking observations: the History and Analytics "Recent cases" tables scroll horizontally within their own container on mobile (by design — the page itself never overflows); the Studies list's up/down/edit/delete icon row sits close to two-line study names on narrow mobile widths but stays legible and tappable.

### What changed — overhaul summary

- **Tokens:** replaced the default-SaaS teal/green `--primary`/`--ring` with a calm PACS-annotation blue (`#2b5c82` light / `#6fa8d8` dark); a dedicated `--caliper` amber reserved only for the benchmark measurement; a blue-graphite dark palette (`#1B2127` film base, `#222A31` viewport, `#34404A` gutter) and an equally-supported light mode (`#EEF2F5`/white), not a re-skinned dark-only theme. Added `--input-border` for WCAG-compliant control boundaries.
- **Typography:** Atkinson Hyperlegible Next for all UI text, Atkinson Hyperlegible Mono reserved for the running timer and durations, so figures never shift or misread at a glance in a dim reading room.
- **Layout language:** "Reading Room" — studies as PACS-style viewports in a grid with corner-annotated facts, thin hairline gutters instead of card shadows/borders, and the benchmark drawn as a caliper (a ruled scale with tick marks for previous/recent/this-read pace) rather than a bar or badge.
- **Per-page highlights:** Start's one-click favorite viewports and frequency/recency lists; Dashboard's per-study caliper grid plus records/streak/achievements strip; Analytics' benchmark-as-caliper header with raw-vs-adjusted trend and a filterable recent-cases table; History as a dense table on desktop and stacked rows on mobile; Studies as a hierarchical modality → body-region list; Achievements as a dated hairline list (deliberately not gamified — no confetti, badges, or leaderboard styling, per the spec's "professional instrument, not a fitness app" tone); Settings/Admin as sectioned hairline layouts with keycap-styled shortcut inputs and severity-differentiated (red/muted) destructive actions.
- **States:** distinct empty states (no history yet vs. filtered-to-nothing, each with one clear next action), app-segment `loading.tsx`/`error.tsx` skeletons built on a static, non-shimmering `Skeleton` primitive, and a heavier skeleton for the study-detail analytics page.
- **Accessibility:** skip link to `#main-content`; table captions/`scope="col"` headers on every data table; `--input-border` token so form controls clear the 3:1 non-text-contrast floor; verified focus-visible rings, icon-button `aria-label`s, dialog focus trapping, one `<h1>` per page, accessible text alternatives (`role="img"` + computed labels, `sr-only` summaries + data tables) for the Caliper and trend chart; every color-coded indicator pairs color with an icon or text label. Full contrast table in Step 6 above — all text pairs clear 4.5:1 AA in both themes.
- **Motion:** the caliper marker's post-case slide now animates a compositor-only `transform` instead of the SVG `cx` attribute; confirmed every other transition is already compositor-safe/paint-limited, no scroll-linked motion or animated layout properties anywhere, and `prefers-reduced-motion` makes everything instant.

### Post-review fixes (round 2)

A design review of `docs/design/compare/*` caught four issues the first pass missed; all four are fixed in app code (not just screenshots) and reverified against a freshly rebuilt, freshly seeded instance (same approach as above):

1. **Start favorites tiles too tall, empty gutter cell with 4 favorites.** `Viewport` gained a `compact` size (≈64–96px, `min-h-16 sm:min-h-24`) used only by Start's `FavoriteTile`, and `ViewportGrid` gained a `fitContent` mode that lays out tiles with `flex flex-wrap` instead of a fixed grid — each tile carries `flex-1`, so items on a partial last row stretch to fill it instead of leaving the container's border-colored background exposed as a bare cell. Verified at 1, 2, 4, and 5 favorites, desktop and mobile: every row fills edge-to-edge, no gutter-colored gaps, no overflow.
2. **Complexity distribution bars nearly invisible.** Replaced the hairline `border-b` track/fill with solid bars: track is `bg-muted` (the already-audited ~5.6–6.5:1 muted-text color), fill is `bg-caliper`, both well clear of the 3:1 non-text-contrast floor in light and dark. Count text was already shown and is unchanged.
3. **Analytics benchmark Caliper tiny and left-offset.** `Caliper` gained a `size` prop (`"sm"` default for the compact Dashboard cards, `"lg"` — 2× the vertical geometry — for the Analytics detail page); `CaliperPanel`/the page now render it at `size="lg"` and full panel width (`w-full`, no `max-w-xl` cap) instead of a narrow, left-aligned strip. The Dashboard's compact cards are unaffected (still `size="sm"`).
4. **Complexity rendered as raw `TYPICAL`/`EASY`/`DIFFICULT` in Analytics' recent-cases table.** Added a shared `COMPLEXITY_LABEL` map (`src/features/analytics/types.ts`) and used it in the Analytics table (the actual bug), History's table (which already had an equivalent local helper — now delegates to the shared map), and the complexity-distribution row labels. Stored/compared values are untouched; only the label changed.

Re-verified: `pnpm lint`, `format:check`, `typecheck`, `test` (54/54), `build`, and `pnpm e2e` (5/5) all pass. Recaptured `start`, `start-timer-running`, `post-case-panel`, and `analytics` (16 files) plus their 8 compare strips against a fresh build/fresh seed (same deterministic CT A/P +C 10%-faster data); all 16 recaptures show 0 console errors and 0 horizontal overflow, desktop and mobile, light and dark.

### Known gaps

- No automated visual-regression/screenshot-diff test was added; this verification pass was manual (script-driven capture + human review of every image).
- The Studies list's action-icon row could use slightly more breathing room from wrapped two-line study names at the narrowest mobile widths (375px) — legible and functional today, not a blocking issue.
- Demo screenshots use synthetic seeded data; no production/real-user screenshots were captured (expected for a pre-launch design pass).
- `next start` logs a harmless warning that `output: standalone` isn't used by `next start` (the app was still exercised correctly for this verification; a real deployment would run `node .next/standalone/server.js`).

## Audit remediation (R1–R6)

Fixes for a bounded set of pre-launch audit findings. No redesign, no
scope creep, and no change to how historical pace/exclusion/complexity
factors are computed — only how already-computed values are surfaced.

- **R1 — post-case graphic compared incompatible durations.** The post-case
  caliper plotted `feedback.recentPaceMs` (complexity-adjusted) against
  `entry.activeDurationMs` (raw) as if they were on the same scale.
  `PostCaseFeedback` (`src/features/analytics/types.ts`) now carries an
  explicit `adjustedDurationMs` — the target case's own duration divided by
  its learned complexity factor, computed once server-side in
  `postCaseFeedback` (`src/features/analytics/engine.ts`) and never
  recomputed in the browser. The post-case panel feeds that value to the
  graphic instead of the raw duration; "Completed in" still shows the raw
  duration. `null` for BASELINE_STARTED/BASELINE_BUILDING/EXCLUDED, where
  there is nothing to compare.
- **R6 — Caliper legend and responsive width.** Added a compact legend
  below the graphic naming each marker ("Recent pace (adjusted)", "This
  read (adjusted)", "Previous pace") so the comparison being drawn is
  labeled, not just colored. Also fixed the width bug the audit flagged:
  the SVG's `height` was a fixed pixel value while `width="100%"`, so on
  any container wider than the 300-unit viewBox the default
  `preserveAspectRatio="xMidYMid meet"` scaled the whole graphic to fit the
  _height_ and centered it — rendering at a fixed ~300px regardless of the
  panel's actual width. Fixed by deriving the SVG's height from its
  rendered width via CSS `aspect-ratio` (matching the viewBox's own aspect
  ratio) instead of pinning `height`, so the browser always picks a scale
  where both axes match the viewBox exactly. This is uniform scaling, not
  a non-uniform stretch — strokes, markers and text grow or shrink
  together in proportion, never distorted — which is simpler than
  computing a second, wider viewBox for `size="lg"` and gives the same
  result.
