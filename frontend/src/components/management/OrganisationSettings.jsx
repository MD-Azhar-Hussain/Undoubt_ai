import { useState } from 'react';
import PropTypes from 'prop-types';
import http from '../../utils/http';
import { Notice } from './ManagementUI';
import { errorText } from './format';
export default function OrganisationSettings({ organisation, onSaved }) {
  const [name, setName] = useState(organisation.name);
  const [status, setStatus] = useState(organisation.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState('');
  async function save(event) {
    event.preventDefault(); if (busy || (status === 'deleted' && organisation.status !== 'deleted' && confirmation !== organisation.name)) return;
    setBusy(true); setError('');
    try { await http.patch(`/admin/organisations/${organisation.id}`, { name, status }); onSaved(); }
    catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }
  return <section className="management-panel"><h2>Organisation settings</h2><p className="management-help">Platform administrators only. Suspension immediately blocks room access and disconnects live sessions. Deletion blocks organisation access while retaining sessions and audit records. Select Active to restore.</p>
    <form className="management-form settings-form" onSubmit={save}><label>Name<input required maxLength={120} value={name} onChange={e => setName(e.target.value)} /></label><label>Status<select value={status} onChange={e => setStatus(e.target.value)}><option value="active">Active</option><option value="suspended">On hold</option><option value="deleted">Deleted (recoverable)</option></select></label>
      {status === 'deleted' && organisation.status !== 'deleted' && <label className="deletion-confirmation">Type “{organisation.name}” to confirm deletion<input value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off" /></label>}
      <button disabled={busy || (status === 'deleted' && organisation.status !== 'deleted' && confirmation !== organisation.name)}>{busy ? 'Saving…' : 'Save settings'}</button><Notice error>{error}</Notice></form>
  </section>;
}
OrganisationSettings.propTypes = { organisation: PropTypes.object, onSaved: PropTypes.func };
