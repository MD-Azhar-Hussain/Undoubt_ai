const express = require('express');
const Doubt = require('../models/Doubt');
const Room = require('../models/Room'); // Import Room model

const router = express.Router();

// room create karne ke liye route
router.post('/rooms', async (req, res) => {
  const { roomId, hostId, hostEmail, topic } = req.body;
  
  console.log('Backend: Creating room with data', { roomId, hostId, hostEmail, topic });
  
  if (!roomId || !hostId || !hostEmail) {
    console.log('Backend: Missing required fields', { roomId: !!roomId, hostId: !!hostId, hostEmail: !!hostEmail });
    return res.status(400).send({ message: 'Room ID, host ID, and host email are required' });
  }
  
  try {
    const room = new Room({ roomId, hostId, hostEmail, topic });
    await room.save();
    console.log('Backend: Room created successfully', room);
    res.status(201).send({ message: 'Room created', room });
  } catch (error) {
    console.error('Backend: Failed to create room:', error);
    res.status(500).send({ message: 'Failed to create room', error: error.message });
  }
});

// doubt submit karne ke liye route
router.post('/doubts', async (req, res) => {
  const { roomId, text, user } = req.body;
  const doubt = new Doubt({ roomId, text, user, upvotes: 0, upvotedBy: [], answered: false });
  await doubt.save();
  res.status(201).send(doubt);
});

// room se doubts ko lane ke liye route
router.get('/rooms/:roomId/doubts', async (req, res) => {
  const { roomId } = req.params;
  const doubts = await Doubt.find({ roomId });
  res.status(200).send(doubts);
});

// Check if user is host of a room
router.get('/rooms/:roomId/host/:userId', async (req, res) => {
  const { roomId, userId } = req.params;
  
  console.log('Backend: Checking host status', { roomId, userId });
  
  try {
    const room = await Room.findOne({ roomId });
    console.log('Backend: Found room', room);
    
    if (!room) {
      console.log('Backend: Room not found');
      return res.status(404).send({ message: 'Room not found' });
    }
    
    const isHost = room.hostId === userId;
    console.log('Backend: Host comparison', { roomHostId: room.hostId, userId, isHost });
    
    res.status(200).send({ isHost, room });
  } catch (error) {
    console.error('Backend: Error checking host status:', error);
    res.status(500).send({ message: 'Failed to check host status', error: error.message });
  }
});

// room close karne ke liye route
router.delete('/rooms/:roomId', async (req, res) => {
  const { roomId } = req.params;
  await Doubt.deleteMany({ roomId });
  await Room.deleteOne({ roomId });
  res.status(200).send({ message: 'Room closed and doubts deleted' });
});

// fetch all doubts
router.get('/doubts', async (req, res) => {
  const doubts = await Doubt.find();
  res.status(200).send(doubts);
});

// Check if room exists
router.get('/rooms/:roomId', async (req, res) => {
  const { roomId } = req.params;
  try {
    const room = await Room.findOne({ roomId });
    if (!room) {
      return res.status(404).send({ exists: false });
    }
    res.status(200).send({ exists: true, room });
  } catch (e) {
    res.status(500).send({ message: 'Failed to fetch room', error: e.message });
  }
});

module.exports = router;
