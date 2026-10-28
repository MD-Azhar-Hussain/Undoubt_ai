import { useNavigate } from 'react-router-dom';
import { LuUsersRound } from "react-icons/lu";
import { TiUserAddOutline } from "react-icons/ti";
import { useAuth } from '../contexts/AuthContext';
import RoomHistory from '../components/RoomHistory';

const HomePage = () => {
  const navigate = useNavigate();
  const { user, access } = useAuth();
  const canHost = access?.personalRoomsAllowed || access?.organisations.some(org => ['admin','host'].includes(org.role) && org.status === 'active');

  const handleCreateRoom = () => {
    navigate('/create-room');
  };

  const handleJoinRoom = () => {
    navigate('/join-room');
  };


  // Try to use first or middle name, fallback to name or email
  let userName = '';
  if (user) {
    const name = user.firstName || '';
    userName = name.split(' ')[1] || name.split(' ')[0] || name;
  }

  return (
    <div className="home-screen min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex flex-col">
      <div className="home-hero flex flex-col items-center text-center justify-center text-white px-4 pt-12 pb-6 sm:pt-16 sm:pb-10">
        <div className="home-intro flex flex-col items-center text-center max-w-4xl mx-auto">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 sm:mb-6 break-words">
            Welcome{userName ? `, ${userName}` : ''}.
          </h1>
          <p className="text-base sm:text-lg md:text-2xl mb-8 sm:mb-10 px-4">
            A space for every question. Join a session or start your own.
          </p>
          <div className="home-actions flex flex-col sm:flex-row gap-3 sm:gap-5 justify-center items-center w-full">
            <>{canHost && <button
              onClick={handleCreateRoom}
              className="px-4 py-2 sm:px-6 sm:py-3 text-base sm:text-lg md:text-xl font-semibold bg-blue-600 hover:bg-blue-700 rounded-lg shadow-lg transform hover:scale-105 transition-transform duration-300 flex items-center justify-center cursor-pointer min-w-[160px] sm:min-w-[180px]"
            >
              <TiUserAddOutline aria-hidden="true" /><span>Create Room<small>Host a conversation</small></span>
            </button>}</>
            <button
              onClick={handleJoinRoom}
              className="px-4 py-2 sm:px-6 sm:py-3 text-base sm:text-lg md:text-xl font-semibold bg-purple-600 hover:bg-purple-700 rounded-lg shadow-lg transform hover:scale-105 transition-transform duration-300 flex items-center justify-center cursor-pointer min-w-[160px] sm:min-w-[180px]"
            >
              <LuUsersRound aria-hidden="true" /><span>Join Room<small>Bring your questions</small></span>
            </button>
          </div>
        </div>
      </div>
      <RoomHistory />
    </div>
  );
};

export default HomePage;
