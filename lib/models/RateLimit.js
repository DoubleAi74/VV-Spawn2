import mongoose from 'mongoose';

// One document per (action, identifier) window. `key` is `${action}:${identifier}`;
// the document is deleted by the TTL index once its window has passed, so the
// collection stays small without any sweeping.
const RateLimitSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
  },
  hits: {
    type: Number,
    default: 0,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
});

// TTL index for automatic expiry (unique on key declared above)
RateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.RateLimit || mongoose.model('RateLimit', RateLimitSchema);
