import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const { handlers, socket } = vi.hoisted(() => {
  const handlers = {};
  const socket = {
    connected: false,
    on: vi.fn((event, handler) => { handlers[event] = handler; }),
    off: vi.fn(event => { delete handlers[event]; }),
    connect: vi.fn(() => { socket.connected = true; handlers.connect?.(); }),
    disconnect: vi.fn(() => { socket.connected = false; }),
    emit: vi.fn(),
    timeout: vi.fn(),
  };
  socket.timeout.mockReturnValue(socket);
  return { handlers, socket };
});
vi.mock('../utils/socket', () => ({ default: socket }));
vi.mock('../utils/http', () => ({ default: { get: vi.fn(), delete: vi.fn() } }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'student', emailAddresses: [{ emailAddress: 'student@example.com' }] } }) }));
import RoomPage from './RoomPage';
import http from '../utils/http';
import { toast } from 'react-toastify';

let joiningAsHost = false;
function mount(role = 'participant') {
  joiningAsHost = role === 'host';
  render(<MemoryRouter initialEntries={['/room/12345']}><Routes><Route path="/room/:roomId" element={<RoomPage />} /><Route path="/access-denied" element={<p>Access denied</p>} /><Route path="/login" element={<p>Sign in again</p>} /></Routes></MemoryRouter>);
}
function joined(canManage = joiningAsHost) {
  const call = socket.emit.mock.calls.find(call => call[0] === 'joinRoom');
  act(() => {
    handlers.roomInfo({ canManage, topic: 'Physics', status: 'active' });
    call.at(-1)(null, { ok: true });
  });
}
beforeEach(() => {
  joiningAsHost = false;
  sessionStorage.clear();
  vi.clearAllMocks(); socket.connected = false; socket.timeout.mockReturnValue(socket);
  vi.spyOn(toast, 'success').mockImplementation(() => 'success');
  vi.spyOn(toast, 'info').mockImplementation(() => 'info');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe('room confirmation and recovery', () => {
  it.each(['/room/12345', '/host/12345'])('opens %s without flashing participant controls before host confirmation', path => {
    render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/room/:roomId" element={<RoomPage />} /><Route path="/host/:roomId" element={<RoomPage />} /></Routes></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Opening your room…' })).toBeTruthy();
    expect(screen.queryByText('PARTICIPANT')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Your question' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close Room' })).toBeNull();
    act(() => handlers.roomInfo({ canManage: true, topic: 'Physics', status: 'active' }));
    expect(screen.getByRole('button', { name: 'Close Room' }).disabled).toBe(true);
    expect(screen.queryByRole('textbox', { name: 'Your question' })).toBeNull();
    joined(true);
    expect(screen.getByText('HOST')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close Room' }).disabled).toBe(false);
    expect(http.get).not.toHaveBeenCalled();
  });
  it('does not treat missing role data or an acknowledgement alone as participant access', () => {
    mount();
    const join = socket.emit.mock.calls.find(call => call[0] === 'joinRoom');
    act(() => { handlers.roomInfo({ topic: 'Physics' }); join.at(-1)(null, { ok: true }); });
    expect(screen.queryByRole('textbox', { name: 'Your question' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Opening your room…' })).toBeTruthy();
    act(() => handlers.roomInfo({ canManage: false, topic: 'Physics', status: 'active' }));
    expect(screen.getByRole('textbox', { name: 'Your question' })).toBeTruthy();
  });
  it('offers recovery after an initial timeout without showing either role', () => {
    mount();
    const join = socket.emit.mock.calls.find(call => call[0] === 'joinRoom');
    act(() => join.at(-1)(new Error('timeout')));
    expect(screen.getByRole('heading', { name: 'Unable to open your room' })).toBeTruthy();
    expect(screen.queryByText('PARTICIPANT')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Your question' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    expect(socket.emit.mock.calls.filter(call => call[0] === 'joinRoom')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Opening your room…' })).toBeTruthy();
  });
  it('preserves the host layout and reply draft through a transient reconnect', () => {
    mount('host'); joined();
    act(() => handlers.existingDoubts([{ id: 'q1', text: 'Explain inertia?', upvotes: 0, upvotedBy: [] }], null));
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    fireEvent.change(screen.getByLabelText('Your reply'), { target: { value: 'Keep this reply draft' } });
    act(() => handlers.disconnect('transport close'));
    expect(screen.getByText('HOST')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close Room' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Save reply' }).disabled).toBe(true);
    expect(screen.queryByRole('textbox', { name: 'Your question' })).toBeNull();
    act(() => handlers.connect());
    expect(screen.getByLabelText('Your reply').value).toBe('Keep this reply draft');
    const join = socket.emit.mock.calls.filter(call => call[0] === 'joinRoom').at(-1);
    act(() => { handlers.roomInfo({ canManage: true, status: 'active' }); join.at(-1)(null, { ok: true }); });
    expect(screen.getByRole('button', { name: 'Save reply' }).disabled).toBe(false);
    expect(screen.queryByRole('textbox', { name: 'Your question' })).toBeNull();
  });
  it('replaces the retained host layout when the server confirms changed permissions', () => {
    mount('host'); joined();
    act(() => handlers.existingDoubts([{ id: 'q1', text: 'Question', upvotes: 0, upvotedBy: [] }], null));
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close Room' }));
    act(() => { handlers.disconnect('transport close'); handlers.connect(); });
    const join = socket.emit.mock.calls.filter(call => call[0] === 'joinRoom').at(-1);
    act(() => { handlers.roomInfo({ canManage: false, status: 'active' }); join.at(-1)(null, { ok: true }); });
    expect(screen.queryByRole('button', { name: 'Close Room' })).toBeNull();
    expect(screen.getByText('PARTICIPANT')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Your question' })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Your reply' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'End this live session?' })).toBeNull();
  });
  it('uses the authenticated socket join without a second HTTP access request', () => {
    mount();
    expect(socket.emit.mock.calls.filter(call => call[0] === 'joinRoom')).toHaveLength(1);
    expect(http.get).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Close Room' })).toBeNull();
    act(() => handlers.roomInfo({ topic: 'Physics', status: 'active', canManage: true }));
    joined(true);
    expect(screen.getByRole('button', { name: 'Close Room' })).toBeTruthy();
    expect(socket.emit.mock.calls.filter(call => call[0] === 'joinRoom')).toHaveLength(1);
  });
  it('does not grant host tools from the URL or a role prop', () => {
    render(<MemoryRouter initialEntries={['/host/12345']}><Routes><Route path="/host/:roomId" element={<RoomPage role="host" />} /></Routes></MemoryRouter>);
    joined();
    act(() => handlers.roomInfo({ topic: 'Physics', status: 'active', canManage: false }));
    expect(screen.queryByRole('button', { name: 'Close Room' })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Your question' })).toBeTruthy();
  });
  it.each([401, 403, 404])('rejects a denied socket join (%s) without host controls', status => {
    mount();
    const join = socket.emit.mock.calls.find(call => call[0] === 'joinRoom');
    act(() => join.at(-1)(null, { ok: false, status, message: 'Denied' }));
    expect(screen.getByText(status === 401 ? 'Sign in again' : 'Access denied')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Close Room' })).toBeNull();
  });
  it('removes host controls and room data on a server-side access disconnect', () => {
    mount('host'); joined();
    act(() => handlers.existingDoubts([{ id: 'q', text: 'Private room question', upvotes: 0, upvotedBy: [] }], null));
    expect(screen.getByRole('button', { name: 'Close Room' })).toBeTruthy();
    act(() => handlers.disconnect('io server disconnect'));
    expect(screen.queryByRole('button', { name: 'Close Room' })).toBeNull();
    expect(screen.queryByText('Private room question')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Your question' })).toBeNull();
  });
  it('does not erase a second draft when an earlier submission finishes', () => {
    mount(); joined();
    const input = screen.getByRole('textbox', { name: 'Your question' });
    fireEvent.change(input, { target: { value: 'First question' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Doubt' }));
    const sending = socket.emit.mock.calls.find(call => call[0] === 'newDoubt');
    fireEvent.change(input, { target: { value: 'The next question I am writing' } });
    act(() => sending.at(-1)(null, { ok: true }));
    expect(input.value).toBe('The next question I am writing');
    expect(screen.getByText('Draft saved in this tab')).toBeTruthy();
  });
  it('keeps an unconfirmed submission and its retry key after leaving and returning to the page', () => {
    mount(); joined();
    fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'Keep across refresh' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Doubt' }));
    const first = socket.emit.mock.calls.find(call => call[0] === 'newDoubt');
    act(() => first.at(-1)(new Error('timeout')));
    cleanup(); socket.emit.mockClear();
    mount(); joined();
    expect(screen.getByRole('textbox', { name: 'Your question' }).value).toBe('Keep across refresh');
    fireEvent.click(screen.getByRole('button', { name: 'Submit Doubt' }));
    const retry = socket.emit.mock.calls.find(call => call[0] === 'newDoubt');
    expect(retry[2].requestId).toBe(first[2].requestId);
  });
  it('submits with Ctrl+Enter only after joining and prevents a second in-flight request', () => {
    mount();
    act(() => handlers.roomInfo({ canManage: false, status: 'active' }));
    const input = screen.getByRole('textbox', { name: 'Your question' });
    fireEvent.change(input, { target: { value: 'Keyboard question' } });
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    expect(socket.emit.mock.calls.filter(call => call[0] === 'newDoubt')).toHaveLength(0);
    joined();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(socket.emit.mock.calls.filter(call => call[0] === 'newDoubt')).toHaveLength(0);
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    expect(socket.emit.mock.calls.filter(call => call[0] === 'newDoubt')).toHaveLength(1);
  });
  it('shows pending vote feedback without claiming success and releases it on rejection', () => {
    mount(); joined();
    act(() => handlers.existingDoubts([{ id: 'q', text: 'Voting question', upvotes: 0, upvotedBy: [] }], null));
    fireEvent.click(screen.getByTitle('Upvote'));
    expect(screen.getByRole('button', { name: 'Saving vote…' }).disabled).toBe(true);
    const sending = socket.emit.mock.calls.find(call => call[0] === 'upvoteDoubt');
    act(() => sending.at(-1)(null, { ok: false }));
    expect(screen.getByTitle('Upvote').disabled).toBe(false);
    expect(screen.queryByText('Upvoted')).toBeNull();
  });
  it('sorts loaded questions and can clear filters without losing the feed', () => {
    mount(); joined();
    act(() => handlers.existingDoubts([
      { id: 'older', text: 'Older popular question', createdAt: '2026-01-01', upvotes: 10, upvotedBy: [], isOwn: true },
      { id: 'newer', text: 'Newer question', createdAt: '2026-01-02', upvotes: 1, upvotedBy: [], isOwn: false },
    ], null));
    expect(screen.getAllByText(/^(Older popular question|Newer question)$/).map(node => node.textContent)).toEqual(['Older popular question', 'Newer question']);
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort questions' }), { target: { value: 'newest' } });
    expect(screen.getAllByText(/^(Older popular question|Newer question)$/).map(node => node.textContent)).toEqual(['Newer question', 'Older popular question']);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'No match' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('Newer question')).toBeTruthy();
  });
  it('reuses a submission key after an acknowledgement timeout and recovers from the retry response', () => {
    mount(); joined();
    fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'Retry this question' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Doubt' }));
    const first = socket.emit.mock.calls.find(call => call[0] === 'newDoubt');
    expect(first[2].requestId).toMatch(/^[0-9a-f-]{36}$/i);
    act(() => first.at(-1)(new Error('timeout')));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Doubt' }));
    const second = socket.emit.mock.calls.filter(call => call[0] === 'newDoubt').at(-1);
    expect(second[2]).toEqual(first[2]);
    act(() => second.at(-1)(null, { ok: true, doubt: { id: 'saved', text: 'Retry this question', isOwn: true, upvotes: 0, upvotedBy: [], revision: 0 } }));
    expect(screen.getAllByText('Retry this question')).toHaveLength(1);
    expect(screen.getByRole('textbox', { name: 'Your question' }).value).toBe('');
  });
  it('preserves new questions and newer updates received before an older join snapshot', () => {
    mount();
    act(() => {
      handlers.newDoubt({ id: 'live', text: 'Live question', upvotes: 0, upvotedBy: [], revision: 0 });
      handlers.upvoteDoubt({ doubtId: 'snapshot', upvotes: 8, revision: 8 });
      handlers.existingDoubts([{ id: 'snapshot', text: 'Snapshot question', upvotes: 1, upvotedBy: [], revision: 1 }], null);
    });
    joined();
    expect(screen.getByText('Live question')).toBeTruthy();
    expect(screen.getByText('8 upvotes')).toBeTruthy();
    expect(screen.queryByText('1 upvotes')).toBeNull();
  });
  it('does not overwrite a newer reply when a stale new-question event arrives', () => {
    mount(); joined();
    const original = { id: 'q1', text: 'What happens?', upvotes: 0, upvotedBy: [], revision: 0 };
    act(() => {
      handlers.newDoubt(original);
      handlers.markAsAnswered('q1', true, { answered: true, answer: 'Keep this answer', upvotes: 0, revision: 2 });
      handlers.newDoubt(original);
    });
    fireEvent.click(screen.getByRole('button', { name: /^Answered/ }));
    expect(screen.getByText('Keep this answer')).toBeTruthy();
  });
  it('reloads older pages after reconnect instead of presenting potentially stale offline records', () => {
    mount(); joined();
    act(() => handlers.existingDoubts([{ id: 'old', text: 'Old loaded question', upvotes: 0, upvotedBy: [], revision: 0 }], null));
    act(() => {
      handlers.connect();
      handlers.existingDoubts([{ id: 'recent', text: 'Recent question', upvotes: 0, upvotedBy: [], revision: 0 }], '100');
    });
    expect(screen.queryByText('Old loaded question')).toBeNull();
    expect(screen.getByText('Recent question')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Load earlier questions' })).toBeTruthy();
  });
  it('renders large feeds in manageable pages and groups burst notifications', () => {
    mount(); joined();
    act(() => {
      for (let i = 0; i < 120; i++) handlers.newDoubt({ id: `q${i}`, text: `Question number ${i}`, upvotes: 0, upvotedBy: [], revision: 0 });
    });
    expect(screen.getAllByText(/^Question number /)).toHaveLength(50);
    expect(toast.info).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Show more questions' }));
    expect(screen.getAllByText(/^Question number /)).toHaveLength(100);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Question number 119' } });
    expect(screen.getByText('Question number 119')).toBeTruthy();
  });
  it('notifies the author once when both broadcast and submission confirmation arrive', () => {
    mount(); joined();
    fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'A question' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Doubt' }));
    const call = socket.emit.mock.calls.find(call => call[0] === 'newDoubt');
    const question = { id: 'q1', text: 'A question', isOwn: true, upvotes: 0, upvotedBy: [], answered: false };
    act(() => {
      handlers.newDoubt(question);
      handlers.newDoubt(question);
      call.at(-1)(null, { ok: true });
    });
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.info).not.toHaveBeenCalled();
    expect(screen.getAllByText('A question')).toHaveLength(1);
    expect(screen.getByRole('textbox', { name: 'Your question' }).value).toBe('');
  });
  it('shows one notification per peer question and answered event', () => {
    mount(); joined();
    const question = { id: 'q1', text: 'Peer question', isOwn: false, upvotes: 0, upvotedBy: [], answered: false };
    act(() => {
      handlers.newDoubt(question);
      handlers.newDoubt(question);
      handlers.markAsAnswered('q1', true);
      handlers.markAsAnswered('q1', true);
    });
    expect(toast.info).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledTimes(1);
  });
  it('keeps submission disabled until the server confirms room access', () => {
    mount();
    act(() => handlers.roomInfo({ canManage: false, status: 'active' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'How does this work?' } });
    expect(screen.getByRole('button', { name: 'Submit Doubt' }).disabled).toBe(true);
    joined();
    expect(screen.getByRole('button', { name: 'Submit Doubt' }).disabled).toBe(false);
  });
  it('previews a vote immediately and rolls it back when rejected', () => {
    mount(); joined();
    act(() => handlers.existingDoubts([{ id: 'q1', text: 'Why?', user: 'Participant', upvotes: 0, upvotedBy: [], answered: false }], null));
    fireEvent.click(screen.getByTitle('Upvote'));
    expect(screen.getByTitle('Remove upvote').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('1 upvotes')).toBeTruthy();
    const call = socket.emit.mock.calls.find(call => call[0] === 'upvoteDoubt');
    act(() => call.at(-1)(null, { ok: false, message: 'Room closed' }));
    expect(screen.queryByTitle('Remove upvote')).toBeNull();
    expect(screen.getByTitle('Upvote')).toBeTruthy();
    expect(screen.getByText('0 upvotes')).toBeTruthy();
  });
  it('does not double-count an optimistic vote or overwrite a newer peer revision', () => {
    mount(); joined();
    act(() => handlers.existingDoubts([{ id: 'q1', text: 'Why?', upvotes: 4, revision: 4, upvotedBy: [], answered: false }], null));
    fireEvent.click(screen.getByTitle('Upvote'));
    const call = socket.emit.mock.calls.find(call => call[0] === 'upvoteDoubt');
    expect(screen.getByText('5 upvotes')).toBeTruthy();
    act(() => handlers.upvoteDoubt({ doubtId: 'q1', upvotes: 6, revision: 6 }));
    expect(screen.getByText('6 upvotes')).toBeTruthy();
    act(() => call.at(-1)(null, { ok: true, voted: true, upvotes: 5, revision: 5 }));
    expect(screen.getByText('6 upvotes')).toBeTruthy();
    expect(screen.getByTitle('Remove upvote').disabled).toBe(false);
  });
  it('previews vote removal and restores it on timeout', () => {
    mount(); joined();
    act(() => handlers.existingDoubts([{ id: 'q1', text: 'Why?', upvotes: 2, revision: 2, upvotedBy: ['student'] }], null));
    fireEvent.click(screen.getByTitle('Remove upvote'));
    expect(screen.getByText('1 upvotes')).toBeTruthy();
    const call = socket.emit.mock.calls.find(call => call[0] === 'downvoteDoubt');
    act(() => call.at(-1)(new Error('timeout')));
    expect(screen.getByText('2 upvotes')).toBeTruthy();
    expect(screen.getByTitle('Remove upvote')).toBeTruthy();
  });
  it('shows a sending question immediately, then replaces it with the committed question', () => {
    mount(); joined();
    fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'Immediate feedback' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Doubt' }));
    expect(screen.getByText('Sending your question…')).toBeTruthy();
    expect(screen.getAllByText('Immediate feedback').length).toBeGreaterThan(0);
    const call = socket.emit.mock.calls.find(call => call[0] === 'newDoubt');
    act(() => call.at(-1)(null, { ok: true, doubt: { id: 'q1', text: 'Immediate feedback', upvotes: 0, upvotedBy: [], isOwn: true } }));
    expect(screen.queryByText('Sending your question…')).toBeNull();
    expect(screen.getAllByText('Immediate feedback')).toHaveLength(1);
  });
  it('resynchronizes on a delivery failure without a page refresh', () => {
    mount(); joined();
    act(() => { for (let i = 0; i < 20; i++) handlers.syncRequired(); });
    expect(socket.emit.mock.calls.filter(call => call[0] === 'joinRoom')).toHaveLength(2);
    expect(http.get).not.toHaveBeenCalled();
  });
  it('ignores an old join acknowledgement after the connection changes', () => {
    mount();
    const oldJoin = socket.emit.mock.calls.find(call => call[0] === 'joinRoom');
    act(() => { handlers.disconnect('transport close'); handlers.connect(); });
    act(() => handlers.roomInfo({ canManage: false, status: 'active' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'Wait for current access' } });
    act(() => oldJoin.at(-1)(null, { ok: true }));
    expect(screen.getByRole('button', { name: 'Submit Doubt' }).disabled).toBe(true);
    const current = socket.emit.mock.calls.filter(call => call[0] === 'joinRoom').at(-1);
    act(() => current.at(-1)(null, { ok: true }));
    expect(screen.getByRole('button', { name: 'Submit Doubt' }).disabled).toBe(false);
  });
  it('ignores older vote broadcasts and rejoins after reconnecting', () => {
    mount(); joined();
    act(() => handlers.existingDoubts([{ id: 'q1', text: 'Why?', user: 'Participant', upvotes: 0, revision: 0, upvotedBy: [], answered: false }], null));
    act(() => {
      handlers.upvoteDoubt({ doubtId: 'q1', upvotes: 3, revision: 3 });
      handlers.upvoteDoubt({ doubtId: 'q1', upvotes: 1, revision: 1 });
      handlers.connect();
    });
    expect(screen.getByText('3 upvotes')).toBeTruthy();
    expect(socket.emit.mock.calls.filter(call => call[0] === 'joinRoom')).toHaveLength(2);
  });
});

describe('closed-session follow-up', () => {
  const question = { id: 'q1', text: 'Explain inertia?', isOwn: true, upvotes: 2, upvotedBy: [], answered: false, revision: 0 };
  it('lets the host save a written reply after closure', async () => {
    mount('host'); joined();
    act(() => { handlers.roomInfo({ canManage: true, topic: 'Physics', status: 'closed' }); handlers.existingDoubts([question], null); });
    expect(screen.queryByRole('button', { name: 'Close Room' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reply', exact: true }));
    fireEvent.change(screen.getByLabelText('Your reply'), { target: { value: 'Resistance to changes in motion.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save reply' }));
    expect(screen.getByText('Sending reply…')).toBeTruthy();
    const call = socket.emit.mock.calls.find(c => c[0] === 'markAsAnswered');
    expect(call.slice(0, 4)).toEqual(['markAsAnswered', '12345', 'q1', 'Resistance to changes in motion.']);
    await act(async () => call.at(-1)(null, { ok: true, update: { answered: true, answer: call[3], revision: 1 } }));
    fireEvent.click(screen.getByRole('button', { name: /^Answered/ }));
    expect(screen.getByText('Resistance to changes in motion.')).toBeTruthy();
  });
  it('keeps a rejected reply draft for retrying', async () => {
    mount('host'); joined();
    act(() => handlers.existingDoubts([question], null));
    fireEvent.click(screen.getByRole('button', { name: 'Reply', exact: true }));
    fireEvent.change(screen.getByLabelText('Your reply'), { target: { value: 'Keep my draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save reply' }));
    const call = socket.emit.mock.calls.find(c => c[0] === 'markAsAnswered');
    await act(async () => call.at(-1)(null, { ok: false }));
    expect(screen.getByLabelText('Your reply').value).toBe('Keep my draft');
  });
  it('disables asking and voting in closed rooms but shows live replies', () => {
    mount(); joined();
    act(() => { handlers.existingDoubts([question], null); handlers.roomClosed(); });
    expect(screen.queryByRole('button', { name: 'Submit Doubt' })).toBeNull();
    expect(screen.getByTitle('Upvote').disabled).toBe(true);
    act(() => handlers.markAsAnswered('q1', true, { answered: true, answer: 'A saved reply', revision: 1 }));
    fireEvent.click(screen.getByRole('button', { name: /^Answered/ }));
    expect(screen.getByText('A saved reply')).toBeTruthy();
  });
  it('filters questions by search and ownership', () => {
    mount(); joined();
    act(() => handlers.existingDoubts([question, { ...question, id: 'q2', text: 'Explain gravity?', isOwn: false }], null));
    fireEvent.click(screen.getByRole('button', { name: 'My questions' }));
    expect(screen.queryByText('Explain gravity?')).toBeNull();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'inertia' } });
    expect(screen.getByText('Explain inertia?')).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'missing' } });
    expect(screen.queryByText('Explain inertia?')).toBeNull();
  });
});

