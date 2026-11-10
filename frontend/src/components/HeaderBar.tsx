import {
  ArrowLeft,
  ChevronRight,
  Film,
  Menu,
  Search,
  Settings,
  X,
} from 'lucide-react';
import {
  BreadcrumbItem,
  BrowseSort,
  BrowseStatusFilter,
  HealthStatus,
  PlayerPreference,
} from '../api/schemas';

interface HeaderBarProps {
  breadcrumbs: BreadcrumbItem[];
  parentPath: string | null;
  searchQuery: string;
  statusFilter: BrowseStatusFilter;
  sortBy: BrowseSort;
  health: HealthStatus | null;
  playerPref: PlayerPreference;
  onOpenMobileSidebar: () => void;
  onNavigatePath: (path: string) => void;
  onSearchChange: (value: string) => void;
  onStatusChange: (status: BrowseStatusFilter) => void;
  onSortChange: (sort: BrowseSort) => void;
  onOpenSettings: () => void;
}

const STATUS_OPTIONS: { value: BrowseStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unwatched', label: 'Unwatched' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'watched', label: 'Watched' },
];

export function HeaderBar({
  breadcrumbs,
  parentPath,
  searchQuery,
  statusFilter,
  sortBy,
  health,
  playerPref,
  onOpenMobileSidebar,
  onNavigatePath,
  onSearchChange,
  onStatusChange,
  onSortChange,
  onOpenSettings,
}: HeaderBarProps) {
  const effectivePlayerLabel =
    playerPref === 'browser'
      ? 'Browser'
      : playerPref === 'mpv'
        ? 'mpv'
        : health?.mpv_available
          ? 'Auto (mpv)'
          : 'Auto (Browser)';

  return (
    <header className="sticky top-0 z-30 border-b border-[#232730] bg-[#0c0d10]/95 backdrop-blur-sm">
      <div className="flex flex-col gap-3 px-4 py-3 sm:px-6">
        {/* Top row: Brand, Breadcrumbs, Settings */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={onOpenMobileSidebar}
              aria-label="Open library sidebar"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#232730] bg-[#15171c] text-[#f3f4f6] transition-colors hover:bg-[#21252e] lg:hidden"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>

            <div className="flex items-center gap-2 shrink-0">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#15171c] border border-[#232730] text-[#f97316]">
                <Film className="h-4 w-4" aria-hidden="true" />
              </span>
              <h1 className="text-base font-semibold tracking-tight text-[#f3f4f6]">
                MediaHub
              </h1>
            </div>

            {breadcrumbs.length > 0 && (
              <nav
                aria-label="Folder breadcrumbs"
                className="hidden min-w-0 items-center gap-1 overflow-x-auto pl-2 sm:flex"
              >
                {parentPath && (
                  <button
                    type="button"
                    onClick={() => onNavigatePath(parentPath)}
                    aria-label="Go to parent folder"
                    className="mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#232730] bg-[#15171c] text-[#9ca3af] transition-colors hover:bg-[#21252e] hover:text-[#f3f4f6]"
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}

                {breadcrumbs.map((crumb, index) => {
                  const isLast = index === breadcrumbs.length - 1;
                  return (
                    <div key={crumb.path} className="flex min-w-0 items-center gap-1">
                      {index > 0 && (
                        <ChevronRight
                          className="h-3.5 w-3.5 shrink-0 text-[#6b7280]"
                          aria-hidden="true"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => onNavigatePath(crumb.path)}
                        aria-current={isLast ? 'location' : undefined}
                        className={`max-w-[14rem] truncate rounded-md px-2 py-1 text-sm transition-colors ${
                          isLast
                            ? 'font-medium text-[#f3f4f6] bg-[#15171c]'
                            : 'text-[#9ca3af] hover:bg-[#15171c] hover:text-[#f3f4f6]'
                        }`}
                      >
                        {crumb.name}
                      </button>
                    </div>
                  );
                })}
              </nav>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenSettings}
              aria-label="Playback and runtime settings"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#232730] bg-[#15171c] px-3 text-xs font-medium text-[#f3f4f6] transition-colors hover:border-[#323744] hover:bg-[#21252e]"
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  health ? 'bg-[#22c55e]' : 'bg-[#6b7280]'
                }`}
                aria-hidden="true"
              />
              <span className="hidden sm:inline">{effectivePlayerLabel}</span>
              <Settings className="h-4 w-4 text-[#9ca3af]" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Mobile back / current folder bar */}
        {breadcrumbs.length > 0 && (
          <div className="flex items-center gap-2 sm:hidden">
            {parentPath && (
              <button
                type="button"
                onClick={() => onNavigatePath(parentPath)}
                aria-label="Go to parent folder"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#232730] bg-[#15171c] text-[#9ca3af]"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
            <span className="truncate text-sm font-medium text-[#f3f4f6]">
              {breadcrumbs[breadcrumbs.length - 1]?.name}
            </span>
          </div>
        )}

        {/* Operational Filter & Search Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="relative min-w-[200px] flex-1 sm:max-w-sm">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b7280]"
              aria-hidden="true"
            />
            <input
              id="folder-search-input"
              name="folderSearch"
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Filter folder items..."
              aria-label="Search current folder"
              className="h-10 w-full rounded-lg border border-[#232730] bg-[#15171c] pl-9 pr-9 text-sm text-[#f3f4f6] placeholder:text-[#6b7280] transition-colors focus:border-[#f97316] focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-[#9ca3af] hover:bg-[#21252e] hover:text-[#f3f4f6]"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Filter by watch status"
              className="inline-flex rounded-lg border border-[#232730] bg-[#15171c] p-0.5"
            >
              {STATUS_OPTIONS.map((opt) => {
                const selected = statusFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onStatusChange(opt.value)}
                    aria-pressed={selected}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      selected
                        ? 'bg-[#f97316] text-[#0c0d10] font-semibold'
                        : 'text-[#9ca3af] hover:text-[#f3f4f6]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <label htmlFor="folder-sort-select" className="inline-flex items-center gap-1.5 text-xs text-[#9ca3af]">
              <span className="sr-only">Sort media by</span>
              <select
                id="folder-sort-select"
                name="folderSort"
                value={sortBy}
                onChange={(e) => onSortChange(e.target.value as BrowseSort)}
                aria-label="Sort media by"
                className="h-9 rounded-lg border border-[#232730] bg-[#15171c] px-2.5 text-xs font-medium text-[#f3f4f6] transition-colors hover:border-[#323744] focus:border-[#f97316] focus:outline-none"
              >
                <option value="name">Sort: Name</option>
                <option value="size">Sort: Size</option>
                <option value="duration">Sort: Duration</option>
                <option value="recent">Sort: Recent</option>
              </select>
            </label>
          </div>
        </div>
      </div>
    </header>
  );
}
