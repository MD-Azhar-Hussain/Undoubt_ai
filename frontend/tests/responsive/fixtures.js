export const useAuth = () => ({ user: { id: 'sample-student' } });
const questions = [
  { id: 'sample-1', text: 'Why does an object keep moving when no force is applied? Could you explain with an everyday example?', upvotes: 12, upvotedBy: [], revision: 0, isOwn: true, answered: false, user: 'student@example.test' },
  { id: 'sample-2', text: 'How are mass and weight different?', upvotes: 7, upvotedBy: [], revision: 0, isOwn: false, answered: true, answer: 'Mass describes how much matter an object contains. Weight is the force of gravity acting on that mass. Your mass stays the same on the Moon, but your weight is lower.', user: 'student@example.test' },
];
const handlers = new Map();
const socket = {
  connected: false,
  on(event, fn) { handlers.set(event, fn); },
  off(event) { handlers.delete(event); },
  connect() { this.connected = true; handlers.get('connect')?.(); },
  disconnect() { this.connected = false; },
  timeout() { return this; },
  emit(event, ...args) {
    const ack = typeof args.at(-1) === 'function' ? args.pop() : () => {};
    if (event === 'joinRoom') {
      handlers.get('roomInfo')?.({ topic: 'Understanding motion', status: 'active', canManage: new URLSearchParams(window.location.search).get('role') === 'host' });
      handlers.get('existingDoubts')?.(questions, null);
    }
    ack(null, { ok: true });
  },
  get: async () => ({ data: { doubts: questions, nextCursor: null } }),
  delete: async () => { handlers.get('roomClosed')?.(); },
};
export default socket;
