const mongoose = require('mongoose');

const doubtSchema = new mongoose.Schema({
  roomId: String,
  id: String,
  text: String,
  user: String,
  upvotes: Number,
  upvotedBy: [String], // Array of user IDs who upvoted
});

const Doubt = mongoose.model('Doubt', doubtSchema);

module.exports = Doubt;

