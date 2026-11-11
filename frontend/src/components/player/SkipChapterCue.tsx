import { FastForward, X } from 'lucide-react';
import { Chapter } from '../../api/schemas';
import { getChapterCategoryLabel } from '../../utils/chapters';

interface SkipChapterCueProps {
  chapter: Chapter | null;
  countdownSec: number | null;
  alignLeft?: boolean;
  onSkipNow: () => void;
  onCancelAutoSkip: () => void;
}

export function SkipChapterCue({
  chapter,
  countdownSec,
  alignLeft = false,
  onSkipNow,
  onCancelAutoSkip,
}: SkipChapterCueProps) {
  if (!chapter) return null;

  const label = getChapterCategoryLabel(chapter.category);
  const isCountingDown = countdownSec !== null && countdownSec > 0;

  return (
    <div
      className={`absolute bottom-20 z-20 flex items-center gap-1.5 sm:bottom-24 ${
        alignLeft ? 'left-4 sm:left-6' : 'right-4 sm:right-6'
      }`}
    >
      <button
        type="button"
        onClick={onSkipNow}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#f97316]/60 bg-[#0c0d10]/90 px-3.5 text-xs font-semibold text-[#f3f4f6] shadow-lg transition-colors hover:bg-[#f97316] hover:text-[#0c0d10]"
      >
        <FastForward className="h-3.5 w-3.5" aria-hidden="true" />
        <span>
          {isCountingDown ? `Skipping ${label} in ${countdownSec}s` : `Skip ${label}`}
        </span>
        <kbd className="hidden rounded border border-current/25 px-1 py-0.5 font-mono text-[10px] opacity-80 sm:inline">
          S
        </kbd>
      </button>

      {isCountingDown && (
        <button
          type="button"
          onClick={onCancelAutoSkip}
          aria-label={`Cancel auto-skip for ${label}`}
          className="inline-flex h-10 items-center gap-1 rounded-lg border border-[#232730] bg-[#15171c]/95 px-2.5 text-xs font-medium text-[#9ca3af] shadow-lg transition-colors hover:bg-[#21252e] hover:text-[#f3f4f6]"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Cancel</span>
        </button>
      )}
    </div>
  );
}
