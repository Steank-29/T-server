const Offer = require('../models/Offer');
const cloudinary = require('../config/cloudinary');
const fs = require('fs');

// Helper function to parse stockBySize from request
const parseStockBySize = (stockData) => {
  if (!stockData) return [];
  
  try {
    // If it's already an array
    if (Array.isArray(stockData)) {
      return stockData.map(item => ({
        size: item.size,
        quantity: Number(item.quantity),
        reserved: item.reserved || 0,
        location: item.location || null,
      }));
    }
    
    // If it's a JSON string
    if (typeof stockData === 'string') {
      const parsed = JSON.parse(stockData);
      return parsed.map(item => ({
        size: item.size,
        quantity: Number(item.quantity),
        reserved: item.reserved || 0,
        location: item.location || null,
      }));
    }
    
    return [];
  } catch (error) {
    throw new Error('Invalid stockBySize format');
  }
};

// @desc    Create a new offer
// @route   POST /api/offers
// @access  Private/Admin
const createOffer = async (req, res) => {
  try {
    const {
      name,
      description,
      mainPrice,
      discount,
      review,
      category,
      sizes,
      stockBySize,
      startDate,
      endDate,
      isActive,
      isFeatured,
      promoCode,
      maxUsage,
      lowStockThreshold,
    } = req.body;

    // Validate required fields
    if (!name || !description || !mainPrice || !discount || !category || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields',
      });
    }

    // Validate dates
    if (new Date(endDate) <= new Date(startDate)) {
      return res.status(400).json({
        success: false,
        message: 'End date must be after start date',
      });
    }

    // Parse stock by size
    let stockData = [];
    try {
      stockData = parseStockBySize(stockBySize);
      
      // Validate that at least one size has stock
      if (stockData.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one size with stock quantity is required',
        });
      }
      
      // Validate all sizes have quantity >= 0
      for (const item of stockData) {
        if (item.quantity < 0) {
          return res.status(400).json({
            success: false,
            message: `Stock quantity for size ${item.size} cannot be negative`,
          });
        }
      }
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    // Check if main image was uploaded
    if (!req.files || !req.files.mainImage) {
      return res.status(400).json({
        success: false,
        message: 'Main image is required',
      });
    }

    // Upload main image to Cloudinary
    const mainImageResult = await cloudinary.uploader.upload(
      req.files.mainImage[0].path,
      {
        folder: 'tawakkul/offers/main',
        width: 800,
        height: 800,
        crop: 'fill',
        quality: 'auto',
      }
    );

    // Delete local file after upload
    fs.unlinkSync(req.files.mainImage[0].path);

    // Upload additional images if provided
    let imagesArray = [];
    if (req.files.images && req.files.images.length > 0) {
      for (const file of req.files.images) {
        const result = await cloudinary.uploader.upload(file.path, {
          folder: 'tawakkul/offers/gallery',
          width: 800,
          height: 800,
          crop: 'fill',
          quality: 'auto',
        });
        imagesArray.push({
          url: result.secure_url,
          publicId: result.public_id,
        });
        fs.unlinkSync(file.path);
      }
    }

    // Create offer
    const offer = await Offer.create({
      name,
      description,
      mainPrice: Number(mainPrice),
      discount: Number(discount),
      review: review ? Number(review) : 0,
      category,
      stockBySize: stockData,
      sizes: stockData.map(item => item.size), // Auto-populate sizes from stock
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      isActive: isActive !== undefined ? isActive : true,
      isFeatured: isFeatured !== undefined ? isFeatured : false,
      promoCode: promoCode || undefined,
      maxUsage: maxUsage ? Number(maxUsage) : 0,
      lowStockThreshold: lowStockThreshold ? Number(lowStockThreshold) : 5,
      mainImage: {
        url: mainImageResult.secure_url,
        publicId: mainImageResult.public_id,
      },
      images: imagesArray,
      createdBy: req.user.id,
    });

    res.status(201).json({
      success: true,
      message: 'Offer created successfully',
      data: offer,
    });
  } catch (error) {
    console.error('Error creating offer:', error);

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', '),
      });
    }

    // Handle duplicate promo code
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Promo code already exists. Please use a different code.',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while creating offer',
      error: error.message,
    });
  }
};

