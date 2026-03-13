import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  passwordHash: {
    type: String,
    required: true,
  },
  usernameTitle: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  usernameTag: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: 50,
  },
  pageCount: {
    type: Number,
    default: 0,
  },
  dashboard: {
    infoText: { type: String, default: '' },
    dashHex: { type: String, default: '#2d3e50' },
    backHex: { type: String, default: '#e5e7eb' },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  // Set during one-off Firebase migration only. Null for all natively-created accounts.
  firebaseUid: {
    type: String,
    default: null,
  },
});

// Unique indexes declared on fields above; no duplicate .index() calls needed.
UserSchema.index({ firebaseUid: 1 }, { sparse: true });

export default mongoose.models.User || mongoose.model('User', UserSchema);
