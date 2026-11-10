import { useCallback, useEffect, useRef, useState } from 'react';
import { FolderOpen, RefreshCw } from 'lucide-react';
import {
  addRoot,
  ApiError,
  browseDirectory,
  deleteRoot,
  getHealth,
  getLastWatched,
  getPlaybackProgress,
  getRoots,
  markAsUnwatched,
  markAsWatched,
  playMedia,
} from '../api/client';
import {
  BrowseItem,
  BrowseResponse,
  BrowseSort,
  BrowseStatusFilter,
  HealthStatus,
  LastWatchedItem,
  LibraryRoot,
  PlayerPreference,
  PlayerPreferenceSchema,
} from '../api/schemas';
import { BrowserPlayerModal } from '../components/BrowserPlayerModal';
import { HeaderBar } from '../components/HeaderBar';
import { MediaRow } from '../components/MediaRow';
import { SettingsModal } from '../components/SettingsModal';
import { Sidebar } from '../components/Sidebar';
import { ToastContainer, ToastItem, ToastTone } from '../components/ToastContainer';

const PLAYER_PREF_STORAGE_KEY = 'mediahub.playerPreference';

function loadSavedPlayerPref(): PlayerPreference {
  try {
    const raw = window.localStorage.getItem(PLAYER_PREF_STORAGE_KEY);
    const parsed = PlayerPreferenceSchema.safeParse(raw);
    return parsed.success ? parsed.data : 'auto';
  } catch {
    return 'auto';
  }
}

