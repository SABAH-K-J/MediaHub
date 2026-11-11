import { z } from 'zod';

export const HealthSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
  mpv_available: z.boolean(),
  ffmpeg_available: z.boolean(),
});

export type HealthStatus = z.infer<typeof HealthSchema>;

export const LibraryRootSchema = z.object({
  id: z.number().int(),
  path: z.string().min(1),
  label: z.string().nullable().optional(),
  created_at: z.string(),
});

export const LibraryRootsListSchema = z.array(LibraryRootSchema);
export type LibraryRoot = z.infer<typeof LibraryRootSchema>;

export const DeleteRootSchema = z.object({
  status: z.literal('deleted'),
  id: z.number().int(),
});

export const BreadcrumbSchema = z.object({
  name: z.string(),
  path: z.string(),
});

export type BreadcrumbItem = z.infer<typeof BreadcrumbSchema>;

export const BrowseItemSchema = z.object({
  name: z.string(),
  path: z.string(),
  is_dir: z.boolean(),
  watched: z.boolean().default(false),
  progress_ratio: z.number().min(0).max(1).default(0),
  last_position_sec: z.number().nullable().optional(),
  resolution: z.string().nullable().optional(),
  duration: z.number().nullable().optional(),
  size_bytes: z.number().nullable().optional(),
  watch_date: z.string().nullable().optional(),
  thumbnail_url: z.string().nullable().optional(),
});

export type BrowseItem = z.infer<typeof BrowseItemSchema>;

export const BrowseResponseSchema = z.object({
  current_path: z.string(),
  root_path: z.string(),
  parent_path: z.string().nullable(),
  breadcrumbs: z.array(BreadcrumbSchema),
  items: z.array(BrowseItemSchema),
});

export type BrowseResponse = z.infer<typeof BrowseResponseSchema>;

export const LastWatchedSchema = z.object({
  file_path: z.string(),
  name: z.string(),
  progress_ratio: z.number().min(0).max(1),
  last_position_sec: z.number().nullable().optional(),
  duration: z.number().nullable().optional(),
  watch_date: z.string(),
  thumbnail_url: z.string().nullable().optional(),
});

export const NullableLastWatchedSchema = LastWatchedSchema.nullable();
export type LastWatchedItem = z.infer<typeof LastWatchedSchema>;

export const VideoProgressSchema = z.object({
  file_path: z.string(),
  file_hash: z.string(),
  duration: z.number().nullable().optional(),
  last_position_sec: z.number().nullable().optional(),
  progress_ratio: z.number().min(0).max(1),
  watched: z.boolean(),
  watch_date: z.string().nullable().optional(),
  resolution: z.string().nullable().optional(),
  size_bytes: z.number().nullable().optional(),
  thumbnail_url: z.string().nullable().optional(),
  preferred_audio_index: z.number().int().nullable().optional(),
  preferred_subtitle_id: z.string().nullable().optional(),
});

export type VideoProgress = z.infer<typeof VideoProgressSchema>;

export const AudioTrackSchema = z.object({
  audio_index: z.number().int().min(0),
  stream_index: z.number().int().min(0),
  codec: z.string(),
  language: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  channels: z.number().int().nullable().optional(),
  channel_layout: z.string().nullable().optional(),
  is_default: z.boolean().default(false),
  browser_compatible: z.boolean().default(false),
});

export type AudioTrack = z.infer<typeof AudioTrackSchema>;

export const SubtitleTrackSchema = z.object({
  id: z.string().min(1),
  source: z.enum(['embedded', 'external']),
  stream_index: z.number().int().nullable().optional(),
  subtitle_index: z.number().int().nullable().optional(),
  filename: z.string().nullable().optional(),
  codec: z.string(),
  language: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  is_default: z.boolean().default(false),
  is_forced: z.boolean().default(false),
  text_based: z.boolean().default(true),
});

export type SubtitleTrack = z.infer<typeof SubtitleTrackSchema>;

export const ChapterCategorySchema = z.enum([
  'intro',
  'recap',
  'outro',
  'credits',
  'preview',
  'main',
]);

export type ChapterCategory = z.infer<typeof ChapterCategorySchema>;

