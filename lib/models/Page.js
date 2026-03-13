import mongoose from 'mongoose';

const PageSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  usernameTag: {
    type: String,
    required: true,
  },
  slug: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    required: true,
    maxlength: 200,
  },
  description: {
    type: String,
    maxlength: 500,
  },
  thumbnail: {
    type: String,
  },
  blurDataURL: {
    type: String,
  },
  isPrivate: {
    type: Boolean,
    default: false,
  },
  order_index: {
    type: Number,
    required: true,
  },
  postCount: {
    type: Number,
    default: 0,
  },
  pageMetaData: {
    infoText1: { type: String, default: '' },
    infoText2: { type: String, default: '' },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  // Set during one-off Firebase migration only. Null for all natively-created pages.
  firebasePageId: {
    type: String,
    default: null,
  },
});

PageSchema.index({ userId: 1, slug: 1 }, { unique: true });
PageSchema.index({ firebasePageId: 1 }, { sparse: true });
PageSchema.index({ userId: 1, order_index: 1 });

export default mongoose.models.Page || mongoose.model('Page', PageSchema);
