import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { syncFileProgress } from '../api/client';
import { BrowseItem } from '../api/schemas';
import { buildStreamUrl, formatDuration } from '../utils/format';

interface BrowserPlayerModalProps {
  item: BrowseItem | null;
  onClose: () => void;
  onProgressSynced: () => void;
}

export function BrowserPlayerModal({
  item,
  onClose,
  onProgressSynced,
}: BrowserPlayerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const lastSavedRef = useRef<number>(0);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(item?.last_position_sec ?? 0);
  const [duration, setDuration] = useState<number | null>(item?.duration ?? null);

  const flushProgress = useCallback(
    async (force = false) => {
      const videoEl = videoRef.current;
      if (!item || !videoEl) return;
      const pos = videoEl.currentTime;
      if (!Number.isFinite(pos) || pos < 0) return;
      if (!force && Math.abs(pos - lastSavedRef.current) < 2) return;

      const dur =
        Number.isFinite(videoEl.duration) && videoEl.duration > 0
          ? videoEl.duration
          : item.duration ?? null;

      lastSavedRef.current = pos;
      try {
        await syncFileProgress(item.path, pos, dur);
        onProgressSynced();
      } catch {
        // Non-blocking: next sync or close will retry
      }
    },
    [item, onProgressSynced],
  );

  useEffect(() => {
    if (!item) return;
    setStreamError(null);
    setCurrentTime(item.last_position_sec ?? 0);
    setDuration(item.duration ?? null);
    lastSavedRef.current = item.last_position_sec ?? 0;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        void flushProgress(true).finally(onClose);
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [item, flushProgress, onClose]);

  useEffect(() => {
    if (!item) return;
    const interval = window.setInterval(() => {
      const videoEl = videoRef.current;
      if (videoEl && !videoEl.paused) {
        void flushProgress(false);
      }
    }, 5000);
    return () => window.clearInterval(interval);
  }, [item, flushProgress]);

  if (!item) return null;

  const streamUrl = buildStreamUrl(item.path);

  const handleClose = () => {
    void flushProgress(true).finally(onClose);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="browser-player-title"
    >
      <div className="flex w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-[#232730] bg-[#15171c] shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-[#232730] px-4 py-3">
          <div className="min-w-0">
            <h2
              id="browser-player-title"
              className="truncate text-sm font-semibold text-[#f3f4f6]"
            >
              {item.name}
            </h2>
            <p className="tabular-timecode text-xs text-[#9ca3af]">
              {formatDuration(currentTime)}
              {duration ? ` / ${formatDuration(duration)}` : ''}
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={handleClose}
            aria-label="Close player"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#232730] bg-[#0c0d10] text-[#9ca3af] transition-colors hover:bg-[#21252e] hover:text-[#f3f4f6]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="relative bg-black">
          {streamError ? (
            <div className="flex aspect-video flex-col items-center justify-center gap-2 p-6 text-center">
              <AlertCircle className="h-8 w-8 text-[#ef4444]" aria-hidden="true" />
              <p className="text-sm font-medium text-[#f3f4f6]">{streamError}</p>
              <p className="max-w-md text-xs text-[#9ca3af]">
                Some container codecs (such as HEVC/MKV) require desktop mpv playback rather than HTML5 video.
              </p>
            </div>
          ) : (
            <video
              ref={videoRef}
              src={streamUrl}
              controls
              autoPlay
              playsInline
              className="aspect-video w-full bg-black"
              onLoadedMetadata={(e) => {
                const videoEl = e.currentTarget;
                if (Number.isFinite(videoEl.duration) && videoEl.duration > 0) {
                  setDuration(videoEl.duration);
                }
                if (
                  item.last_position_sec &&
                  item.last_position_sec > 0 &&
                  (!videoEl.duration || item.last_position_sec < videoEl.duration - 2)
                ) {
                  videoEl.currentTime = item.last_position_sec;
                }
              }}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onPause={() => {
                void flushProgress(true);
              }}
              onEnded={() => {
                void flushProgress(true);
              }}
              onError={() => {
                setStreamError('Browser could not decode this video format.');
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

