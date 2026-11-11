import { useEffect, useState } from 'react';
import { Captions, Check, ListVideo, Sliders, Volume2, X } from 'lucide-react';
import {
  AudioTrack,
  Chapter,
  PlayerCustomization,
  SubtitleTrack,
} from '../../api/schemas';
import { getChapterCategoryLabel, isSkippableCategory } from '../../utils/chapters';
import { formatDuration } from '../../utils/format';

export type PlayerSettingsTab = 'audio' | 'subtitles' | 'chapters' | 'customize';

interface PlayerSettingsPopoverProps {
  open: boolean;
  initialTab: PlayerSettingsTab;
  audioTracks: AudioTrack[];
  selectedAudioIndex: number;
  subtitleTracks: SubtitleTrack[];
  selectedSubtitleId: string | null;
  chapters: Chapter[];
  currentTime: number;
  customization: PlayerCustomization;
  onClose: () => void;
  onSelectAudio: (audioIndex: number) => void;
  onSelectSubtitle: (trackId: string | null) => void;
  onJumpToChapter: (startSec: number) => void;
  onUpdateCustomization: (patch: Partial<PlayerCustomization>) => void;
}

const TABS: { id: PlayerSettingsTab; label: string; Icon: typeof Volume2 }[] = [
  { id: 'audio', label: 'Audio', Icon: Volume2 },
  { id: 'subtitles', label: 'Subtitles', Icon: Captions },
  { id: 'chapters', label: 'Chapters', Icon: ListVideo },
  { id: 'customize', label: 'Customize', Icon: Sliders },
];