export function Dashboard() {
  const [roots, setRoots] = useState<LibraryRoot[]>([]);
  const [loadingRoots, setLoadingRoots] = useState(true);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [lastWatched, setLastWatched] = useState<LastWatchedItem | null>(null);

  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [browseData, setBrowseData] = useState<BrowseResponse | null>(null);
  const [loadingBrowse, setLoadingBrowse] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<BrowseStatusFilter>('all');
  const [sortBy, setSortBy] = useState<BrowseSort>('name');

  const [playerPref, setPlayerPref] = useState<PlayerPreference>(loadSavedPlayerPref);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [browserPlayerItem, setBrowserPlayerItem] = useState<BrowseItem | null>(null);
  const [activeMpvPath, setActiveMpvPath] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const browseAbortRef = useRef<AbortController | null>(null);

  const pushToast = useCallback((tone: ToastTone, title: string, description?: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-3), { id, tone, title, description }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handlePlayerPrefChange = useCallback((pref: PlayerPreference) => {
    setPlayerPref(pref);
    try {
      window.localStorage.setItem(PLAYER_PREF_STORAGE_KEY, pref);
    } catch {
      // Ignore storage failures in private browsing
    }
  }, []);

  const refreshSidebarState = useCallback(async (signal?: AbortSignal) => {
    const [rootsRes, lastRes] = await Promise.allSettled([
      getRoots(signal),
      getLastWatched(signal),
    ]);

    if (rootsRes.status === 'fulfilled') {
      const nextRoots = rootsRes.value;
      setRoots(nextRoots);
      setCurrentPath((prev) => {
        if (prev && nextRoots.some((r) => prev.startsWith(r.path))) {
          return prev;
        }
        return nextRoots[0]?.path ?? null;
      });
    }
    if (lastRes.status === 'fulfilled') {
      setLastWatched(lastRes.value);
    }
    setLoadingRoots(false);
  }, []);

  const loadFolder = useCallback(
    async (targetPath: string, showSpinner = true) => {
      browseAbortRef.current?.abort();
      const controller = new AbortController();
      browseAbortRef.current = controller;

      if (showSpinner) {
        setLoadingBrowse(true);
      }
      setBrowseError(null);

      try {
        const res = await browseDirectory({
          path: targetPath,
          q: searchQuery,
          status: statusFilter,
          sort: sortBy,
          signal: controller.signal,
        });
        setBrowseData(res);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        const msg = err instanceof Error ? err.message : 'Unable to open folder.';
        setBrowseError(msg);
      } finally {
        if (browseAbortRef.current === controller) {
          setLoadingBrowse(false);
        }
      }
    },
    [searchQuery, statusFilter, sortBy],
  );

  // Initial load: health + roots + last watched
  useEffect(() => {
    const controller = new AbortController();
    getHealth(controller.signal)
      .then(setHealth)
      .catch(() => setHealth(null));
    void refreshSidebarState(controller.signal);

    return () => controller.abort();
  }, [refreshSidebarState]);

  // Browse whenever path or filters change
  useEffect(() => {
    if (!currentPath) {
      setBrowseData(null);
      setBrowseError(null);
      return;
    }
    void loadFolder(currentPath, true);
    return () => browseAbortRef.current?.abort();
  }, [currentPath, loadFolder]);

  // Background refresh (5s) for active thumbnails / mpv progress
  useEffect(() => {
    if (!currentPath) return;
    const timer = window.setInterval(() => {
      const controller = new AbortController();
      void getLastWatched(controller.signal)
        .then(setLastWatched)
        .catch(() => undefined);

      if (activeMpvPath) {
        void getPlaybackProgress(activeMpvPath, controller.signal)
          .then((prog) => {
            if (!prog.active) {
              setActiveMpvPath(null);
            }
          })
          .catch(() => undefined);
      }

      void browseDirectory({
        path: currentPath,
        q: searchQuery,
        status: statusFilter,
        sort: sortBy,
        signal: controller.signal,
      })
        .then(setBrowseData)
        .catch(() => undefined);
    }, 5000);

    return () => window.clearInterval(timer);
  }, [currentPath, searchQuery, statusFilter, sortBy, activeMpvPath]);

  const handleAddRoot = async (path: string) => {
    const created = await addRoot(path);
    await refreshSidebarState();
    setCurrentPath(created.path);
    setSearchQuery('');
    setStatusFilter('all');
    pushToast('success', 'Folder added', created.path);
  };

  const handleDeleteRoot = async (rootId: number) => {
    try {
      await deleteRoot(rootId);
      await refreshSidebarState();
      pushToast('info', 'Folder removed from library');
    } catch (err) {
      pushToast(
        'error',
        'Could not remove folder',
        err instanceof Error ? err.message : undefined,
      );
    }
  };

  const launchBrowserPlayer = useCallback((item: BrowseItem) => {
    setBrowserPlayerItem(item);
  }, []);

  const handlePlayPrimary = useCallback(
    async (item: BrowseItem) => {
      const shouldUseBrowser =
        playerPref === 'browser' || (playerPref === 'auto' && health?.mpv_available === false);

      if (shouldUseBrowser) {
        launchBrowserPlayer(item);
        return;
      }

      try {
        await playMedia(item.path);
        setActiveMpvPath(item.path);
        pushToast('info', 'Launched in mpv', item.name);
      } catch (err) {
        if (err instanceof ApiError && err.status === 503) {
          pushToast(
            'warning',
            'mpv is unavailable on host',
            'Switching to the in-browser player.',
          );
          launchBrowserPlayer(item);
          return;
        }
        pushToast(
          'error',
          'Playback failed',
          err instanceof Error ? err.message : 'Unable to start video playback.',
        );
      }
    },
    [playerPref, health, launchBrowserPlayer, pushToast],
  );

  const handleResumeLastWatched = useCallback(
    (lw: LastWatchedItem) => {
      const item: BrowseItem = {
        name: lw.name,
        path: lw.file_path,
        is_dir: false,
        watched: false,
        progress_ratio: lw.progress_ratio,
        last_position_sec: lw.last_position_sec ?? null,
        duration: lw.duration ?? null,
        thumbnail_url: lw.thumbnail_url ?? null,
      };
      void handlePlayPrimary(item);
    },
    [handlePlayPrimary],
  );

  const handleToggleWatched = async (item: BrowseItem) => {
    try {
      if (item.watched) {
        await markAsUnwatched(item.path);
        pushToast('info', 'Marked as unwatched', item.name);
      } else {
        await markAsWatched(item.path);
        pushToast('success', 'Marked as watched', item.name);
      }
      if (currentPath) {
        void loadFolder(currentPath, false);
      }
      void getLastWatched().then(setLastWatched).catch(() => undefined);
    } catch (err) {
      pushToast(
        'error',
        'Failed to update status',
        err instanceof Error ? err.message : undefined,
      );
    }
  };

  const hasActiveFilters = searchQuery.trim().length > 0 || statusFilter !== 'all';
  const items = browseData?.items ?? [];

  return (
    <div className="flex min-h-screen bg-[#0c0d10] text-[#f3f4f6]">
      <Sidebar
        roots={roots}
        activeRootPath={browseData?.root_path ?? currentPath}
        loadingRoots={loadingRoots}
        lastWatched={lastWatched}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        onSelectRoot={(path) => {
          setCurrentPath(path);
          setSearchQuery('');
        }}
        onAddRoot={handleAddRoot}
        onDeleteRoot={handleDeleteRoot}
        onResumeLastWatched={handleResumeLastWatched}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <HeaderBar
          breadcrumbs={browseData?.breadcrumbs ?? []}
          parentPath={browseData?.parent_path ?? null}
          searchQuery={searchQuery}
          statusFilter={statusFilter}
          sortBy={sortBy}
          health={health}
          playerPref={playerPref}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
          onNavigatePath={(path) => setCurrentPath(path)}
          onSearchChange={setSearchQuery}
          onStatusChange={setStatusFilter}
          onSortChange={setSortBy}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
          {!currentPath && !loadingRoots ? (
            <section
              aria-label="Empty library guide"
              className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#232730] bg-[#15171c]/60 px-6 py-16 text-center"
            >
              <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-[#232730] bg-[#0c0d10] text-[#f97316]">
                <FolderOpen className="h-6 w-6" aria-hidden="true" />
              </span>
              <h2 className="text-lg font-semibold text-[#f3f4f6]">No library folder selected</h2>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-[#9ca3af]">
                Add a local video folder in the library rail to browse nested shows, movies, and clips with automatic resume tracking.
              </p>
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                className="mt-5 inline-flex h-10 items-center justify-center rounded-lg bg-[#f97316] px-4 text-sm font-semibold text-[#0c0d10] transition-colors hover:bg-[#fb923c] lg:hidden"
              >
                Open Library Rail
              </button>
            </section>
          ) : loadingBrowse && !browseData ? (
            <div className="space-y-3" aria-busy="true" aria-label="Loading folder contents">
              <div className="h-20 animate-pulse rounded-lg bg-[#15171c]" />
              <div className="h-20 animate-pulse rounded-lg bg-[#15171c]" />
              <div className="h-20 animate-pulse rounded-lg bg-[#15171c]" />
            </div>
          ) : browseError ? (
            <div
              role="alert"
              className="flex flex-col items-start justify-between gap-4 rounded-xl border border-[#ef4444]/40 bg-[#15171c] p-5 sm:flex-row sm:items-center"
            >
              <div>
                <h2 className="text-sm font-semibold text-[#f3f4f6]">Unable to load folder</h2>
                <p className="mt-1 text-xs text-[#9ca3af]">{browseError}</p>
              </div>
              {currentPath && (
                <button
                  type="button"
                  onClick={() => void loadFolder(currentPath, true)}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#232730] bg-[#0c0d10] px-3.5 text-xs font-medium text-[#f3f4f6] transition-colors hover:bg-[#21252e]"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  Retry
                </button>
              )}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-[#232730] bg-[#15171c]/60 px-6 py-14 text-center">
              <p className="text-sm font-medium text-[#f3f4f6]">
                {hasActiveFilters
                  ? 'No items match the current search or status filter.'
                  : 'No video files found in this folder.'}
              </p>
              <p className="mt-1 text-xs text-[#9ca3af]">
                {hasActiveFilters
                  ? 'Adjust your filter criteria or clear the search query.'
                  : 'Supported extensions: .mp4, .mkv, .webm, .mov, .avi, .wmv, .m4v'}
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                  }}
                  className="mt-4 inline-flex h-9 items-center rounded-lg border border-[#232730] bg-[#0c0d10] px-3.5 text-xs font-medium text-[#f3f4f6] hover:bg-[#21252e]"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <section aria-label="Media index">
              <div className="mb-3 flex items-center justify-between text-xs text-[#9ca3af]">
                <span>
                  Showing <strong className="tabular-timecode text-[#f3f4f6]">{items.length}</strong>{' '}
                  {items.length === 1 ? 'item' : 'items'}
                </span>
                {browseData && (
                  <span className="hidden truncate pl-4 font-mono text-[11px] text-[#6b7280] sm:inline">
                    {browseData.current_path}
                  </span>
                )}
              </div>

              <div className="space-y-2.5">
                {items.map((item) => (
                  <MediaRow
                    key={item.path}
                    item={item}
                    isPlayingMpv={activeMpvPath === item.path}
                    onOpenFolder={(path) => setCurrentPath(path)}
                    onPlayPrimary={(target) => void handlePlayPrimary(target)}
                    onPlayInBrowser={launchBrowserPlayer}
                    onToggleWatched={(target) => void handleToggleWatched(target)}
                  />
                ))}
              </div>
            </section>
          )}
        </main>
      </div>

      <BrowserPlayerModal
        item={browserPlayerItem}
        onClose={() => {
          setBrowserPlayerItem(null);
          if (currentPath) void loadFolder(currentPath, false);
          void getLastWatched().then(setLastWatched).catch(() => undefined);
        }}
        onProgressSynced={() => {
          void getLastWatched().then(setLastWatched).catch(() => undefined);
        }}
      />

      <SettingsModal
        open={settingsOpen}
        health={health}
        playerPref={playerPref}
        onChangePlayerPref={handlePlayerPrefChange}
        onClose={() => setSettingsOpen(false)}
      />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

