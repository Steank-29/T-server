const Product = require('../models/Product');
const cloudinary = require('../config/cloudinary');
const fs = require('fs');
const path = require('path');

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

// @desc    Create a new product
// @route   POST /api/products
// @access  Private/Admin
const createProduct = async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      size,
      stockBySize,
      review,
      discount,
      category,
      status,
      lowStockThreshold,
    } = req.body;

    // Validate required fields
    if (!name || !description || !price || !category) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields',
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
        folder: 'tawakkul/products/main',
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
          folder: 'tawakkul/products/gallery',
          width: 800,
          height: 800,
          crop: 'fill',
          quality: 'auto',
        });
        imagesArray.push({
          url: result.secure_url,
          publicId: result.public_id,
        });
        // Delete local file
        fs.unlinkSync(file.path);
      }
    }

    // Create product
    const product = await Product.create({
      name,
      description,
      price: Number(price),
      stockBySize: stockData,
      size: stockData.map(item => item.size), // Auto-populate sizes from stock
      review: review ? Number(review) : 0,
      discount: discount ? Number(discount) : 0,
      category,
      status: status || 'active',
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
      message: 'Product created successfully',
      data: product,
    });
  } catch (error) {
    console.error('Error creating product:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', '),
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while creating product',
      error: error.message,
    });
  }
};

// @desc    Get all products with filtering, sorting, and pagination
// @route   GET /api/products
// @access  Private/Admin
const getProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      category,
      status,
      minPrice,
      maxPrice,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      inStock, // New filter: 'true' or 'false'
      size, // Filter by available size
    } = req.query;

    // Build filter object
    const filter = {};

    // Search by name or description
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
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

    // Filter by price range
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
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
    const [products, total] = await Promise.all([
      Product.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email'),
      Product.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      count: products.length,
      total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      data: products,
    });
  } catch (error) {
    console.error('Error getting products:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching products',
      error: error.message,
    });
  }
};

// @desc    Get single product by ID
// @route   GET /api/products/:id
// @access  Private/Admin
const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    // Add computed fields for convenience
    const productWithStock = product.toObject();
    productWithStock.stockSummary = {
      totalStock: product.totalStock,
      inStock: product.inStock,
      sizes: product.stockBySize.map(s => ({
        size: s.size,
        available: s.quantity - s.reserved,
        total: s.quantity,
        reserved: s.reserved,
        location: s.location,
        isLowStock: (s.quantity - s.reserved) <= product.lowStockThreshold,
      })),
    };

    res.status(200).json({
      success: true,
      data: productWithStock,
    });
  } catch (error) {
    console.error('Error getting product:', error);
    
    // Handle invalid ObjectId
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while fetching product',
      error: error.message,
    });
  }
};

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private/Admin
const updateProduct = async (req, res) => {
  try {
    let product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    const updateData = { ...req.body };
    updateData.updatedBy = req.user.id;

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
      if (product.mainImage.publicId) {
        await cloudinary.uploader.destroy(product.mainImage.publicId);
      }

      // Upload new main image
      const mainImageResult = await cloudinary.uploader.upload(
        req.files.mainImage[0].path,
        {
          folder: 'tawakkul/products/main',
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

      // Delete local file
      fs.unlinkSync(req.files.mainImage[0].path);
    }

    // Handle additional images
    if (req.files && req.files.images && req.files.images.length > 0) {
      // Delete old additional images from Cloudinary
      if (product.images && product.images.length > 0) {
        for (const image of product.images) {
          await cloudinary.uploader.destroy(image.publicId);
        }
      }

      // Upload new additional images
      let imagesArray = [];
      for (const file of req.files.images) {
        const result = await cloudinary.uploader.upload(file.path, {
          folder: 'tawakkul/products/gallery',
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

    // Handle low stock threshold
    if (updateData.lowStockThreshold) {
      updateData.lowStockThreshold = Number(updateData.lowStockThreshold);
    }

    // Update product
    product = await Product.findByIdAndUpdate(
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
      message: 'Product updated successfully',
      data: product,
    });
  } catch (error) {
    console.error('Error updating product:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', '),
      });
    }

    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while updating product',
      error: error.message,
    });
  }
};

// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Private/Admin
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    // Delete images from Cloudinary
    if (product.mainImage.publicId) {
      await cloudinary.uploader.destroy(product.mainImage.publicId);
    }

    if (product.images && product.images.length > 0) {
      for (const image of product.images) {
        await cloudinary.uploader.destroy(image.publicId);
      }
    }

    // Delete product from database
    await Product.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Product deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while deleting product',
      error: error.message,
    });
  }
};

// @desc    Bulk delete products
// @route   DELETE /api/products/bulk
// @access  Private/Admin
const bulkDeleteProducts = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of product IDs',
      });
    }

    // Find all products to delete their images
    const products = await Product.find({ _id: { $in: ids } });

    // Delete images from Cloudinary
    for (const product of products) {
      if (product.mainImage.publicId) {
        await cloudinary.uploader.destroy(product.mainImage.publicId);
      }
      if (product.images && product.images.length > 0) {
        for (const image of product.images) {
          await cloudinary.uploader.destroy(image.publicId);
        }
      }
    }

    // Delete products from database
    await Product.deleteMany({ _id: { $in: ids } });

    res.status(200).json({
      success: true,
      message: `${ids.length} products deleted successfully`,
    });
  } catch (error) {
    console.error('Error bulk deleting products:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting products',
      error: error.message,
    });
  }
};