export function PlayerSettingsPopover({
  open,
  initialTab,
  audioTracks,
  selectedAudioIndex,
  subtitleTracks,
  selectedSubtitleId,
  chapters,
  currentTime,
  customization,
  onClose,
  onSelectAudio,
  onSelectSubtitle,
  onJumpToChapter,
  onUpdateCustomization,
}: PlayerSettingsPopoverProps) {
  const [activeTab, setActiveTab] = useState<PlayerSettingsTab>(initialTab);

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  if (!open) return null;

  return (
    <div
      role="region"
      aria-label="Player customization and track controls"
      className="fixed inset-x-3 bottom-4 z-40 flex max-h-[72vh] flex-col overflow-hidden rounded-xl border border-[#232730] bg-[#15171c]/98 text-[#f3f4f6] shadow-2xl sm:inset-x-auto sm:bottom-20 sm:right-5 sm:w-[26rem]"
    >
      {/* Tab Header */}
      <div className="flex items-center justify-between border-b border-[#232730] px-2 py-2">
        <div role="tablist" aria-label="Player panels" className="flex items-center gap-1">
          {TABS.map(({ id, label, Icon }) => {
            const selected = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveTab(id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  selected
                    ? 'bg-[#f97316] text-[#0c0d10] font-semibold'
                    : 'text-[#9ca3af] hover:bg-[#21252e] hover:text-[#f3f4f6]'
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close player menu"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#9ca3af] hover:bg-[#21252e] hover:text-[#f3f4f6]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Tab Body */}
      <div className="flex-1 overflow-y-auto p-3.5 text-xs">
        {activeTab === 'audio' && (
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-[#9ca3af]">Audio Tracks</p>
            {audioTracks.length === 0 ? (
              <p className="rounded-lg border border-[#232730] bg-[#0c0d10] p-3 text-[#9ca3af]">
                Default stream audio active (no separate tracks reported).
              </p>
            ) : (
              audioTracks.map((track) => {
                const isSelected = track.audio_index === selectedAudioIndex;
                const label =
                  track.title ||
                  (track.language ? track.language.toUpperCase() : `Track ${track.audio_index + 1}`);
                return (
                  <button
                    key={track.audio_index}
                    type="button"
                    onClick={() => onSelectAudio(track.audio_index)}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      isSelected
                        ? 'border-[#f97316] bg-[#1b1e25]'
                        : 'border-[#232730] bg-[#0c0d10] hover:border-[#323744]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-[#f3f4f6]">{label}</div>
                      <div className="mt-0.5 text-[11px] text-[#9ca3af]">
                        {track.codec.toUpperCase()}
                        {track.channels ? ` • ${track.channels}ch` : ''}
                        {track.language && track.title ? ` • ${track.language.toUpperCase()}` : ''}
                      </div>
                    </div>
                    {isSelected && <Check className="h-4 w-4 shrink-0 text-[#f97316]" aria-hidden="true" />}
                  </button>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'subtitles' && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-[#9ca3af]">Subtitle Track</p>
              <button
                type="button"
                onClick={() => onSelectSubtitle(null)}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors ${
                  selectedSubtitleId === null
                    ? 'border-[#f97316] bg-[#1b1e25]'
                    : 'border-[#232730] bg-[#0c0d10] hover:border-[#323744]'
                }`}
              >
                <span className="font-medium text-[#f3f4f6]">Off</span>
                {selectedSubtitleId === null && (
                  <Check className="h-4 w-4 text-[#f97316]" aria-hidden="true" />
                )}
              </button>

              {subtitleTracks.map((sub) => {
                const isSelected = selectedSubtitleId === sub.id;
                const label =
                  sub.title ||
                  (sub.language ? sub.language.toUpperCase() : `Subtitle (${sub.codec})`);
                return (
                  <button
                    key={sub.id}
                    type="button"
                    disabled={!sub.text_based}
                    onClick={() => onSelectSubtitle(sub.id)}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                      isSelected
                        ? 'border-[#f97316] bg-[#1b1e25]'
                        : 'border-[#232730] bg-[#0c0d10] hover:border-[#323744]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-[#f3f4f6]">{label}</div>
                      <div className="text-[11px] text-[#9ca3af]">
                        {sub.source === 'external' ? 'External' : 'Embedded'} • {sub.codec.toUpperCase()}
                        {sub.is_forced ? ' • Forced' : ''}
                        {!sub.text_based ? ' • Image-based (mpv only)' : ''}
                      </div>
                    </div>
                    {isSelected && <Check className="h-4 w-4 shrink-0 text-[#f97316]" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>

            {/* Subtitle Styling & Sync Controls */}
            <div className="space-y-3 border-t border-[#232730] pt-3">
              <p className="text-[11px] font-medium text-[#9ca3af]">Subtitle Appearance & Sync</p>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[#9ca3af]">Style Mode</span>
                <div className="flex gap-1">
                  {([
                    { value: 'native', label: 'Native' },
                    { value: 'custom', label: 'Custom' },
                  ] as const).map((modeOpt) => (
                    <button
                      key={modeOpt.value}
                      type="button"
                      onClick={() => onUpdateCustomization({ subtitleMode: modeOpt.value })}
                      className={`rounded px-2.5 py-1 font-medium ${
                        customization.subtitleMode === modeOpt.value
                          ? 'bg-[#f97316] text-[#0c0d10]'
                          : 'bg-[#0c0d10] text-[#9ca3af] hover:text-[#f3f4f6]'
                      }`}
                    >
                      {modeOpt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[#9ca3af]">Font</span>
                <div className="flex gap-1">
                  {([
                    { value: 'gotham', label: 'Gotham' },
                    { value: 'sans', label: 'Sans' },
                    { value: 'serif', label: 'Serif' },
                    { value: 'mono', label: 'Mono' },
                  ] as const).map((fontOpt) => (
                    <button
                      key={fontOpt.value}
                      type="button"
                      onClick={() => onUpdateCustomization({ subtitleFontFamily: fontOpt.value })}
                      className={`rounded px-2 py-1 font-medium ${
                        customization.subtitleFontFamily === fontOpt.value
                          ? 'bg-[#f97316] text-[#0c0d10]'
                          : 'bg-[#0c0d10] text-[#9ca3af] hover:text-[#f3f4f6]'
                      }`}
                    >
                      {fontOpt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[#9ca3af]">Outline</span>
                <div className="flex gap-1">
                  {(['none', 'thin', 'medium', 'heavy'] as const).map((outOpt) => (
                    <button
                      key={outOpt}
                      type="button"
                      onClick={() => onUpdateCustomization({ subtitleOutline: outOpt })}
                      className={`rounded px-2 py-1 capitalize ${
                        customization.subtitleOutline === outOpt
                          ? 'bg-[#f97316] text-[#0c0d10] font-semibold'
                          : 'bg-[#0c0d10] text-[#9ca3af] hover:text-[#f3f4f6]'
                      }`}
                    >
                      {outOpt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[#9ca3af]">Size</span>
                <div className="flex gap-1">
                  {(['sm', 'md', 'lg', 'xl'] as const).map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => onUpdateCustomization({ subtitleFontSize: sz })}
                      className={`rounded px-2 py-1 font-medium uppercase ${
                        customization.subtitleFontSize === sz
                          ? 'bg-[#f97316] text-[#0c0d10]'
                          : 'bg-[#0c0d10] text-[#9ca3af] hover:text-[#f3f4f6]'
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[#9ca3af]">Color</span>
                <div className="flex gap-1">
                  {(['white', 'amber', 'cyan'] as const).map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => onUpdateCustomization({ subtitleColor: col })}
                      className={`rounded px-2 py-1 capitalize ${
                        customization.subtitleColor === col
                          ? 'bg-[#f97316] text-[#0c0d10] font-semibold'
                          : 'bg-[#0c0d10] text-[#9ca3af] hover:text-[#f3f4f6]'
                      }`}
                    >
                      {col}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[#9ca3af]">Backdrop</span>
                <div className="flex gap-1">
                  {(['shadow', 'translucent', 'solid'] as const).map((bg) => (
                    <button
                      key={bg}
                      type="button"
                      onClick={() => onUpdateCustomization({ subtitleBackdrop: bg })}
                      className={`rounded px-2 py-1 capitalize ${
                        customization.subtitleBackdrop === bg
                          ? 'bg-[#f97316] text-[#0c0d10] font-semibold'
                          : 'bg-[#0c0d10] text-[#9ca3af] hover:text-[#f3f4f6]'
                      }`}
                    >
                      {bg}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[#9ca3af]">Timing Offset</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label="Advance subtitles by 0.5s"
                    onClick={() =>
                      onUpdateCustomization({
                        subtitleOffsetSec: Math.max(-15, Number((customization.subtitleOffsetSec - 0.5).toFixed(1))),
                      })
                    }
                    className="rounded border border-[#232730] bg-[#0c0d10] px-2 py-1 text-[#f3f4f6] hover:bg-[#21252e]"
                  >
                    -0.5s
                  </button>
                  <span className="tabular-timecode w-12 text-center text-[#f3f4f6]">
                    {customization.subtitleOffsetSec >= 0 ? '+' : ''}
                    {customization.subtitleOffsetSec.toFixed(1)}s
                  </span>
                  <button
                    type="button"
                    aria-label="Delay subtitles by 0.5s"
                    onClick={() =>
                      onUpdateCustomization({
                        subtitleOffsetSec: Math.min(15, Number((customization.subtitleOffsetSec + 0.5).toFixed(1))),
                      })
                    }
                    className="rounded border border-[#232730] bg-[#0c0d10] px-2 py-1 text-[#f3f4f6] hover:bg-[#21252e]"
                  >
                    +0.5s
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'chapters' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-[#9ca3af]">Auto-Skip Rules</p>
              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-[#232730] bg-[#0c0d10] px-3 py-2">
                <span>Auto-skip Intro / Opening</span>
                <input
                  type="checkbox"
                  checked={customization.autoSkipIntro}
                  onChange={(e) => onUpdateCustomization({ autoSkipIntro: e.target.checked })}
                  className="accent-[#f97316]"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-[#232730] bg-[#0c0d10] px-3 py-2">
                <span>Auto-skip Recap</span>
                <input
                  type="checkbox"
                  checked={customization.autoSkipRecap}
                  onChange={(e) => onUpdateCustomization({ autoSkipRecap: e.target.checked })}
                  className="accent-[#f97316]"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-[#232730] bg-[#0c0d10] px-3 py-2">
                <span>Auto-skip Outro / Credits</span>
                <input
                  type="checkbox"
                  checked={customization.autoSkipOutro}
                  onChange={(e) => onUpdateCustomization({ autoSkipOutro: e.target.checked })}
                  className="accent-[#f97316]"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-[#232730] bg-[#0c0d10] px-3 py-2">
                <span>Auto-skip Next Episode Preview</span>
                <input
                  type="checkbox"
                  checked={customization.autoSkipPreview}
                  onChange={(e) => onUpdateCustomization({ autoSkipPreview: e.target.checked })}
                  className="accent-[#f97316]"
                />
              </label>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[#9ca3af]">Skip Timing</span>
                <div className="flex gap-1">
                  {([
                    { value: 0, label: 'Instant' },
                    { value: 3, label: '3s Countdown' },
                  ] as const).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => onUpdateCustomization({ autoSkipCountdownSec: opt.value })}
                      className={`rounded px-2.5 py-1 font-medium ${
                        customization.autoSkipCountdownSec === opt.value
                          ? 'bg-[#f97316] text-[#0c0d10]'
                          : 'bg-[#0c0d10] text-[#9ca3af] hover:text-[#f3f4f6]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1.5 border-t border-[#232730] pt-3">
              <p className="text-[11px] font-medium text-[#9ca3af]">Detected Chapters</p>
              {chapters.length === 0 ? (
                <p className="rounded-lg border border-[#232730] bg-[#0c0d10] p-3 text-[#9ca3af]">
                  No embedded chapters found in this file.
                </p>
              ) : (
                chapters.map((ch) => {
                  const isCurrent = currentTime >= ch.start_sec && currentTime < ch.end_sec;
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => onJumpToChapter(ch.start_sec)}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                        isCurrent
                          ? 'border-[#f97316] bg-[#1b1e25]'
                          : 'border-[#232730] bg-[#0c0d10] hover:border-[#323744]'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-[#f3f4f6]">{ch.title}</div>
                        <div className="tabular-timecode text-[11px] text-[#9ca3af]">
                          {formatDuration(ch.start_sec)} – {formatDuration(ch.end_sec)}
                        </div>
                      </div>
                      {isSkippableCategory(ch.category) && (
                        <span className="shrink-0 rounded bg-[#f59e0b]/15 px-2 py-0.5 text-[10px] font-semibold text-[#f59e0b]">
                          {getChapterCategoryLabel(ch.category)}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {activeTab === 'customize' && (
          <div className="space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#9ca3af]">Playback Speed</span>
              <div className="flex flex-wrap justify-end gap-1">
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => onUpdateCustomization({ playbackSpeed: spd })}
                    className={`tabular-timecode rounded px-2 py-1 font-medium ${
                      customization.playbackSpeed === spd
                        ? 'bg-[#f97316] text-[#0c0d10]'
                        : 'bg-[#0c0d10] text-[#9ca3af] hover:text-[#f3f4f6]'
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-[#9ca3af]">Seek Step</span>
              <div className="flex gap-1">
                {[5, 10, 15, 30].map((step) => (
                  <button
                    key={step}
                    type="button"
                    onClick={() => onUpdateCustomization({ seekStepSec: step })}
                    className={`tabular-timecode rounded px-2 py-1 font-medium ${
                      customization.seekStepSec === step
                        ? 'bg-[#f97316] text-[#0c0d10]'
                        : 'bg-[#0c0d10] text-[#9ca3af] hover:text-[#f3f4f6]'
                    }`}
                  >
                    {step}s
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-[#9ca3af]">Video Fit</span>
              <div className="flex gap-1">
                {(['contain', 'cover', 'fill'] as const).map((fit) => (
                  <button
                    key={fit}
                    type="button"
                    onClick={() => onUpdateCustomization({ fitMode: fit })}
                    className={`rounded px-2.5 py-1 capitalize ${
                      customization.fitMode === fit
                        ? 'bg-[#f97316] text-[#0c0d10] font-semibold'
                        : 'bg-[#0c0d10] text-[#9ca3af] hover:text-[#f3f4f6]'
                    }`}
                  >
                    {fit}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-[#9ca3af]">HUD Behavior</span>
              <div className="flex gap-1">
                {([
                  { value: 'hover_area', label: 'UI Area' },
                  { value: 'auto_hide', label: 'Auto-hide' },
                  { value: 'always', label: 'Always' },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onUpdateCustomization({ hudMode: opt.value })}
                    className={`rounded px-2 py-1 font-medium ${
                      customization.hudMode === opt.value
                        ? 'bg-[#f97316] text-[#0c0d10]'
                        : 'bg-[#0c0d10] text-[#9ca3af] hover:text-[#f3f4f6]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-[#232730] bg-[#0c0d10] px-3 py-2">
              <span>Auto-play next episode</span>
              <input
                type="checkbox"
                checked={customization.autoPlayNextEpisode}
                onChange={(e) => onUpdateCustomization({ autoPlayNextEpisode: e.target.checked })}
                className="accent-[#f97316]"
              />
            </label>

            {customization.autoPlayNextEpisode && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#9ca3af]">Next Episode Countdown</span>
                <div className="flex gap-1">
                  {([5, 10] as const).map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => onUpdateCustomization({ autoNextCountdownSec: sec })}
                      className={`tabular-timecode rounded px-2.5 py-1 font-medium ${
                        customization.autoNextCountdownSec === sec
                          ? 'bg-[#f97316] text-[#0c0d10]'
                          : 'bg-[#0c0d10] text-[#9ca3af] hover:text-[#f3f4f6]'
                      }`}
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
              </div>
            )}

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-[#232730] bg-[#0c0d10] px-3 py-2">
              <span>Show remaining time</span>
              <input
                type="checkbox"
                checked={customization.showRemainingTime}
                onChange={(e) => onUpdateCustomization({ showRemainingTime: e.target.checked })}
                className="accent-[#f97316]"
              />
            </label>

            <div className="rounded-lg border border-[#232730] bg-[#0c0d10] p-2.5 text-[11px] text-[#9ca3af]">
              <p className="mb-1 font-medium text-[#f3f4f6]">Keyboard Shortcuts</p>
              <p>Space / K: Play/Pause • Left / Right: Seek • M: Mute • F: Fullscreen</p>
              <p className="mt-0.5">C: Subtitles • S: Skip Chapter • Shift+P/N: Prev/Next Episode</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
