import { Check, ChevronRight, Film, Folder, MonitorPlay, Play, RotateCcw } from 'lucide-react';
import { BrowseItem } from '../api/schemas';
import { formatBytes, formatDuration, formatPercent, resolveAssetUrl } from '../utils/format';

interface MediaRowProps {
  item: BrowseItem;
  isPlayingMpv: boolean;
  onOpenFolder: (path: string) => void;
  onPlayPrimary: (item: BrowseItem) => void;
  onPlayInBrowser: (item: BrowseItem) => void;
  onToggleWatched: (item: BrowseItem) => void;
}

export function MediaRow({
  item,
  isPlayingMpv,
  onOpenFolder,
  onPlayPrimary,
  onPlayInBrowser,
  onToggleWatched,
}: MediaRowProps) {
  if (item.is_dir) {
    return (
      <button
        type="button"
        onClick={() => onOpenFolder(item.path)}
        className="group flex w-full items-center justify-between gap-3 rounded-lg border border-[#232730] bg-[#15171c] px-4 py-3 text-left transition-colors hover:border-[#323744] hover:bg-[#1b1e25]"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#232730] bg-[#0c0d10] text-[#f97316]">
            <Folder className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[#f3f4f6]">{item.name}</p>
            <p className="text-xs text-[#9ca3af]">Folder</p>
          </div>
        </div>
        <ChevronRight
          className="h-4 w-4 shrink-0 text-[#6b7280] transition-transform group-hover:translate-x-0.5 group-hover:text-[#f3f4f6]"
          aria-hidden="true"
        />
      </button>
    );
  }

  const thumbUrl = resolveAssetUrl(item.thumbnail_url);
  const progressPct = Math.round(Math.min(Math.max(item.progress_ratio, 0), 1) * 100);
  const isInProgress = !item.watched && item.progress_ratio > 0 && item.progress_ratio < 0.9;

  return (
    <article
      aria-label={item.name}
      className="flex flex-col gap-3 rounded-lg border border-[#232730] bg-[#15171c] p-3 transition-colors hover:border-[#323744] sm:flex-row sm:items-center sm:gap-4"
    >
      {/* 16:9 Thumbnail Frame */}
      <button
        type="button"
        onClick={() => onPlayPrimary(item)}
        aria-label={`Play ${item.name}`}
        className="group relative aspect-video w-full shrink-0 overflow-hidden rounded-md border border-[#232730] bg-[#0c0d10] sm:w-40"
      >
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={item.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[#6b7280]">
            <Film className="h-6 w-6" aria-hidden="true" />
          </div>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#f97316] text-[#0c0d10]">
            <Play className="h-4 w-4 fill-current" aria-hidden="true" />
          </span>
        </span>
        {item.duration != null && (
          <span className="tabular-timecode absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-medium text-[#f3f4f6]">
            {formatDuration(item.duration)}
          </span>
        )}
      </button>

      {/* Cue Details & Timecode Scrubber */}
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-[#f3f4f6]" title={item.name}>
            {item.name}
          </h3>

          <span
            className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${
              item.watched
                ? 'bg-[#22c55e]/15 text-[#22c55e]'
                : isInProgress
                  ? 'bg-[#f59e0b]/15 text-[#f59e0b]'
                  : 'bg-[#1b1e25] text-[#9ca3af]'
            }`}
          >
            {item.watched ? 'Watched' : isInProgress ? 'In Progress' : 'Unwatched'}
          </span>
        </div>

        {/* Metadata line */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#9ca3af]">
          {item.resolution && (
            <span className="tabular-timecode rounded border border-[#232730] bg-[#0c0d10] px-1.5 py-0.5 text-[11px] text-[#f3f4f6]">
              {item.resolution}
            </span>
          )}
          <span className="tabular-timecode">{formatBytes(item.size_bytes)}</span>
          {isPlayingMpv && (
            <span className="font-medium text-[#f97316]">Playing in mpv</span>
          )}
        </div>

        {/* Signature Timecode Scrubber Bar */}
        <div className="flex items-center gap-3">
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#0c0d10]"
            role="progressbar"
            aria-label={`Progress for ${item.name}`}
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={`h-full rounded-full transition-all duration-200 ${
                item.watched ? 'bg-[#22c55e]' : 'bg-[#f59e0b]'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="tabular-timecode shrink-0 text-xs text-[#9ca3af]">
            {item.last_position_sec != null && item.duration
              ? `${formatDuration(item.last_position_sec)} / ${formatDuration(item.duration)}`
              : formatPercent(item.progress_ratio)}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end lg:flex-row">
        <button
          type="button"
          onClick={() => onPlayPrimary(item)}
          className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#f97316] px-3.5 text-xs font-semibold text-[#0c0d10] transition-colors hover:bg-[#fb923c] sm:flex-initial"
        >
          <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          {isInProgress ? 'Resume' : 'Play'}
        </button>

        <button
          type="button"
          onClick={() => onPlayInBrowser(item)}
          aria-label={`Stream ${item.name} in browser`}
          title="Stream in browser"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#232730] bg-[#0c0d10] text-[#9ca3af] transition-colors hover:border-[#323744] hover:bg-[#21252e] hover:text-[#f3f4f6]"
        >
          <MonitorPlay className="h-4 w-4" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={() => onToggleWatched(item)}
          aria-pressed={item.watched}
          aria-label={item.watched ? `Mark ${item.name} as unwatched` : `Mark ${item.name} as watched`}
          title={item.watched ? 'Mark unwatched' : 'Mark watched'}
          className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors ${
            item.watched
              ? 'border-[#22c55e]/40 bg-[#22c55e]/10 text-[#22c55e] hover:bg-[#22c55e]/20'
              : 'border-[#232730] bg-[#0c0d10] text-[#9ca3af] hover:border-[#323744] hover:bg-[#21252e] hover:text-[#f3f4f6]'
          }`}
        >
          {item.watched ? (
            <>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden xl:inline">Unwatch</span>
            </>
          ) : (
            <>
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden xl:inline">Watched</span>
            </>
          )}
        </button>
      </div>
    </article>
  );
}

