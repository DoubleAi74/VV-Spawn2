import mongoose from 'mongoose';

const PostSchema = new mongoose.Schema({
  pageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Page',
    required: true,
  },
  slug: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    maxlength: 200,
    default: '',
  },
  description: {
    type: String,
    default: '',
  },
  content: {
    type: String,
    default: '',
  },
  content_type: {
    type: String,
    enum: ['photo', 'file', 'url', 'text'],
    required: true,
  },
  thumbnail: {
    type: String,
  },
  blurDataURL: {
    type: String,
  },
  order_index: {
    type: Number,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

PostSchema.index({ pageId: 1, slug: 1 }, { unique: true });
PostSchema.index({ pageId: 1, order_index: 1 });

export default mongoose.models.Post || mongoose.model('Post', PostSchema);