describe('mobile disclosure controls', () => {
  it('lets a participant show and hide the room QR without host powers', () => {
    mount(); joined();
    fireEvent.click(screen.getByRole('button', { name: 'Session options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show QR' }));
    expect(screen.getByRole('button', { name: 'Hide QR' }).getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById('room-qr').querySelector('svg')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Close Room' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Hide QR' }));
    expect(document.getElementById('room-qr')).toBeNull();
  });
  it('keeps a question draft when the composer is collapsed and reopened', () => {
    mount(); joined();
    const toggle = screen.getByRole('button', { name: 'Ask a question' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'Keep this draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue your question' }));
    expect(screen.getByRole('button', { name: 'Continue your question' }).getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Continue your question' }));
    expect(screen.getByRole('textbox', { name: 'Your question' }).value).toBe('Keep this draft');
  });
  it('opens session actions without closing or leaving the room', () => {
    mount('host'); joined();
    const options = screen.getByRole('button', { name: 'Session options' });
    expect(options.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(options);
    expect(options.getAttribute('aria-expanded')).toBe('true');
    expect(socket.emit.mock.calls.some(call => call[0] === 'closeRoom')).toBe(false);
    expect(screen.queryByRole('heading', { name: 'End this live session?' })).toBeNull();
  });
});
