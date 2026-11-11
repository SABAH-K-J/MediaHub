import { Play, SkipForward, X } from 'lucide-react';
import { BrowseItem } from '../../api/schemas';
import { formatDuration, resolveAssetUrl } from '../../utils/format';

interface NextEpisodeCueProps {
  nextItem: BrowseItem | null;
  countdownSec: number | null;
  onPlayNow: () => void;
  onCancel: () => void;
}

export function NextEpisodeCue({
  nextItem,
  countdownSec,
  onPlayNow,
  onCancel,
}: NextEpisodeCueProps) {
  if (!nextItem || countdownSec === null) return null;

  const thumbUrl = resolveAssetUrl(nextItem.thumbnail_url);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 bottom-24 z-30 flex items-center gap-3 rounded-xl border border-[#323744] bg-[#15171c]/95 p-3 text-[#f3f4f6] shadow-2xl sm:inset-x-auto sm:right-6 sm:w-80 sm:absolute"
    >
      {thumbUrl ? (
        <img
          src={thumbUrl}
          alt={nextItem.name}
          className="h-14 w-24 shrink-0 rounded-md border border-[#232730] object-cover"
        />
      ) : (
        <div className="flex h-14 w-24 shrink-0 items-center justify-center rounded-md border border-[#232730] bg-[#0c0d10] text-[#f97316]">
          <SkipForward className="h-5 w-5" aria-hidden="true" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-[#f97316]">
          Up Next in <span className="tabular-timecode">{countdownSec}s</span>
        </p>
        <p className="mt-0.5 truncate text-xs font-medium text-[#f3f4f6]" title={nextItem.name}>
          {nextItem.name}
        </p>
        {nextItem.duration != null && (
          <p className="tabular-timecode text-[11px] text-[#9ca3af]">
            {formatDuration(nextItem.duration)}
          </p>
        )}

        <div className="mt-2 flex items-center gap-1.5">
          <button
            type="button"
            onClick={onPlayNow}
            className="inline-flex h-8 items-center gap-1 rounded-md bg-[#f97316] px-2.5 text-xs font-semibold text-[#0c0d10] transition-colors hover:bg-[#fb923c]"
          >
            <Play className="h-3 w-3 fill-current" aria-hidden="true" />
            <span>Play Now</span>
          </button>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel auto next episode"
            className="inline-flex h-8 items-center gap-1 rounded-md border border-[#232730] bg-[#0c0d10] px-2 text-xs text-[#9ca3af] transition-colors hover:bg-[#21252e] hover:text-[#f3f4f6]"
          >
            <X className="h-3 w-3" aria-hidden="true" />
            <span>Cancel</span>
          </button>
        </div>
      </div>
    </div>
  );
}

