import axios from './http';

export const getDoubts = async (roomId, before) => {
  const response = await axios.get(`/rooms/${roomId}/doubts`, { params: { before } });
  return response.data;
};

