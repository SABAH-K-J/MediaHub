import { describe, expect, it } from 'vitest';
import {
  BrowseResponseSchema,
  HealthSchema,
  RootPathInputSchema,
  VideoProgressSchema,
} from '../api/schemas';

describe('Zod API schemas', () => {
  it('validates health and browse payloads', () => {
    const health = HealthSchema.parse({
      status: 'ok',
      version: '2.0.0',
      mpv_available: false,
      ffmpeg_available: true,
    });
    expect(health.ffmpeg_available).toBe(true);

    const browse = BrowseResponseSchema.parse({
      current_path: '/media/movies',
      root_path: '/media',
      parent_path: '/media',
      breadcrumbs: [
        { name: 'media', path: '/media' },
        { name: 'movies', path: '/media/movies' },
      ],
      items: [
        {
          name: 'test.mp4',
          path: '/media/movies/test.mp4',
          is_dir: false,
          watched: false,
          progress_ratio: 0.42,
          last_position_sec: 120,
          duration: 300,
          size_bytes: 1024000,
        },
      ],
    });
    expect(browse.items).toHaveLength(1);
    expect(browse.items[0].progress_ratio).toBe(0.42);
  });

  it('rejects empty root paths and out-of-range progress ratios', () => {
    expect(RootPathInputSchema.safeParse('   ').success).toBe(false);
    expect(RootPathInputSchema.safeParse('/media/shows').success).toBe(true);

    expect(
      VideoProgressSchema.safeParse({
        file_path: '/media/a.mp4',
        file_hash: 'a'.repeat(64),
        progress_ratio: 1.5,
        watched: false,
      }).success,
    ).toBe(false);
  });
});