// @desc    Get all offers with filtering, sorting, and pagination
// @route   GET /api/offers
// @access  Private/Admin
const getOffers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      category,
      status,
      isActive,
      isFeatured,
      minDiscount,
      maxDiscount,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      inStock, // New: filter by stock availability
      size, // New: filter by available size
    } = req.query;

    // Build filter object
    const filter = {};

    // Search by name, description, or promo code
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { promoCode: { $regex: search, $options: 'i' } },
      ];
    }

    // Filter by category
    if (category && category !== 'all') {
      filter.category = category;
    }

    // Filter by status
    if (status && status !== 'all') {
      filter.status = status;
    }

    // Filter by active status
    if (isActive !== undefined && isActive !== 'all') {
      filter.isActive = isActive === 'true';
    }

    // Filter by featured status
    if (isFeatured !== undefined && isFeatured !== 'all') {
      filter.isFeatured = isFeatured === 'true';
    }

    // Filter by discount range
    if (minDiscount || maxDiscount) {
      filter.discount = {};
      if (minDiscount) filter.discount.$gte = Number(minDiscount);
      if (maxDiscount) filter.discount.$lte = Number(maxDiscount);
    }

    // Filter by stock availability
    if (inStock === 'true') {
      filter.totalStock = { $gt: 0 };
    } else if (inStock === 'false') {
      filter.totalStock = 0;
    }

    // Filter by available size
    if (size) {
      filter['stockBySize.size'] = size;
      filter['stockBySize.quantity'] = { $gt: 0 };
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Execute query
    const [offers, total] = await Promise.all([
      Offer.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email'),
      Offer.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      count: offers.length,
      total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      data: offers,
    });
  } catch (error) {
    console.error('Error getting offers:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching offers',
      error: error.message,
    });
  }
};

// @desc    Get single offer by ID
// @route   GET /api/offers/:id
// @access  Private/Admin
const getOfferById = async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'Offer not found',
      });
    }

    // Add computed fields for convenience
    const offerWithStock = offer.toObject();
    offerWithStock.stockSummary = {
      totalStock: offer.totalStock,
      inStock: offer.inStock,
      sizes: offer.stockBySize.map(s => ({
        size: s.size,
        available: s.quantity - s.reserved,
        total: s.quantity,
        reserved: s.reserved,
        location: s.location,
        isLowStock: (s.quantity - s.reserved) <= offer.lowStockThreshold,
      })),
    };

    res.status(200).json({
      success: true,
      data: offerWithStock,
    });
  } catch (error) {
    console.error('Error getting offer:', error);

    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Offer not found',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while fetching offer',
      error: error.message,
    });
  }
};

