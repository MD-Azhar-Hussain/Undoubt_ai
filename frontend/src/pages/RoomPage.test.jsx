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
import { toast } from 'react-toastify';

function mount(role = 'participant') {
  render(<MemoryRouter initialEntries={['/room/12345']}><Routes><Route path="/room/:roomId" element={<RoomPage role={role} />} /></Routes></MemoryRouter>);
}
function joined() {
  const call = socket.emit.mock.calls.find(call => call[0] === 'joinRoom');
  act(() => call.at(-1)(null, { ok: true }));
}
beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks(); socket.connected = false; socket.timeout.mockReturnValue(socket);
  vi.spyOn(toast, 'success').mockImplementation(() => 'success');
  vi.spyOn(toast, 'info').mockImplementation(() => 'info');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe('room confirmation and recovery', () => {
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
    fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'How does this work?' } });
    expect(screen.getByRole('button', { name: 'Submit Doubt' }).disabled).toBe(true);
    joined();
    expect(screen.getByRole('button', { name: 'Submit Doubt' }).disabled).toBe(false);
  });
  it('does not claim an upvote when the server rejects it', () => {
    mount(); joined();
    act(() => handlers.existingDoubts([{ id: 'q1', text: 'Why?', user: 'Participant', upvotes: 0, upvotedBy: [], answered: false }], null));
    fireEvent.click(screen.getByTitle('Upvote'));
    const call = socket.emit.mock.calls.find(call => call[0] === 'upvoteDoubt');
    act(() => call.at(-1)(null, { ok: false, message: 'Room closed' }));
    expect(screen.queryByTitle('Remove upvote')).toBeNull();
    expect(screen.getByTitle('Upvote')).toBeTruthy();
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
    act(() => { handlers.roomInfo({ topic: 'Physics', status: 'closed' }); handlers.existingDoubts([question], null); });
    expect(screen.queryByRole('button', { name: 'Close Room' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reply', exact: true }));
    fireEvent.change(screen.getByLabelText('Your reply'), { target: { value: 'Resistance to changes in motion.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save reply' }));
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
