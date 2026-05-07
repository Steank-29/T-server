const Order = require('../models/Order');
const Product = require('../models/Product');
const Offer = require('../models/Offer');

// Helper function to generate order number
const generateOrderNumber = async () => {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  
  const todayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  
  const count = await Order.countDocuments({
    createdAt: { $gte: todayStart, $lt: todayEnd },
  });
  
  const sequential = (count + 1).toString().padStart(4, '0');
  return `TAW-${year}${month}${day}-${sequential}`;
};

// @desc    Create new order
// @route   POST /api/orders
// @access  Public
exports.createOrder = async (req, res) => {
  try {
    const { customer, items, paymentMethod, shippingCost } = req.body;

    // Validate customer data
    if (!customer || !customer.fullName || !customer.email || !customer.phone || !customer.address) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required customer information',
      });
    }

    // Validate items
    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please add at least one item to your order',
      });
    }

    // Process items and check stock
    const orderItems = [];
    let totalAmount = 0;
    let discountAmount = 0;

    for (const item of items) {
      const { productId, itemType, quantity, size } = item;

      if (!productId || !itemType || !quantity || !size) {
        return res.status(400).json({
          success: false,
          message: 'Each item must have productId, itemType, quantity, and size',
        });
      }

      // Find the product or offer
      let productData;
      if (itemType === 'Offer') {
        productData = await Offer.findById(productId);
      } else {
        productData = await Product.findById(productId);
      }

      if (!productData) {
        return res.status(404).json({
          success: false,
          message: `${itemType} with ID ${productId} not found`,
        });
      }

      // Check stock availability
      const stockItem = productData.stockBySize?.find(s => s.size === size);
      if (!stockItem) {
        return res.status(400).json({
          success: false,
          message: `Size ${size} is not available for ${productData.name || 'this item'}`,
        });
      }

      const availableStock = stockItem.quantity - (stockItem.reserved || 0);
      if (availableStock < quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${productData.name || 'item'} - Size ${size}. Available: ${availableStock}`,
        });
      }

      // Get price info
      const price = productData.mainPrice || productData.price;
      let discountedPrice;
      
      if (itemType === 'Offer') {
        discountedPrice = price * (1 - (productData.discount || 0) / 100);
      } else if (productData.discount > 0) {
        discountedPrice = price * (1 - (productData.discount || 0) / 100);
      } else {
        discountedPrice = price;
      }

      // Reserve stock
      stockItem.reserved = (stockItem.reserved || 0) + quantity;
      await productData.save();

      // Add to order items
      const orderItem = {
        product: productData._id,
        itemType,
        name: productData.name,
        price: price,
        discountedPrice: parseFloat(discountedPrice.toFixed(2)),
        quantity,
        size,
        image: productData.mainImage?.url || productData.mainImage || '',
        discount: productData.discount || 0,
      };

      orderItems.push(orderItem);
      totalAmount += price * quantity;
      discountAmount += (price - discountedPrice) * quantity;
    }

    // Calculate final amount BEFORE adding shipping
    const subtotalAmount = parseFloat((totalAmount - discountAmount).toFixed(2));
    
    // Add shipping cost (default to 0 if not provided)
    const shippingCostAmount = parseFloat(shippingCost) || 0;
    const finalAmount = parseFloat((subtotalAmount + shippingCostAmount).toFixed(2));

    // Generate order number
    const orderNumber = await generateOrderNumber();

    // Create order
    const order = await Order.create({
      orderNumber,
      customer,
      items: orderItems,
      totalAmount,
      discountAmount,
      finalAmount, // This now includes shipping
      shippingCost: shippingCostAmount, // Store shipping cost separately
      paymentMethod: paymentMethod || 'cash_on_delivery',
    });

    res.status(201).json({
      success: true,
      message: 'Order placed successfully!',
      data: order,
    });
  } catch (error) {
    console.error('Order creation error:', error);
    
    // Handle duplicate order number (rare race condition)
    if (error.code === 11000 && error.keyPattern?.orderNumber) {
      return res.status(409).json({
        success: false,
        message: 'Order number conflict, please try again',
      });
    }
    
    res.status(500).json({
      success: false,
      message: error.message || 'Error creating order',
    });
  }
};

// @desc    Get all orders
// @route   GET /api/orders
// @access  Private/Admin
exports.getOrders = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      search,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const query = {};

    // Filter by status
    if (status && status !== 'all') {
      query.status = status;
    }

    // Search by order number or customer name/email
    if (search) {
      query.$or = [
        { orderNumber: { $regex: search, $options: 'i' } },
        { 'customer.fullName': { $regex: search, $options: 'i' } },
        { 'customer.email': { $regex: search, $options: 'i' } },
        { 'customer.phone': { $regex: search, $options: 'i' } },
      ];
    }

    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOptions = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [orders, total] = await Promise.all([
      Order.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit)),
      Order.countDocuments(query),
    ]);

    // Calculate summary stats
    const stats = await Order.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$finalAmount' },
          totalDiscount: { $sum: '$discountAmount' },
          averageOrderValue: { $avg: '$finalAmount' },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      count: orders.length,
      total,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      stats: stats[0] || {
        totalOrders: 0,
        totalRevenue: 0,
        totalDiscount: 0,
        averageOrderValue: 0,
      },
      data: orders,
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching orders',
    });
  }
};

// @desc    Get single order
// @route   GET /api/orders/:id
// @access  Private/Admin
exports.getOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    res.status(200).json({
      success: true,
      data: order,
    });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching order',
    });
  }
};

// @desc    Update order status
// @route   PATCH /api/orders/:id/status
// @access  Private/Admin
exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid status',
      });
    }

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    // Handle status-specific updates
    const updateData = { status };

    if (status === 'delivered') {
      updateData.deliveredAt = new Date();
      updateData.isPaid = true;
      updateData.paidAt = new Date();
    } else if (status === 'cancelled') {
      updateData.cancelledAt = new Date();
      
      // Release reserved stock
      for (const item of order.items) {
        if (item.itemType === 'Offer') {
          const offer = await Offer.findById(item.product);
          if (offer) {
            const stockItem = offer.stockBySize?.find(s => s.size === item.size);
            if (stockItem) {
              stockItem.reserved = (stockItem.reserved || 0) - item.quantity;
              if (stockItem.reserved < 0) stockItem.reserved = 0;
              await offer.save();
            }
          }
        } else {
          const product = await Product.findById(item.product);
          if (product) {
            const stockItem = product.stockBySize?.find(s => s.size === item.size);
            if (stockItem) {
              stockItem.reserved = (stockItem.reserved || 0) - item.quantity;
              if (stockItem.reserved < 0) stockItem.reserved = 0;
              await product.save();
            }
          }
        }
      }
    }

    const updatedOrder = await Order.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: `Order ${status} successfully`,
      data: updatedOrder,
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating order status',
    });
  }
};

// @desc    Cancel order (customer)
// @route   PATCH /api/orders/:id/cancel
// @access  Public
exports.cancelOrder = async (req, res) => {
  try {
    const { reason } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    if (order.status === 'delivered' || order.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel order that is already ${order.status}`,
      });
    }

    // Release reserved stock
    for (const item of order.items) {
      if (item.itemType === 'Offer') {
        const offer = await Offer.findById(item.product);
        if (offer) {
          const stockItem = offer.stockBySize?.find(s => s.size === item.size);
          if (stockItem) {
            stockItem.reserved = (stockItem.reserved || 0) - item.quantity;
            if (stockItem.reserved < 0) stockItem.reserved = 0;
            await offer.save();
          }
        }
      } else {
        const product = await Product.findById(item.product);
        if (product) {
          const stockItem = product.stockBySize?.find(s => s.size === item.size);
          if (stockItem) {
            stockItem.reserved = (stockItem.reserved || 0) - item.quantity;
            if (stockItem.reserved < 0) stockItem.reserved = 0;
            await product.save();
          }
        }
      }
    }

    order.status = 'cancelled';
    order.cancelledAt = new Date();
    order.cancellationReason = reason || 'Cancelled by customer';
    await order.save();

    res.status(200).json({
      success: true,
      message: 'Order cancelled successfully',
      data: order,
    });
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({
      success: false,
      message: 'Error cancelling order',
    });
  }
};

