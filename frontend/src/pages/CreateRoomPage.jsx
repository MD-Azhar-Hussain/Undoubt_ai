import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { FaCopy, FaShareAlt, FaTimes, FaClock } from 'react-icons/fa';
import axios from 'axios';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useAuth } from '../contexts/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const FRONTEND_URL = import.meta.env.VITE_FRONTEND_URL;

const CreateRoomPage = () => {
  const [roomId, setRoomId] = useState('');
  const navigate = useNavigate();
  const [showShare, setShowShare] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const timerRef = useRef(null);
  const { user } = useAuth();
  const [topic, setTopic] = useState('');

  const handleCreateRoom = async () => {
    if (!user || !user.id || !user.emailAddresses || !user.emailAddresses[0]) {
      toast.error('User information not available. Please log in again.');
      return;
    }

    const newRoomId = Math.floor(10000 + Math.random() * 90000).toString();
    const roomData = {
      roomId: newRoomId,
      hostId: user.id,
      hostEmail: user.emailAddresses[0].emailAddress,
      topic: topic?.trim() || undefined,
    };
    
    console.log('CreateRoomPage: Creating room with data', roomData);
    
    try {
      const response = await axios.post(`${API_BASE_URL}/rooms`, roomData);
      console.log('CreateRoomPage: Room created successfully', response.data);
      setRoomId(newRoomId);
      if (topic && topic.trim()) {
        try {
          localStorage.setItem(`roomName:${newRoomId}`, topic.trim());
        } catch (e) {
          // ignore storage errors
        }
      }
      toast.success('Room created successfully');
      setShowShare(true);
      setCountdown(30);
    } catch (error) {
      console.error('CreateRoomPage: Failed to create room:', error);
      toast.error('Failed to create room');
    }
  };

  useEffect(() => {
    if (showShare) {
      timerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            handleGoToRoom();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [showShare]);

  const handleSkipShare = () => {
    setShowShare(false);
    handleGoToRoom();
  };

  const handleGoToRoom = () => {
    setShowShare(false);
    navigate(`/host/${roomId}`);
  };

  const handleCopyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    toast.success('Room ID copied to clipboard!');
  };

  const handleCopyRoomLink = () => {
    const link = `${FRONTEND_URL}/room/${roomId}`;
    navigator.clipboard.writeText(link);
    toast.success('Room link copied to clipboard!');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-800 to-black flex flex-col items-center justify-center text-white px-4 relative">
      <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold mb-4 sm:mb-6 text-center flex items-center justify-center gap-3 animate-fade-in">
        <FaShareAlt className="text-blue-400 animate-bounce" />
        Create a Room
      </h1>
      <div className="w-full max-w-md mb-3 animate-fade-in">
        <label htmlFor="topic" className="block text-sm sm:text-base text-gray-200 mb-2">Topic of the room (optional)</label>
        <input
          id="topic"
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g., Linear Algebra Doubts"
          className="w-full px-4 py-2 rounded-lg bg-gray-900/60 border border-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600 text-white"
        />
      </div>
      <button
        onClick={handleCreateRoom}
        disabled={showShare}
        className="px-4 py-2 sm:px-6 sm:py-3 text-base sm:text-lg md:text-xl font-semibold bg-blue-600 hover:bg-blue-700 rounded-lg shadow-lg transform hover:scale-105 transition-transform duration-300 cursor-pointer mb-2 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        Create Room
      </button>
      {/* Share Modal/Section */}
      {showShare && roomId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 animate-fade-in">
          {/* Mobile popup (unchanged layout) */}
          <div className="md:hidden bg-gradient-to-br from-purple-900 via-blue-900 to-black rounded-2xl shadow-2xl p-8 flex flex-col items-center relative w-[90vw] max-w-md animate-pop-in">
            <button
              onClick={handleSkipShare}
              className="absolute top-4 right-4 text-gray-300 hover:text-red-400 text-xl"
              title="Skip"
            >
              <FaTimes />
            </button>
            <div className="flex flex-col items-center gap-3">
              <FaShareAlt className="text-3xl text-blue-400 mb-2 animate-bounce" />
              <h2 className="text-2xl font-bold mb-2">Share Your Room</h2>
              <div className="mb-4 p-4 bg-white rounded-lg animate-fade-in">
                <QRCode value={roomId} size={180} />
              </div>
              <p className="text-base sm:text-lg md:text-xl mb-2 text-center">Room ID: <span className="font-mono text-orange-400">{roomId}</span></p>
              <button
                onClick={handleCopyRoomId}
                className="px-4 py-2 text-base font-semibold bg-purple-600 hover:bg-purple-700 rounded-lg shadow-lg transform hover:scale-105 transition-transform duration-300 mb-2"
              >
                <FaCopy className="inline mr-2" />Copy Room ID
              </button>
              <div className="w-full flex flex-col items-center mt-2">
                <span className="text-base sm:text-lg text-center text-gray-200 mb-1">Share Link:</span>
                <div className="flex items-center w-full justify-center gap-2">
                  <span className="font-mono text-xs sm:text-sm bg-gray-900 px-2 py-1 rounded break-all max-w-[180px] sm:max-w-[240px] overflow-x-auto">{`${FRONTEND_URL}/room/${roomId}`}</span>
                  <button
                    onClick={handleCopyRoomLink}
                    className="px-2 py-1 bg-blue-700 hover:bg-blue-800 rounded text-white text-xs font-semibold shadow"
                  >
                    <FaCopy className="inline mr-1" />Copy Link
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-300 mt-2">
                <FaClock />
                <span>Auto-redirecting in {countdown}s</span>
              </div>
              <button
                onClick={handleGoToRoom}
                className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold shadow-lg transition-all duration-300"
              >
                Go to Room
              </button>
            </div>
          </div>

          {/* Desktop popup (distinct layout) */}
          <div className="hidden md:flex bg-gradient-to-br from-purple-900 via-blue-900 to-black rounded-none shadow-2xl p-12 relative w-screen h-screen max-w-none animate-pop-in">
            <button
              onClick={handleSkipShare}
              className="absolute top-4 right-4 text-gray-300 hover:text-red-400 text-2xl"
              title="Skip"
            >
              <FaTimes />
            </button>
            <div className="w-full h-full grid grid-cols-2 xl:grid-cols-3 gap-10 items-center">
              <div className="flex flex-col items-center justify-center">
                <div className="mb-6 p-6 bg-white rounded-xl">
                  <QRCode value={roomId} size={320} />
                </div>
                <p className="text-xl mb-3 text-center">Room ID: <span className="font-mono text-orange-400 text-3xl">{roomId}</span></p>
                <button
                  onClick={handleCopyRoomId}
                  className="px-6 py-3 text-base font-semibold bg-purple-600 hover:bg-purple-700 rounded-lg shadow-lg transition-transform duration-300"
                >
                  <FaCopy className="inline mr-2" />Copy Room ID
                </button>
              </div>

              <div className="flex flex-col justify-center xl:col-span-2 overflow-y-auto pr-2">
                <div className="flex items-center gap-4 mb-6">
                  <FaShareAlt className="text-3xl text-blue-400" />
                  <h2 className="text-4xl font-bold">Share Your Room</h2>
                </div>
                {topic?.trim() && (
                  <p className="text-gray-200 mb-4 text-lg"><span className="text-gray-300">Topic:</span> <span className="font-semibold">{topic.trim()}</span></p>
                )}
                <span className="text-lg text-gray-200 mb-2">Share Link:</span>
                <div className="flex items-center gap-3 mb-6">
                  <span className="font-mono text-base bg-gray-900 px-4 py-3 rounded break-all max-w-4xl overflow-x-auto">{`${FRONTEND_URL}/room/${roomId}`}</span>
                  <button
                    onClick={handleCopyRoomLink}
                    className="px-4 py-3 bg-blue-700 hover:bg-blue-800 rounded text-white text-sm font-semibold shadow"
                  >
                    <FaCopy className="inline mr-1" />Copy Link
                  </button>
                </div>
                <div className="flex items-center gap-2 text-lg text-gray-300">
                  <FaClock />
                  <span>Auto-redirecting in {countdown}s</span>
                </div>
                <div className="mt-8">
                  <button
                    onClick={handleGoToRoom}
                    className="px-8 py-4 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold shadow-lg transition-all duration-300 text-xl"
                  >
                    Go to Room
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Old share section (if any) is removed, only show if not in share modal */}
      {!showShare && roomId && (
        <div className="mt-6 sm:mt-10 flex flex-col items-center animate-fade-in">
          <div className="mb-4 sm:mb-5 p-4 bg-white rounded-lg">
            <QRCode value={roomId} size={window.innerWidth < 640 ? 150 : 200} />
          </div>
          <p className="text-base sm:text-lg md:text-xl mb-3 text-center">Room ID: <span className="font-mono text-orange-400">{roomId}</span></p>
          <button
            onClick={handleCopyRoomId}
            className="px-4 py-2 sm:px-6 sm:py-3 text-base sm:text-lg md:text-xl font-semibold bg-purple-600 hover:bg-purple-700 rounded-lg shadow-lg transform hover:scale-105 transition-transform duration-300"
          >
            Copy Room ID
          </button>
        </div>
      )}
      <ToastContainer />
    </div>
  );
};

export default CreateRoomPage;

