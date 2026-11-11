import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomPlayerModal } from '../components/player/CustomPlayerModal';

function jsonResp(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

describe('CustomPlayerModal', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('hides HUD until pointer enters UI zone, supports native ASS & Gotham outline, audio switching, intro skip, and auto next episode', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onProgressSynced = vi.fn();
    const onSelectEpisode = vi.fn();

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/media/info')) {
        return jsonResp({
          file_path: '/media/Episode01.mp4',
          duration: 600,
          container_ext: '.mp4',
          video_codec: 'h264',
          width: 1280,
          height: 720,
          can_direct_play: true,
          audio_tracks: [
            {
              audio_index: 0,
              stream_index: 1,
              codec: 'aac',
              language: 'jpn',
              title: 'Japanese',
              channels: 2,
              is_default: true,
              browser_compatible: true,
            },
            {
              audio_index: 1,
              stream_index: 2,
              codec: 'ac3',
              language: 'eng',
              title: 'English',
              channels: 6,
              is_default: false,
              browser_compatible: false,
            },
          ],
          subtitle_tracks: [
            {
              id: 'ext:Episode01.en.ass',
              source: 'external',
              codec: 'ass',
              language: 'en',
              title: 'EN (ass)',
              is_default: false,
              is_forced: false,
              text_based: true,
            },
          ],
          chapters: [
            { id: 'ch-0', title: 'Opening', start_sec: 0, end_sec: 90, category: 'intro' },
            { id: 'ch-1', title: 'Main Episode', start_sec: 90, end_sec: 600, category: 'main' },
          ],
          preferred_audio_index: null,
          preferred_subtitle_id: null,
          prev_item: null,
          next_item: {
            name: 'Episode02.mp4',
            path: '/media/Episode02.mp4',
            is_dir: false,
            watched: false,
            progress_ratio: 0,
            duration: 600,
          },
        });
      }
      if (url.includes('/api/subtitles') && url.includes('format=ass')) {
        return Promise.resolve(
          new Response(
            '[Script Info]\nPlayResX: 1280\nPlayResY: 720\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, Bold, Italic, Underline, Outline, Alignment\nStyle: Default,Arial,48,&H00FFFFFF,&H00000000,0,0,0,2,2\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:05.00,0:00:25.00,Default,,0,0,0,,{\\an8\\c&H0000FFFF&}Native Top Title\n',
            { status: 200, headers: { 'Content-Type': 'text/plain' } },
          ),
        );
      }
      if (url.includes('/api/subtitles')) {
        return Promise.resolve(
          new Response('WEBVTT\n\n00:00:05.000 --> 00:00:25.000\nCustom Gotham Caption\n', {
            status: 200,
            headers: { 'Content-Type': 'text/vtt' },
          }),
        );
      }
      if (url.includes('/api/file/preferences')) {
        return jsonResp({
          file_path: '/media/Episode01.mp4',
          file_hash: 'a'.repeat(64),
          progress_ratio: 0.1,
          watched: false,
          preferred_audio_index: 1,
          preferred_subtitle_id: 'ext:Episode01.en.ass',
        });
      }
      if (url.includes('/api/file/progress')) {
        return jsonResp({
          file_path: '/media/Episode01.mp4',
          file_hash: 'a'.repeat(64),
          progress_ratio: 0.15,
          watched: false,
        });
      }
      return jsonResp({ detail: 'Not found' }, 404);
    });

    vi.stubGlobal('fetch', fetchMock);

    render(
      <CustomPlayerModal
        item={{
          name: 'Episode01.mp4',
          path: '/media/Episode01.mp4',
          is_dir: false,
          watched: false,
          progress_ratio: 0,
          duration: 600,
        }}
        onClose={onClose}
        onProgressSynced={onProgressSynced}
        onSelectEpisode={onSelectEpisode}
      />,
    );

    const dialog = screen.getByRole('dialog');
    await waitFor(() => {
      const videoEl = dialog.querySelector('video');
      expect(videoEl?.getAttribute('src')).toContain('/api/stream?path=');
    });

    const videoEl = dialog.querySelector('video')!;
    const playerBox = videoEl.closest('.select-none') as HTMLElement;
    const bottomHud = screen.getByRole('button', { name: 'Subtitles and caption style' }).closest('.z-20') as HTMLElement;

    // HUD is hidden by default until mouse enters top/bottom UI area
    expect(bottomHud.className).toContain('opacity-0');
    fireEvent.mouseEnter(bottomHud);
    expect(bottomHud.className).toContain('opacity-100');

    Object.defineProperty(videoEl, 'currentTime', { value: 10, writable: true, configurable: true });
    Object.defineProperty(videoEl, 'duration', { value: 600, writable: true, configurable: true });
    fireEvent.timeUpdate(videoEl);

    // Enable ASS subtitles -> Native mode renders native top-aligned colored span
    await user.click(screen.getByRole('button', { name: 'Subtitles and caption style' }));
    await user.click(screen.getByRole('button', { name: /EN \(ass\)/i }));

    const nativeCue = await screen.findByText('Native Top Title');
    expect(nativeCue).toBeInTheDocument();

    // Switch to Custom style mode with Gotham font and Heavy outline
    await user.click(screen.getByRole('button', { name: 'Custom' }));
    await user.click(screen.getByRole('button', { name: 'heavy' }));
    const customCue = await screen.findByText('Custom Gotham Caption');
    expect(customCue.closest('div')?.className).toContain('font-subtitle-gotham');
    expect(customCue.closest('div')?.className).toContain('subtitle-outline-heavy');

    // Skip intro cue while inside Opening (0..90s)
    await user.click(screen.getByRole('button', { name: /Skip Intro/i }));
    expect(videoEl.currentTime).toBe(90);

    // Switch audio track to English -> /api/stream/transcode?audio=1
    await user.click(screen.getByRole('button', { name: 'Audio tracks' }));
    await user.click(screen.getByRole('button', { name: /English/i }));
    await waitFor(() => {
      expect(videoEl.getAttribute('src')).toContain('/api/stream/transcode');
      expect(videoEl.getAttribute('src')).toContain('audio=1');
    });

    // End video -> Up Next card appears and Play Now transitions to Episode02.mp4
    fireEvent.ended(videoEl);
    expect(await screen.findByText('Episode02.mp4')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Play Now' }));
    await waitFor(() => expect(onSelectEpisode).toHaveBeenCalledWith(expect.objectContaining({ name: 'Episode02.mp4' })));

    expect(playerBox).toBeInTheDocument();
  });
});
