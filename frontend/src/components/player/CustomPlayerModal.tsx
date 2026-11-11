import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Captions,
  ListVideo,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Sliders,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  getMediaInfo,
  getSubtitleVtt,
  saveFilePreferences,
  syncFileProgress,
} from '../../api/client';
import {
  BrowseItem,
  DEFAULT_PLAYER_CUSTOMIZATION,
  MediaInfo,
  PlayerCustomization,
  PlayerCustomizationSchema,
} from '../../api/schemas';
import {
  computeSkipTargetSec,
  findActiveChapter,
  isSkippableCategory,
  shouldAutoSkipCategory,
} from '../../utils/chapters';
import {
  buildStreamUrl,
  buildTranscodeStreamUrl,
  formatDuration,
} from '../../utils/format';
import {
  getActiveSubtitleCues,
  parseAssSubtitles,
  parseWebVtt,
  SubtitleCue,
} from '../../utils/subtitles';
import { NextEpisodeCue } from './NextEpisodeCue';
import { PlayerSettingsPopover, PlayerSettingsTab } from './PlayerSettingsPopover';
import { PlayerTimeline } from './PlayerTimeline';
import { SkipChapterCue } from './SkipChapterCue';
import { SubtitleOverlay } from './SubtitleOverlay';

interface CustomPlayerModalProps {
  item: BrowseItem | null;
  onClose: () => void;
  onProgressSynced: () => void;
  onSelectEpisode?: (nextItem: BrowseItem) => void;
}

const CUSTOMIZATION_STORAGE_KEY = 'mediahub.playerCustomization';
const TOP_HUD_ZONE_PX = 84;
const BOTTOM_HUD_ZONE_PX = 124;

function loadPlayerCustomization(): PlayerCustomization {
  try {
    const raw = window.localStorage.getItem(CUSTOMIZATION_STORAGE_KEY);
    if (!raw) return DEFAULT_PLAYER_CUSTOMIZATION;
    const parsed = PlayerCustomizationSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_PLAYER_CUSTOMIZATION;
  } catch {
    return DEFAULT_PLAYER_CUSTOMIZATION;
  }
}