// @desc    Update offer
// @route   PUT /api/offers/:id
// @access  Private/Admin
const updateOffer = async (req, res) => {
  try {
    let offer = await Offer.findById(req.params.id);

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'Offer not found',
      });
    }

    const updateData = { ...req.body };
    updateData.updatedBy = req.user.id;

    // Convert date strings to Date objects
    if (updateData.startDate) {
      updateData.startDate = new Date(updateData.startDate);
    }
    if (updateData.endDate) {
      updateData.endDate = new Date(updateData.endDate);
    }

    // Handle stockBySize update
    if (req.body.stockBySize) {
      try {
        const stockData = parseStockBySize(req.body.stockBySize);
        
        // Validate quantities
        for (const item of stockData) {
          if (item.quantity < 0) {
            return res.status(400).json({
              success: false,
              message: `Stock quantity for size ${item.size} cannot be negative`,
            });
          }
        }
        
        updateData.stockBySize = stockData;
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }
    }

    // Handle main image update
    if (req.files && req.files.mainImage) {
      // Delete old main image from Cloudinary
      if (offer.mainImage.publicId) {
        await cloudinary.uploader.destroy(offer.mainImage.publicId);
      }

      // Upload new main image
      const mainImageResult = await cloudinary.uploader.upload(
        req.files.mainImage[0].path,
        {
          folder: 'tawakkul/offers/main',
          width: 800,
          height: 800,
          crop: 'fill',
          quality: 'auto',
        }
      );

      updateData.mainImage = {
        url: mainImageResult.secure_url,
        publicId: mainImageResult.public_id,
      };

      fs.unlinkSync(req.files.mainImage[0].path);
    }

    // Handle additional images
    if (req.files && req.files.images && req.files.images.length > 0) {
      // Delete old additional images from Cloudinary
      if (offer.images && offer.images.length > 0) {
        for (const image of offer.images) {
          if (image.publicId) {
            await cloudinary.uploader.destroy(image.publicId);
          }
        }
      }

      // Upload new additional images
      let imagesArray = [];
      for (const file of req.files.images) {
        const result = await cloudinary.uploader.upload(file.path, {
          folder: 'tawakkul/offers/gallery',
          width: 800,
          height: 800,
          crop: 'fill',
          quality: 'auto',
        });
        imagesArray.push({
          url: result.secure_url,
          publicId: result.public_id,
        });
        fs.unlinkSync(file.path);
      }
      updateData.images = imagesArray;
    }

    // Handle sizes if provided as string (legacy)
    if (updateData.sizes && typeof updateData.sizes === 'string') {
      updateData.sizes = JSON.parse(updateData.sizes);
    }

    // Handle low stock threshold
    if (updateData.lowStockThreshold) {
      updateData.lowStockThreshold = Number(updateData.lowStockThreshold);
    }

    // Update offer
    offer = await Offer.findByIdAndUpdate(
      req.params.id,
      updateData,
      {
        new: true,
        runValidators: true,
      }
    )
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.status(200).json({
      success: true,
      message: 'Offer updated successfully',
      data: offer,
    });
  } catch (error) {
    console.error('Error updating offer:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', '),
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Promo code already exists. Please use a different code.',
      });
    }

    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Offer not found',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while updating offer',
      error: error.message,
    });
  }
};

// @desc    Delete offer
// @route   DELETE /api/offers/:id
// @access  Private/Admin
const deleteOffer = async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id);

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'Offer not found',
      });
    }

    // Delete images from Cloudinary
    if (offer.mainImage.publicId) {
      await cloudinary.uploader.destroy(offer.mainImage.publicId);
    }

    if (offer.images && offer.images.length > 0) {
      for (const image of offer.images) {
        if (image.publicId) {
          await cloudinary.uploader.destroy(image.publicId);
        }
      }
    }

    // Delete offer from database
    await Offer.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Offer deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting offer:', error);

    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Offer not found',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while deleting offer',
      error: error.message,
    });
  }
};

// @desc    Bulk delete offers
// @route   DELETE /api/offers/bulk
// @access  Private/Admin
const bulkDeleteOffers = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of offer IDs',
      });
    }

    // Find all offers to delete their images
    const offers = await Offer.find({ _id: { $in: ids } });

    // Delete images from Cloudinary
    for (const offer of offers) {
      if (offer.mainImage.publicId) {
        await cloudinary.uploader.destroy(offer.mainImage.publicId);
      }
      if (offer.images && offer.images.length > 0) {
        for (const image of offer.images) {
          if (image.publicId) {
            await cloudinary.uploader.destroy(image.publicId);
          }
        }
      }
    }

    // Delete offers from database
    await Offer.deleteMany({ _id: { $in: ids } });

    res.status(200).json({
      success: true,
      message: `${ids.length} offers deleted successfully`,
    });
  } catch (error) {
    console.error('Error bulk deleting offers:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting offers',
      error: error.message,
    });
  }
};

// @desc    Toggle offer status (active/inactive)
// @route   PATCH /api/offers/:id/toggle-status
// @access  Private/Admin
const toggleOfferStatus = async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id);

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'Offer not found',
      });
    }

    offer.isActive = !offer.isActive;
    offer.updatedBy = req.user.id;
    await offer.save();

    res.status(200).json({
      success: true,
      message: `Offer ${offer.isActive ? 'activated' : 'deactivated'} successfully`,
      data: offer,
    });
  } catch (error) {
    console.error('Error toggling offer status:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while toggling offer status',
      error: error.message,
    });
  }
};

