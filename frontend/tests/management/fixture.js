const organisation = { id: '11111111-1111-4111-8111-111111111111', name: 'North Campus · Engineering & Applied Sciences', slug: 'north-campus', status: 'active', members: 82, sessions: 16 };
export const useAuth = () => ({ access: { isPlatformAdmin: true, organisations: [{ ...organisation, role: 'admin' }] }, refreshAccess() {} });
const list = items => ({ data: { items, nextCursor: null } });
const reject = async () => { throw new Error('Preview only. No live writes.'); };
export default {
  async get(url) {
    if (url === '/admin/organisations') return list([organisation]);
    if (url.endsWith('/members')) return list([{ email: 'administrator@campus.example', role: 'admin', status: 'active', registered: true }, { email: 'visiting.researcher.with.a.long.email@conference.example', role: 'member', status: 'active', expires_at: '2030-12-01T16:00:00.000Z', registered: false }]);
    if (url.endsWith('/sessions')) return list([{ roomId: '123456', topic: 'Questions from the annual engineering workshop', status: 'closed', hostEmail: 'teacher@campus.example', organisationName: organisation.name }]);
    if (url.endsWith('/audit')) return list([{ id: '1', action: 'membership.updated', target: 'visiting.researcher@conference.example', actor_id: 'sample-admin', details: { role: 'member', previousRole: null }, created_at: '2026-10-23T10:00:00.000Z' }]);
    return { data: { organisation, role: 'platform_admin', summary: { members: 82, sessions: 16, live_sessions: 3 } } };
  }, post: reject, patch: reject, put: reject,
};
