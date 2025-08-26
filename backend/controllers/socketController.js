const Doubt = require('../models/Doubt');
const Room = require('../models/Room');

const handleSocketConnection = (io, socket) => {
  console.log('New client connected');

  socket.on('joinRoom', async (roomId, role, userId) => {
    socket.join(roomId);
    let isHost = false;
    let topic = null;
    try {
      const room = await Room.findOne({ roomId });
      if (room) {
        topic = room.topic || null;
        if (userId && room.hostId === userId) {
          isHost = true;
        }
      }
    } catch (e) {
      // fall through with isHost=false
    }
    socket.role = isHost ? 'host' : 'participant';
    socket.userId = userId;
    console.log(`Client joined room: ${roomId} as ${socket.role}`);
    // Send room metadata to the joined client
    socket.emit('roomInfo', { roomId, topic });

    // Send existing doubts to the newly joined client
    const existingDoubts = await Doubt.find({ roomId });
    socket.emit('existingDoubts', existingDoubts);
  });

  socket.on('newDoubt', async (roomId, doubt) => {
    const newDoubt = new Doubt({ ...doubt, roomId, upvotes: 0, upvotedBy: [] });
    await newDoubt.save();
    io.to(roomId).emit('newDoubt', newDoubt); // Broadcast to all clients in the room
  });

  socket.on('upvoteDoubt', async (roomId, doubtId, userId) => {
    const doubt = await Doubt.findOne({ roomId, id: doubtId });
    if (doubt && !doubt.upvotedBy.includes(userId)) {
      doubt.upvotes += 1;
      doubt.upvotedBy.push(userId);
      await doubt.save();
      io.to(roomId).emit('upvoteDoubt', doubtId); // Broadcast to all clients in the room
    }
  });

  socket.on('downvoteDoubt', async (roomId, doubtId, userId) => {
    const doubt = await Doubt.findOne({ roomId, id: doubtId });
    if (doubt && doubt.upvotedBy.includes(userId)) {
      doubt.upvotes -= 1;
      doubt.upvotedBy = doubt.upvotedBy.filter(id => id !== userId);
      await doubt.save();
      io.to(roomId).emit('downvoteDoubt', doubtId); // Broadcast to all clients in the room
    }
  });

  socket.on('markAsAnswered', async (roomId, doubtId) => {
    if (socket.role !== 'host') {
      return; // only host can toggle answered
    }
    const doubt = await Doubt.findOne({ roomId, id: doubtId });
    if (doubt) {
      doubt.answered = !doubt.answered;
      await doubt.save();
      io.to(roomId).emit('markAsAnswered', doubtId, doubt.answered); // Broadcast to all clients in the room
    }
  });

  socket.on('closeRoom', async (roomId) => {
    if (socket.role !== 'host') {
      return; // only host can close room
    }
    await Doubt.deleteMany({ roomId });
    io.to(roomId).emit('roomClosed'); // Broadcast to all clients in the room
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
};

module.exports = handleSocketConnection;