export function CustomPlayerModal({
  item,
  onClose,
  onProgressSynced,
  onSelectEpisode,
}: CustomPlayerModalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const lastSavedRef = useRef<number>(0);
  const lastSubtitleIdRef = useRef<string | null>(null);
  const initialResumeAppliedRef = useRef<boolean>(false);

  const [customization, setCustomization] = useState<PlayerCustomization>(loadPlayerCustomization);
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);

  const [selectedAudioIndex, setSelectedAudioIndex] = useState<number>(0);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null);
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([]);

  const [streamOffsetSec, setStreamOffsetSec] = useState<number>(0);
  const [transcodeNonce, setTranscodeNonce] = useState<number>(0);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(1);
  const [videoTime, setVideoTime] = useState<number>(0);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [bufferedSec, setBufferedSec] = useState<number>(0);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const [pointerInUiZone, setPointerInUiZone] = useState<boolean>(false);
  const [hudVisible, setHudVisible] = useState<boolean>(false);
  const [popoverOpen, setPopoverOpen] = useState<boolean>(false);
  const [popoverTab, setPopoverTab] = useState<PlayerSettingsTab>('audio');

  const [suppressedChapters, setSuppressedChapters] = useState<Set<string>>(() => new Set());
  const [skipCountdown, setSkipCountdown] = useState<number | null>(null);
  const [nextEpisodeCountdown, setNextEpisodeCountdown] = useState<number | null>(null);

  const updateCustomization = useCallback((patch: Partial<PlayerCustomization>) => {
    setCustomization((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(CUSTOMIZATION_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage failures
      }
      return next;
    });
  }, []);

  const defaultAudioIndex = useMemo(() => {
    if (!mediaInfo || mediaInfo.audio_tracks.length === 0) return 0;
    const def = mediaInfo.audio_tracks.find((t) => t.is_default) ?? mediaInfo.audio_tracks[0];
    return def.audio_index;
  }, [mediaInfo]);

  const useTranscode = useMemo(() => {
    if (!mediaInfo) return false;
    return !mediaInfo.can_direct_play || selectedAudioIndex !== defaultAudioIndex;
  }, [mediaInfo, selectedAudioIndex, defaultAudioIndex]);

  const totalDuration = useMemo(() => {
    if (mediaInfo?.duration && mediaInfo.duration > 0) return mediaInfo.duration;
    if (item?.duration && item.duration > 0) return item.duration;
    if (videoDuration > 0) return useTranscode ? streamOffsetSec + videoDuration : videoDuration;
    return 0;
  }, [mediaInfo, item, videoDuration, useTranscode, streamOffsetSec]);

  const currentMediaTime = useMemo(() => {
    const raw = useTranscode ? streamOffsetSec + videoTime : videoTime;
    return totalDuration > 0 ? Math.min(raw, totalDuration) : raw;
  }, [useTranscode, streamOffsetSec, videoTime, totalDuration]);

  const activeChapter = useMemo(
    () => findActiveChapter(mediaInfo?.chapters ?? [], currentMediaTime),
    [mediaInfo, currentMediaTime],
  );

  const activeSkippableChapter = useMemo(() => {
    if (!activeChapter || !isSkippableCategory(activeChapter.category)) return null;
    if (suppressedChapters.has(activeChapter.id)) return null;
    return activeChapter;
  }, [activeChapter, suppressedChapters]);

  const activeSubtitleCues = useMemo(
    () =>
      selectedSubtitleId
        ? getActiveSubtitleCues(subtitleCues, currentMediaTime, customization.subtitleOffsetSec)
        : [],
    [selectedSubtitleId, subtitleCues, currentMediaTime, customization.subtitleOffsetSec],
  );

  const streamSrc = useMemo(() => {
    if (!item || loadingInfo) return undefined;
    if (useTranscode) {
      return `${buildTranscodeStreamUrl(item.path, selectedAudioIndex, streamOffsetSec)}&n=${transcodeNonce}`;
    }
    return buildStreamUrl(item.path);
  }, [item, loadingInfo, useTranscode, selectedAudioIndex, streamOffsetSec, transcodeNonce]);

  const showHud =
    popoverOpen ||
    customization.hudMode === 'always' ||
    (customization.hudMode === 'hover_area'
      ? pointerInUiZone
      : hudVisible || !isPlaying);

  const flushProgress = useCallback(
    async (force = false) => {
      if (!item) return;
      const pos = currentMediaTime;
      if (!Number.isFinite(pos) || pos < 0) return;
      if (!force && Math.abs(pos - lastSavedRef.current) < 2) return;

      lastSavedRef.current = pos;
      try {
        await syncFileProgress(item.path, pos, totalDuration > 0 ? totalDuration : null);
        onProgressSynced();
      } catch {
        // Non-blocking sync
      }
    },
    [item, currentMediaTime, totalDuration, onProgressSynced],
  );

  const handleClose = useCallback(() => {
    setNextEpisodeCountdown(null);
    void flushProgress(true).finally(onClose);
  }, [flushProgress, onClose]);

  const transitionToEpisode = useCallback(
    (target: BrowseItem) => {
      if (!onSelectEpisode) return;
      setNextEpisodeCountdown(null);
      void flushProgress(true).finally(() => onSelectEpisode(target));
    },
    [flushProgress, onSelectEpisode],
  );

  const seekTo = useCallback(
    (targetSec: number, suppressCurrentChapter = false) => {
      const clamped =
        totalDuration > 0
          ? Math.min(Math.max(0, targetSec), Math.max(0, totalDuration - 0.1))
          : Math.max(0, targetSec);

      if (suppressCurrentChapter && mediaInfo) {
        const targetCh = findActiveChapter(mediaInfo.chapters, clamped);
        if (targetCh && isSkippableCategory(targetCh.category)) {
          setSuppressedChapters((prev) => new Set(prev).add(targetCh.id));
        }
      }

      setSkipCountdown(null);
      setNextEpisodeCountdown(null);
      setStreamError(null);

      if (useTranscode) {
        setStreamOffsetSec(clamped);
        setVideoTime(0);
        setTranscodeNonce((n) => n + 1);
      } else {
        const el = videoRef.current;
        if (el) {
          el.currentTime = clamped;
        }
        setVideoTime(clamped);
      }
    },
    [totalDuration, mediaInfo, useTranscode],
  );

  // Load media stream metadata when item opens or switches episode
  useEffect(() => {
    if (!item) return;
    const controller = new AbortController();
    initialResumeAppliedRef.current = false;
    setLoadingInfo(true);
    setStreamError(null);
    setMediaInfo(null);
    setSubtitleCues([]);
    setSuppressedChapters(new Set());
    setSkipCountdown(null);
    setNextEpisodeCountdown(null);
    setPopoverOpen(false);
    setPointerInUiZone(false);
    setHudVisible(false);
    setVideoTime(0);
    setVideoDuration(0);
    setBufferedSec(0);
    setStreamOffsetSec(0);
    lastSavedRef.current = item.last_position_sec ?? 0;

    getMediaInfo(item.path, controller.signal)
      .then((info) => {
        setMediaInfo(info);

        const defaultAudio =
          info.audio_tracks.find((t) => t.is_default) ?? info.audio_tracks[0];
        const defaultIdx = defaultAudio?.audio_index ?? 0;
        const hasPreferredAudio =
          info.preferred_audio_index !== null &&
          info.preferred_audio_index !== undefined &&
          info.audio_tracks.some((t) => t.audio_index === info.preferred_audio_index);
        const chosenAudio = hasPreferredAudio
          ? (info.preferred_audio_index as number)
          : defaultIdx;
        setSelectedAudioIndex(chosenAudio);

        const hasPreferredSub =
          info.preferred_subtitle_id &&
          info.subtitle_tracks.some(
            (s) => s.id === info.preferred_subtitle_id && s.text_based,
          );
        const defaultTextSub = info.subtitle_tracks.find((s) => s.is_default && s.text_based);
        const chosenSub = hasPreferredSub
          ? (info.preferred_subtitle_id as string)
          : (defaultTextSub?.id ?? null);
        setSelectedSubtitleId(chosenSub);
        if (chosenSub) lastSubtitleIdRef.current = chosenSub;

        const resumePos = item.last_position_sec ?? 0;
        const willTranscode = !info.can_direct_play || chosenAudio !== defaultIdx;
        if (willTranscode && resumePos > 0) {
          setStreamOffsetSec(resumePos);
          initialResumeAppliedRef.current = true;
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setMediaInfo({
          file_path: item.path,
          duration: item.duration ?? null,
          container_ext: '.mp4',
          can_direct_play: true,
          audio_tracks: [],
          subtitle_tracks: [],
          chapters: [],
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingInfo(false);
        }
      });

    return () => controller.abort();
  }, [item]);

  // Fetch ASS or WebVTT subtitles whenever track or style mode changes
  useEffect(() => {
    if (!item || !selectedSubtitleId) {
      setSubtitleCues([]);
      return;
    }
    const controller = new AbortController();
    const trackMeta = mediaInfo?.subtitle_tracks.find((t) => t.id === selectedSubtitleId);
    const isAssCodec = trackMeta?.codec === 'ass' || trackMeta?.codec === 'ssa';
    const requestFormat: 'ass' | 'vtt' =
      customization.subtitleMode === 'native' && isAssCodec ? 'ass' : 'vtt';

    getSubtitleVtt(item.path, selectedSubtitleId, controller.signal, requestFormat)
      .then((payload) => {
        setSubtitleCues(
          requestFormat === 'ass' ? parseAssSubtitles(payload) : parseWebVtt(payload),
        );
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setSubtitleCues([]);
      });
    return () => controller.abort();
  }, [item, selectedSubtitleId, mediaInfo, customization.subtitleMode]);

  // Sync playback rate & volume onto <video>
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.playbackRate = customization.playbackSpeed;
    el.volume = volume;
    el.muted = isMuted;
  }, [customization.playbackSpeed, volume, isMuted, streamSrc]);

  // Periodic 5s progress sync
  useEffect(() => {
    if (!item) return;
    const timer = window.setInterval(() => {
      if (isPlaying) {
        void flushProgress(false);
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [item, isPlaying, flushProgress]);

  // Auto-hide HUD timer when hudMode === 'auto_hide'
  useEffect(() => {
    if (
      customization.hudMode !== 'auto_hide' ||
      !hudVisible ||
      !isPlaying ||
      popoverOpen ||
      customization.controlsAutoHideSec === 0
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      setHudVisible(false);
    }, customization.controlsAutoHideSec * 1000);
    return () => window.clearTimeout(timer);
  }, [customization.hudMode, hudVisible, isPlaying, popoverOpen, customization.controlsAutoHideSec]);

  // Auto chapter skip countdown & execution
  useEffect(() => {
    if (!activeSkippableChapter || !isPlaying) {
      setSkipCountdown(null);
      return;
    }
    if (!shouldAutoSkipCategory(activeSkippableChapter.category, customization)) {
      setSkipCountdown(null);
      return;
    }

    const target = computeSkipTargetSec(activeSkippableChapter, totalDuration || null);
    if (customization.autoSkipCountdownSec === 0) {
      setSuppressedChapters((prev) => new Set(prev).add(activeSkippableChapter.id));
      seekTo(target, false);
      return;
    }

    setSkipCountdown(customization.autoSkipCountdownSec);
    const interval = window.setInterval(() => {
      setSkipCountdown((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          window.clearInterval(interval);
          setSuppressedChapters((s) => new Set(s).add(activeSkippableChapter.id));
          seekTo(target, false);
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [activeSkippableChapter, isPlaying, customization, totalDuration, seekTo]);

  // Auto next episode countdown when video ends
  useEffect(() => {
    if (nextEpisodeCountdown === null || !mediaInfo?.next_item || !onSelectEpisode) {
      return;
    }
    if (nextEpisodeCountdown <= 0) {
      transitionToEpisode(mediaInfo.next_item);
      return;
    }
    const timer = window.setTimeout(() => {
      setNextEpisodeCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [nextEpisodeCountdown, mediaInfo, onSelectEpisode, transitionToEpisode]);

  // Fullscreen state listener
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const togglePlayPause = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      setNextEpisodeCountdown(null);
      void el.play().catch(() => undefined);
    } else {
      el.pause();
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    const root = containerRef.current;
    if (!root) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      void root.requestFullscreen?.().catch(() => undefined);
    }
  }, []);

  const togglePiP = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (document.pictureInPictureElement) {
      void document.exitPictureInPicture().catch(() => undefined);
    } else if (typeof el.requestPictureInPicture === 'function') {
      void el.requestPictureInPicture().catch(() => undefined);
    }
  }, []);

  const handleSelectAudio = useCallback(
    (nextAudioIdx: number) => {
      if (!item || nextAudioIdx === selectedAudioIndex) return;
      const resumeAt = currentMediaTime;
      setSelectedAudioIndex(nextAudioIdx);
      setStreamOffsetSec(resumeAt);
      setVideoTime(0);
      setTranscodeNonce((n) => n + 1);
      setStreamError(null);
      void saveFilePreferences(item.path, nextAudioIdx, selectedSubtitleId).catch(() => undefined);
    },
    [item, selectedAudioIndex, selectedSubtitleId, currentMediaTime],
  );

  const handleSelectSubtitle = useCallback(
    (nextSubId: string | null) => {
      if (!item) return;
      setSelectedSubtitleId(nextSubId);
      if (nextSubId) {
        lastSubtitleIdRef.current = nextSubId;
      }
      void saveFilePreferences(item.path, selectedAudioIndex, nextSubId).catch(() => undefined);
    },
    [item, selectedAudioIndex],
  );

  // Keyboard shortcuts & initial focus
  useEffect(() => {
    if (!item) return;
    const prevFocused = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')
      ) {
        return;
      }

      if (customization.hudMode === 'auto_hide') {
        setHudVisible(true);
      }

      switch (event.key) {
        case 'Escape':
          event.preventDefault();
          if (popoverOpen) {
            setPopoverOpen(false);
          } else {
            handleClose();
          }
          break;
        case ' ':
        case 'k':
        case 'K':
          event.preventDefault();
          togglePlayPause();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          seekTo(currentMediaTime - customization.seekStepSec, true);
          break;
        case 'ArrowRight':
          event.preventDefault();
          seekTo(currentMediaTime + customization.seekStepSec, true);
          break;
        case 'j':
        case 'J':
          event.preventDefault();
          seekTo(currentMediaTime - 10, true);
          break;
        case 'l':
        case 'L':
          event.preventDefault();
          seekTo(currentMediaTime + 10, true);
          break;
        case 'ArrowUp':
          event.preventDefault();
          setIsMuted(false);
          setVolume((v) => Math.min(1, Number((v + 0.1).toFixed(2))));
          break;
        case 'ArrowDown':
          event.preventDefault();
          setVolume((v) => Math.max(0, Number((v - 0.1).toFixed(2))));
          break;
        case 'm':
        case 'M':
          event.preventDefault();
          setIsMuted((m) => !m);
          break;
        case 'f':
        case 'F':
          event.preventDefault();
          toggleFullscreen();
          break;
        case 'c':
        case 'C':
          event.preventDefault();
          if (selectedSubtitleId) {
            handleSelectSubtitle(null);
          } else {
            const fallback =
              lastSubtitleIdRef.current ??
              mediaInfo?.subtitle_tracks.find((s) => s.text_based)?.id ??
              null;
            handleSelectSubtitle(fallback);
          }
          break;
        case 's':
        case 'S':
          if (activeSkippableChapter) {
            event.preventDefault();
            setSuppressedChapters((prev) => new Set(prev).add(activeSkippableChapter.id));
            seekTo(computeSkipTargetSec(activeSkippableChapter, totalDuration || null), false);
          }
          break;
        case 'N':
          if (event.shiftKey && mediaInfo?.next_item && onSelectEpisode) {
            event.preventDefault();
            transitionToEpisode(mediaInfo.next_item);
          }
          break;
        case 'P':
          if (event.shiftKey && mediaInfo?.prev_item && onSelectEpisode) {
            event.preventDefault();
            transitionToEpisode(mediaInfo.prev_item);
          }
          break;
        case '[':
          if (mediaInfo && mediaInfo.chapters.length > 0) {
            event.preventDefault();
            const prevCh = [...mediaInfo.chapters]
              .reverse()
              .find((c) => c.start_sec < currentMediaTime - 2);
            seekTo(prevCh ? prevCh.start_sec : 0, true);
          }
          break;
        case ']':
          if (mediaInfo && mediaInfo.chapters.length > 0) {
            event.preventDefault();
            const nextCh = mediaInfo.chapters.find((c) => c.start_sec > currentMediaTime + 0.5);
            if (nextCh) seekTo(nextCh.start_sec, true);
          }
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      prevFocused?.focus?.();
    };
  }, [
    item,
    popoverOpen,
    handleClose,
    togglePlayPause,
    seekTo,
    currentMediaTime,
    customization.seekStepSec,
    customization.hudMode,
    toggleFullscreen,
    selectedSubtitleId,
    handleSelectSubtitle,
    mediaInfo,
    activeSkippableChapter,
    totalDuration,
    onSelectEpisode,
    transitionToEpisode,
  ]);

  if (!item) return null;

  const fitClass =
    customization.fitMode === 'cover'
      ? 'object-cover'
      : customization.fitMode === 'fill'
        ? 'object-fill'
        : 'object-contain';

  const openMenuTab = (tab: PlayerSettingsTab) => {
    if (popoverOpen && popoverTab === tab) {
      setPopoverOpen(false);
    } else {
      setPopoverTab(tab);
      setPopoverOpen(true);
    }
  };

  const remainingTime = totalDuration > 0 ? Math.max(0, totalDuration - currentMediaTime) : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-2 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="custom-player-title"
    >
      <div
        ref={containerRef}
        onMouseMove={(e) => {
          if (customization.hudMode === 'auto_hide') {
            setHudVisible(true);
            return;
          }
          if (customization.hudMode === 'hover_area' && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const relY = e.clientY - rect.top;
            const inZone = relY <= TOP_HUD_ZONE_PX || relY >= rect.height - BOTTOM_HUD_ZONE_PX;
            setPointerInUiZone(inZone);
          }
        }}
        onMouseLeave={() => {
          setPointerInUiZone(false);
          if (customization.hudMode === 'auto_hide') {
            setHudVisible(false);
          }
        }}
        className="relative flex min-h-[20rem] max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-[#232730] bg-black shadow-2xl select-none sm:aspect-video"
      >
        {/* Top Bar Overlay */}
        <div
          onMouseEnter={() => setPointerInUiZone(true)}
          className={`absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 bg-gradient-to-b from-black/85 via-black/45 to-transparent px-4 py-3 transition-opacity duration-200 ${
            showHud ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <div className="min-w-0">
            <h2
              id="custom-player-title"
              className="truncate text-sm font-semibold text-[#f3f4f6] sm:text-base"
            >
              {item.name}
            </h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[#9ca3af]">
              {activeChapter && <span>{activeChapter.title}</span>}
              {useTranscode && (
                <span className="rounded border border-[#232730] bg-[#15171c]/90 px-1.5 py-0.5 text-[10px] text-[#f59e0b]">
                  FFmpeg Stream
                </span>
              )}
            </div>
          </div>

          <button
            ref={closeBtnRef}
            type="button"
            onClick={handleClose}
            aria-label="Close player"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#232730] bg-[#15171c]/90 text-[#f3f4f6] transition-colors hover:bg-[#21252e]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Video Stage */}
        <div
          className="relative flex flex-1 items-center justify-center overflow-hidden bg-black"
          onClick={() => {
            if (popoverOpen) {
              setPopoverOpen(false);
              return;
            }
            const isTouch =
              typeof window !== 'undefined' &&
              window.matchMedia?.('(pointer: coarse)').matches;
            if (isTouch && customization.hudMode === 'hover_area') {
              setPointerInUiZone((prev) => !prev);
            } else {
              togglePlayPause();
            }
          }}
          onDoubleClick={toggleFullscreen}
        >
          {streamError ? (
            <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
              <AlertCircle className="h-8 w-8 text-[#ef4444]" aria-hidden="true" />
              <p className="text-sm font-medium text-[#f3f4f6]">{streamError}</p>
              <p className="max-w-md text-xs text-[#9ca3af]">
                Ensure FFmpeg is installed on the host for multi-audio remuxing or switch to external mpv in Settings.
              </p>
            </div>
          ) : (
            <video
              ref={videoRef}
              src={streamSrc}
              autoPlay
              playsInline
              className={`h-full w-full ${fitClass}`}
              onLoadedMetadata={(e) => {
                const el = e.currentTarget;
                if (Number.isFinite(el.duration) && el.duration > 0) {
                  setVideoDuration(el.duration);
                }
                if (
                  !useTranscode &&
                  !initialResumeAppliedRef.current &&
                  item.last_position_sec &&
                  item.last_position_sec > 0 &&
                  (!el.duration || item.last_position_sec < el.duration - 2)
                ) {
                  el.currentTime = item.last_position_sec;
                  setVideoTime(item.last_position_sec);
                  initialResumeAppliedRef.current = true;
                }
              }}
              onPlay={() => {
                setIsPlaying(true);
                setNextEpisodeCountdown(null);
              }}
              onPause={() => {
                setIsPlaying(false);
                void flushProgress(true);
              }}
              onEnded={() => {
                setIsPlaying(false);
                void flushProgress(true);
                if (
                  mediaInfo?.next_item &&
                  customization.autoPlayNextEpisode &&
                  onSelectEpisode
                ) {
                  setNextEpisodeCountdown(customization.autoNextCountdownSec);
                }
              }}
              onTimeUpdate={(e) => {
                const el = e.currentTarget;
                setVideoTime(el.currentTime);
                if (el.buffered.length > 0) {
                  const endBuf = el.buffered.end(el.buffered.length - 1);
                  setBufferedSec(useTranscode ? streamOffsetSec + endBuf : endBuf);
                }
              }}
              onError={() => {
                if (streamSrc) {
                  setStreamError('Unable to decode or stream this video track in the browser.');
                }
              }}
            />
          )}

          {/* Custom / Native Subtitle Overlay */}
          <SubtitleOverlay
            cues={activeSubtitleCues}
            mode={customization.subtitleMode}
            fontFamily={customization.subtitleFontFamily}
            fontSize={customization.subtitleFontSize}
            color={customization.subtitleColor}
            backdrop={customization.subtitleBackdrop}
            outline={customization.subtitleOutline}
            bottomPct={
              showHud
                ? Math.max(customization.subtitleBottomPct, 18)
                : customization.subtitleBottomPct
            }
          />
        </div>

        {/* Skip Intro / Outro / Recap Cue */}
        <SkipChapterCue
          chapter={activeSkippableChapter}
          countdownSec={skipCountdown}
          alignLeft={popoverOpen}
          onSkipNow={() => {
            if (!activeSkippableChapter) return;
            setSuppressedChapters((prev) => new Set(prev).add(activeSkippableChapter.id));
            seekTo(computeSkipTargetSec(activeSkippableChapter, totalDuration || null), false);
          }}
          onCancelAutoSkip={() => {
            if (!activeSkippableChapter) return;
            setSkipCountdown(null);
            setSuppressedChapters((prev) => new Set(prev).add(activeSkippableChapter.id));
          }}
        />

        {/* Auto Next Episode Card */}
        <NextEpisodeCue
          nextItem={mediaInfo?.next_item ?? null}
          countdownSec={nextEpisodeCountdown}
          onPlayNow={() => {
            if (mediaInfo?.next_item) {
              transitionToEpisode(mediaInfo.next_item);
            }
          }}
          onCancel={() => setNextEpisodeCountdown(null)}
        />

        {/* Tabbed Settings Popover */}
        <PlayerSettingsPopover
          open={popoverOpen}
          initialTab={popoverTab}
          audioTracks={mediaInfo?.audio_tracks ?? []}
          selectedAudioIndex={selectedAudioIndex}
          subtitleTracks={mediaInfo?.subtitle_tracks ?? []}
          selectedSubtitleId={selectedSubtitleId}
          chapters={mediaInfo?.chapters ?? []}
          currentTime={currentMediaTime}
          customization={customization}
          onClose={() => setPopoverOpen(false)}
          onSelectAudio={handleSelectAudio}
          onSelectSubtitle={handleSelectSubtitle}
          onJumpToChapter={(sec) => {
            seekTo(sec, true);
            setPopoverOpen(false);
          }}
          onUpdateCustomization={updateCustomization}
        />

        {/* Bottom HUD Controls */}
        <div
          onMouseEnter={() => setPointerInUiZone(true)}
          className={`absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/95 via-black/75 to-transparent px-3 pb-2.5 pt-6 transition-opacity duration-200 sm:px-5 ${
            showHud ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <PlayerTimeline
            currentTime={currentMediaTime}
            duration={totalDuration}
            bufferedSec={bufferedSec}
            chapters={mediaInfo?.chapters ?? []}
            seekStepSec={customization.seekStepSec}
            onSeek={(sec) => seekTo(sec, true)}
          />

          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            {/* Left Transport Controls */}
            <div className="flex items-center gap-1 sm:gap-1.5">
              {mediaInfo?.prev_item && onSelectEpisode && (
                <button
                  type="button"
                  onClick={() => transitionToEpisode(mediaInfo.prev_item!)}
                  aria-label="Previous episode"
                  title={`Previous: ${mediaInfo.prev_item.name}`}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#f3f4f6] transition-colors hover:bg-[#21252e]"
                >
                  <SkipBack className="h-4 w-4" aria-hidden="true" />
                </button>
              )}

              <button
                type="button"
                onClick={togglePlayPause}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#f97316] text-[#0c0d10] transition-colors hover:bg-[#fb923c]"
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4 fill-current" aria-hidden="true" />
                ) : (
                  <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                )}
              </button>

              {mediaInfo?.next_item && onSelectEpisode && (
                <button
                  type="button"
                  onClick={() => transitionToEpisode(mediaInfo.next_item!)}
                  aria-label="Next episode"
                  title={`Next: ${mediaInfo.next_item.name}`}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#f3f4f6] transition-colors hover:bg-[#21252e]"
                >
                  <SkipForward className="h-4 w-4" aria-hidden="true" />
                </button>
              )}

              <button
                type="button"
                onClick={() => seekTo(currentMediaTime - customization.seekStepSec, true)}
                aria-label={`Rewind ${customization.seekStepSec} seconds`}
                className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs text-[#f3f4f6] transition-colors hover:bg-[#21252e]"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                <span className="tabular-timecode hidden sm:inline">
                  {customization.seekStepSec}
                </span>
              </button>

              <button
                type="button"
                onClick={() => seekTo(currentMediaTime + customization.seekStepSec, true)}
                aria-label={`Forward ${customization.seekStepSec} seconds`}
                className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs text-[#f3f4f6] transition-colors hover:bg-[#21252e]"
              >
                <RotateCw className="h-4 w-4" aria-hidden="true" />
                <span className="tabular-timecode hidden sm:inline">
                  {customization.seekStepSec}
                </span>
              </button>

              {/* Volume */}
              <div className="flex items-center gap-1.5 pl-1">
                <button
                  type="button"
                  onClick={() => setIsMuted((m) => !m)}
                  aria-label={isMuted || volume === 0 ? 'Unmute' : 'Mute'}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#f3f4f6] hover:bg-[#21252e]"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="h-4 w-4 text-[#9ca3af]" aria-hidden="true" />
                  ) : (
                    <Volume2 className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    const nextVol = Number(e.target.value);
                    setVolume(nextVol);
                    setIsMuted(nextVol === 0);
                  }}
                  aria-label="Volume"
                  className="hidden h-1.5 w-20 cursor-pointer accent-[#f97316] sm:block"
                />
              </div>

              {/* Timecode Readout */}
              <button
                type="button"
                onClick={() =>
                  updateCustomization({ showRemainingTime: !customization.showRemainingTime })
                }
                aria-label="Toggle elapsed or remaining time"
                className="tabular-timecode rounded-md px-2 py-1 text-xs text-[#f3f4f6] hover:bg-[#21252e]"
              >
                {customization.showRemainingTime
                  ? `-${formatDuration(remainingTime)}`
                  : formatDuration(currentMediaTime)}
                <span className="text-[#9ca3af]"> / {formatDuration(totalDuration)}</span>
              </button>
            </div>

            {/* Right Track & Customization Controls */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => openMenuTab('audio')}
                aria-label="Audio tracks"
                aria-expanded={popoverOpen && popoverTab === 'audio'}
                className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors ${
                  popoverOpen && popoverTab === 'audio'
                    ? 'bg-[#f97316] text-[#0c0d10]'
                    : 'text-[#f3f4f6] hover:bg-[#21252e]'
                }`}
              >
                <Volume2 className="h-4 w-4" aria-hidden="true" />
                <span className="hidden md:inline">Audio</span>
              </button>

              <button
                type="button"
                onClick={() => openMenuTab('subtitles')}
                aria-label="Subtitles and caption style"
                aria-expanded={popoverOpen && popoverTab === 'subtitles'}
                className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors ${
                  popoverOpen && popoverTab === 'subtitles'
                    ? 'bg-[#f97316] text-[#0c0d10]'
                    : selectedSubtitleId
                      ? 'text-[#f97316] hover:bg-[#21252e]'
                      : 'text-[#f3f4f6] hover:bg-[#21252e]'
                }`}
              >
                <Captions className="h-4 w-4" aria-hidden="true" />
                <span className="hidden md:inline">Subtitles</span>
              </button>

              <button
                type="button"
                onClick={() => openMenuTab('chapters')}
                aria-label="Chapters and auto-skip"
                aria-expanded={popoverOpen && popoverTab === 'chapters'}
                className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors ${
                  popoverOpen && popoverTab === 'chapters'
                    ? 'bg-[#f97316] text-[#0c0d10]'
                    : 'text-[#f3f4f6] hover:bg-[#21252e]'
                }`}
              >
                <ListVideo className="h-4 w-4" aria-hidden="true" />
                <span className="hidden md:inline">Chapters</span>
              </button>

              <button
                type="button"
                onClick={() => openMenuTab('customize')}
                aria-label="Customize player"
                aria-expanded={popoverOpen && popoverTab === 'customize'}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                  popoverOpen && popoverTab === 'customize'
                    ? 'bg-[#f97316] text-[#0c0d10]'
                    : 'text-[#f3f4f6] hover:bg-[#21252e]'
                }`}
              >
                <Sliders className="h-4 w-4" aria-hidden="true" />
              </button>

              {typeof document !== 'undefined' && document.pictureInPictureEnabled && (
                <button
                  type="button"
                  onClick={togglePiP}
                  aria-label="Picture in Picture"
                  className="hidden h-9 w-9 items-center justify-center rounded-lg text-[#f3f4f6] transition-colors hover:bg-[#21252e] sm:inline-flex"
                >
                  <PictureInPicture2 className="h-4 w-4" aria-hidden="true" />
                </button>
              )}

              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#f3f4f6] transition-colors hover:bg-[#21252e]"
              >
                {isFullscreen ? (
                  <Minimize className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Maximize className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
