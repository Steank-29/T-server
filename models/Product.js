const mongoose = require('mongoose');

// Size stock subdocument schema
const sizeStockSchema = new mongoose.Schema({
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
    type: String, // Optional: warehouse location, shelf number, etc.
    trim: true,
  },
});

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      minlength: [3, 'Product name must be at least 3 characters'],
      maxlength: [100, 'Product name cannot exceed 100 characters'],
    },
    description: {
      type: String,
      required: [true, 'Product description is required'],
      minlength: [10, 'Description must be at least 10 characters'],
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
    },
    price: {
      type: Number,
      required: [true, 'Product price is required'],
      min: [0, 'Price cannot be negative'],
    },
    
    // NEW: Stock by size
    stockBySize: [sizeStockSchema],
    
    // OPTIONAL: Keep size array for backward compatibility or remove it
    // I recommend keeping both but marking size as not required
    size: {
      type: [String],
      enum: {
        values: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
        message: '{VALUE} is not a valid size',
      },
      // Not required anymore since we use stockBySize
    },
    
    review: {
      type: Number,
      default: 0,
      min: [0, 'Rating cannot be less than 0'],
      max: [5, 'Rating cannot be more than 5'],
      set: (val) => Math.round(val * 2) / 2,
    },
    discount: {
      type: Number,
      default: 0,
      min: [0, 'Discount cannot be negative'],
      max: [100, 'Discount cannot exceed 100%'],
    },
    category: {
      type: String,
      required: [true, 'Product category is required'],
      enum: {
        values: ['Sport', 'Streetwear', 'Religious'],
        message: '{VALUE} is not a valid category',
      },
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'draft'],
      default: 'active',
    },
    mainImage: {
      url: {
        type: String,
        required: [true, 'Main image is required'],
      },
      publicId: {
        type: String,
        required: [true, 'Image public ID is required'],
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
          required: true,
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
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for discounted price
productSchema.virtual('discountedPrice').get(function () {
  if (this.discount > 0) {
    return (this.price * (1 - this.discount / 100)).toFixed(2);
  }
  return this.price.toFixed(2);
});

// Virtual for average rating
productSchema.virtual('averageRating').get(function () {
  return this.review;
});

// NEW: Virtual to check if product is in stock (any size)
productSchema.virtual('inStock').get(function () {
  return this.totalStock > 0;
});

// NEW: Method to get stock for specific size
productSchema.methods.getStockBySize = function(size) {
  const sizeStock = this.stockBySize.find(s => s.size === size);
  return sizeStock ? sizeStock.quantity - sizeStock.reserved : 0;
};

// NEW: Method to check if specific size is available
productSchema.methods.isSizeAvailable = function(size, quantity = 1) {
  const sizeStock = this.stockBySize.find(s => s.size === size);
  if (!sizeStock) return false;
  return (sizeStock.quantity - sizeStock.reserved) >= quantity;
};

// NEW: Method to reserve stock for an order
productSchema.methods.reserveStock = async function(size, quantity) {
  const sizeStock = this.stockBySize.find(s => s.size === size);
  
  if (!sizeStock) {
    throw new Error(`Size ${size} not found for this product`);
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
productSchema.methods.releaseStock = async function(size, quantity) {
  const sizeStock = this.stockBySize.find(s => s.size === size);
  
  if (!sizeStock) {
    throw new Error(`Size ${size} not found for this product`);
  }
  
  if (sizeStock.reserved < quantity) {
    throw new Error(`Cannot release more than reserved. Reserved: ${sizeStock.reserved}`);
  }
  
  sizeStock.reserved -= quantity;
  await this.save();
  return true;
};

// NEW: Method to confirm stock deduction (after order completion)
productSchema.methods.confirmStockDeduction = async function(size, quantity) {
  const sizeStock = this.stockBySize.find(s => s.size === size);
  
  if (!sizeStock) {
    throw new Error(`Size ${size} not found for this product`);
  }
  
  if (sizeStock.reserved < quantity) {
    throw new Error(`Cannot deduct more than reserved. Reserved: ${sizeStock.reserved}`);
  }
  
  sizeStock.quantity -= quantity;
  sizeStock.reserved -= quantity;
  
  await this.save();
  return true;
};

// Pre-save middleware to update totalStock and extract sizes
productSchema.pre('save', function(next) {
  // Capitalize name
  if (this.isModified('name')) {
    this.name = this.name
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
  
  // Update total stock
  if (this.isModified('stockBySize')) {
    this.totalStock = this.stockBySize.reduce((sum, item) => sum + item.quantity, 0);
    
    // Keep size array in sync with stockBySize (optional)
    this.size = this.stockBySize
      .filter(item => item.quantity > 0)
      .map(item => item.size);
  }
  
  next();
});

// NEW: Method to add or update stock for a size
productSchema.methods.updateStock = async function(size, quantity, location = null) {
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
productSchema.index({ name: 'text', description: 'text' });
productSchema.index({ category: 1 });
productSchema.index({ status: 1 });
productSchema.index({ price: 1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ 'stockBySize.size': 1 });
productSchema.index({ totalStock: 1 });

const Product = mongoose.model('Product', productSchema);

module.exports = Product;