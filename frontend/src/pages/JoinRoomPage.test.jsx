import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import JoinRoomPage from './JoinRoomPage';
import http from '../utils/http';
vi.mock('../utils/http', () => ({ default: { get: vi.fn() } }));
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
function mount() {
  render(<MemoryRouter initialEntries={['/join-room']}><Routes><Route path="/join-room" element={<JoinRoomPage />} /><Route path="/room/:roomId" element={<p>Room opened</p>} /><Route path="/host/:roomId" element={<p>Host opened</p>} /></Routes></MemoryRouter>);
}
describe('joining without retyping room links', () => {
  it('takes a verified manager directly to the host gate without a participant redirect', async () => {
    http.get.mockResolvedValue({ data: { exists: true, room: { canManage: true } } });
    mount();
    fireEvent.change(screen.getByLabelText('Room code'), { target: { value: '482916' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join Room' }));
    await screen.findByText('Host opened');
    expect(http.get).toHaveBeenCalledTimes(1);
  });
  it.each(['482 916', '482-916', '482916', `${window.location.origin}/room/482916`, `${window.location.origin}/join-room/482916?from=share`])('accepts %s', async value => {
    http.get.mockResolvedValue({ data: { exists: true, room: {} } });
    mount();
    fireEvent.change(screen.getByLabelText('Room code'), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'Join Room' }));
    await screen.findByText('Room opened');
    expect(http.get).toHaveBeenCalledWith('/rooms/482916');
  });
  it('keeps the code and shows an inline error when the server rejects joining', async () => {
    http.get.mockRejectedValue({ response: { data: { message: 'Your organisation access has expired' } } });
    mount();
    fireEvent.change(screen.getByLabelText('Room code'), { target: { value: '482916' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join Room' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('alert').textContent).toContain('access has expired');
    expect(screen.getByLabelText('Room code').value).toBe('482916');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Join Room' }).disabled).toBe(false));
  });
  it.each(['https://attacker.invalid/room/482916', '../admin', '12 34', `${window.location.origin}/admin`])('rejects malformed or unrelated input %s without a request', value => {
    mount();
    fireEvent.change(screen.getByLabelText('Room code'), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'Join Room' }));
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(http.get).not.toHaveBeenCalled();
  });
});
