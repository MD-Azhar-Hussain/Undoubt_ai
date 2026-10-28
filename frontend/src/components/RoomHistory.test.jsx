import { afterEach, beforeEach, it, expect, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RoomHistory from './RoomHistory';
import http from '../utils/http';
vi.mock('../utils/http', () => ({ default: { get: vi.fn() } }));
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());
it('shows hosted and joined history with correct closed-room destinations', async () => {
  http.get.mockResolvedValue({ data: { rooms: [
    { roomId: '123456', topic: 'Hosted physics', role: 'host', status: 'closed', unanswered: 1, createdAt: '2026-10-22' },
    { roomId: '234567', topic: 'Joined maths', role: 'participant', status: 'closed', unanswered: 2, createdAt: '2026-10-22' },
  ] } });
  render(<MemoryRouter><RoomHistory /></MemoryRouter>);
  expect((await screen.findByRole('link', { name: 'Review & reply' })).getAttribute('href')).toBe('/host/123456');
  expect(screen.getByRole('link', { name: 'View questions & replies' }).getAttribute('href')).toBe('/room/234567');
  fireEvent.click(screen.getByRole('button', { name: 'Joined', exact: true }));
  expect(screen.queryByText('Hosted physics')).toBeNull();
  expect(screen.getByText('Joined maths')).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Report' })).toBeNull();
});
it('allows retrying a failed history request', async () => {
  http.get.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: { rooms: [] } });
  render(<MemoryRouter><RoomHistory /></MemoryRouter>);
  await screen.findByText('Session history is unavailable. Please try again.');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(await screen.findByText('Create or join a room. Your sessions will be saved here.')).toBeTruthy();
});