// @desc    Toggle offer featured status
// @route   PATCH /api/offers/:id/toggle-featured
// @access  Private/Admin
const toggleOfferFeatured = async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id);

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'Offer not found',
      });
    }

    offer.isFeatured = !offer.isFeatured;
    offer.updatedBy = req.user.id;
    await offer.save();

    res.status(200).json({
      success: true,
      message: `Offer ${offer.isFeatured ? 'marked as featured' : 'removed from featured'}`,
      data: offer,
    });
  } catch (error) {
    console.error('Error toggling featured status:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while toggling featured status',
      error: error.message,
    });
  }
};

// @desc    Get offer statistics
// @route   GET /api/offers/stats
// @access  Private/Admin
const getOfferStats = async (req, res) => {
  try {
    const stats = await Offer.aggregate([
      {
        $group: {
          _id: null,
          totalOffers: { $sum: 1 },
          activeOffers: {
            $sum: {
              $cond: [{ $eq: ['$status', 'active'] }, 1, 0],
            },
          },
          averageDiscount: { $avg: '$discount' },
          featuredOffers: {
            $sum: {
              $cond: [{ $eq: ['$isFeatured', true] }, 1, 0],
            },
          },
          totalSales: { $sum: '$salesCount' },
          averageSavings: { $avg: { $subtract: ['$mainPrice', '$discountedPrice'] } },
          totalStockUnits: { $sum: '$totalStock' },
        },
      },
    ]);

    const categoryStats = await Offer.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          averageDiscount: { $avg: '$discount' },
          totalStock: { $sum: '$totalStock' },
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);

    const statusStats = await Offer.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    // Low stock offers count
    const lowStockOffers = await Offer.aggregate([
      {
        $unwind: '$stockBySize',
      },
      {
        $match: {
          $expr: {
            $lte: [
              { $subtract: ['$stockBySize.quantity', '$stockBySize.reserved'] },
              '$lowStockThreshold'
            ]
          }
        },
      },
      {
        $group: {
          _id: '$name',
          sizes: { $push: '$stockBySize.size' },
        },
      },
      {
        $count: 'count',
      },
    ]);

    res.status(200).json({
      success: true,
      data: {
        overall: stats[0] || {},
        byCategory: categoryStats,
        byStatus: statusStats,
        lowStockOffersCount: lowStockOffers[0]?.count || 0,
      },
    });
  } catch (error) {
    console.error('Error getting offer stats:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching statistics',
      error: error.message,
    });
  }
};

// @desc    Validate promo code (public)
// @route   POST /api/offers/validate-promo
// @access  Public
const validatePromoCode = async (req, res) => {
  try {
    const { promoCode, cartTotal } = req.body;

    if (!promoCode) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a promo code',
      });
    }

    const offer = await Offer.findOne({
      promoCode: promoCode.toUpperCase(),
      isActive: true,
      status: 'active',
    });

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'Invalid or expired promo code',
      });
    }

    // Check if offer has stock
    if (offer.totalStock <= 0) {
      return res.status(400).json({
        success: false,
        message: 'This offer is currently out of stock',
      });
    }

    // Check max usage
    if (offer.maxUsage > 0 && offer.usageCount >= offer.maxUsage) {
      return res.status(400).json({
        success: false,
        message: 'Promo code usage limit reached',
      });
    }

    // Calculate discount amount
    const discountAmount = cartTotal
      ? (cartTotal * offer.discount / 100).toFixed(2)
      : null;

    res.status(200).json({
      success: true,
      message: 'Valid promo code',
      data: {
        offer: {
          id: offer._id,
          name: offer.name,
          discount: offer.discount,
          promoCode: offer.promoCode,
        },
        discountAmount: discountAmount ? parseFloat(discountAmount) : null,
      },
    });
  } catch (error) {
    console.error('Error validating promo code:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while validating promo code',
      error: error.message,
    });
  }
};

