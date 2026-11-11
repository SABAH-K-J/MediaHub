import { encodePathB64 } from './encoding';

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return '--:--';
  }
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');

  if (hrs > 0) {
    return `${hrs}:${pad(mins)}:${pad(secs)}`;
  }
  return `${mins}:${pad(secs)}`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) {
    return '—';
  }
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / 1024 ** exp;
  return `${val >= 100 || exp === 0 ? val.toFixed(0) : val.toFixed(1)} ${units[exp]}`;
}

export function formatPercent(ratio: number): string {
  const clamped = Math.min(Math.max(ratio, 0), 1);
  return `${Math.round(clamped * 100)}%`;
}

export function resolveApiBase(): string {
  const configured = import.meta.env.VITE_API_URL;
  if (typeof configured === 'string' && configured.trim().length > 0) {
    return configured.trim().replace(/\/+$/, '');
  }
  return '';
}

export function buildStreamUrl(filePath: string): string {
  const base = resolveApiBase();
  return `${base}/api/stream?path=${encodeURIComponent(encodePathB64(filePath))}`;
}

export function buildTranscodeStreamUrl(
  filePath: string,
  audioIndex: number,
  startSec = 0,
): string {
  const base = resolveApiBase();
  const params = new URLSearchParams({
    path: encodePathB64(filePath),
    audio: String(Math.max(0, audioIndex)),
    start: Math.max(0, startSec).toFixed(3),
  });
  return `${base}/api/stream/transcode?${params.toString()}`;
}

export function resolveAssetUrl(relativePath: string | null | undefined): string | null {
  if (!relativePath) return null;
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
    return relativePath;
  }
  const base = resolveApiBase();
  return `${base}${relativePath}`;
}

