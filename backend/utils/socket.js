import { io } from 'socket.io-client';
require('dotenv').config();

const socket = io(process.env.VITE_SOCKET_SERVER_URL, {
  withCredentials: true,
});

export default socket;