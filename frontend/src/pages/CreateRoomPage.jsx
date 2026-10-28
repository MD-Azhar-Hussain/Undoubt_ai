import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { FaCopy } from 'react-icons/fa';
import http from '../utils/http';
import { toast } from 'react-toastify';
import { FRONTEND_URL } from '../utils/constants';
import { useAuth } from '../contexts/AuthContext';

export default function CreateRoomPage() {
  const { access, accessError, refreshAccess } = useAuth();
  const [search] = useSearchParams();
  const [organisationId, setOrganisationId] = useState(search.get('organisationId') || '');
  const [platformOrganisation, setPlatformOrganisation] = useState(null);
  const [workspaceError, setWorkspaceError] = useState('');
  const organisations = access?.organisations.filter(org => org.status === 'active' && ['admin', 'host'].includes(org.role)) || [];
  if (platformOrganisation && !organisations.some(org => org.id === platformOrganisation.id)) organisations.push(platformOrganisation);
  const requestedOrganisation = search.get('organisationId');
  useEffect(() => {
    if (!access?.isPlatformAdmin || !requestedOrganisation) return;
    const controller = new AbortController();
    http.get(`/organisations/${requestedOrganisation}`, { signal: controller.signal }).then(({ data }) => {
      if (controller.signal.aborted) return;
      if (data.organisation.status === 'active') setPlatformOrganisation(data.organisation);
      else setWorkspaceError('This organisation is suspended.');
    }).catch(error => { if (!controller.signal.aborted) setWorkspaceError(error.response?.data?.message || 'Could not load organisation.'); });
    return () => controller.abort();
  }, [access?.isPlatformAdmin, requestedOrganisation]);
  const canCreate = access && (organisationId ? organisations.some(org => org.id === organisationId) : access.personalRoomsAllowed);
  const [roomId, setRoomId] = useState('');
  const [creating, setCreating] = useState(false);
  const [topic, setTopic] = useState('');
  const navigate = useNavigate();
  const create = async event => {
    event.preventDefault();
    if (creating || roomId || !canCreate) return;
    setCreating(true);
    try {
      const { data } = await http.post('/rooms', { topic: topic.trim() || undefined, organisationId: organisationId || undefined });
      setRoomId(data.room.roomId);
    } catch (error) { toast.error(error.response?.data?.message || 'Could not create the room. Please try again.'); }
    finally { setCreating(false); }
  };
  const copy = async value => {
    try { await navigator.clipboard.writeText(value); toast.success('Copied to clipboard'); }
    catch { toast.error('Could not copy. Select and copy the code or link below.'); }
  };
  const joinLink = `${FRONTEND_URL}/room/${roomId}`;
  return <main className="form-screen create-screen min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white px-4 py-10 sm:py-16">
    <div className="max-w-lg mx-auto">
      <Link to="/" className="inline-block py-2 text-blue-200 underline">Back to sessions</Link>
      <section className="form-card mt-6 rounded-2xl border border-white/15 bg-white/5 p-5 sm:p-8">
        <h1 className="text-3xl font-bold">{roomId ? 'Your room is ready' : 'Create a room'}</h1>
        <p className="text-gray-300 mt-3">{roomId ? 'Share the code or link, then open your host view when you’re ready.' : 'Give your session a topic so everyone can find it again later.'}</p>
        {!roomId ? <form onSubmit={create} className="mt-6 space-y-4">
          <label htmlFor="workspace" className="block text-sm font-medium">Workspace</label>
          <select id="workspace" value={organisationId} onChange={e => setOrganisationId(e.target.value)} className="w-full px-4 py-3 rounded-lg bg-gray-950 border border-white/20" disabled={!access}>
            <option value="">{access?.personalRoomsAllowed ? 'Personal session' : 'Select an organisation'}</option>
            {organisations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
          </select>
          <p className="text-sm text-gray-300">{organisationId ? 'Only this organisation’s active members can join. Its administrators can manage the session.' : 'Personal sessions are open to signed-in users with the room code.'}</p>
          {(accessError || workspaceError) && <p role="alert" className="text-red-200">{accessError || workspaceError}</p>}
          {accessError && <button type="button" onClick={refreshAccess} className="underline">Retry workspace access</button>}
          {!access && !accessError && <p role="status">Loading workspaces…</p>}
          {access && !access.personalRoomsAllowed && !organisations.length && <p role="status">Ask an organisation administrator for hosting access before creating a session.</p>}
          <label htmlFor="topic" className="block text-sm font-medium">Session topic (optional)</label>
          <input id="topic" maxLength={200} value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. Linear algebra questions" className="w-full px-4 py-3 rounded-lg bg-gray-950 border border-white/20" />
          <button disabled={creating || !canCreate} className="w-full px-4 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 font-semibold">{creating ? 'Creating…' : 'Create Room'}</button>
        </form> : <div className="mt-6 space-y-5">
          <div className="text-center"><p className="text-sm text-gray-300">Room code</p><p className="font-mono text-4xl sm:text-5xl tracking-widest mt-2 text-orange-300 select-all">{roomId}</p></div>
          <div className="bg-white rounded-xl p-4 w-fit mx-auto"><QRCode value={joinLink} size={180} className="max-w-full h-auto" /></div>
          <div className="flex flex-col sm:flex-row gap-3"><button onClick={() => copy(roomId)} className="flex-1 rounded-lg px-4 py-3 bg-white/10"><FaCopy className="inline mr-2" />Copy code</button><button onClick={() => copy(joinLink)} className="flex-1 rounded-lg px-4 py-3 bg-white/10">Copy join link</button></div>
          <p className="text-xs text-gray-300 break-all select-all">{joinLink}</p>
          <button onClick={() => navigate(`/host/${roomId}`)} className="w-full bg-blue-600 hover:bg-blue-500 rounded-lg px-4 py-3 font-semibold">Open host view</button>
          <p className="text-sm text-gray-300 text-center">This room is already saved in your recent sessions.</p>
        </div>}
      </section>
    </div>
  </main>;
}