// @desc    Track order by order number
// @route   GET /api/orders/track/:orderNumber
// @access  Public
exports.trackOrder = async (req, res) => {
  try {
    const order = await Order.findOne({ 
      orderNumber: req.params.orderNumber 
    }).select('orderNumber status customer.fullName createdAt deliveredAt items.name items.quantity items.size');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    res.status(200).json({
      success: true,
      data: order,
    });
  } catch (error) {
    console.error('Track order error:', error);
    res.status(500).json({
      success: false,
      message: 'Error tracking order',
    });
  }
};

// @desc    Get order stats
// @route   GET /api/orders/stats
// @access  Private/Admin
exports.getOrderStats = async (req, res) => {
  try {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);

    const [overall, todayStats, monthlyStats, statusBreakdown] = await Promise.all([
      // Overall stats
      Order.aggregate([
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalRevenue: { $sum: '$finalAmount' },
            totalDiscount: { $sum: '$discountAmount' },
            averageOrderValue: { $avg: '$finalAmount' },
            maxOrderValue: { $max: '$finalAmount' },
            minOrderValue: { $min: '$finalAmount' },
          },
        },
      ]),
      // Today's stats
      Order.aggregate([
        {
          $match: {
            createdAt: {
              $gte: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
              $lt: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1),
            },
          },
        },
        {
          $group: {
            _id: null,
            orders: { $sum: 1 },
            revenue: { $sum: '$finalAmount' },
          },
        },
      ]),
      // Monthly stats
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: firstDayOfMonth },
          },
        },
        {
          $group: {
            _id: null,
            orders: { $sum: 1 },
            revenue: { $sum: '$finalAmount' },
          },
        },
      ]),
      // Status breakdown
      Order.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const statusCounts = {};
    statusBreakdown.forEach(item => {
      statusCounts[item._id] = item.count;
    });

    res.status(200).json({
      success: true,
      data: {
        overall: overall[0] || {
          totalOrders: 0,
          totalRevenue: 0,
          totalDiscount: 0,
          averageOrderValue: 0,
        },
        today: todayStats[0] || { orders: 0, revenue: 0 },
        thisMonth: monthlyStats[0] || { orders: 0, revenue: 0 },
        statusBreakdown: statusCounts,
      },
    });
  } catch (error) {
    console.error('Order stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching order stats',
    });
  }
};

// @desc    Delete order
// @route   DELETE /api/orders/:id
// @access  Private/Admin
exports.deleteOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    // If order is not cancelled or delivered, release stock
    if (order.status !== 'cancelled' && order.status !== 'delivered') {
      for (const item of order.items) {
        if (item.itemType === 'Offer') {
          const offer = await Offer.findById(item.product);
          if (offer) {
            const stockItem = offer.stockBySize?.find(s => s.size === item.size);
            if (stockItem) {
              stockItem.reserved = (stockItem.reserved || 0) - item.quantity;
              if (stockItem.reserved < 0) stockItem.reserved = 0;
              await offer.save();
            }
          }
        } else {
          const product = await Product.findById(item.product);
          if (product) {
            const stockItem = product.stockBySize?.find(s => s.size === item.size);
            if (stockItem) {
              stockItem.reserved = (stockItem.reserved || 0) - item.quantity;
              if (stockItem.reserved < 0) stockItem.reserved = 0;
              await product.save();
            }
          }
        }
      }
    }

    await order.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Order deleted successfully',
    });
  } catch (error) {
    console.error('Delete order error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting order',
    });
  }
};