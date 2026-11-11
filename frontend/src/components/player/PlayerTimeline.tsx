import { KeyboardEvent, MouseEvent, useRef, useState } from 'react';
import { Chapter } from '../../api/schemas';
import { findActiveChapter, isSkippableCategory } from '../../utils/chapters';
import { formatDuration } from '../../utils/format';

interface PlayerTimelineProps {
  currentTime: number;
  duration: number;
  bufferedSec: number;
  chapters: Chapter[];
  seekStepSec: number;
  onSeek: (targetSec: number) => void;
}

export function PlayerTimeline({
  currentTime,
  duration,
  bufferedSec,
  chapters,
  seekStepSec,
  onSeek,
}: PlayerTimelineProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [hoverSec, setHoverSec] = useState<number | null>(null);
  const [hoverPct, setHoverPct] = useState<number>(0);

  const safeDuration = duration > 0 && Number.isFinite(duration) ? duration : 0;
  const clampedTime = Math.min(Math.max(currentTime, 0), safeDuration || currentTime);
  const progressPct = safeDuration > 0 ? Math.min(100, (clampedTime / safeDuration) * 100) : 0;
  const bufferedPct =
    safeDuration > 0 ? Math.min(100, (Math.max(bufferedSec, clampedTime) / safeDuration) * 100) : 0;

  const computeTimeFromPointer = (clientX: number): { sec: number; pct: number } | null => {
    const el = trackRef.current;
    if (!el || safeDuration <= 0) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    return { sec: ratio * safeDuration, pct: ratio * 100 };
  };

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const res = computeTimeFromPointer(event.clientX);
    if (res) {
      onSeek(res.sec);
    }
  };

  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    const res = computeTimeFromPointer(event.clientX);
    if (res) {
      setHoverSec(res.sec);
      setHoverPct(res.pct);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (safeDuration <= 0) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      onSeek(Math.max(0, clampedTime - seekStepSec));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      onSeek(Math.min(safeDuration, clampedTime + seekStepSec));
    } else if (event.key === 'Home') {
      event.preventDefault();
      onSeek(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      onSeek(safeDuration);
    }
  };

  const hoverChapter = hoverSec !== null ? findActiveChapter(chapters, hoverSec) : null;

  return (
    <div className="relative py-2">
      {hoverSec !== null && (
        <div
          className="pointer-events-none absolute -top-9 z-20 -translate-x-1/2 whitespace-nowrap rounded-md border border-[#232730] bg-[#15171c] px-2.5 py-1 text-xs shadow-lg"
          style={{ left: `${Math.min(92, Math.max(8, hoverPct))}%` }}
        >
          <span className="tabular-timecode font-semibold text-[#f3f4f6]">
            {formatDuration(hoverSec)}
          </span>
          {hoverChapter && (
            <span className="ml-2 text-[#9ca3af]">{hoverChapter.title}</span>
          )}
        </div>
      )}

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Seek timeline"
        aria-valuemin={0}
        aria-valuemax={Math.round(safeDuration)}
        aria-valuenow={Math.round(clampedTime)}
        aria-valuetext={`${formatDuration(clampedTime)} of ${formatDuration(safeDuration)}`}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverSec(null)}
        onKeyDown={handleKeyDown}
        className="group relative flex h-5 cursor-pointer items-center focus:outline-none"
      >
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-[#232730] transition-all group-hover:h-2">
          {/* Buffered range */}
          <div
            className="absolute inset-y-0 left-0 bg-[#323744]"
            style={{ width: `${bufferedPct}%` }}
          />

          {/* Skippable chapter bands */}
          {safeDuration > 0 &&
            chapters
              .filter((ch) => isSkippableCategory(ch.category))
              .map((ch) => {
                const leftPct = (ch.start_sec / safeDuration) * 100;
                const widthPct = Math.max(0.5, ((ch.end_sec - ch.start_sec) / safeDuration) * 100);
                return (
                  <div
                    key={ch.id}
                    className="absolute inset-y-0 bg-[#f59e0b]/45"
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                  />
                );
              })}

          {/* Active progress */}
          <div
            className="absolute inset-y-0 left-0 bg-[#f97316]"
            style={{ width: `${progressPct}%` }}
          />

          {/* Chapter boundary ticks */}
          {safeDuration > 0 &&
            chapters
              .filter((ch) => ch.start_sec > 0)
              .map((ch) => (
                <div
                  key={`tick-${ch.id}`}
                  className="absolute inset-y-0 w-0.5 bg-[#0c0d10]"
                  style={{ left: `${(ch.start_sec / safeDuration) * 100}%` }}
                />
              ))}
        </div>

        {/* Scrubber thumb */}
        <div
          className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#0c0d10] bg-[#f97316] opacity-90 shadow transition-transform group-hover:scale-125"
          style={{ left: `${progressPct}%` }}
        />
      </div>
    </div>
  );
}

