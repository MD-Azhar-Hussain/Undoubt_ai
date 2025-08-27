import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://undoubtai-production.up.railway.app/api';

export const createRoom = async () => {
  const response = await axios.post(`${API_BASE_URL}/rooms`);
  return response.data;
};

export const submitDoubt = async (roomId, doubtText, user) => {
  const response = await axios.post(`${API_BASE_URL}/doubts`, { roomId, text: doubtText, user });
  return response.data;
};

export const getDoubts = async (roomId) => {
  const response = await axios.get(`${API_BASE_URL}/rooms/${roomId}/doubts`);
  return response.data;
};

export const getRoom = async (roomId) => {
  const response = await axios.get(`${API_BASE_URL}/rooms/${roomId}`);
  return response.data;
};

