import { useState, useRef } from 'react';
import PropTypes from 'prop-types';
import http from '../../utils/http';
import { Notice, Collection } from './ManagementUI';
import { errorText, date } from './format';
export default function MemberEditor({ id, suspended, onSaved }) {
  const emailInput = useRef(null);
  const [member, setMember] = useState({ email: '', role: 'member', status: 'active', expiresAt: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [version, setVersion] = useState(0);
  async function save(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      await http.put(`/organisations/${id}/members`, { ...member, expiresAt: member.expiresAt ? new Date(member.expiresAt).toISOString() : null });
      setSuccess('Member access saved. New members can sign in with this email; no invitation email was sent.');
      setMember({ email: '', role: 'member', status: 'active', expiresAt: '' }); setVersion(value => value + 1); onSaved();
    } catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }
  return <section className="management-panel"><h2>Members & access</h2><p className="management-help">Members join sessions. Hosts also create rooms. Administrators manage all members and sessions in this organisation.</p>
    <form className="management-form" onSubmit={save}>
      <label>Member email<input ref={emailInput} required type="email" maxLength={254} value={member.email} onChange={e => setMember({ ...member, email: e.target.value })} /></label>
      <div className="form-pair"><label>Role<select value={member.role} onChange={e => setMember({ ...member, role: e.target.value, expiresAt: e.target.value === 'admin' ? '' : member.expiresAt })}><option value="member">Member</option><option value="host">Host</option><option value="admin">Administrator</option></select></label>
        <label>Access<select value={member.status} onChange={e => setMember({ ...member, status: e.target.value })}><option value="active">Active</option><option value="removed">Removed</option></select></label></div>
      <label>Access expiry (optional, local time)<input type="datetime-local" disabled={member.role === 'admin'} value={member.expiresAt || ''} onChange={e => setMember({ ...member, expiresAt: e.target.value })} /></label><p className="management-help">Leave empty for permanent access. Temporary members and hosts lose access automatically. Administrators require permanent access.</p><p className="management-help">Saving an existing email updates its permissions. Removing access also disconnects its live sessions.</p>
      <button disabled={busy || suspended}>{busy ? 'Saving…' : 'Save member access'}</button><Notice error>{error}</Notice><Notice>{success}</Notice>
    </form>
    <Collection key={version} url={`/organisations/${id}/members`} empty="No members yet." renderItem={item => <article className="management-row" key={item.email}><div><strong className="break-text">{item.email}</strong><p>{item.role} · {item.status} · {item.registered ? 'Registered' : 'Awaiting sign-in'}</p>{item.expires_at && <p>Expires: {date(item.expires_at)}{new Date(item.expires_at) <= new Date() ? ' · Expired' : ''}</p>}</div><button className="secondary" disabled={suspended || busy} onClick={() => { setMember({ email: item.email, role: item.role, status: item.status, expiresAt: item.expires_at ? new Date(new Date(item.expires_at).getTime() - new Date(item.expires_at).getTimezoneOffset() * 60000).toISOString().slice(0,16) : '' }); setSuccess(''); setError(''); emailInput.current?.focus(); emailInput.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }); }}>Edit<span className="sr-only"> {item.email}</span></button></article>} />
  </section>;
}
MemberEditor.propTypes = { id: PropTypes.string, suspended: PropTypes.bool, onSaved: PropTypes.func };
