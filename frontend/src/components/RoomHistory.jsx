import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import http from '../utils/http';

export default function RoomHistory() {
  const [rooms, setRooms] = useState([]);
  const [status, setStatus] = useState('Loading your sessions…');
  const [filter, setFilter] = useState('all');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setStatus('Loading your sessions…');
    http.get('/rooms').then(({ data }) => {
      if (cancelled) return;
      setRooms(data.rooms);
      setStatus(data.rooms.length ? '' : 'Create or join a room. Your sessions will be saved here.');
    }).catch(() => { if (!cancelled) setStatus('Session history is unavailable. Please try again.'); });
    return () => { cancelled = true; };
  }, [attempt]);
  const filtered = rooms.filter(room => filter === 'all' || room.role === filter);
  return <section className="session-history w-full max-w-5xl mx-auto px-4 sm:px-6 py-8 text-white" aria-labelledby="sessions-heading">
    <div className="history-heading flex flex-wrap justify-between items-center gap-3 mb-4">
      <div><h2 id="sessions-heading" className="text-2xl font-semibold">Your recent sessions</h2>
        <p className="text-sm text-gray-300 mt-1">Pick up where you left off. Revisit replies anytime.</p></div>
      <button className="px-3 py-2 rounded-lg border border-white/20" onClick={() => setAttempt(n => n + 1)}>Refresh</button>
    </div>
    <div className="session-filters flex flex-wrap gap-2 mb-5" aria-label="Filter sessions">
      {[['all', 'All sessions'], ['host', 'Hosted'], ['participant', 'Joined']].map(([value, label]) =>
        <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)} className={`px-4 py-2 rounded-full text-sm ${filter === value ? 'bg-blue-600' : 'bg-white/10 hover:bg-white/20'}`}>{label}</button>)}
    </div>
    {status && <p role="status" className="text-gray-300 py-4">{status}</p>}
    {!status && !filtered.length && <p className="text-gray-300 py-4">No {filter === 'host' ? 'hosted' : 'joined'} sessions yet.</p>}
    <div className="session-grid">
      {filtered.map(room => <article key={room.roomId} className="session-card min-w-0 p-5 rounded-2xl border border-white/15 bg-gray-900/60">
        <div className="flex gap-2 text-xs font-medium"><span className="rounded-full px-2 py-1 bg-white/10">{room.role === 'host' ? 'Hosted by you' : 'Joined'}</span><span className={`rounded-full px-2 py-1 ${room.status === 'active' ? 'bg-emerald-900 text-emerald-200' : 'bg-slate-700 text-slate-200'}`}>{room.status === 'active' ? 'Live' : 'Closed'}</span></div>
        <h3 className="font-semibold text-lg mt-3 break-words">{room.topic || 'Untitled session'}</h3>
        <p className="text-sm text-gray-300 mt-2"><span className="font-mono">{room.roomId}</span> · {new Date(room.createdAt).toLocaleDateString()}</p>
        <p className="text-sm text-gray-300 mt-2">{room.unanswered} unanswered {room.unanswered === 1 ? 'question' : 'questions'}</p>
        <div className="session-card-actions flex flex-wrap items-center gap-4 mt-4">
          <Link className="inline-flex items-center px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500" to={`/${room.role === 'host' ? 'host' : 'room'}/${room.roomId}`}>{room.status === 'active' ? 'Return to room' : room.role === 'host' ? 'Review & reply' : 'View questions & replies'}</Link>
          {room.role === 'host' && <Link className="text-blue-200 underline py-2" to={`/sessions/${room.roomId}`}>Report</Link>}
        </div>
      </article>)}
    </div>
    {rooms.length === 50 && <p className="text-sm text-gray-300 mt-4">Showing your 50 most recent sessions.</p>}
  </section>;
}
