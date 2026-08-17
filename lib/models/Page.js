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
  // Every address this page has ever had, kept indefinitely. A link someone
  // circulated must not break because the owner corrected a typo in a title.
  // See LNK-3.
  previousSlugs: {
    type: [String],
    default: [],
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
// Redirect lookups and the uniqueness check both query this.
PageSchema.index({ userId: 1, previousSlugs: 1 });

export default mongoose.models.Page || mongoose.model('Page', PageSchema);
