import { useEffect, useState } from 'react';
import './ManagementPages.css';
import PropTypes from 'prop-types';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import http from '../utils/http';
import { Page, Notice, Collection, Audit, SectionNav } from '../components/management/ManagementUI';
import { errorText } from '../components/management/format';
import MemberEditor from '../components/management/MemberEditor';
import OrganisationSettings from '../components/management/OrganisationSettings';
export default function OrganisationPage() {
  const { organisationId } = useParams();
  const { access, accessError, refreshAccess } = useAuth();
  if (organisationId) return <OrganisationDetail key={organisationId} id={organisationId} />;
  return <Page title="Your organisations" intro="Keep each community’s sessions and membership in its own workspace.">
    <section className="management-panel">
      {!access ? <><Notice error={!!accessError}>{accessError || 'Loading your workspaces…'}</Notice>{accessError && <button onClick={refreshAccess}>Retry</button>}</> : <>
        {access.isPlatformAdmin && <p><Link to="/admin">Manage all organisations →</Link></p>}
        {!access.organisations.some(org => org.role === 'admin') && <p className="management-empty">Organisation administrator access is required. Only your own managed workspaces appear here.</p>}
        <div className="management-list">{access.organisations.filter(org => org.role === 'admin').map(org => <article className="management-row" key={org.id}><div><h2>{org.name}</h2><p>{org.role === 'admin' ? 'Administrator' : org.role === 'host' ? 'Host' : 'Member'} · {org.status}</p></div>
          {org.role === 'admin' ? <Link className="button-link secondary" to={`/organisation/${org.id}`}>Manage</Link> : org.status === 'active' && <Link className="button-link secondary" to={org.role === 'host' ? `/create-room?organisationId=${org.id}` : '/join-room'}>{org.role === 'host' ? 'Host a session' : 'Join a session'}</Link>}
        </article>)}</div><button className="secondary" onClick={refreshAccess}>Refresh access</button>
      </>}
    </section>
  </Page>;
}

function OrganisationDetail({ id }) {
  const { access } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [section, setSection] = useState('sessions');
  useEffect(() => {
    const controller = new AbortController(); setError('');
    http.get(`/organisations/${id}`, { signal: controller.signal }).then(({ data }) => { if (!controller.signal.aborted) setData(data); }).catch(error => { if (!controller.signal.aborted) setError(errorText(error)); });
    return () => controller.abort();
  }, [id, version]);
  const refresh = () => setVersion(value => value + 1);
  return <Page title={data?.organisation.name || 'Organisation'} intro="Manage access, follow your sessions and keep questions moving towards answers.">
    <Link className="back-link" to={access?.isPlatformAdmin ? '/admin' : '/organisation'}>← All organisations</Link>
    {error ? <section className="management-panel"><Notice error>{error}</Notice><button className="secondary" onClick={refresh}>Retry</button></section> : !data ? <Notice>Loading workspace…</Notice> : <>
      {data.organisation.status !== 'active' && <Notice>This organisation is unavailable. Sessions and membership changes are paused until a platform administrator restores access.</Notice>}
      <div className="management-stats"><div><strong>{data.summary.members}</strong><span>Active members</span></div><div><strong>{data.summary.sessions}</strong><span>Total sessions</span></div><div><strong>{data.summary.live_sessions}</strong><span>Open sessions</span></div></div>
      <SectionNav selected={section} onSelect={setSection} sections={[{ id: 'sessions', label: 'Sessions' }, { id: 'members', label: 'Members & access' }, { id: 'activity', label: 'Activity' }, ...(data.role === 'platform_admin' ? [{ id: 'settings', label: 'Settings' }] : [])]} />
      {section === 'sessions' && <section className="management-panel"><div className="panel-heading"><h2>Sessions</h2>{data.organisation.status === 'active' && <Link className="button-link" to={`/create-room?organisationId=${id}`}>Create session</Link>}</div>
        <p className="management-help">Closed sessions remain available for reports and follow-up replies.</p>
        <Collection key={`sessions-${version}`} url={`/organisations/${id}/sessions`} empty="No sessions yet." renderItem={room => <article className="management-row" key={room.roomId}>
          <div><h3>{room.topic || 'Untitled session'}</h3><p className="break-text">{room.hostEmail}</p><p><span className="font-mono">{room.roomId}</span> · {room.status}</p></div>
          {data.organisation.status === 'active' && <div className="row-actions"><Link to={`/host/${room.roomId}`}>Open room</Link><Link to={`/sessions/${room.roomId}`}>Report</Link></div>}
        </article>} />
      </section>}{section === 'members' && <MemberEditor id={id} suspended={data.organisation.status !== 'active'} onSaved={refresh} />}
      {section === 'settings' && data.role === 'platform_admin' && <OrganisationSettings organisation={data.organisation} onSaved={refresh} />}
      {section === 'activity' && <Audit key={`audit-${version}`} url={`/organisations/${id}/audit`} />}
    </>}
  </Page>;
}
OrganisationDetail.propTypes = { id: PropTypes.string.isRequired };