// @desc    Get product statistics
// @route   GET /api/products/stats
// @access  Private/Admin
const getProductStats = async (req, res) => {
  try {
    const stats = await Product.aggregate([
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          averagePrice: { $avg: '$price' },
          averageRating: { $avg: '$review' },
          totalSales: { $sum: '$salesCount' },
          minPrice: { $min: '$price' },
          maxPrice: { $max: '$price' },
          totalInventoryValue: { 
            $sum: { $multiply: ['$price', '$totalStock'] } 
          },
          totalStockUnits: { $sum: '$totalStock' },
        },
      },
    ]);

    const categoryStats = await Product.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          averagePrice: { $avg: '$price' },
          totalStock: { $sum: '$totalStock' },
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);

    const statusStats = await Product.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    // Low stock products count
    const lowStockProducts = await Product.aggregate([
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
        lowStockProductsCount: lowStockProducts[0]?.count || 0,
      },
    });
  } catch (error) {
    console.error('Error getting product stats:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching statistics',
      error: error.message,
    });
  }
};

// @desc    Export products to Excel/CSV
// @route   GET /api/products/export
// @access  Private/Admin
const exportProducts = async (req, res) => {
  try {
    const { format = 'json' } = req.query;
    const products = await Product.find({})
      .select('-__v')
      .populate('createdBy', 'name email');

    if (format === 'csv') {
      // Convert to CSV format with stock details
      const csvHeader = 'Name,Description,Price,Category,Sizes,Stock Details,Total Stock,Rating,Discount,Status,Created At\n';
      const csvRows = products.map((p) => {
        const stockDetails = p.stockBySize
          .map(s => `${s.size}:${s.quantity - s.reserved}`)
          .join('; ');
        
        return `"${p.name}","${p.description}","${p.price}","${p.category}","${p.size.join(';')}","${stockDetails}","${p.totalStock}","${p.review}","${p.discount}","${p.status}","${p.createdAt}"`;
      });
      const csv = csvHeader + csvRows.join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=products.csv');
      return res.send(csv);
    }

    res.status(200).json({
      success: true,
      count: products.length,
      data: products,
    });
  } catch (error) {
    console.error('Error exporting products:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while exporting products',
      error: error.message,
    });
  }
};

// NEW: @desc    Update stock for specific size
// @route   PATCH /api/products/:id/stock
// @access  Private/Admin
const updateProductStock = async (req, res) => {
  try {
    const { size, quantity, operation = 'set', location } = req.body;
    
    if (!size || quantity === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Please provide size and quantity',
      });
    }

    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    const sizeStock = product.stockBySize.find(s => s.size === size);
    
    if (!sizeStock && operation !== 'set') {
      return res.status(404).json({
        success: false,
        message: `Size ${size} not found for this product`,
      });
    }

    switch (operation) {
      case 'set':
        await product.updateStock(size, Number(quantity), location);
        break;
      case 'add':
        if (sizeStock) {
          sizeStock.quantity += Number(quantity);
          if (location) sizeStock.location = location;
        } else {
          product.stockBySize.push({
            size,
            quantity: Number(quantity),
            reserved: 0,
            location: location || null,
          });
        }
        await product.save();
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
        await product.save();
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid operation. Use: set, add, or subtract',
        });
    }

    // Refresh product to get updated values
    const updatedProduct = await Product.findById(req.params.id);

    res.status(200).json({
      success: true,
      message: `Stock updated successfully for size ${size}`,
      data: {
        size,
        available: updatedProduct.getStockBySize(size),
        total: updatedProduct.stockBySize.find(s => s.size === size)?.quantity || 0,
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

// NEW: @desc    Get low stock products
// @route   GET /api/products/low-stock
// @access  Private/Admin
const getLowStockProducts = async (req, res) => {
  try {
    const products = await Product.find({})
      .populate('createdBy', 'name email');
    
    const lowStockProducts = products
      .map(product => {
        const lowStockSizes = product.stockBySize
          .filter(size => (size.quantity - size.reserved) <= product.lowStockThreshold)
          .map(size => ({
            size: size.size,
            available: size.quantity - size.reserved,
            total: size.quantity,
            threshold: product.lowStockThreshold,
          }));
        
        if (lowStockSizes.length > 0) {
          return {
            ...product.toObject(),
            lowStockSizes,
          };
        }
        return null;
      })
      .filter(p => p !== null);

    res.status(200).json({
      success: true,
      count: lowStockProducts.length,
      data: lowStockProducts,
    });
  } catch (error) {
    console.error('Error getting low stock products:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching low stock products',
      error: error.message,
    });
  }
};

module.exports = {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  bulkDeleteProducts,
  getProductStats,
  exportProducts,
  updateProductStock,
  getLowStockProducts,
};