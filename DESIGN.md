# MediaHub Design System ("Screening Room Program & Cue Index")

## Visual World & Surface Tokens
- **Canvas:** `#0c0d10` (`--color-canvas`)
- **Elevated Rail / Rows:** `#15171c` (`--color-rail`), `#1b1e25` (`--color-surface`)
- **Hairline Borders:** `#232730` (`--color-border`), `#323744` (`--color-border-strong`)
- **Ink:** `#f3f4f6` primary (`--color-ink`), `#9ca3af` metadata (`--color-ink-muted`), `#6b7280` muted (`--color-ink-dim`)
- **Accents & Semantic States:**
  - Screening CTA / Active selection: `#f97316` (`--color-accent`) with `#0c0d10` ink for high WCAG AA contrast
  - Watched: `#22c55e` (`--color-watched`)
  - In Progress: `#f59e0b` (`--color-progress`)
  - Error / Destructive: `#ef4444` (`--color-danger`)

## Typography & Offline Stacks
- Zero external font CDN imports; local system sans stack (`--font-sans`) for UI chrome and tabular monospace (`--font-mono`, `tabular-nums`) reserved for timecodes, file sizes, and progress percentages.

## Layout & Component Grammar
- **Left Library Rail (`Sidebar.tsx`):** Persistent desktop rail (`w-76`), collapsible mobile drawer (`< lg`), inline root registration form, inline delete confirmation, and "Continue Watching" resume card.
- **Top Operational Toolbar (`HeaderBar.tsx`):** Breadcrumbs clamped to active root, live search, status filter pills (`All`, `Unwatched`, `In Progress`, `Watched`), sort selector, and runtime status/settings trigger.
- **Cue Rows (`MediaRow.tsx`):** Folder rows + video cue rows with 16:9 thumbnail frame, metadata badges, timecode progress scrubber bar, primary Play/Resume CTA, browser stream toggle, and Watched/Unwatched toggle.
- **Modals & Feedback (`BrowserPlayerModal.tsx`, `SettingsModal.tsx`, `ToastContainer.tsx`):** Native `role="dialog"` modals with `Escape`/focus management and `aria-live` toast notifications.

