import { useState } from 'react';
import './ManagementPages.css';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import http from '../utils/http';
import { Page, Notice, Collection, Audit, SectionNav } from '../components/management/ManagementUI';
import { errorText } from '../components/management/format';
export default function AdminPage() {
  const { access, accessError, refreshAccess } = useAuth();
  const [version, setVersion] = useState(0);
  const [section, setSection] = useState('organisations');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({ name: '', slug: '', adminEmail: '' });
  async function create(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      await http.post('/admin/organisations', form);
      setSuccess(`${form.name} is ready. Its administrator can sign in with the email you entered. No invitation email has been sent.`);
      setForm({ name: '', slug: '', adminEmail: '' }); setVersion(value => value + 1);
    } catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }
  return <Page title="Platform administration" intro="Manage organisations and review changes across your platform.">
    {!access ? <section className="management-panel"><Notice error={!!accessError}>{accessError || 'Checking access…'}</Notice>{accessError && <button onClick={refreshAccess}>Retry</button>}</section> : !access.isPlatformAdmin ? <section className="management-panel"><h2>Administrator access required</h2><p>This area is available to authorised platform administrators.</p><Link to="/">Back to my sessions</Link></section> : <>
      <SectionNav selected={section} onSelect={setSection} sections={[{ id: 'organisations', label: 'Organisations' }, { id: 'sessions', label: 'Sessions' }, { id: 'activity', label: 'Activity' }]} />
      {section === 'organisations' && <div className="management-grid"><section className="management-panel"><h2>Organisations</h2><p className="management-help">Your communities, each with its own people and conversations.</p>
        <Collection key={version} url="/admin/organisations" empty="Create your first organisation to get started." renderItem={org => <article className="management-row" key={org.id}>
          <div><Link className="record-title" to={`/organisation/${org.id}`}>{org.name}</Link><p>{org.members} members · {org.sessions} sessions</p></div><span className={`status-pill ${org.status}`}>{org.status}</span>
        </article>} />
      </section><section className="management-panel"><h2>Add an organisation</h2><p className="management-help">Assign its first administrator. They must sign in with this verified Google email.</p>
        <form className="management-form" onSubmit={create}>
          <label>Organisation name<input required maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoComplete="organization" /></label>
          <label>Workspace slug<input required pattern="[a-z0-9][a-z0-9-]{2,59}" minLength={3} maxLength={60} value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value.toLowerCase() })} placeholder="e.g. north-campus" aria-describedby="slug-help" /></label><p id="slug-help" className="management-help">3–60 lowercase letters, numbers or hyphens. Must be unique.</p>
          <label>Administrator email<input type="email" required maxLength={254} value={form.adminEmail} onChange={e => setForm({ ...form, adminEmail: e.target.value })} autoComplete="email" /></label>
          <button disabled={busy}>{busy ? 'Creating…' : 'Create organisation'}</button>
          <Notice error>{error}</Notice><Notice>{success}</Notice>
        </form>
      </section></div>}
      {section === 'sessions' && <section className="management-panel"><h2>All sessions</h2><p className="management-help">Platform-wide oversight of personal and organisation sessions.</p>
        <Collection url="/admin/sessions" empty="No sessions yet." renderItem={room => <article className="management-row" key={room.roomId}><div><h3>{room.topic || 'Untitled session'}</h3><p className="break-text">{room.organisationName || 'Personal'} · {room.hostEmail}</p><p>{room.roomId} · {room.status}</p></div>
          {room.organisationStatus && room.organisationStatus !== 'active' ? <span className="status-pill suspended">Workspace suspended</span> : <div className="row-actions"><Link to={`/host/${room.roomId}`}>Open room</Link><Link to={`/sessions/${room.roomId}`}>Report</Link></div>}
        </article>} />
      </section>}{section === 'activity' && <Audit key={`audit-${version}`} url="/admin/audit" />}
    </>}
  </Page>;
}
