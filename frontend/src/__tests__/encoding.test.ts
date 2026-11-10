import { describe, expect, it } from 'vitest';
import { decodePathB64, encodePathB64 } from '../utils/encoding';

describe('encoding utilities', () => {
  it('round-trips ASCII and Unicode Windows/POSIX paths using URL-safe Base64', () => {
    const samples = [
      'D:\\Videos\\Movies\\Sci-Fi (2025)\\film.mkv',
      '/media/anime/日本語/第01話.mp4',
      'C:\\Users\\Viewer\\My Clips\\clip #1 & trailer.webm',
    ];

    for (const sample of samples) {
      const encoded = encodePathB64(sample);
      expect(encoded).not.toMatch(/[+/=]/);
      expect(decodePathB64(encoded)).toBe(sample);
    }
  });
});

