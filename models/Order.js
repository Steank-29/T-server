// backend/models/Order.js
const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'items.itemType',
  },
  itemType: {
    type: String,
    enum: ['Product', 'Offer'],
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
  discountedPrice: {
    type: Number,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    default: 1,
    min: 1,
  },
  size: {
    type: String,
    required: true,
  },
  image: {
    type: String,
    default: '',
  },
  discount: {
    type: Number,
    default: 0,
  },
});

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    unique: true,
  },
  customer: {
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      minlength: [3, 'Name must be at least 3 characters'],
    },
    email: {
      type: String,
      required: [false, 'Email is required'],
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email'],
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
    },
    address: {
      type: String,
      required: [true, 'Address is required'],
      trim: true,
      minlength: [5, 'Please provide complete address'],
    },
    notes: {
      type: String,
      default: '',
    },
  },
  items: [orderItemSchema],
  totalAmount: {
    type: Number,
    required: true,
  },
  discountAmount: {
    type: Number,
    default: 0,
  },
  shippingCost: {        // ✅ NEW FIELD
    type: Number,
    default: 0,
  },
  finalAmount: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending',
  },
  paymentMethod: {
    type: String,
    enum: ['cash_on_delivery', 'card', 'online'],
    default: 'cash_on_delivery',
  },
  isPaid: {
    type: Boolean,
    default: false,
  },
  paidAt: Date,
  deliveredAt: Date,
  cancelledAt: Date,
  cancellationReason: String,
}, {
  timestamps: true,
});

// Generate unique order number
const generateOrderNumber = async () => {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  
  // Count orders created today for sequential number
  const todayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  
  const count = await mongoose.model('Order').countDocuments({
    createdAt: { $gte: todayStart, $lt: todayEnd },
  });
  
  const sequential = (count + 1).toString().padStart(4, '0');
  return `TAW-${year}${month}${day}-${sequential}`;
};

// Pre-save middleware to generate orderNumber
orderSchema.pre('save', async function(next) {
  try {
    if (this.isNew && !this.orderNumber) {
      this.orderNumber = await generateOrderNumber();
    }
    next();
  } catch (error) {
    next(error);
  }
});

// Indexes for better query performance
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ 'customer.email': 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ createdAt: -1 });

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;