export const ChapterSchema = z.object({
  id: z.string(),
  title: z.string(),
  start_sec: z.number().min(0),
  end_sec: z.number().min(0),
  category: ChapterCategorySchema,
});

export type Chapter = z.infer<typeof ChapterSchema>;

export const MediaInfoSchema = z.object({
  file_path: z.string(),
  duration: z.number().nullable().optional(),
  container_ext: z.string(),
  video_codec: z.string().nullable().optional(),
  width: z.number().int().nullable().optional(),
  height: z.number().int().nullable().optional(),
  can_direct_play: z.boolean().default(true),
  audio_tracks: z.array(AudioTrackSchema),
  subtitle_tracks: z.array(SubtitleTrackSchema),
  chapters: z.array(ChapterSchema),
  preferred_audio_index: z.number().int().nullable().optional(),
  preferred_subtitle_id: z.string().nullable().optional(),
  prev_item: BrowseItemSchema.nullable().optional(),
  next_item: BrowseItemSchema.nullable().optional(),
});

export type MediaInfo = z.infer<typeof MediaInfoSchema>;

export const PlayerCustomizationSchema = z.object({
  playbackSpeed: z.number().min(0.25).max(4).default(1),
  seekStepSec: z.number().int().min(1).max(120).default(10),
  fitMode: z.enum(['contain', 'cover', 'fill']).default('contain'),
  hudMode: z.enum(['hover_area', 'auto_hide', 'always']).default('hover_area'),
  controlsAutoHideSec: z.number().int().min(0).max(30).default(3),
  showRemainingTime: z.boolean().default(false),
  subtitleMode: z.enum(['native', 'custom']).default('native'),
  subtitleFontFamily: z.enum(['gotham', 'sans', 'serif', 'mono']).default('gotham'),
  subtitleFontSize: z.enum(['sm', 'md', 'lg', 'xl']).default('md'),
  subtitleColor: z.enum(['white', 'amber', 'cyan']).default('white'),
  subtitleBackdrop: z.enum(['shadow', 'translucent', 'solid']).default('shadow'),
  subtitleOutline: z.enum(['none', 'thin', 'medium', 'heavy']).default('medium'),
  subtitleBottomPct: z.number().min(4).max(28).default(8),
  subtitleOffsetSec: z.number().min(-15).max(15).default(0),
  autoSkipIntro: z.boolean().default(true),
  autoSkipRecap: z.boolean().default(true),
  autoSkipOutro: z.boolean().default(false),
  autoSkipPreview: z.boolean().default(false),
  autoSkipCountdownSec: z.union([z.literal(0), z.literal(3)]).default(3),
  autoPlayNextEpisode: z.boolean().default(true),
  autoNextCountdownSec: z.union([z.literal(5), z.literal(10)]).default(5),
});

export type PlayerCustomization = z.infer<typeof PlayerCustomizationSchema>;

export const DEFAULT_PLAYER_CUSTOMIZATION: PlayerCustomization = PlayerCustomizationSchema.parse({});

export const PlayResponseSchema = z.object({
  status: z.literal('playback started'),
  mode: z.literal('mpv'),
});

export const PlayProgressSchema = z.object({
  active: z.boolean(),
  file_path: z.string().nullable().optional(),
  time_pos: z.number().nullable().optional(),
  duration: z.number().nullable().optional(),
  progress: z.number().nullable().optional(),
});

export type PlayProgress = z.infer<typeof PlayProgressSchema>;

export const RootPathInputSchema = z
  .string()
  .trim()
  .min(1, 'Enter a folder path to register.')
  .max(4096, 'Folder path is too long.');

export const BrowseStatusFilterSchema = z.enum(['all', 'unwatched', 'in_progress', 'watched']);
export type BrowseStatusFilter = z.infer<typeof BrowseStatusFilterSchema>;

export const BrowseSortSchema = z.enum(['name', 'size', 'duration', 'recent']);
export type BrowseSort = z.infer<typeof BrowseSortSchema>;

export const PlayerPreferenceSchema = z.enum(['auto', 'mpv', 'browser']);
export type PlayerPreference = z.infer<typeof PlayerPreferenceSchema>;

