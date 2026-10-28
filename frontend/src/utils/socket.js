import { io } from 'socket.io-client';
import { auth } from '../config/firebase';
import { socketOrigin } from '../config/socketEndpoint';
const socket = io(socketOrigin(import.meta.env.VITE_SOCKET_SERVER_URL, window.location.origin), {
  path: '/socket.io/',
  autoConnect: false,
  auth: async callback => {
    try { callback({ token: await auth.currentUser?.getIdToken() }); }
    catch { callback({ token: null }); }
  },
  timeout: 10000,
});
export default socket;
