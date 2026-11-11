import { FormEvent, useEffect, useState } from 'react';
import { Folder, FolderOpen, FolderPlus, Play, Trash2, X } from 'lucide-react';
import { LastWatchedItem, LibraryRoot, RootPathInputSchema } from '../api/schemas';
import { formatDuration, formatPercent, resolveAssetUrl } from '../utils/format';

interface PyWebViewWindow extends Window {
  pywebview?: {
    api?: {
      pick_folder?: () => Promise<string | null>;
    };
  };
}

interface SidebarProps {
  roots: LibraryRoot[];
  activeRootPath: string | null;
  loadingRoots: boolean;
  lastWatched: LastWatchedItem | null;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onSelectRoot: (rootPath: string) => void;
  onAddRoot: (path: string) => Promise<void>;
  onDeleteRoot: (rootId: number) => Promise<void>;
  onResumeLastWatched: (item: LastWatchedItem) => void;
}

export function Sidebar({
  roots,
  activeRootPath,
  loadingRoots,
  lastWatched,
  mobileOpen,
  onCloseMobile,
  onSelectRoot,
  onAddRoot,
  onDeleteRoot,
  onResumeLastWatched,
}: SidebarProps) {
  const [newPath, setNewPath] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [hasDesktopPicker, setHasDesktopPicker] = useState<boolean>(() =>
    Boolean((window as PyWebViewWindow).pywebview?.api?.pick_folder),
  );

  useEffect(() => {
    const checkBridge = () => {
      if ((window as PyWebViewWindow).pywebview?.api?.pick_folder) {
        setHasDesktopPicker(true);
      }
    };
    checkBridge();
    window.addEventListener('pywebviewready', checkBridge);
    return () => window.removeEventListener('pywebviewready', checkBridge);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseMobile();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen, onCloseMobile]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = RootPathInputSchema.safeParse(newPath);
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? 'Invalid folder path.');
      return;
    }

    setValidationError(null);
    setSubmitting(true);
    try {
      await onAddRoot(parsed.data);
      setNewPath('');
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Unable to add library folder.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async (rootId: number) => {
    setDeletingId(rootId);
    try {
      await onDeleteRoot(rootId);
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  };

  const handleDesktopBrowse = async () => {
    const picker = (window as PyWebViewWindow).pywebview?.api?.pick_folder;
    if (!picker) return;
    setValidationError(null);
    setSubmitting(true);
    try {
      const picked = await picker();
      if (picked) {
        await onAddRoot(picked);
        setNewPath('');
      }
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Unable to add library folder.');
    } finally {
      setSubmitting(false);
    }
  };

  const thumbUrl = resolveAssetUrl(lastWatched?.thumbnail_url);

  const railContent = (
    <div className="flex h-full flex-col bg-[#15171c] border-r border-[#232730]">
      <div className="flex items-center justify-between border-b border-[#232730] px-4 py-3.5 lg:hidden">
        <span className="text-sm font-semibold tracking-tight text-[#f3f4f6]">Library Rail</span>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close library sidebar"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[#9ca3af] transition-colors hover:bg-[#21252e] hover:text-[#f3f4f6]"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {/* Register new local root */}
      <div className="border-b border-[#232730] p-4">
        <form onSubmit={handleSubmit} noValidate className="space-y-2.5">
          <label
            htmlFor="root-path-input"
            className="block text-xs font-medium text-[#9ca3af]"
          >
            Add library folder
          </label>
          <div className="flex gap-2">
            <input
              id="root-path-input"
              type="text"
              value={newPath}
              onChange={(e) => {
                setNewPath(e.target.value);
                if (validationError) setValidationError(null);
              }}
              placeholder="D:\Videos or /media/movies"
              aria-invalid={validationError ? 'true' : 'false'}
              aria-describedby={validationError ? 'root-path-error' : undefined}
              className="min-w-0 flex-1 rounded-lg border border-[#232730] bg-[#0c0d10] px-3 py-2 text-sm text-[#f3f4f6] placeholder:text-[#6b7280] transition-colors focus:border-[#f97316] focus:outline-none"
            />
            <button
              type="submit"
              disabled={submitting}
              aria-label="Add folder"
              className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#f97316] px-3 text-sm font-semibold text-[#0c0d10] transition-colors hover:bg-[#fb923c] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FolderPlus className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{submitting ? 'Adding' : 'Add'}</span>
            </button>
          </div>
          {hasDesktopPicker && (
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleDesktopBrowse()}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-[#232730] bg-[#0c0d10] px-3 text-xs font-medium text-[#f3f4f6] transition-colors hover:border-[#323744] hover:bg-[#21252e] disabled:opacity-50"
            >
              <FolderOpen className="h-3.5 w-3.5 text-[#f97316]" aria-hidden="true" />
              <span>Browse Computer Folder…</span>
            </button>
          )}
          {validationError && (
            <p id="root-path-error" role="alert" className="text-xs text-[#ef4444]">
              {validationError}
            </p>
          )}
        </form>
      </div>

      {/* Registered Roots */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-xs font-semibold text-[#9ca3af]">Registered Folders</h2>
          <span className="tabular-timecode text-xs text-[#6b7280]">{roots.length}</span>
        </div>

        {loadingRoots ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading library folders">
            <div className="h-12 animate-pulse rounded-lg bg-[#1b1e25]" />
            <div className="h-12 animate-pulse rounded-lg bg-[#1b1e25]" />
          </div>
        ) : roots.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#232730] bg-[#0c0d10]/60 p-4 text-xs leading-relaxed text-[#9ca3af]">
            No library folders yet. Paste a local directory path above to start indexing video files.
          </div>
        ) : (
          <ul className="space-y-1.5" role="list">
            {roots.map((root) => {
              const isActive = activeRootPath === root.path;
              const isConfirming = confirmDeleteId === root.id;
              const displayName = root.label || root.path.split(/[\\/]/).filter(Boolean).pop() || root.path;

              return (
                <li key={root.id} className="rounded-lg border border-transparent">
                  <div
                    className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 transition-colors ${
                      isActive
                        ? 'border-[#f97316]/45 bg-[#1b1e25] text-[#f3f4f6]'
                        : 'border-transparent text-[#9ca3af] hover:bg-[#1b1e25]/70 hover:text-[#f3f4f6]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectRoot(root.path);
                        onCloseMobile();
                      }}
                      title={root.path}
                      className="flex min-h-10 min-w-0 flex-1 items-center gap-2.5 px-1 text-left"
                    >
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          isActive ? 'bg-[#f97316]' : 'bg-[#323744]'
                        }`}
                        aria-hidden="true"
                      />
                      <Folder className="h-4 w-4 shrink-0 text-[#9ca3af]" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-[#f3f4f6]">
                          {displayName}
                        </div>
                        <div className="truncate text-[11px] text-[#6b7280]">{root.path}</div>
                      </div>
                    </button>

                    {!isConfirming && (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(root.id)}
                        aria-label={`Remove folder ${displayName}`}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[#6b7280] transition-colors hover:bg-[#21252e] hover:text-[#ef4444]"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>

                  {isConfirming && (
                    <div className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-[#ef4444]/30 bg-[#0c0d10] px-2.5 py-2 text-xs">
                      <span className="text-[#9ca3af]">Remove folder?</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          disabled={deletingId === root.id}
                          className="rounded px-2.5 py-1 text-[#9ca3af] transition-colors hover:bg-[#21252e] hover:text-[#f3f4f6]"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleConfirmDelete(root.id)}
                          disabled={deletingId === root.id}
                          className="rounded bg-[#ef4444] px-2.5 py-1 font-semibold text-[#f3f4f6] transition-colors hover:bg-[#dc2626] disabled:opacity-50"
                        >
                          {deletingId === root.id ? 'Removing' : 'Remove'}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Continue Watching Cue Card */}
      {lastWatched && (
        <div className="border-t border-[#232730] p-3.5">
          <div className="rounded-lg border border-[#232730] bg-[#0c0d10] p-3">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-semibold text-[#f59e0b]">Continue Watching</span>
              <span className="tabular-timecode text-[#9ca3af]">
                {formatPercent(lastWatched.progress_ratio)}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {thumbUrl ? (
                <img
                  src={thumbUrl}
                  alt={lastWatched.name}
                  className="h-12 w-20 shrink-0 rounded border border-[#232730] object-cover"
                />
              ) : (
                <div className="flex h-12 w-20 shrink-0 items-center justify-center rounded border border-[#232730] bg-[#15171c] text-[#6b7280]">
                  <Play className="h-4 w-4" aria-hidden="true" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[#f3f4f6]" title={lastWatched.name}>
                  {lastWatched.name}
                </p>
                <p className="tabular-timecode mt-0.5 text-xs text-[#9ca3af]">
                  {formatDuration(lastWatched.last_position_sec)}
                  {lastWatched.duration ? ` / ${formatDuration(lastWatched.duration)}` : ''}
                </p>
              </div>
            </div>

            <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[#232730]">
              <div
                className="h-full rounded-full bg-[#f59e0b] transition-all"
                style={{ width: `${Math.round(lastWatched.progress_ratio * 100)}%` }}
              />
            </div>

            <button
              type="button"
              onClick={() => {
                onResumeLastWatched(lastWatched);
                onCloseMobile();
              }}
              className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#f97316] px-3 text-sm font-semibold text-[#0c0d10] transition-colors hover:bg-[#fb923c]"
            >
              <Play className="h-4 w-4 fill-current" aria-hidden="true" />
              Resume playback
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop persistent rail */}
      <aside aria-label="Library navigation" className="hidden w-76 shrink-0 lg:block">
        {railContent}
      </aside>

      {/* Mobile slide-over drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/70"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside
            aria-label="Library navigation"
            className="relative z-10 h-full w-80 max-w-[85vw]"
          >
            {railContent}
          </aside>
        </div>
      )}
    </>
  );
}

