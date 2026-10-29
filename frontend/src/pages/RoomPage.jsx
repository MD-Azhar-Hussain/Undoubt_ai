import PropTypes from 'prop-types';
import { useState, useEffect, useRef, useMemo, useDeferredValue } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import socket from '../utils/socket';
import QRCode from 'react-qr-code';
import { FaCopy, FaQuestionCircle, FaCheckCircle, FaTimes } from 'react-icons/fa';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import axios from '../utils/http';
import stringSimilarity from 'string-similarity';
import { getDoubts } from '../utils/api';

import DoubtCard from '../components/DoubtCard';
import { FRONTEND_URL } from '../utils/constants';
import { mergeDoubts, updateDoubt, reconcileSnapshot } from '../utils/roomFeed';
import useQuestionDraft from '../hooks/useQuestionDraft';
import { copyText } from '../utils/roomLinks';


const RoomPage = () => {
  const { roomId } = useParams();
  const { user } = useAuth();
  if (!/^[a-zA-Z0-9-]{5,64}$/.test(roomId || '')) return <Navigate to="/access-denied" replace />;
  return <RoomSession key={`${user.id}:${roomId}`} roomId={roomId} user={user} />;
};

const RoomSession = ({ roomId, user }) => {
  const navigate = useNavigate();
  // The authenticated socket join supplies permissions and data together.
  // Neither the URL nor a caller-provided role grants host controls.
  const [canManage, setCanManage] = useState(null);
  const role = canManage === null ? null : canManage ? 'host' : 'participant';
  const draft = useQuestionDraft(user.id, roomId);
  const newDoubt = draft.text;
  const setNewDoubt = draft.setText;

  const pendingVotes = useRef(new Map());
  const pendingAnswers = useRef(new Set());
  const submissionInFlight = useRef(false);
  const questionInput = useRef(null);
  const questionWorkspace = useRef(null);
  const qrDialog = useRef(null);
  const [doubts, setDoubts] = useState([]);
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState('popular');
  const [votePreviews, setVotePreviews] = useState(new Map());
  const [answeringIds, setAnsweringIds] = useState(new Set());
  const [submissionMessage, setSubmissionMessage] = useState('');
  const [connectionState, setConnectionState] = useState('connecting');
  const [visibleLimit, setVisibleLimit] = useState(50);
  const [showTools, setShowTools] = useState(false);
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  const [closing, setClosing] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [connected, setConnected] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sendingQuestion, setSendingQuestion] = useState(null);
  const deferredDraft = useDeferredValue(newDoubt);
  const [upvotedDoubts, setUpvotedDoubts] = useState(new Set());
  const [visibleEmails, setVisibleEmails] = useState(new Set());
  const [isRoomClosed, setIsRoomClosed] = useState(false);
  const [roomClosureMessage, setRoomClosureMessage] = useState('');
  const [activeTab, setActiveTab] = useState('active'); // 'active' or 'answered'
  const [showQRCode, setShowQRCode] = useState(false);
  const [recentlyAnswered, setRecentlyAnswered] = useState(new Set());
  const [isQrFullscreen, setIsQrFullscreen] = useState(false);
  const [qrFullscreenSize, setQrFullscreenSize] = useState(400);
  const [roomName, setRoomName] = useState('');
  const [animateStagger, setAnimateStagger] = useState(true);

  useEffect(() => {
    let disposed = false;
    let joining = false, joinAttempt = 0;
    let pendingSnapshotUpdates = [];
    let questionsDuringJoin = new Set();
    let lastPeerNotification = -Infinity;
    setDoubts([]);
    setUpvotedDoubts(new Set());
    const seenQuestions = new Set();
    const seenAnswers = new Set();
    const timers = new Set();
    const later = (callback, delay) => {
      const timer = setTimeout(() => { timers.delete(timer); if (!disposed) callback(); }, delay);
      timers.add(timer);
    };
    const join = () => {
      if (joining) return;
      joining = true;
      const attempt = ++joinAttempt;
      pendingSnapshotUpdates = [];
      questionsDuringJoin = new Set();
      setConnected(false);
      // Keep the last verified layout during a transient reconnect. Actions
      // stay disabled until this join succeeds; unknown access stays neutral.
      setConnectionState('connecting');
      socket.timeout(10000).emit('joinRoom', roomId, (error, result) => {
        if (disposed || attempt !== joinAttempt) return;
        joining = false;
        if (error) { setConnectionState('disconnected'); toast.error('Could not join the room. Please reconnect.'); return; }
        setConnected(!!result?.ok);
        setConnectionState(result?.ok ? 'connected' : 'disconnected');
        if (!result?.ok && [401, 403, 404].includes(result?.status)) {
          setDoubts([]);
          setCanManage(null);
          navigate(result.status === 401 ? '/login' : '/access-denied', { replace: true });
          return;
        }
        if (!result?.ok && [404, 410].includes(result?.status)) {
          setIsRoomClosed(true);
          setRoomClosureMessage(result.message);
        }
      });
    };
    const expired = () => { socket.disconnect(); socket.connect(); };
    socket.on('sessionExpired', expired);
    const disconnected = reason => {
      joining = false;
      joinAttempt++;
      setConnected(false);
      if (reason === 'io server disconnect') { setCanManage(null); setDoubts([]); }
      setConnectionState('disconnected');
    };
    const failure = error => toast.error(error.message, { toastId: `room-error-${error.message}` });
    const connectionFailure = error => { disconnected(); failure(error); };
    socket.on('connect', join);
    socket.on('syncRequired', join);
    socket.on('disconnect', disconnected);
    socket.on('connect_error', connectionFailure);
    socket.on('operationError', failure);

    socket.on('existingDoubts', (existingDoubts, cursor) => {
      existingDoubts.forEach(d => { seenQuestions.add(d.id); if (d.answered) seenAnswers.add(d.id); });
      setNextCursor(cursor);
      const updates = pendingSnapshotUpdates || [];
      const liveIds = questionsDuringJoin;
      pendingSnapshotUpdates = null;
      setDoubts(previous => reconcileSnapshot(previous, existingDoubts, updates, liveIds));
      setUpvotedDoubts(previous => {
        const next = new Set(previous);
        for (const doubt of existingDoubts) {
          if (doubt.upvotedBy.includes(user.id)) next.add(doubt.id); else next.delete(doubt.id);
        }
        return next;
      });
    });

    socket.on('roomInfo', (info) => {
      setCanManage(typeof info?.canManage === 'boolean' ? info.canManage : null);
      if (info?.canManage !== true) setConfirmClose(false);
      setIsRoomClosed(info?.status === 'closed');
      setRoomClosureMessage(info?.status === 'closed' ? 'This session has ended. You can revisit questions and host replies here.' : '');
      if (info && typeof info.topic === 'string') {
        const nm = info.topic.trim();
        setRoomName(nm);
        try { localStorage.setItem(`roomName:${roomId}`, nm); } catch { /* Storage may be unavailable. */ }
      }
    });
    socket.on('roomTopicUpdated', ({ topic }) => {
      const nm = (topic || '').trim();
      setRoomName(nm);
      try { localStorage.setItem(`roomName:${roomId}`, nm); } catch { /* Storage may be unavailable. */ }
    });

    socket.on('newDoubt', (doubt) => {
      if (doubt.isOwn) setSendingQuestion(current => current?.text === doubt.text ? null : current);
      if (pendingSnapshotUpdates) questionsDuringJoin.add(doubt.id);
      setDoubts(previous => mergeDoubts(previous, [doubt]));
      if (seenQuestions.has(doubt.id)) return;
      seenQuestions.add(doubt.id);
      if (doubt.isOwn) toast.success('Question submitted', { toastId: 'question-' + doubt.id });
      else if (Date.now() - lastPeerNotification > 3000) {
        lastPeerNotification = Date.now();
        toast.info('New questions added', { toastId: 'room-questions-' + roomId });
      }
    });

    socket.on('upvoteDoubt', ({ doubtId, upvotes, revision }) => {
      pendingSnapshotUpdates?.push({ id: doubtId, upvotes, revision });
      setDoubts(previous => updateDoubt(previous, { id: doubtId, upvotes, revision }));
    });

    socket.on('downvoteDoubt', ({ doubtId, upvotes, revision }) => {
      pendingSnapshotUpdates?.push({ id: doubtId, upvotes, revision });
      setDoubts(previous => updateDoubt(previous, { id: doubtId, upvotes, revision }));
    });

    socket.on('markAsAnswered', (doubtId, answered, update) => {
      if (update) pendingSnapshotUpdates?.push({ ...update, id: doubtId });
      setDoubts(previous => updateDoubt(previous, { id: doubtId, answered, ...update }));
      if (answered && seenAnswers.has(doubtId)) return;
      if (answered) seenAnswers.add(doubtId); else seenAnswers.delete(doubtId);
      if (answered) {
        setRecentlyAnswered(previous => new Set(previous).add(doubtId));
        later(() => setRecentlyAnswered(previous => {
          const next = new Set(previous); next.delete(doubtId); return next;
        }), 600);
      }
      toast.success(answered ? 'Question marked as answered' : 'Question reopened', {
        toastId: 'answer-' + doubtId,
        position: "top-right",
        autoClose: 3000,
        theme: "colored",
        priority: 1,
      });
    });

    socket.on('roomClosed', () => {
      setIsRoomClosed(true);
      setConfirmClose(false);
      setRoomClosureMessage('This session has ended. You can revisit questions and host replies here.');
      toast.info('Session ended. Questions and replies remain available.', {
        toastId: 'closed-' + roomId,
        position: "top-right",
        autoClose: 5000,
        theme: "colored",
        priority: 10,
      });
    });

    if (socket.connected) join();
    else socket.connect();
    return () => {
      disposed = true;
      timers.forEach(clearTimeout);
      socket.off('sessionExpired', expired);
      socket.off('connect', join);
      socket.off('syncRequired', join);
      socket.off('disconnect', disconnected);
      socket.off('connect_error', connectionFailure);
      socket.off('operationError', failure);
      socket.disconnect();
      socket.off('existingDoubts');
      socket.off('roomInfo');
      socket.off('newDoubt');
      socket.off('upvoteDoubt');
      socket.off('downvoteDoubt');
      socket.off('markAsAnswered');
      socket.off('roomClosed');
      socket.off('roomTopicUpdated');
    };
  }, [roomId, user.id, navigate]);

  useEffect(() => {
    // Sockets via 'existingDoubts' will naturally populate doubts upon joining.
    // Fetching here explicitly races the websocket and causes redundant payload fetching.
    try {
      const stored = localStorage.getItem(`roomName:${roomId}`);
      if (stored && stored.trim()) setRoomName(stored.trim());
    } catch {
      // ignore storage errors
    }
  }, [roomId]);

  // Run stagger animation only on initial mount and when tab changes
  useEffect(() => {
    setAnimateStagger(true);
    const timer = setTimeout(() => setAnimateStagger(false), 700);
    return () => clearTimeout(timer);
  }, [activeTab]);

  useEffect(() => { setVisibleLimit(50); }, [activeTab, search, onlyMine, roomId, sortOrder]);

  useEffect(() => {
    if (composerExpanded) questionInput.current?.focus();
  }, [composerExpanded]);

  const handleAddDoubt = () => {
    if (newDoubt.trim() === '') {
      toast.error('Doubt cannot be empty', {
        position: "top-right",
        autoClose: 3000,
        theme: "colored",
        priority: 5,
      });
      return;
    }

    if (!connected || !socket.connected || submissionInFlight.current || isRoomClosed) return;
    const doubt = draft.prepare();
    submissionInFlight.current = true;
    setSubmissionMessage('');
    setSubmitting(true);
    setSendingQuestion(doubt);
    socket.timeout(10000).emit('newDoubt', roomId, doubt, (error, result) => {
      setSendingQuestion(null);
      setSubmitting(false);
      submissionInFlight.current = false;
      if (error) { setSubmissionMessage('No confirmation yet. Retry this question safely; it will only be saved once.'); return; }
      if (!result?.ok) { setSubmissionMessage(result?.message || 'Your question could not be submitted. Your draft is kept.'); return; }
      if (result.doubt) setDoubts(previous => mergeDoubts(previous, [result.doubt]));
      if (draft.acknowledge(doubt)) setComposerExpanded(false);
    });
  };

  const handleToggleUpvote = (id) => {
    if (!connected || !socket.connected || isRoomClosed || pendingVotes.current.has(id)) return;
    const question = doubts.find(doubt => doubt.id === id);
    if (!question) return;
    const wasVoted = upvotedDoubts.has(id);
    pendingVotes.current.set(id, { revision: question.revision || 0, delta: wasVoted ? -1 : 1 });
    setVotePreviews(new Map(pendingVotes.current));
    setUpvotedDoubts(previous => {
      const next = new Set(previous);
      if (wasVoted) next.delete(id); else next.add(id);
      return next;
    });
    const event = wasVoted ? 'downvoteDoubt' : 'upvoteDoubt';
    socket.timeout(10000).emit(event, roomId, id, (error, result) => {
      pendingVotes.current.delete(id);
      setVotePreviews(new Map(pendingVotes.current));
      setUpvotedDoubts(previous => {
        const next = new Set(previous);
        if (!error && result?.ok ? result.voted : wasVoted) next.add(id); else next.delete(id);
        return next;
      });
      if (error) return toast.error('Vote not confirmed. Reconnect to refresh your votes.');
      if (!result?.ok) return;
      setDoubts(previous => previous.map(d => d.id === id && (result.revision || 0) >= (d.revision || 0)
        ? { ...d, upvotes: result.upvotes, revision: result.revision } : d));
    });
  };

  const handleToggleEmailVisibility = (id) => {
    setVisibleEmails((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleMarkAsAnswered = (id) => {
    if (!connected || pendingAnswers.current.has(id)) return;
    pendingAnswers.current.add(id);
    setAnsweringIds(new Set(pendingAnswers.current));
    socket.timeout(10000).emit('markAsAnswered', roomId, id, (error, result) => {
      pendingAnswers.current.delete(id);
      setAnsweringIds(new Set(pendingAnswers.current));
      if (error) toast.error('Answer status not confirmed. Please reconnect.');
      if (result?.ok && result.update) setDoubts(previous => updateDoubt(previous, { ...result.update, id }));
    });
  };

  const handleReply = (id, answer) => new Promise(resolve => {
    if (!connected || pendingAnswers.current.has(id)) return resolve(false);
    pendingAnswers.current.add(id);
    socket.timeout(10000).emit('markAsAnswered', roomId, id, answer, (error, result) => {
      pendingAnswers.current.delete(id);
      if (error) { toast.error('Reply not confirmed. Your draft is kept; reconnect before retrying.'); return resolve(false); }
      if (result?.ok && result.update) setDoubts(previous => previous.map(d => d.id === id && result.update.revision >= (d.revision || 0) ? { ...d, ...result.update } : d));
      resolve(!!result?.ok);
    });
  });

  const handleCopy = async (value, label) => {
    try { await copyText(value); toast.success(`${label} copied`, { toastId: 'room-copy' }); }
    catch { toast.error('Copy is unavailable in this browser. Use the room code shown above.'); }
  };
  const handleCopyRoomId = () => handleCopy(roomId, 'Room code');
  const handleCopyRoomLink = () => handleCopy(`${FRONTEND_URL}/room/${roomId}`, 'Room link');

  const handleCloseRoom = async () => {
    if (closing) return;
    setClosing(true);
    try {
      await axios.delete('/rooms/' + roomId);
      setIsRoomClosed(true);
      setConfirmClose(false);
      setRoomClosureMessage('This session has ended. You can revisit questions and host replies here.');
    } catch (error) { toast.error(error.response?.data?.message || 'Could not close room'); }
    finally { setClosing(false); }
  };

  const handleLeaveRoom = () => {
    navigate('/');
  };

  const handleDoubtChange = (e) => {
    const newDoubtText = e.target.value;
    setNewDoubt(newDoubtText);
    setSubmissionMessage('');


  };

  const toggleQRCode = () => {
    setShowQRCode((prev) => !prev);
  };

  const recomputeQrSize = () => {
    const vw = (window.visualViewport?.width || window.innerWidth);
    const vh = (window.visualViewport?.height || window.innerHeight);
    const horizontalPadding = 32; // px padding on sides
    const verticalReserved = 160; // space for close button, caption and actions
    const availableWidth = Math.max(0, vw - horizontalPadding);
    const availableHeight = Math.max(0, vh - verticalReserved);
    const size = Math.floor(Math.min(availableWidth, availableHeight));
    setQrFullscreenSize(Math.max(128, size));
  };

  const openQrFullscreen = () => {
    recomputeQrSize();
    setIsQrFullscreen(true);
  };
  const closeQrFullscreen = () => setIsQrFullscreen(false);

  useEffect(() => {
    if (!isQrFullscreen) return;
    const previousFocus = document.activeElement;
    qrDialog.current?.querySelector('button')?.focus();
    const onKey = event => {
      if (event.key === 'Escape') setIsQrFullscreen(false);
      if (event.key !== 'Tab') return;
      const controls = qrDialog.current?.querySelectorAll('button');
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const onResize = () => recomputeQrSize();
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('resize', onResize); window.removeEventListener('keydown', onKey); previousFocus?.focus(); };
  }, [isQrFullscreen]);

  // Download doubts/questions as a text file
  const handleDownloadDoubts = () => {
    if (!doubts || doubts.length === 0) {
      toast.info('No doubts to download.');
      return;
    }
    const lines = doubts.map((d, idx) => `${idx + 1}. ${d.text} [${d.answered ? 'Answered' : 'Unanswered'}]${d.answer ? '\nHost reply: ' + d.answer : ''}`);
    const content = lines.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `room_${roomId}_doubts.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const [sortedActiveDoubts, sortedAnsweredDoubts] = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = doubts.map(doubt => {
      const pending = votePreviews.get(doubt.id);
      // New server revisions already include committed changes. Do not add the
      // preview twice when a broadcast arrives before the acknowledgement.
      return pending && pending.revision === (doubt.revision || 0)
        ? { ...doubt, upvotes: Math.max(0, doubt.upvotes + pending.delta) } : doubt;
    }).filter(d => (!onlyMine || d.isOwn) && `${d.text} ${d.answer || ''}`.toLowerCase().includes(query));
    const time = doubt => Date.parse(doubt.createdAt) || 0;
    const compare = (a, b) => sortOrder === 'newest' ? time(b) - time(a) : sortOrder === 'oldest' ? time(a) - time(b) : b.upvotes - a.upvotes || time(a) - time(b);
    return [filtered.filter(d => !d.answered).sort(compare), filtered.filter(d => d.answered).sort(compare)];
  }, [doubts, onlyMine, search, votePreviews, sortOrder]);
  const similarDoubt = useMemo(() => deferredDraft.trim().length < 3 ? undefined : doubts.find(doubt =>
    typeof doubt.text === 'string' && stringSimilarity.compareTwoStrings(deferredDraft, doubt.text) > 0.7), [deferredDraft, doubts]);

  if (role === null) return (
    <main className="access-screen">
      <section className="access-card" aria-busy={connectionState === 'connecting'}>
        <span className="eyebrow">Room {roomId}</span>
        <h1>{connectionState === 'disconnected' ? 'Unable to open your room' : 'Opening your room…'}</h1>
        <p role="status">{connectionState === 'disconnected'
          ? 'Your draft is kept. Reconnect to try again.'
          : 'Preparing your session and checking your access.'}</p>
        {connectionState === 'disconnected' && <button onClick={() => { setConnectionState('connecting'); socket.disconnect(); socket.connect(); }}>Reconnect</button>}
        <button onClick={handleLeaveRoom}>Back to sessions</button>
      </section>
    </main>
  );

  return (
    <div className="room-screen min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white">
      <div role="status" className="room-status px-6 py-2 text-sm bg-gray-900">{!connected ? connectionState === 'connecting' ? 'Connecting to your session…' : 'Connection lost · your draft is kept. Reconnect to send or vote.' : isRoomClosed ? 'Closed session · replies available' : 'Live session'}<span className="room-status-count"> · {doubts.length} questions · {doubts.filter(d => d.answered).length} answered</span>
        {!connected && connectionState !== 'connecting' && <button className="ml-4 underline" onClick={() => { setConnectionState('connecting'); socket.disconnect(); socket.connect(); }}>Reconnect</button>}
      </div>
      {nextCursor && <button disabled={loadingEarlier || !connected} className="m-4 px-4 py-2 bg-blue-700 rounded" onClick={async () => {
        if (loadingEarlier) return;
        setLoadingEarlier(true);
        try {
          const page = await getDoubts(roomId, nextCursor);
          setDoubts(previous => mergeDoubts(previous, page.doubts));
          setUpvotedDoubts(previous => new Set([...previous, ...page.doubts.filter(d => d.upvotedBy.includes(user.id)).map(d => d.id)]));
          setNextCursor(page.nextCursor);
        } catch { toast.error('Could not load earlier questions'); }
        finally { setLoadingEarlier(false); }
      }}>{loadingEarlier ? 'Loading…' : 'Load earlier questions'}</button>}
      {/* Header Section */}
      <div className="room-header bg-gray-900 border-b border-gray-700">
        <div className="room-header-inner mx-auto px-4 py-3">
          <div className="room-header-row">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex flex-col min-w-0 w-full">
                {(
                  <div className="flex items-center gap-2">
                    {role === 'host' ? (
                      <input aria-label="Room topic" disabled={isRoomClosed || !connected} maxLength={200}
                        value={roomName}
                        onChange={(e) => setRoomName(e.target.value)}
                        onBlur={() => { if (connected && !isRoomClosed) socket.emit('updateRoomTopic', roomId, roomName); }}
                        placeholder="Room topic"
                        className="min-w-0 w-full text-xl sm:text-2xl md:text-3xl font-bold bg-transparent border-b border-white/20 focus:border-white/40 focus:outline-none px-1"
                      />
                    ) : (
                      <h1 className="min-w-0 break-words text-xl sm:text-2xl md:text-3xl font-bold">{roomName || 'Question room'}</h1>
                    )}
                    <span className={`text-[10px] sm:text-xs px-2 py-1 rounded-full border ${role==='host' ? 'bg-purple-700/30 text-purple-200 border-purple-400/30' : 'bg-blue-700/30 text-blue-200 border-blue-400/30'}`}>
                      {role === 'host' ? 'HOST' : 'PARTICIPANT'}
                    </span>
                  </div>
                )}
                <div className="room-code-row flex items-center gap-2 mt-1">
                  <span className="inline-block text-xs sm:text-sm text-gray-300 bg-gray-800 px-2 py-0.5 rounded">ID: {roomId}</span>
                  <button
                    onClick={handleCopyRoomId}
                    className="p-1.5 text-gray-300 hover:text-white transition-colors hover:bg-gray-700/30 rounded"
                    title="Copy Room ID"
                  >
                    <FaCopy className="text-sm" />
                  </button>
                </div>
              </div>
            </div>
            <div className="room-controls">
              <button className="room-tools-toggle" aria-expanded={showTools} aria-controls="room-tools" onClick={() => setShowTools(value => !value)}>Session options <span aria-hidden="true">{showTools ? '−' : '+'}</span></button>
              <div id="room-tools" className={`room-tools ${showTools ? 'is-open' : ''}`}>
              {!isRoomClosed && <button onClick={handleCopyRoomLink} className="px-3 py-2 bg-blue-700 rounded-lg">Copy room link</button>}
              {!isRoomClosed && (
                  <button
                    onClick={toggleQRCode}
                    aria-expanded={showQRCode}
                    aria-controls="room-qr"
                    className="px-3 py-1.5 text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shrink-0"
                  >
                    {showQRCode ? 'Hide QR' : 'Show QR'}
                  </button>
              )}
              {role === 'host' && !isRoomClosed && (
                  <button
                    disabled={!connected || closing}
                    onClick={() => setConfirmClose(true)}
                    className="px-3 py-1.5 text-xs sm:text-sm bg-red-600 hover:bg-red-700 rounded-lg transition-colors shrink-0"
                  >
                    Close Room
                  </button>
              )}
              {(
                <button
                  onClick={handleLeaveRoom}
                  className="px-3 py-1.5 text-xs sm:text-sm bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors text-white shrink-0"
                >
                  Back to sessions
                </button>
              )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {confirmClose && <section aria-label="Confirm session closure" className="max-w-3xl mx-auto m-4 p-5 rounded-xl border border-orange-300/40 bg-gray-900">
        <h2 className="font-semibold text-lg">End this live session?</h2>
        <p className="text-gray-300 my-3">New questions and votes will stop. Everyone who joined can revisit the session, and you can keep replying.</p>
        <div className="flex flex-wrap gap-3"><button disabled={closing} onClick={handleCloseRoom} className="px-4 py-2 bg-red-700 rounded-lg">{closing ? 'Closing…' : 'End session'}</button><button disabled={closing} onClick={() => setConfirmClose(false)} className="px-4 py-2 bg-gray-700 rounded-lg">Keep live</button></div>
      </section>}
      {!isRoomClosed && showQRCode && (
        <div id="room-qr" className="room-share bg-gray-800 bg-opacity-50 p-4 border-b border-gray-700">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-8">
            <button onClick={openQrFullscreen} className="group focus:outline-none">
              <QRCode
                value={`${FRONTEND_URL}/room/${roomId}`}
                className="w-32 h-32 sm:w-40 sm:h-40 transition-transform duration-200 group-hover:scale-105 cursor-pointer"
              />
              <p className="mt-2 text-xs text-gray-400 hidden sm:block">Click QR to enlarge</p>
            </button>
            <div className="text-center sm:text-left">
              <p className="text-sm sm:text-base text-gray-300">
                Share this QR code with participants
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Room ID: {roomId}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen QR Modal */}
      {isQrFullscreen && (
        <div
          ref={qrDialog} role="dialog" aria-modal="true" aria-label="Share room QR code"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-85 p-4 overflow-auto"
          onClick={closeQrFullscreen}
        >
          <div className="relative w-full h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={closeQrFullscreen}
              className="absolute top-4 right-4 text-gray-200 hover:text-white text-3xl"
              aria-label="Close"
              title="Close"
            >
              <FaTimes />
            </button>
            <div className="flex flex-col items-center">
              <QRCode value={`${FRONTEND_URL}/room/${roomId}`} size={qrFullscreenSize} />
              <p className="mt-4 text-gray-200 text-sm sm:text-base text-center px-4">{roomName ? `${roomName} • ` : ''}Scan to join • Room ID: <span className="font-mono text-orange-300">{roomId}</span></p>
              <button
                onClick={handleCopyRoomLink}
                className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-sm font-semibold"
              >
                <FaCopy className="inline mr-2" />Copy Join Link
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Room Closure Message */}
      {roomClosureMessage && (
        <div className="room-closure bg-slate-800 text-white p-4 text-center flex flex-col items-center gap-2">
          <p className="text-base font-medium">{roomClosureMessage}</p>
          {role === 'host' && <p className="text-sm text-gray-300">You can still reply to unanswered questions below.</p>}
          {/* Download Doubts Button (visible to all users after room is closed) */}
          <button
            onClick={handleDownloadDoubts}
            className="mt-2 px-6 py-3 bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-700 hover:from-purple-700 hover:to-indigo-800 text-white font-semibold rounded-lg shadow-lg transition-all duration-300 transform hover:scale-105"
          >
            Download Loaded Questions
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className={`room-layout ${role === 'participant' && !isRoomClosed ? 'has-composer' : ''}`}>
        {/* Doubt Input Section (for participants) */}
        {role === 'participant' && !isRoomClosed && (
          <div className={`question-composer ${composerExpanded ? 'is-expanded' : ''}`}>
            <button className="composer-toggle" aria-expanded={composerExpanded} aria-controls="question-editor" onClick={() => setComposerExpanded(value => !value)}><FaQuestionCircle aria-hidden="true" /><span>{newDoubt ? 'Continue your question' : 'Ask a question'}</span><span aria-hidden="true">{composerExpanded ? '−' : '+'}</span></button>
            <div id="question-editor" className="composer-body space-y-4">
              <div className="composer-heading flex items-center space-x-2">
                <FaQuestionCircle className="text-blue-300" />
                <h2 className="text-xl font-semibold text-gray-100">Ask Your Doubt</h2>
              </div>
              <textarea ref={questionInput} aria-label="Your question" aria-describedby="question-draft-help" maxLength={2000}
                value={newDoubt}
                onChange={handleDoubtChange}
                onKeyDown={event => {
                  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) { event.preventDefault(); handleAddDoubt(); }
                }}
                placeholder="Type your doubt here..."
                className="w-full h-24 p-4 bg-gray-900/80 text-gray-100 rounded-lg border border-blue-500/30 focus:border-blue-400 focus:outline-none resize-none placeholder-gray-400"
                disabled={isRoomClosed}
              />
              <div id="question-draft-help" className="draft-help"><span>{newDoubt ? draft.saved ? 'Draft saved in this tab' : 'Draft kept while this page is open' : 'Only the host can see who asked.'}</span><span>{newDoubt.length}/2000</span></div>
              <p className="keyboard-hint">Ctrl / ⌘ + Enter to submit. Enter adds a new line.</p>
              {submissionMessage && <p className="interaction-error" role="alert">{submissionMessage}</p>}
              {similarDoubt && (
                <div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                  <div className="flex items-start gap-2">
                    <FaQuestionCircle className="text-blue-300 shrink-0 mt-1" aria-hidden="true" />
                    <div className="flex-1">
                      <p className="text-blue-200 text-sm font-medium">Someone has a similar question:</p>
                      <p className="text-gray-200 text-sm mt-1">&quot;{similarDoubt.text}&quot;</p>
                      <p className="text-blue-200 text-xs mt-1">Upvotes: {similarDoubt.upvotes}</p>
                      <button className="similar-question-link" onClick={() => {
                        setSearch(similarDoubt.text); setOnlyMine(false); setActiveTab(similarDoubt.answered ? 'answered' : 'active');
                        questionWorkspace.current?.scrollIntoView?.({ block: 'start' });
                        questionWorkspace.current?.focus();
                      }}>{similarDoubt.answered ? 'Read the reply' : 'View this question'}</button>
                    </div>
                  </div>
                </div>
              )}
              <button
                  onClick={handleAddDoubt}
                disabled={!connected || submitting || isRoomClosed || newDoubt.trim() === ''}
                className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all duration-300 transform hover:scale-105 disabled:transform-none"
              >
                {submitting ? 'Submitting…' : 'Submit Doubt'}
              </button>
            </div>
          </div>
        )}

        <section ref={questionWorkspace} tabIndex={-1} className="question-workspace" aria-label="Session questions">
        {sendingQuestion && <div role="status" className="doubt-card p-4 mb-4 rounded-xl border border-blue-400/40 bg-gray-900/50">
          <p className="text-sm text-blue-200">Sending your question…</p>
          <p className="question-text whitespace-pre-wrap break-words mt-2">{sendingQuestion.text}</p>
        </div>}
        <div className="question-filters">
          <label className="flex-1 text-sm text-gray-200"><span className="sr-only">Search loaded questions and replies</span>
            <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by keyword…" className="block w-full bg-gray-900 border border-white/20 rounded-lg px-4 py-3" />
          </label>
          <button aria-pressed={onlyMine} onClick={() => setOnlyMine(value => !value)} className={`px-4 py-3 rounded-lg border border-white/20 ${onlyMine ? 'bg-blue-600' : 'bg-gray-900'}`}>My questions</button>
          <div className="question-sort-row"><label htmlFor="question-sort">Sort questions</label><select id="question-sort" value={sortOrder} onChange={event => setSortOrder(event.target.value)}><option value="popular">Most upvoted</option><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select>
            {(search || onlyMine) && <button onClick={() => { setSearch(''); setOnlyMine(false); }}>Clear filters</button>}
          </div>
        </div>
        {nextCursor && <p className="text-sm text-gray-300 mb-4">Search and counts cover loaded questions. Load earlier questions to include more.</p>}
        {/* Tabs for Active and Answered Doubts */}
        <div className="question-tabs">
          <div className="flex space-x-1 bg-gray-800 bg-opacity-50 rounded-lg p-1">
            <button
              aria-pressed={activeTab === 'active'}
              onClick={() => setActiveTab('active')}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all duration-200 ${
                activeTab === 'active'
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'text-gray-300 hover:text-white hover:bg-gray-700'
              }`}
            >
              Unanswered ({sortedActiveDoubts.length})
            </button>
            <button
              aria-pressed={activeTab === 'answered'}
              onClick={() => setActiveTab('answered')}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all duration-200 ${
                activeTab === 'answered'
                  ? 'bg-green-600 text-white shadow-lg'
                  : 'text-gray-300 hover:text-white hover:bg-gray-700'
              }`}
            >
              Answered ({sortedAnsweredDoubts.length})
            </button>
          </div>
        </div>

        {/* Doubts Container */}
        <div className="question-list space-y-6">
          {activeTab === 'active' ? (
            <div>
              <h3 className="text-xl font-semibold mb-4 flex items-center">
                <FaQuestionCircle className="mr-2 text-blue-400" />
                Unanswered
              </h3>
              {sortedActiveDoubts.length === 0 ? (
                <div className="text-center py-12 rounded-xl border border-white/10 bg-gray-900/40">
                  <FaQuestionCircle className="text-6xl text-gray-400 mx-auto mb-4" />
                  <p className="text-xl text-gray-200 mb-2">No unanswered questions match</p>
                  {role === 'participant' && !isRoomClosed && !search && !onlyMine && <p className="text-gray-400">Be the first to ask a question!</p>}
                </div>
              ) : (
                <div className={`space-y-4 ${animateStagger ? 'stagger-in' : ''}`}>
                  {sortedActiveDoubts.slice(0, visibleLimit).map((doubt) => (
                    <DoubtCard
                      key={doubt.id}
                      doubt={doubt}
                      onReply={handleReply}
                      connected={connected}
                      closed={isRoomClosed}
                      upvotedDoubts={upvotedDoubts}
                      role={role}
                      visibleEmails={visibleEmails}
                      recentlyAnswered={recentlyAnswered}
                      onToggleEmailVisibility={handleToggleEmailVisibility}
                      onMarkAsAnswered={handleMarkAsAnswered}
                      onToggleUpvote={handleToggleUpvote}
                      voting={votePreviews.has(doubt.id)} answering={answeringIds.has(doubt.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              <h3 className="text-xl font-semibold mb-4 flex items-center">
                <FaCheckCircle className="mr-2 text-green-400" />
                Answered Doubts
              </h3>
              {sortedAnsweredDoubts.length === 0 ? (
                <div className="text-center py-12 rounded-xl border border-white/10 bg-gray-900/40">
                  <FaCheckCircle className="text-6xl text-gray-400 mx-auto mb-4" />
                  <p className="text-xl text-gray-200">No answered doubts yet</p>
                </div>
              ) : (
                <div className={`space-y-4 ${animateStagger ? 'stagger-in' : ''}`}>
                  {sortedAnsweredDoubts.slice(0, visibleLimit).map((doubt) => (
                    <DoubtCard
                      key={doubt.id}
                      doubt={doubt}
                      onReply={handleReply}
                      connected={connected}
                      closed={isRoomClosed}
                      isAnswered={true}
                      upvotedDoubts={upvotedDoubts}
                      role={role}
                      visibleEmails={visibleEmails}
                      recentlyAnswered={recentlyAnswered}
                      onToggleEmailVisibility={handleToggleEmailVisibility}
                      onMarkAsAnswered={handleMarkAsAnswered}
                      onToggleUpvote={handleToggleUpvote}
                      voting={votePreviews.has(doubt.id)} answering={answeringIds.has(doubt.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
          {(activeTab === 'active' ? sortedActiveDoubts.length : sortedAnsweredDoubts.length) > visibleLimit &&
            <button type="button" className="mt-4 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3" onClick={() => setVisibleLimit(limit => limit + 50)}>
              Show more questions
            </button>}
        </div>
        </section>
      </div>
    </div>
  );
};

export default RoomPage;
RoomSession.propTypes = { roomId: PropTypes.string.isRequired, user: PropTypes.shape({ id: PropTypes.string.isRequired }).isRequired };
