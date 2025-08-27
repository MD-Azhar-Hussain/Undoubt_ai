import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import socket from '../utils/socket';
import QRCode from 'react-qr-code';
import { FaCopy, FaEye, FaEyeSlash, FaCheck, FaThumbsUp, FaQuestionCircle, FaCheckCircle, FaArrowUp, FaArrowDown, FaTimes } from 'react-icons/fa';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import axios from 'axios';
import stringSimilarity from 'string-similarity';
import { createRoom, submitDoubt, getDoubts, getRoom } from '../utils/api';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const DEFAULT_FRONTEND_ORIGIN = 'https://undoubt-ai.vercel.app';
const RAW_FRONTEND_URL = import.meta.env.VITE_FRONTEND_URL || (typeof window !== 'undefined' ? window.location.origin : DEFAULT_FRONTEND_ORIGIN);
const FRONTEND_URL = (() => {
  try {
    const parsed = new URL(RAW_FRONTEND_URL);
    const isLocalhost = ['localhost', '127.0.0.1'].includes(parsed.hostname);
    if (isLocalhost) return parsed.origin;
    if (parsed.hostname.endsWith('vercel.app') && parsed.hostname !== 'undoubt-ai.vercel.app') {
      return DEFAULT_FRONTEND_ORIGIN;
    }
    return parsed.origin;
  } catch (_) {
    return DEFAULT_FRONTEND_ORIGIN;
  }
})();