// @desc    Export offers to CSV
// @route   GET /api/offers/export
// @access  Private/Admin
const exportOffers = async (req, res) => {
  try {
    const { format = 'json' } = req.query;
    const offers = await Offer.find({})
      .select('-__v')
      .populate('createdBy', 'name email');

    if (format === 'csv') {
      const csvHeader = 'Name,Description,Original Price,Discount %,Final Price,Category,Stock Details,Total Stock,Promo Code,Start Date,End Date,Status,Featured\n';
      const csvRows = offers.map((o) => {
        const stockDetails = o.stockBySize
          .map(s => `${s.size}:${s.quantity - s.reserved}`)
          .join('; ');
        
        return `"${o.name}","${o.description}","${o.mainPrice}","${o.discount}","${o.discountedPrice}","${o.category}","${stockDetails}","${o.totalStock}","${o.promoCode || ''}","${o.startDate.toISOString()}","${o.endDate.toISOString()}","${o.status}","${o.isFeatured}"`;
      });
      const csv = csvHeader + csvRows.join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=offers.csv');
      return res.send(csv);
    }

    res.status(200).json({
      success: true,
      count: offers.length,
      data: offers,
    });
  } catch (error) {
    console.error('Error exporting offers:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while exporting offers',
      error: error.message,
    });
  }
};

// NEW: @desc    Update offer stock for specific size
// @route   PATCH /api/offers/:id/stock
// @access  Private/Admin
const updateOfferStock = async (req, res) => {
  try {
    const { size, quantity, operation = 'set', location } = req.body;
    
    if (!size || quantity === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Please provide size and quantity',
      });
    }

    const offer = await Offer.findById(req.params.id);
    
    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'Offer not found',
      });
    }

    const sizeStock = offer.stockBySize.find(s => s.size === size);
    
    if (!sizeStock && operation !== 'set') {
      return res.status(404).json({
        success: false,
        message: `Size ${size} not found for this offer`,
      });
    }

    switch (operation) {
      case 'set':
        await offer.updateStock(size, Number(quantity), location);
        break;
      case 'add':
        if (sizeStock) {
          sizeStock.quantity += Number(quantity);
          if (location) sizeStock.location = location;
        } else {
          offer.stockBySize.push({
            size,
            quantity: Number(quantity),
            reserved: 0,
            location: location || null,
          });
        }
        await offer.save();
        break;
      case 'subtract':
        const newQuantity = sizeStock.quantity - Number(quantity);
        if (newQuantity < 0) {
          return res.status(400).json({
            success: false,
            message: 'Cannot subtract more than available stock',
          });
        }
        sizeStock.quantity = newQuantity;
        await offer.save();
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid operation. Use: set, add, or subtract',
        });
    }

    // Refresh offer to get updated values
    const updatedOffer = await Offer.findById(req.params.id);

    res.status(200).json({
      success: true,
      message: `Stock updated successfully for size ${size}`,
      data: {
        size,
        available: updatedOffer.getStockBySize(size),
        total: updatedOffer.stockBySize.find(s => s.size === size)?.quantity || 0,
      },
    });
  } catch (error) {
    console.error('Error updating stock:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating stock',
      error: error.message,
    });
  }
};

// NEW: @desc    Get low stock offers
// @route   GET /api/offers/low-stock
// @access  Private/Admin
const getLowStockOffers = async (req, res) => {
  try {
    const offers = await Offer.find({})
      .populate('createdBy', 'name email');
    
    const lowStockOffers = offers
      .map(offer => {
        const lowStockSizes = offer.stockBySize
          .filter(size => (size.quantity - size.reserved) <= offer.lowStockThreshold)
          .map(size => ({
            size: size.size,
            available: size.quantity - size.reserved,
            total: size.quantity,
            threshold: offer.lowStockThreshold,
          }));
        
        if (lowStockSizes.length > 0) {
          return {
            ...offer.toObject(),
            lowStockSizes,
          };
        }
        return null;
      })
      .filter(o => o !== null);

    res.status(200).json({
      success: true,
      count: lowStockOffers.length,
      data: lowStockOffers,
    });
  } catch (error) {
    console.error('Error getting low stock offers:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching low stock offers',
      error: error.message,
    });
  }
};

module.exports = {
  createOffer,
  getOffers,
  getOfferById,
  updateOffer,
  deleteOffer,
  bulkDeleteOffers,
  toggleOfferStatus,
  toggleOfferFeatured,
  getOfferStats,
  validatePromoCode,
  exportOffers,
  updateOfferStock,
  getLowStockOffers,
};