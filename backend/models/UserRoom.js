const mongoose = require('mongoose');

const UserRoomSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  roomId: { type: String, required: true },
});

const UserRoom = mongoose.model('UserRoom', UserRoomSchema);

module.exports = UserRoom;