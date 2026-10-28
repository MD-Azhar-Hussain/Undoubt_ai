import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes, Link } from 'react-router-dom';
const { state, get } = vi.hoisted(() => ({ state: { user: { id: 'user' }, loading: false, isAuthenticated: true, acceptAccess: vi.fn() }, get: vi.fn() }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => state }));
vi.mock('../utils/http', () => ({ default: { get } }));
import { ReportProtectedRoute, ManagementProtectedRoute } from './ProtectedRoute';
function mount(path) {
  return render(<MemoryRouter initialEntries={[path]}><Link to="/sessions/654321">Next room</Link><Routes>
    <Route path="/admin" element={<ManagementProtectedRoute platform><p>Private admin tools</p></ManagementProtectedRoute>} />
    <Route path="/organisation/:organisationId" element={<ManagementProtectedRoute><p>Private workspace</p></ManagementProtectedRoute>} />
    <Route path="/sessions/:roomId" element={<ReportProtectedRoute><p>Private report</p></ReportProtectedRoute>} />
    <Route path="/access-denied" element={<p>Denied</p>} /><Route path="/login" element={<p>Sign in</p>} />
  </Routes></MemoryRouter>);
}
beforeEach(() => { get.mockReset(); state.acceptAccess.mockReset(); state.isAuthenticated = true; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('requires fresh platform approval before mounting admin tools', async () => {
  get.mockResolvedValue({ data: { isPlatformAdmin: false } }); mount('/admin');
  expect(screen.queryByText('Private admin tools')).toBeNull();
  await screen.findByText('Denied');
});
it('does not make permission requests when signed out', async () => {
  state.isAuthenticated = false; mount('/admin'); await screen.findByText('Sign in'); expect(get).not.toHaveBeenCalled();
});
it('rejects malformed organisation IDs before fetching', async () => {
  mount('/organisation/invalid'); await screen.findByText('Denied'); expect(get).not.toHaveBeenCalled();
});
it('keeps tools hidden on network errors and permits retry', async () => {
  get.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: { isPlatformAdmin: true } });
  mount('/admin'); fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
  await screen.findByText('Private admin tools');
  expect(state.acceptAccess).toHaveBeenCalledWith({ isPlatformAdmin: true });
});
it('does not carry a previous room permission into the next room', async () => {
  let resolveNext;
  get.mockResolvedValueOnce({ data: { isHost: true } }).mockImplementationOnce(() => new Promise(resolve => { resolveNext = resolve; }));
  mount('/sessions/123456'); await screen.findByText('Private report');
  fireEvent.click(screen.getByRole('link', { name: 'Next room' }));
  expect(screen.queryByText('Private report')).toBeNull();
  await act(async () => resolveNext({ data: { isHost: true } }));
  await screen.findByText('Private report');
});
it('rechecks access when returning to the browser window', async () => {
  const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
  get.mockResolvedValueOnce({ data: { isPlatformAdmin: true } }).mockRejectedValueOnce({ response: { status: 403 } });
  mount('/admin'); await screen.findByText('Private admin tools');
  now.mockReturnValue(61001);
  fireEvent(window, new Event('focus'));
  await screen.findByText('Denied');
});

it('does not recheck or reset report state on rapid window switches', async () => {
  get.mockResolvedValue({ data: { isHost: true } });
  mount('/sessions/123456'); await screen.findByText('Private report');
  for (let i = 0; i < 10; i++) fireEvent(window, new Event('focus'));
  expect(get).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Private report')).toBeTruthy();
});

it('keeps the same report element mounted during successful background verification', async () => {
  const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
  let finish;
  get.mockResolvedValueOnce({ data: { isHost: true } }).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  mount('/sessions/123456'); const original = await screen.findByText('Private report');
  now.mockReturnValue(61001);
  fireEvent(window, new Event('focus'));
  fireEvent(document, new Event('visibilitychange'));
  expect(get).toHaveBeenCalledTimes(2);
  expect(screen.getByText('Private report')).toBe(original);
  await act(async () => finish({ data: { isHost: true } }));
  expect(screen.getByText('Private report')).toBe(original);
});

it('hides a previously approved report if revalidation fails, including during retry', async () => {
  const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
  get.mockResolvedValueOnce({ data: { isHost: true } }).mockRejectedValueOnce(new Error('offline')).mockImplementationOnce(() => new Promise(() => {}));
  mount('/sessions/123456'); await screen.findByText('Private report');
  now.mockReturnValue(61001); fireEvent(window, new Event('focus'));
  const retry = await screen.findByRole('button', { name: 'Try again' });
  expect(screen.queryByText('Private report')).toBeNull();
  fireEvent.click(retry);
  expect(screen.queryByText('Private report')).toBeNull();
});
