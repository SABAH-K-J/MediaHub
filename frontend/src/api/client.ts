import { z } from 'zod';
import { encodePathB64 } from '../utils/encoding';
import { resolveApiBase } from '../utils/format';
import {
  BrowseResponse,
  BrowseResponseSchema,
  BrowseSort,
  BrowseStatusFilter,
  DeleteRootSchema,
  HealthSchema,
  HealthStatus,
  LastWatchedItem,
  LibraryRoot,
  LibraryRootSchema,
  LibraryRootsListSchema,
  NullableLastWatchedSchema,
  PlayProgress,
  PlayProgressSchema,
  PlayResponseSchema,
  VideoProgress,
  VideoProgressSchema,
} from './schemas';

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

async function requestJson<T>(
  endpoint: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  options: RequestInit = {},
): Promise<T> {
  const base = resolveApiBase();
  const url = `${base}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const errBody = (await response.json()) as { detail?: unknown };
      if (typeof errBody?.detail === 'string' && errBody.detail.trim()) {
        detail = errBody.detail;
      }
    } catch {
      // Ignore non-JSON error bodies
    }
    throw new ApiError(response.status, detail);
  }

  const raw: unknown = await response.json();
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Unexpected API response format for ${endpoint}`);
  }
  return parsed.data;
}

export function getHealth(signal?: AbortSignal): Promise<HealthStatus> {
  return requestJson('/api/health', HealthSchema, { method: 'GET', signal });
}

export function getRoots(signal?: AbortSignal): Promise<LibraryRoot[]> {
  return requestJson('/api/roots', LibraryRootsListSchema, { method: 'GET', signal });
}

export function addRoot(path: string, label?: string): Promise<LibraryRoot> {
  const payload = label ? { path, label } : { path };
  return requestJson('/api/roots', LibraryRootSchema, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteRoot(rootId: number): Promise<void> {
  await requestJson(`/api/roots/${rootId}`, DeleteRootSchema, { method: 'DELETE' });
}

export interface BrowseParams {
  path: string;
  q?: string;
  status?: BrowseStatusFilter;
  sort?: BrowseSort;
  signal?: AbortSignal;
}

export function browseDirectory({
  path,
  q = '',
  status = 'all',
  sort = 'name',
  signal,
}: BrowseParams): Promise<BrowseResponse> {
  const params = new URLSearchParams({
    path: encodePathB64(path),
    status,
    sort,
  });
  if (q.trim().length > 0) {
    params.set('q', q.trim());
  }
  return requestJson(`/api/browse?${params.toString()}`, BrowseResponseSchema, {
    method: 'GET',
    signal,
  });
}

export function getLastWatched(signal?: AbortSignal): Promise<LastWatchedItem | null> {
  return requestJson('/api/last-watched', NullableLastWatchedSchema, {
    method: 'GET',
    signal,
  });
}

export async function playMedia(filePath: string): Promise<void> {
  await requestJson('/api/play', PlayResponseSchema, {
    method: 'POST',
    body: JSON.stringify({ file_path: encodePathB64(filePath) }),
  });
}

export function getPlaybackProgress(
  filePath: string,
  signal?: AbortSignal,
): Promise<PlayProgress> {
  const params = new URLSearchParams({ path: encodePathB64(filePath) });
  return requestJson(`/api/play/progress?${params.toString()}`, PlayProgressSchema, {
    method: 'GET',
    signal,
  });
}

export function syncFileProgress(
  filePath: string,
  positionSec: number,
  durationSec: number | null,
): Promise<VideoProgress> {
  return requestJson('/api/file/progress', VideoProgressSchema, {
    method: 'POST',
    body: JSON.stringify({
      file_path: encodePathB64(filePath),
      position_sec: positionSec,
      duration_sec: durationSec,
    }),
  });
}

export function markAsWatched(filePath: string): Promise<VideoProgress> {
  return requestJson('/api/file/watch', VideoProgressSchema, {
    method: 'POST',
    body: JSON.stringify({ file_path: encodePathB64(filePath) }),
  });
}

export function markAsUnwatched(filePath: string): Promise<VideoProgress> {
  return requestJson('/api/file/unwatch', VideoProgressSchema, {
    method: 'POST',
    body: JSON.stringify({ file_path: encodePathB64(filePath) }),
  });
}
