import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BrowserPlayerModal } from '../components/BrowserPlayerModal';

describe('BrowserPlayerModal', () => {
  it('renders accessible dialog, syncs progress on pause, and closes cleanly', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onProgressSynced = vi.fn();

    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            file_path: '/media/sample.mp4',
            file_hash: 'b'.repeat(64),
            progress_ratio: 0.4,
            watched: false,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <BrowserPlayerModal
        item={{
          name: 'sample.mp4',
          path: '/media/sample.mp4',
          is_dir: false,
          watched: false,
          progress_ratio: 0.2,
          last_position_sec: 40,
          duration: 200,
        }}
        onClose={onClose}
        onProgressSynced={onProgressSynced}
      />,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('sample.mp4')).toBeInTheDocument();

    const videoEl = dialog.querySelector('video');
    expect(videoEl).not.toBeNull();
    if (videoEl) {
      Object.defineProperty(videoEl, 'currentTime', { value: 80, writable: true });
      Object.defineProperty(videoEl, 'duration', { value: 200, writable: true });
      fireEvent.pause(videoEl);
    }

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/file/progress',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(onProgressSynced).toHaveBeenCalled();
    });

    await user.click(screen.getByRole('button', { name: 'Close player' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

