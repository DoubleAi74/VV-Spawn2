import mongoose from 'mongoose';

// Stores single-use magic link tokens (expire after 10 minutes).
const VerificationTokenSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  token: {
    type: String,
    required: true,
    unique: true,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  used: {
    type: Boolean,
    default: false,
  },
});

// TTL index for automatic expiry (unique on token declared above)
VerificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.VerificationToken ||
  mongoose.model('VerificationToken', VerificationTokenSchema);
