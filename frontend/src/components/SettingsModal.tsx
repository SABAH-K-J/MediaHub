import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { HealthStatus, PlayerPreference } from '../api/schemas';

interface SettingsModalProps {
  open: boolean;
  health: HealthStatus | null;
  playerPref: PlayerPreference;
  onChangePlayerPref: (pref: PlayerPreference) => void;
  onClose: () => void;
}

const PREF_OPTIONS: { value: PlayerPreference; label: string; description: string }[] = [
  {
    value: 'auto',
    label: 'Auto (Recommended)',
    description: 'Uses external mpv when installed on host, otherwise streams in browser.',
  },
  {
    value: 'mpv',
    label: 'External mpv',
    description: 'Launches local mpv with IPC position sync. Offers browser fallback if missing.',
  },
  {
    value: 'browser',
    label: 'In-Browser Player',
    description: 'Streams directly via HTTP byte-range playback inside MediaHub.',
  },
];

export function SettingsModal({
  open,
  health,
  playerPref,
  onChangePlayerPref,
  onClose,
}: SettingsModalProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div className="w-full max-w-md rounded-xl border border-[#232730] bg-[#15171c] p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#232730] pb-3">
          <h2 id="settings-modal-title" className="text-base font-semibold text-[#f3f4f6]">
            Playback & Runtime Status
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#9ca3af] transition-colors hover:bg-[#21252e] hover:text-[#f3f4f6]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div className="rounded-lg border border-[#232730] bg-[#0c0d10] p-3 text-xs">
            <div className="flex items-center justify-between py-1">
              <span className="text-[#9ca3af]">Backend API</span>
              <span className="tabular-timecode font-medium text-[#22c55e]">
                {health ? `v${health.version} (Ready)` : 'Unavailable'}
              </span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-[#9ca3af]">External mpv</span>
              <span
                className={`font-medium ${
                  health?.mpv_available ? 'text-[#22c55e]' : 'text-[#f59e0b]'
                }`}
              >
                {health?.mpv_available ? 'Detected' : 'Not installed'}
              </span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-[#9ca3af]">FFmpeg / Thumbnails</span>
              <span
                className={`font-medium ${
                  health?.ffmpeg_available ? 'text-[#22c55e]' : 'text-[#f59e0b]'
                }`}
              >
                {health?.ffmpeg_available ? 'Detected' : 'Not installed'}
              </span>
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-[#9ca3af]">Default Player Mode</legend>
            {PREF_OPTIONS.map((opt) => {
              const selected = playerPref === opt.value;
              return (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                    selected
                      ? 'border-[#f97316] bg-[#1b1e25]'
                      : 'border-[#232730] bg-[#0c0d10] hover:border-[#323744]'
                  }`}
                >
                  <input
                    type="radio"
                    name="player-preference"
                    value={opt.value}
                    checked={selected}
                    onChange={() => onChangePlayerPref(opt.value)}
                    className="mt-0.5 accent-[#f97316]"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[#f3f4f6]">{opt.label}</div>
                    <div className="mt-0.5 text-xs leading-relaxed text-[#9ca3af]">
                      {opt.description}
                    </div>
                  </div>
                </label>
              );
            })}
          </fieldset>
        </div>
      </div>
    </div>
  );
}