const RoomPage = ({ role }) => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [doubts, setDoubts] = useState([]);
  const [newDoubt, setNewDoubt] = useState('');
  const [similarity, setSimilarity] = useState(0);
  const [upvotedDoubts, setUpvotedDoubts] = useState(new Set(JSON.parse(localStorage.getItem('upvotedDoubts') || '[]')));
  const [visibleEmails, setVisibleEmails] = useState(new Set());
  const [isRoomClosed, setIsRoomClosed] = useState(false);
  const [roomClosureMessage, setRoomClosureMessage] = useState('');
  const [activeTab, setActiveTab] = useState('active'); // 'active' or 'answered'
  const [showQRCode, setShowQRCode] = useState(true);
  const [isQrFullscreen, setIsQrFullscreen] = useState(false);
  const [qrFullscreenSize, setQrFullscreenSize] = useState(400);
  const [roomName, setRoomName] = useState('');

  useEffect(() => {
    socket.emit('joinRoom', roomId, role, user.id);

    socket.on('existingDoubts', (existingDoubts) => {
      setDoubts(existingDoubts);
      const upvoted = new Set(existingDoubts.filter(d => d.upvotedBy.includes(user.id)).map(d => d.id));
      setUpvotedDoubts(upvoted);
    });

    socket.on('roomInfo', (info) => {
      if (info && typeof info.topic === 'string') {
        const nm = info.topic.trim();
        if (nm) {
          setRoomName((prev) => prev || nm);
          try { localStorage.setItem(`roomName:${roomId}`, nm); } catch (e) {}
        }
      }
    });

    socket.on('newDoubt', (doubt) => {
      setDoubts((prevDoubts) => [...prevDoubts, doubt]);
      toast.info(`New Doubt: ${doubt.text}`, {
        position: "top-right",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "colored",
        style: { backgroundColor: '#AA60C8' }
      });
    });

    socket.on('upvoteDoubt', (doubtId) => {
      setDoubts((prevDoubts) =>
        prevDoubts.map((doubt) =>
          doubt.id === doubtId ? { ...doubt, upvotes: doubt.upvotes + 1 } : doubt
        )
      );
    });

    socket.on('downvoteDoubt', (doubtId) => {
      setDoubts((prevDoubts) =>
        prevDoubts.map((doubt) =>
          doubt.id === doubtId ? { ...doubt, upvotes: doubt.upvotes - 1 } : doubt
        )
      );
    });

    socket.on('markAsAnswered', (doubtId, answered) => {
      setDoubts((prevDoubts) =>
        prevDoubts.map((doubt) =>
          doubt.id === doubtId ? { ...doubt, answered } : doubt
        )
      );
      toast.success('Doubt marked as answered!', {
        position: "top-right",
        autoClose: 3000,
        theme: "colored",
      });
    });

    socket.on('roomClosed', () => {
      setIsRoomClosed(true);
      setRoomClosureMessage('The room was closed, kindly leave the room');
      toast.error('Room was closed, kindly leave the room');
    });

    return () => {
      socket.off('existingDoubts');
      socket.off('roomInfo');
      socket.off('newDoubt');
      socket.off('upvoteDoubt');
      socket.off('downvoteDoubt');
      socket.off('markAsAnswered');
      socket.off('roomClosed');
    };
  }, [roomId, role, user.id, navigate]);

  useEffect(() => {
    const fetchDoubts = async () => {
      const response = await axios.get(`${API_BASE_URL}/rooms/${roomId}/doubts`);
      setDoubts(response.data);
    };

    fetchDoubts();
    try {
      const stored = localStorage.getItem(`roomName:${roomId}`);
      if (stored && stored.trim()) setRoomName(stored.trim());
    } catch (e) {
      // ignore storage errors
    }
    // Try to fetch from API to keep name consistent for all users
    (async () => {
      try {
        const resp = await getRoom(roomId);
        if (resp && resp.exists && resp.room && typeof resp.room.topic === 'string') {
          const apiName = resp.room.topic.trim();
          if (apiName) {
            setRoomName(apiName);
            try { localStorage.setItem(`roomName:${roomId}`, apiName); } catch (e) {}
          }
        }
      } catch (e) {
        // ignore fetch errors
      }
    })();
  }, [roomId]);

  const handleAddDoubt = () => {
    if (newDoubt.trim() === '') {
      toast.error('Doubt cannot be empty');
      return;
    }

    const doubt = {
      id: Math.random().toString(36).substring(2, 15),
      text: newDoubt,
      user: user.emailAddresses[0].emailAddress,
      upvotes: 0,
      createdAt: new Date().toISOString(),
      answered: false,
    };
    socket.emit('newDoubt', roomId, doubt);
    setNewDoubt('');
    setSimilarity(0);
    toast.success('Doubt submitted successfully!', {
      position: "top-right",
      autoClose: 3000,
      theme: "colored",
    });
  };

  const handleToggleUpvote = (id) => {
    if (upvotedDoubts.has(id)) {
      socket.emit('downvoteDoubt', roomId, id, user.id);
      setUpvotedDoubts((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        localStorage.setItem('upvotedDoubts', JSON.stringify(Array.from(newSet)));
        return newSet;
      });
    } else {
      socket.emit('upvoteDoubt', roomId, id, user.id);
      setUpvotedDoubts((prev) => {
        const newSet = new Set(prev).add(id);
        localStorage.setItem('upvotedDoubts', JSON.stringify(Array.from(newSet)));
        return newSet;
      });
    }
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
    socket.emit('markAsAnswered', roomId, id);
  };

  const handleCopyRoomId = () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(roomId).then(() => {
        toast.success('Room ID copied to clipboard!');
      }).catch((err) => {
        toast.error('Failed to copy Room ID');
        console.error('Failed to copy Room ID:', err);
      });
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = roomId;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        toast.success('Room ID copied to clipboard!');
      } catch (err) {
        toast.error('Failed to copy Room ID');
        console.error('Failed to copy Room ID:', err);
      }
      document.body.removeChild(textArea);
    }
  };

  const handleCloseRoom = async () => {
    await axios.delete(`${API_BASE_URL}/rooms/${roomId}`);
    socket.emit('closeRoom', roomId);
    navigate('/');
  };

  const handleLeaveRoom = () => {
    navigate('/');
  };

  const handleDoubtChange = (e) => {
    const newDoubtText = e.target.value;
    setNewDoubt(newDoubtText);

    if (newDoubtText.trim() === '') {
      setSimilarity(0);
      return;
    }

    const existingDoubtTexts = doubts
      .filter(doubt => doubt && doubt.text && typeof doubt.text === 'string')
      .map(doubt => doubt.text);

    if (existingDoubtTexts.length === 0) {
      setSimilarity(0);
      return;
    }

    const bestMatch = stringSimilarity.findBestMatch(newDoubtText, existingDoubtTexts);
    setSimilarity(bestMatch.bestMatch.rating * 100);
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
    setQrFullscreenSize(Math.max(220, size));
  };

  const openQrFullscreen = () => {
    recomputeQrSize();
    setIsQrFullscreen(true);
  };
  const closeQrFullscreen = () => setIsQrFullscreen(false);

  useEffect(() => {
    if (!isQrFullscreen) return;
    const onResize = () => recomputeQrSize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isQrFullscreen]);

  // Download doubts/questions as a text file
  const handleDownloadDoubts = () => {
    if (!doubts || doubts.length === 0) {
      toast.info('No doubts to download.');
      return;
    }
    const lines = doubts.map((d, idx) => `${idx + 1}. ${d.text} [${d.answered ? 'Answered' : 'Active'}]`);
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

  // Separate active and answered doubts
  const activeDoubts = doubts.filter(doubt => !doubt.answered);
  const answeredDoubts = doubts.filter(doubt => doubt.answered);

  // Sort doubts by upvotes and then by creation time
  const sortedActiveDoubts = activeDoubts.sort((a, b) => {
    if (b.upvotes === a.upvotes) {
      return new Date(a.createdAt) - new Date(b.createdAt);
    }
    return b.upvotes - a.upvotes;
  });

  const sortedAnsweredDoubts = answeredDoubts.sort((a, b) => {
    if (b.upvotes === a.upvotes) {
      return new Date(a.createdAt) - new Date(b.createdAt);
    }
    return b.upvotes - a.upvotes;
  });

  const DoubtCard = ({ doubt, isAnswered = false }) => (
    <div
      className={`relative p-4 mb-4 rounded-xl shadow-lg transition-all duration-300 hover:shadow-xl transform hover:scale-[1.01] ${
        isAnswered 
          ? 'bg-emerald-900/30 border border-emerald-400/30' 
          : 'bg-gray-900/50 border border-blue-500/30'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 mr-3">
          <p className={`text-lg font-medium mb-2 ${isAnswered ? 'text-emerald-200' : 'text-gray-100'}`}>
            {doubt.text}
          </p>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <span className={`text-sm font-semibold ${isAnswered ? 'text-emerald-300' : 'text-blue-300'}`}>
                {doubt.upvotes} upvotes
              </span>
              {isAnswered && (
                <span className="text-sm text-emerald-300 font-semibold flex items-center">
                  <FaCheckCircle className="mr-1" />
                  Answered
                </span>
              )}
            </div>
            <div className="flex items-center space-x-2">
              {role === 'host' && (
                <>
                  <button
                    onClick={() => handleToggleEmailVisibility(doubt.id)}
                    className="p-2 text-gray-300 hover:text-white transition-colors"
                    title={visibleEmails.has(doubt.id) ? 'Hide email' : 'Show email'}
                  >
                    {visibleEmails.has(doubt.id) ? <FaEyeSlash /> : <FaEye />}
                  </button>
                  {visibleEmails.has(doubt.id) && (
                    <span className="text-xs text-gray-200 bg-gray-800 px-2 py-1 rounded border border-gray-700">
                      {doubt.user}
                    </span>
                  )}
                  {!isAnswered && (
                    <button
                      onClick={() => handleMarkAsAnswered(doubt.id)}
                      className="p-2 text-emerald-300 hover:text-emerald-200 transition-colors"
                      title="Mark as answered"
                    >
                      <FaCheck />
                    </button>
                  )}
                </>
              )}
              <button
                onClick={() => handleToggleUpvote(doubt.id)}
                className={`p-2 rounded-full transition-all duration-200 ${
                  upvotedDoubts.has(doubt.id) 
                    ? 'text-blue-300 bg-blue-900/40' 
                    : 'text-gray-400 hover:text-blue-300 hover:bg-blue-900/30'
                }`}
                title={upvotedDoubts.has(doubt.id) ? 'Remove upvote' : 'Upvote'}
              >
                <FaThumbsUp />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-800 to-black text-white">
      {/* Header Section */}
      <div className="sticky top-0 z-50 bg-gray-900 bg-opacity-95 backdrop-blur-sm border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="flex flex-col">
                {roomName && (
                  <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">
                    {roomName}
                  </h1>
                )}
                <span className="mt-0.5 inline-block text-xs sm:text-sm text-gray-300 bg-gray-800 px-2 py-0.5 rounded self-start">ID: {roomId}</span>
              </div>
              <button
                onClick={handleCopyRoomId}
                className="p-2 text-gray-300 hover:text-white transition-colors"
                title="Copy Room ID"
              >
                <FaCopy />
              </button>
            </div>
            <div className="flex items-center space-x-2">
              {role !== 'participant' && (
                <>
                  <button
                    onClick={toggleQRCode}
                    className="px-3 py-1.5 text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                  >
                    {showQRCode ? 'Hide QR' : 'Show QR'}
                  </button>
                  <button
                    onClick={handleCloseRoom}
                    className="px-3 py-1.5 text-xs sm:text-sm bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                  >
                    Close Room
                  </button>
                </>
              )}
              {role !== 'host' && (
                <button
                  onClick={handleLeaveRoom}
                  className="px-3 py-1.5 text-xs sm:text-sm bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Leave
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* QR Code Section (for hosts) */}
      {role !== 'participant' && showQRCode && (
        <div className="bg-gray-800 bg-opacity-50 p-4 border-b border-gray-700">
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
                onClick={() => navigator.clipboard.writeText(`${FRONTEND_URL}/room/${roomId}`).then(() => toast.success('Room link copied'))}
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
        <div className="bg-red-600 text-white p-4 text-center flex flex-col items-center gap-4">
          <p className="text-lg font-semibold">{roomClosureMessage}</p>
          {/* Download Doubts Button (visible to all users after room is closed) */}
          <button
            onClick={handleDownloadDoubts}
            className="mt-2 px-6 py-3 bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-700 hover:from-purple-700 hover:to-indigo-800 text-white font-semibold rounded-lg shadow-lg transition-all duration-300 transform hover:scale-105"
          >
            Download All Doubts
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Doubt Input Section (for participants) */}
        {role === 'participant' && !isRoomClosed && (
          <div className="mb-8 rounded-xl p-6 backdrop-blur-sm border border-white/10 bg-gradient-to-br from-gray-900/60 via-gray-900/40 to-gray-800/40">
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <FaQuestionCircle className="text-blue-300" />
                <h2 className="text-xl font-semibold text-gray-100">Ask Your Doubt</h2>
              </div>
              <textarea
                value={newDoubt}
                onChange={handleDoubtChange}
                placeholder="Type your doubt here..."
                className="w-full h-24 p-4 bg-gray-900/80 text-gray-100 rounded-lg border border-blue-500/30 focus:border-blue-400 focus:outline-none resize-none placeholder-gray-400"
                disabled={isRoomClosed}
              />
              {similarity > 0 && (
                <div className="flex items-center space-x-2 text-sm">
                  <span className="text-gray-300">Similarity:</span>
                  <span className={`font-semibold ${similarity > 70 ? 'text-red-300' : similarity > 40 ? 'text-yellow-300' : 'text-green-300'}`}>
                    {similarity.toFixed(1)}%
                  </span>
                  {similarity > 70 && (
                    <span className="text-red-300 text-xs">(Consider checking existing doubts)</span>
                  )}
                </div>
              )}
              <button
                onClick={handleAddDoubt}
                disabled={isRoomClosed || newDoubt.trim() === ''}
                className="w-full sm:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all duration-300 transform hover:scale-105 disabled:transform-none"
              >
                Submit Doubt
              </button>
            </div>
          </div>
        )}

        {/* Tabs for Active and Answered Doubts */}
        <div className="mb-6">
          <div className="flex space-x-1 bg-gray-800 bg-opacity-50 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('active')}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all duration-200 ${
                activeTab === 'active'
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'text-gray-300 hover:text-white hover:bg-gray-700'
              }`}
            >
              Active Doubts ({sortedActiveDoubts.length})
            </button>
            <button
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
        <div className="space-y-6">
          {activeTab === 'active' ? (
            <div>
              <h3 className="text-xl font-semibold mb-4 flex items-center">
                <FaQuestionCircle className="mr-2 text-blue-400" />
                Active Doubts
              </h3>
              {sortedActiveDoubts.length === 0 ? (
                <div className="text-center py-12 rounded-xl border border-white/10 bg-gray-900/40">
                  <FaQuestionCircle className="text-6xl text-gray-400 mx-auto mb-4" />
                  <p className="text-xl text-gray-200 mb-2">No active doubts</p>
                  {role === 'participant' && (
                    <p className="text-gray-400">Be the first to ask a question!</p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {sortedActiveDoubts.map((doubt) => (
                    <DoubtCard key={doubt.id} doubt={doubt} />
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
                <div className="space-y-4">
                  {sortedAnsweredDoubts.map((doubt) => (
                    <DoubtCard key={doubt.id} doubt={doubt} isAnswered={true} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ToastContainer />
    </div>
  );
};

export default RoomPage;