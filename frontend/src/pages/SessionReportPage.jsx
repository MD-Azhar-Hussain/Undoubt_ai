import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import http from '../utils/http';

export default function SessionReportPage() {
  const { roomId } = useParams();
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setReport(null);
    setError('');
    http.get(`/rooms/${roomId}/report`).then(({ data }) => {
      if (!cancelled) setReport(data);
    }).catch(error => { if (!cancelled) setError(error.response?.data?.message || 'Could not load this report. Please refresh to retry.'); });
    return () => { cancelled = true; };
  }, [roomId]);
  const loadMore = async () => {
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await http.get(`/rooms/${roomId}/report`, { params: { before: report.nextCursor } });
      setReport(previous => ({ ...data, doubts: [...new Map([...previous.doubts, ...data.doubts].map(d => [d.id, d])).values()] }));
    } catch { setError('Could not load more questions. Please retry.'); }
    finally { setLoading(false); }
  };
  return <main className="report-screen min-h-screen bg-gray-950 text-white px-6 py-10">
    <div className="max-w-4xl mx-auto">
      <Link to="/" className="text-orange-300 underline">Back to sessions</Link>
      <h1 className="text-3xl font-bold mt-6">{report?.room.topic || 'Session report'}</h1>
      {error && <p role="alert" className="text-red-300 mt-4">{error}</p>}
      {!report && !error && <p role="status" className="mt-4">Loading report…</p>}
      {report && <>
        <p className="text-gray-400 mt-2">{report.room.status} · {roomId}</p>
        <dl className="report-stats grid grid-cols-3 gap-4 my-8">
          {Object.entries(report.summary).map(([label, value]) => <div key={label} className="rounded-xl bg-gray-900 p-4"><dt className="capitalize text-gray-300">{label === 'total' ? 'Questions' : label}</dt><dd className="text-3xl mt-2">{value}</dd></div>)}
        </dl>
        <p className="text-sm text-gray-400 mb-4">Showing {report.doubts.length} of {report.summary.total} questions. Available to the host and authorised administrators.</p>
        <ol className="space-y-4">{report.doubts.map(d => <li key={d.id} className="rounded-xl border border-gray-800 p-5">
          <p className="whitespace-pre-wrap break-words">{d.text}</p>
          {d.answer && <div className="mt-4 border-l-2 border-emerald-400 pl-4"><p className="text-sm text-emerald-200">Host reply</p><p className="whitespace-pre-wrap break-words mt-1">{d.answer}</p></div>}
          <p className="text-sm text-gray-400 mt-3">{d.answered ? 'Answered' : 'Unanswered'} · {d.upvotes} votes</p>
        </li>)}</ol>
        {report.nextCursor && <button disabled={loading} onClick={loadMore} className="my-6 px-4 py-2 bg-blue-700 rounded disabled:opacity-50">{loading ? 'Loading…' : 'Load more questions'}</button>}
      </>}
    </div>
  </main>;
}
