import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Dashboard } from '../pages/Dashboard';

function mockJsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

describe('Dashboard', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('loads roots, browses media, toggles watched state, and deletes root with inline confirm', async () => {
    const user = userEvent.setup();
    let watchedState = false;
    let roots = [
      {
        id: 1,
        path: 'D:\\Videos',
        label: 'Videos',
        created_at: '2026-11-10T12:00:00Z',
      },
    ];

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.endsWith('/api/health')) {
        return mockJsonResponse({
          status: 'ok',
          version: '2.0.0',
          mpv_available: false,
          ffmpeg_available: true,
        });
      }
      if (url.endsWith('/api/roots') && method === 'GET') {
        return mockJsonResponse(roots);
      }
      if (url.endsWith('/api/roots/1') && method === 'DELETE') {
        roots = [];
        return mockJsonResponse({ status: 'deleted', id: 1 });
      }
      if (url.endsWith('/api/last-watched')) {
        return mockJsonResponse(null);
      }
      if (url.includes('/api/browse')) {
        return mockJsonResponse({
          current_path: 'D:\\Videos',
          root_path: 'D:\\Videos',
          parent_path: null,
          breadcrumbs: [{ name: 'Videos', path: 'D:\\Videos' }],
          items: [
            {
              name: 'Pilot.mp4',
              path: 'D:\\Videos\\Pilot.mp4',
              is_dir: false,
              watched: watchedState,
              progress_ratio: watchedState ? 1.0 : 0.25,
              last_position_sec: watchedState ? null : 75,
              duration: 300,
              size_bytes: 2048000,
              resolution: '1080p',
              thumbnail_url: null,
            },
          ],
        });
      }
      if (url.endsWith('/api/file/watch') && method === 'POST') {
        watchedState = true;
        return mockJsonResponse({
          file_path: 'D:\\Videos\\Pilot.mp4',
          file_hash: 'a'.repeat(64),
          progress_ratio: 1.0,
          watched: true,
        });
      }
      return mockJsonResponse({ detail: 'Not found' }, 404);
    });

    vi.stubGlobal('fetch', fetchMock);

    render(<Dashboard />);

    expect(await screen.findByText('Pilot.mp4')).toBeInTheDocument();
    expect(screen.getByText('1080p')).toBeInTheDocument();

    // Mark as watched
    const watchBtn = screen.getByRole('button', { name: 'Mark Pilot.mp4 as watched' });
    await user.click(watchBtn);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Mark Pilot.mp4 as unwatched' })).toBeInTheDocument();
    });

    // Inline delete confirmation for root
    const removeBtn = screen.getByRole('button', { name: 'Remove folder Videos' });
    await user.click(removeBtn);
    const confirmBtn = screen.getByRole('button', { name: 'Remove' });
    await user.click(confirmBtn);

    expect(await screen.findByText('No library folder selected')).toBeInTheDocument();
  });
});

