const mongoose = require('mongoose');

// Size stock subdocument schema for offers
const offerSizeStockSchema = new mongoose.Schema({
  size: {
    type: String,
    enum: {
      values: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
      message: '{VALUE} is not a valid size',
    },
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: [0, 'Stock quantity cannot be negative'],
    default: 0,
  },
  reserved: {
    type: Number,
    default: 0,
    min: [0, 'Reserved quantity cannot be negative'],
  },
  location: {
    type: String,
    trim: true,
  },
});

const offerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Offer name is required'],
      trim: true,
      minlength: [3, 'Offer name must be at least 3 characters'],
      maxlength: [100, 'Offer name cannot exceed 100 characters'],
    },
    description: {
      type: String,
      required: [true, 'Offer description is required'],
      minlength: [10, 'Description must be at least 10 characters'],
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
    },
    mainPrice: {
      type: Number,
      required: [true, 'Original price is required'],
      min: [0, 'Price cannot be negative'],
    },
    discount: {
      type: Number,
      required: [true, 'Discount percentage is required'],
      min: [1, 'Discount must be at least 1%'],
      max: [99, 'Discount cannot exceed 99%'],
    },
    discountedPrice: {
      type: Number,
    },
    review: {
      type: Number,
      default: 0,
      min: [0, 'Rating cannot be less than 0'],
      max: [5, 'Rating cannot be more than 5'],
      set: (val) => Math.round(val * 2) / 2,
    },
    category: {
      type: String,
      required: [true, 'Offer category is required'],
      enum: {
        values: [
          'Summer Sale',
          'Winter Sale',
          'Offer Tawakkul',
          'New Arrival',
          'Eid Special',
          'Limited Edition',
        ],
        message: '{VALUE} is not a valid category',
      },
    },
    
    // NEW: Stock by size for offers
    stockBySize: [offerSizeStockSchema],
    
    // OPTIONAL: Keep sizes array for backward compatibility
    sizes: {
      type: [String],
      enum: {
        values: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
        message: '{VALUE} is not a valid size',
      },
    },
    
    startDate: {
      type: Date,
      required: [true, 'Start date is required'],
    },
    endDate: {
      type: Date,
      required: [true, 'End date is required'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    promoCode: {
      type: String,
      uppercase: true,
      trim: true,
      unique: true,
      sparse: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'expired', 'upcoming', 'ended'],
      default: 'active',
    },
    usageCount: {
      type: Number,
      default: 0,
    },
    maxUsage: {
      type: Number,
      default: 0, // 0 means unlimited
    },
    
    // NEW: Low stock alert threshold
    lowStockThreshold: {
      type: Number,
      default: 5,
      min: [0, 'Threshold cannot be negative'],
    },
    
    // NEW: Track total stock (calculated field)
    totalStock: {
      type: Number,
      default: 0,
    },
    
    mainImage: {
      url: {
        type: String,
        required: [true, 'Main image is required'],
      },
      publicId: {
        type: String,
      },
    },
    images: [
      {
        url: {
          type: String,
          required: true,
        },
        publicId: {
          type: String,
        },
      },
    ],
    totalReviews: {
      type: Number,
      default: 0,
    },
    salesCount: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for savings amount
offerSchema.virtual('savings').get(function () {
  return (this.mainPrice - this.discountedPrice).toFixed(2);
});

// Virtual for discount percentage display
offerSchema.virtual('discountDisplay').get(function () {
  return `${this.discount}% OFF`;
});

// Virtual for time remaining
offerSchema.virtual('timeRemaining').get(function () {
  const now = new Date();
  const end = new Date(this.endDate);
  const diff = end - now;
  
  if (diff <= 0) return 'Expired';
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (days > 0) return `${days}d ${hours}h remaining`;
  return `${hours}h remaining`;
});

// Virtual for offer validity status
offerSchema.virtual('isValid').get(function () {
  const now = new Date();
  return this.isActive && now >= new Date(this.startDate) && now <= new Date(this.endDate);
});

// NEW: Virtual to check if offer is in stock (any size)
offerSchema.virtual('inStock').get(function () {
  return this.totalStock > 0;
});

// NEW: Method to get stock for specific size
offerSchema.methods.getStockBySize = function(size) {
  const sizeStock = this.stockBySize.find(s => s.size === size);
  return sizeStock ? sizeStock.quantity - sizeStock.reserved : 0;
};

// NEW: Method to check if specific size is available
offerSchema.methods.isSizeAvailable = function(size, quantity = 1) {
  const sizeStock = this.stockBySize.find(s => s.size === size);
  if (!sizeStock) return false;
  return (sizeStock.quantity - sizeStock.reserved) >= quantity;
};

// NEW: Method to reserve stock for an order
offerSchema.methods.reserveStock = async function(size, quantity) {
  const sizeStock = this.stockBySize.find(s => s.size === size);
  
  if (!sizeStock) {
    throw new Error(`Size ${size} not found for this offer`);
  }
  
  const available = sizeStock.quantity - sizeStock.reserved;
  
  if (available < quantity) {
    throw new Error(`Insufficient stock for size ${size}. Available: ${available}`);
  }
  
  sizeStock.reserved += quantity;
  await this.save();
  return true;
};

// NEW: Method to release reserved stock (if order is cancelled)
offerSchema.methods.releaseStock = async function(size, quantity) {
  const sizeStock = this.stockBySize.find(s => s.size === size);
  
  if (!sizeStock) {
    throw new Error(`Size ${size} not found for this offer`);
  }
  
  if (sizeStock.reserved < quantity) {
    throw new Error(`Cannot release more than reserved. Reserved: ${sizeStock.reserved}`);
  }
  
  sizeStock.reserved -= quantity;
  await this.save();
  return true;
};

// NEW: Method to confirm stock deduction (after order completion)
offerSchema.methods.confirmStockDeduction = async function(size, quantity) {
  const sizeStock = this.stockBySize.find(s => s.size === size);
  
  if (!sizeStock) {
    throw new Error(`Size ${size} not found for this offer`);
  }
  
  if (sizeStock.reserved < quantity) {
    throw new Error(`Cannot deduct more than reserved. Reserved: ${sizeStock.reserved}`);
  }
  
  sizeStock.quantity -= quantity;
  sizeStock.reserved -= quantity;
  this.salesCount += quantity;
  
  await this.save();
  return true;
};

// NEW: Method to add or update stock for a size
offerSchema.methods.updateStock = async function(size, quantity, location = null) {
  const existingSize = this.stockBySize.find(s => s.size === size);
  
  if (existingSize) {
    existingSize.quantity = quantity;
    if (location) existingSize.location = location;
  } else {
    this.stockBySize.push({
      size,
      quantity,
      reserved: 0,
      location: location || undefined,
    });
  }
  
  await this.save();
  return this;
};

// Indexes
offerSchema.index({ name: 'text', description: 'text', promoCode: 'text' });
offerSchema.index({ category: 1 });
offerSchema.index({ status: 1 });
offerSchema.index({ isActive: 1 });
offerSchema.index({ isFeatured: 1 });
offerSchema.index({ startDate: 1, endDate: 1 });
offerSchema.index({ promoCode: 1 }, { unique: true, sparse: true });
offerSchema.index({ createdAt: -1 });
offerSchema.index({ 'stockBySize.size': 1 });
offerSchema.index({ totalStock: 1 });

// Pre-save middleware to calculate discounted price, set status, and update total stock
offerSchema.pre('save', function (next) {
  // Calculate discounted price
  if (this.isModified('mainPrice') || this.isModified('discount')) {
    this.discountedPrice = parseFloat(
      (this.mainPrice * (1 - this.discount / 100)).toFixed(2)
    );
  }

  // Update total stock
  if (this.isModified('stockBySize')) {
    this.totalStock = this.stockBySize.reduce((sum, item) => sum + item.quantity, 0);
    
    // Keep sizes array in sync with stockBySize (optional)
    this.sizes = this.stockBySize
      .filter(item => item.quantity > 0)
      .map(item => item.size);
  }

  // Set status based on dates and active flag
  const now = new Date();
  
  if (!this.isActive) {
    this.status = 'inactive';
  } else if (now < new Date(this.startDate)) {
    this.status = 'upcoming';
  } else if (now > new Date(this.endDate)) {
    this.status = 'expired';
  } else {
    this.status = 'active';
  }

  // Capitalize name
  if (this.isModified('name')) {
    this.name = this.name
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  next();
});

// Static method to update expired offers
offerSchema.statics.updateExpiredOffers = async function () {
  const now = new Date();
  await this.updateMany(
    {
      endDate: { $lt: now },
      status: { $ne: 'expired' },
    },
    {
      status: 'expired',
      isActive: false,
    }
  );
};

// Static method to activate upcoming offers
offerSchema.statics.activateUpcomingOffers = async function () {
  const now = new Date();
  await this.updateMany(
    {
      startDate: { $lte: now },
      endDate: { $gt: now },
      isActive: true,
      status: 'upcoming',
    },
    {
      status: 'active',
    }
  );
};

const Offer = mongoose.model('Offer', offerSchema);

module.exports = Offer;