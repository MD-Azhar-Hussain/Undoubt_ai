import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import axios from '../utils/http';
import { parseRoomCode } from '../utils/roomLinks';
import { FRONTEND_URL } from '../utils/constants';


const JoinRoomPage = () => {
  const { roomId: initialCode } = useParams();
  const [roomId, setRoomId] = useState(initialCode || '');
  const [joining, setJoining] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const input = useRef(null);
  const navigate = useNavigate();

  const handleJoinRoom = async (event) => {
    event.preventDefault();
    if (joining) return;
    let code;
    try { code = parseRoomCode(roomId, [window.location.origin, new URL(FRONTEND_URL).origin]); }
    catch (error) { setErrorMessage(error.message); input.current?.focus(); return; }
    setErrorMessage('');
    setJoining(true);
    try {
      const response = await axios.get(`/rooms/${code}`);
      if (response.data.exists) {
        // Persist room name locally for immediate display
        const topic = response.data?.room?.topic;
        if (typeof topic === 'string' && topic.trim()) {
          try { localStorage.setItem(`roomName:${code}`, topic.trim()); } catch { /* Storage may be unavailable. */ }
        }
        navigate(`/room/${code}`);
      } else {
        setErrorMessage('Room not found. Check the code with your host.');
      }
    } catch (error) {
      setErrorMessage(error.response?.data?.message || 'Could not connect. Your code is kept—try again in a moment.');
    } finally { setJoining(false); }
  };

  return (
    <div className="form-screen join-screen min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex flex-col items-center justify-center text-white px-4">
      <div className="form-card w-full max-w-md mx-auto text-center">
        <Link to="/" className="form-back">Back to sessions</Link>
        <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold mb-4 sm:mb-6">
          Join a Room
        </h1>
        <p className="text-base sm:text-lg md:text-xl mb-6 px-4">
          Enter your host’s six-digit code, paste a room link, or scan their QR code.
        </p>
        <form onSubmit={handleJoinRoom}>
        <label htmlFor="room-code" className="sr-only">Room code</label>
        <input
          id="room-code"
          ref={input}
          aria-invalid={!!errorMessage}
          aria-describedby={errorMessage ? 'room-code-error' : 'room-code-hint'}
          autoComplete="off"
          inputMode="numeric"
          maxLength={2048}
          type="text"
          value={roomId}
          disabled={joining}
          onChange={(e) => { setRoomId(e.target.value); setErrorMessage(''); }}
          placeholder="e.g. 482916"
          className="w-full p-2 sm:p-3 text-base sm:text-lg md:text-xl border-2 border-gray-300 rounded-lg text-black mb-6 placeholder-gray-600 bg-gray-200 focus:outline-none focus:border-blue-500"
        />
        <p id="room-code-hint" className="join-hint">You can paste a code like 482 916. Older room links still work.</p>
        {errorMessage && <p id="room-code-error" className="interaction-error" role="alert">{errorMessage}</p>}
        <button
          type="submit"
          disabled={joining || !roomId}
          className="w-full sm:w-auto px-4 py-2 sm:px-6 sm:py-3 text-base sm:text-lg md:text-xl font-semibold bg-blue-600 hover:bg-blue-700 rounded-lg shadow-lg transform hover:scale-105 transition-transform duration-300 cursor-pointer"
        >
          {joining ? 'Joining…' : 'Join Room'}
        </button>
        </form>
      </div>
    </div>
  );
};

export default JoinRoomPage;
