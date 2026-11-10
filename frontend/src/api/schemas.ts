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
});

export type VideoProgress = z.infer<typeof VideoProgressSchema>;

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

