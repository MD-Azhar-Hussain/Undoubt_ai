import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
const { authState, http } = vi.hoisted(() => ({
  authState: { access: null, accessError: '', refreshAccess: vi.fn() },
  http: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() },
}));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../utils/http', () => ({ default: http }));
import AdminPage from './AdminPage';
import OrganisationPage from './OrganisationPage';
import CreateRoomPage from './CreateRoomPage';
import OrganisationSettings from '../components/management/OrganisationSettings';
const id = 'd7df3a95-d423-412f-ae49-47184b498e44';
const org = { id, name: 'Campus', status: 'active', role: 'admin' };
function mount(path) {
  render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/admin" element={<AdminPage />} /><Route path="/organisation/:organisationId" element={<OrganisationPage />} /><Route path="/create-room" element={<CreateRoomPage />} /></Routes></MemoryRouter>);
}
beforeEach(() => {
  vi.resetAllMocks();
  authState.access = { isPlatformAdmin: true, organisations: [], personalRoomsAllowed: true };
  authState.accessError = '';
  http.get.mockResolvedValue({ data: { items: [], nextCursor: null } });
});
afterEach(cleanup);

it('does not render platform tools for a normal user or request platform data', () => {
  authState.access.isPlatformAdmin = false;
  mount('/admin');
  expect(screen.getByText('Administrator access required')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Create organisation' })).toBeNull();
  expect(http.get).not.toHaveBeenCalled();
});
it('creates an organisation with an explicit first administrator', async () => {
  http.post.mockResolvedValue({ data: org }); mount('/admin');
  fireEvent.change(screen.getByLabelText('Organisation name'), { target: { value: 'Campus' } });
  fireEvent.change(screen.getByLabelText('Workspace slug'), { target: { value: 'campus' } });
  fireEvent.change(screen.getByLabelText('Administrator email'), { target: { value: 'admin@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create organisation' }));
  await screen.findByText(/Campus is ready/);
  expect(http.post).toHaveBeenCalledWith('/admin/organisations', { name: 'Campus', slug: 'campus', adminEmail: 'admin@example.com' });
  expect(screen.getByLabelText('Organisation name').value).toBe('');
});
it('keeps organisation management unavailable when the server denies access', async () => {
  http.get.mockRejectedValue({ response: { status: 404, data: { message: 'Organisation not found' } } });
  mount(`/organisation/${id}`);
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Organisation not found');
  expect(screen.queryByRole('button', { name: 'Save member access' })).toBeNull();
});
it('shows a failed membership update without claiming success', async () => {
  http.get.mockImplementation(url => Promise.resolve({ data: url === `/organisations/${id}` ? { organisation: org, role: 'admin', summary: { members: 1, sessions: 0, live_sessions: 0 } } : { items: [], nextCursor: null } }));
  http.put.mockRejectedValue({ response: { status: 409, data: { message: 'Add another administrator first' } } });
  mount(`/organisation/${id}`);
  fireEvent.click(await screen.findByRole('button', { name: 'Members & access' }));
  fireEvent.change(await screen.findByLabelText('Member email'), { target: { value: 'admin@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save member access' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Add another administrator first');
  expect(screen.queryByText(/Member access saved/)).toBeNull();
  expect(screen.queryByText('Organisation settings')).toBeNull();
});
it('loads more organisations with the server cursor', async () => {
  http.get.mockImplementation((url, config) => Promise.resolve({ data: url === '/admin/organisations' ? config.params.after ? { items: [{ ...org, id: 'second', name: 'Second campus', members: 1, sessions: 0 }], nextCursor: null } : { items: [{ ...org, members: 1, sessions: 0 }], nextCursor: id } : { items: [], nextCursor: null } }));
  mount('/admin');
  fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));
  await screen.findByText('Second campus');
  expect(screen.getByText('Campus')).toBeTruthy();
  expect(http.get).toHaveBeenCalledWith('/admin/organisations', expect.objectContaining({ params: { after: id } }));
});
it('sends the selected organisation when creating a room', async () => {
  authState.access = { isPlatformAdmin: false, organisations: [org], personalRoomsAllowed: false };
  http.post.mockResolvedValue({ data: { room: { roomId: '123456' } } });
  mount(`/create-room?organisationId=${id}`);
  fireEvent.click(screen.getByRole('button', { name: 'Create Room' }));
  await screen.findByText('Your room is ready');
  expect(http.post).toHaveBeenCalledWith('/rooms', { topic: undefined, organisationId: id });
});
it('does not allow a member to create an organisation session', async () => {
  authState.access = { isPlatformAdmin: false, organisations: [{ ...org, role: 'member' }], personalRoomsAllowed: false };
  mount(`/create-room?organisationId=${id}`);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Create Room' }).disabled).toBe(true));
  expect(http.post).not.toHaveBeenCalled();
});

it('requires the organisation name before submitting recoverable deletion', async () => {
  const saved = vi.fn(); http.patch.mockResolvedValue({ data: org });
  render(<OrganisationSettings organisation={org} onSaved={saved} />);
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'deleted' } });
  const button = screen.getByRole('button', { name: 'Save settings' });
  expect(button.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Type “Campus” to confirm deletion'), { target: { value: 'Wrong' } });
  expect(button.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Type “Campus” to confirm deletion'), { target: { value: 'Campus' } });
  fireEvent.click(button);
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(http.patch).toHaveBeenCalledWith(`/admin/organisations/${id}`, { name: 'Campus', status: 'deleted' });
});
