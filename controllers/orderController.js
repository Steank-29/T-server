const Order = require('../models/Order');
const Product = require('../models/Product');
const Offer = require('../models/Offer');
const sendEmail = require('../utils/sendEmail');
const crypto = require('crypto');

// Helper function to generate unique order number
const generateOrderNumber = async () => {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  
  const random = crypto.randomBytes(2).toString('hex').toUpperCase().slice(0, 4);
  const orderNumber = `TAW-${year}${month}${day}-${hours}${minutes}${seconds}-${random}`;
  
  const existingOrder = await Order.findOne({ orderNumber });
  if (existingOrder) {
    const newRandom = crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 4);
    return `TAW-${year}${month}${day}-${hours}${minutes}${seconds}-${newRandom}`;
  }
  
  return orderNumber;
};

// Helper function to send order confirmation emails
const sendOrderEmails = async (order) => {
  const appName = process.env.APP_NAME || 'Tawakkul';
  const appUrl = process.env.APP_URL || 'https://www.tawakkol.tn';
  const adminEmail = process.env.EMAIL_ADMIN || 'samijlassi2909@gmail.com';

  // Format items for email
  const itemsHtml = order.items.map((item, index) => `
    <tr style="border-bottom: 1px solid #e8e8e8;">
      <td style="padding: 12px 8px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          ${item.image ? `<img src="${item.image}" alt="${item.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px;" />` : ''}
          <div>
            <p style="margin: 0; font-weight: 600; color: #141010;">${item.name}</p>
            <p style="margin: 4px 0 0; font-size: 13px; color: #888;">
              Size: ${item.size} | Qty: ${item.quantity}
              ${item.discount > 0 ? ` | <span style="color: #c31919;">-${item.discount}% OFF</span>` : ''}
            </p>
          </div>
        </div>
      </td>
      <td style="padding: 12px 8px; text-align: right; font-weight: 600; color: #141010;">
        ${item.discountedPrice.toFixed(2)} TND
      </td>
    </tr>
  `).join('');

  // ==================== ADMIN EMAIL ====================
  const adminEmailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; padding: 20px;">
      <!-- Header -->
      <div style="background: #0D0D0D; padding: 24px; border-radius: 12px 12px 0 0;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h2 style="color: #ffffff; margin: 0; font-size: 20px;">🛍️ New Order Received</h2>
          <span style="background: #22C55E; color: #ffffff; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600;">
            ${order.paymentMethod === 'cash_on_delivery' ? 'Cash on Delivery' : order.paymentMethod}
          </span>
        </div>
        <p style="color: #aaa; margin: 8px 0 0; font-size: 14px;">
          Order #${order.orderNumber} • ${new Date(order.createdAt).toLocaleString()}
        </p>
      </div>

      <!-- Content -->
      <div style="background: #ffffff; padding: 24px; border: 1px solid #e8e8e8; border-top: none; border-radius: 0 0 12px 12px;">
        
        <!-- Customer Info -->
        <div style="background: #fafafa; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="margin: 0 0 12px; color: #141010; font-size: 16px;">👤 Customer Information</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 4px 0; color: #888; font-weight: 600; width: 80px;">Name:</td>
              <td style="padding: 4px 0; color: #141010; font-weight: 500;">${order.customer.fullName}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #888; font-weight: 600;">Email:</td>
              <td style="padding: 4px 0; color: #141010;">${order.customer.email}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #888; font-weight: 600;">Phone:</td>
              <td style="padding: 4px 0; color: #141010;">${order.customer.phone}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #888; font-weight: 600;">Address:</td>
              <td style="padding: 4px 0; color: #141010;">${order.customer.address}</td>
            </tr>
            ${order.customer.notes ? `
            <tr>
              <td style="padding: 4px 0; color: #888; font-weight: 600;">Notes:</td>
              <td style="padding: 4px 0; color: #c31919; font-style: italic;">${order.customer.notes}</td>
            </tr>
            ` : ''}
          </table>
        </div>

        <!-- Order Items -->
        <h3 style="margin: 0 0 12px; color: #141010; font-size: 16px;">📦 Order Items (${order.items.length})</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="background: #fafafa;">
              <th style="padding: 10px 8px; text-align: left; color: #888; font-size: 13px; text-transform: uppercase;">Item</th>
              <th style="padding: 10px 8px; text-align: right; color: #888; font-size: 13px; text-transform: uppercase;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <!-- Order Summary -->
        <div style="background: #fafafa; padding: 16px; border-radius: 8px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 6px 0; color: #888;">Subtotal (${order.items.reduce((sum, item) => sum + item.quantity, 0)} items)</td>
              <td style="padding: 6px 0; text-align: right; color: #141010; font-weight: 500;">${order.totalAmount.toFixed(2)} TND</td>
            </tr>
            ${order.discountAmount > 0 ? `
            <tr>
              <td style="padding: 6px 0; color: #22C55E;">Discount</td>
              <td style="padding: 6px 0; text-align: right; color: #22C55E; font-weight: 500;">-${order.discountAmount.toFixed(2)} TND</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 6px 0; color: #888;">Shipping</td>
              <td style="padding: 6px 0; text-align: right; color: #141010; font-weight: 500;">
                ${order.shippingCost === 0 ? '<span style="color: #22C55E;">FREE</span>' : `${order.shippingCost.toFixed(2)} TND`}
              </td>
            </tr>
            <tr style="border-top: 2px solid #e8e8e8;">
              <td style="padding: 10px 0; font-weight: 700; color: #141010; font-size: 16px;">Total</td>
              <td style="padding: 10px 0; text-align: right; font-weight: 700; color: #c31919; font-size: 18px;">${order.finalAmount.toFixed(2)} TND</td>
            </tr>
          </table>
        </div>

        <!-- Action Buttons -->
        <div style="margin-top: 20px; text-align: center;">
          <a href="${appUrl}/admin/orders/${order._id}" style="display: inline-block; background: #0D0D0D; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 0 6px;">
            📋 View Order Details
          </a>
        </div>
      </div>

      <!-- Footer -->
      <div style="text-align: center; padding: 16px; color: #aaa; font-size: 12px;">
        <p>This is an automated notification from ${appName} Order System</p>
      </div>
    </div>
  `;

  // ==================== CUSTOMER EMAIL ====================
  const customerEmailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <!-- Header -->
      <div style="text-align: center; padding: 30px 20px; background: #0D0D0D; border-radius: 12px 12px 0 0;">
        <h1 style="color: #ffffff; margin: 0; font-size: 28px;">${appName}</h1>
        <div style="background: #c31919; height: 3px; width: 50px; margin: 15px auto;"></div>
        <p style="color: #aaa; margin: 10px 0 0;">Order Confirmation</p>
      </div>

      <!-- Content -->
      <div style="background: #ffffff; padding: 24px; border: 1px solid #e8e8e8; border-top: none; border-radius: 0 0 12px 12px;">
        
        <!-- Success Message -->
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="width: 60px; height: 60px; background: #22C55E; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 12px;">
            <span style="color: #ffffff; font-size: 28px;">✓</span>
          </div>
          <h2 style="color: #141010; margin: 0;">Order Placed Successfully!</h2>
          <p style="color: #888; margin: 8px 0;">Thank you for your order, ${order.customer.fullName}!</p>
        </div>

        <!-- Order Number -->
        <div style="background: #fafafa; padding: 16px; border-radius: 8px; text-align: center; margin-bottom: 20px; border: 1px dashed #e0e0e0;">
          <p style="margin: 0; color: #888; font-size: 13px;">Order Number</p>
          <p style="margin: 4px 0 0; font-size: 20px; font-weight: 700; color: #c31919; letter-spacing: 1px;">${order.orderNumber}</p>
        </div>

        <!-- Customer & Delivery Info -->
        <div style="display: flex; gap: 16px; margin-bottom: 20px;">
          <div style="flex: 1; background: #fafafa; padding: 12px; border-radius: 8px;">
            <p style="margin: 0; font-weight: 600; color: #141010; font-size: 14px;">👤 Customer</p>
            <p style="margin: 4px 0 0; color: #666; font-size: 13px;">${order.customer.fullName}</p>
            <p style="margin: 2px 0 0; color: #666; font-size: 13px;">${order.customer.phone}</p>
          </div>
          <div style="flex: 1; background: #fafafa; padding: 12px; border-radius: 8px;">
            <p style="margin: 0; font-weight: 600; color: #141010; font-size: 14px;">📍 Delivery</p>
            <p style="margin: 4px 0 0; color: #666; font-size: 13px;">${order.customer.address}</p>
          </div>
        </div>

        <!-- Order Items -->
        <h3 style="margin: 0 0 12px; color: #141010; font-size: 16px;">📦 Your Order</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="background: #fafafa;">
              <th style="padding: 10px 8px; text-align: left; color: #888; font-size: 13px;">Item</th>
              <th style="padding: 10px 8px; text-align: center; color: #888; font-size: 13px;">Qty</th>
              <th style="padding: 10px 8px; text-align: right; color: #888; font-size: 13px;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${order.items.map(item => `
              <tr style="border-bottom: 1px solid #f0f0f0;">
                <td style="padding: 10px 8px;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    ${item.image ? `<img src="${item.image}" alt="${item.name}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 6px;" />` : ''}
                    <div>
                      <p style="margin: 0; font-weight: 500; color: #141010; font-size: 13px;">${item.name}</p>
                      <p style="margin: 2px 0 0; font-size: 11px; color: #888;">Size: ${item.size}</p>
                    </div>
                  </div>
                </td>
                <td style="padding: 10px 8px; text-align: center; color: #141010; font-weight: 600;">${item.quantity}</td>
                <td style="padding: 10px 8px; text-align: right; color: #141010; font-weight: 600;">${item.discountedPrice.toFixed(2)} TND</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <!-- Order Summary -->
        <div style="background: #fafafa; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 6px 0; color: #888;">Subtotal</td>
              <td style="padding: 6px 0; text-align: right; color: #141010;">${order.totalAmount.toFixed(2)} TND</td>
            </tr>
            ${order.discountAmount > 0 ? `
            <tr>
              <td style="padding: 6px 0; color: #22C55E;">Discount</td>
              <td style="padding: 6px 0; text-align: right; color: #22C55E;">-${order.discountAmount.toFixed(2)} TND</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 6px 0; color: #888;">Shipping</td>
              <td style="padding: 6px 0; text-align: right; color: #141010;">
                ${order.shippingCost === 0 ? '<span style="color: #22C55E;">FREE</span>' : `${order.shippingCost.toFixed(2)} TND`}
              </td>
            </tr>
            <tr style="border-top: 2px solid #e0e0e0;">
              <td style="padding: 10px 0; font-weight: 700; color: #141010; font-size: 16px;">Total</td>
              <td style="padding: 10px 0; text-align: right; font-weight: 700; color: #c31919; font-size: 18px;">${order.finalAmount.toFixed(2)} TND</td>
            </tr>
          </table>
        </div>

        <!-- Payment Method -->
        <div style="background: #FFF3E0; padding: 12px 16px; border-radius: 8px; border-left: 4px solid #FF9800; margin-bottom: 20px;">
          <p style="margin: 0; font-weight: 600; color: #E65100;">
            💰 Payment Method: ${order.paymentMethod === 'cash_on_delivery' ? 'Cash on Delivery' : order.paymentMethod}
          </p>
          ${order.paymentMethod === 'cash_on_delivery' ? '<p style="margin: 4px 0 0; color: #666; font-size: 13px;">Please have the exact amount ready upon delivery.</p>' : ''}
        </div>

        <!-- What's Next -->
        <div style="margin-bottom: 20px;">
          <h3 style="color: #141010; font-size: 16px; margin: 0 0 8px;">📋 What's Next?</h3>
          <ol style="color: #666; margin: 0; padding-left: 20px; line-height: 1.8;">
            <li>We'll process your order within 24 hours</li>
            <li>You'll receive a shipping confirmation with tracking details</li>
            <li>Expected delivery: <strong>3-5 business days</strong></li>
          </ol>
        </div>

        <!-- CTA Buttons -->
        <div style="text-align: center; margin-bottom: 20px;">
          <a href="${appUrl}/track-order?order=${order.orderNumber}" style="display: inline-block; background: #0D0D0D; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 0 6px;">
            📍 Track Order
          </a>
          <a href="${appUrl}" style="display: inline-block; background: #ffffff; color: #0D0D0D; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; border: 2px solid #0D0D0D; margin: 0 6px;">
            🛍️ Continue Shopping
          </a>
        </div>

        <!-- Contact Info -->
        <div style="border-top: 1px solid #e8e8e8; padding-top: 16px; text-align: center;">
          <p style="margin: 0; color: #888; font-size: 13px;">Need help? Contact us at</p>
          <p style="margin: 4px 0; font-weight: 600; color: #141010;">${adminEmail}</p>
          <p style="margin: 4px 0; color: #888; font-size: 13px;">or call +216 12 345 678</p>
        </div>
      </div>

      <!-- Footer -->
      <div style="text-align: center; padding: 16px; color: #aaa; font-size: 11px;">
        <p>${appName} © ${new Date().getFullYear()}. All rights reserved.</p>
        <p>This email was sent to ${order.customer.email} regarding order #${order.orderNumber}</p>
      </div>
    </div>
  `;

  // Send admin notification
  try {
    await sendEmail({
      email: adminEmail,
      subject: `🔔 New Order #${order.orderNumber} - ${order.customer.fullName} (${order.finalAmount.toFixed(2)} TND)`,
      html: adminEmailHtml
    });
    console.log(`✅ Admin notification sent for order #${order.orderNumber}`);
  } catch (error) {
    console.error('❌ Admin email failed:', error.message);
  }

  // Send customer confirmation
  try {
    await sendEmail({
      email: order.customer.email,
      subject: `✅ Order Confirmed #${order.orderNumber} - ${appName}`,
      html: customerEmailHtml
    });
    console.log(`✅ Customer confirmation sent to ${order.customer.email}`);
  } catch (error) {
    console.error('❌ Customer email failed:', error.message);
  }
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

    // Calculate final amount
    const subtotalAmount = parseFloat((totalAmount - discountAmount).toFixed(2));
    const shippingCostAmount = parseFloat(shippingCost) || 0;
    const finalAmount = parseFloat((subtotalAmount + shippingCostAmount).toFixed(2));

    // Generate order number with retry logic
    let orderNumber;
    let order;
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        orderNumber = await generateOrderNumber();
        
        order = await Order.create({
          orderNumber,
          customer,
          items: orderItems,
          totalAmount,
          discountAmount,
          finalAmount,
          shippingCost: shippingCostAmount,
          paymentMethod: paymentMethod || 'cash_on_delivery',
        });
        
        break;
      } catch (error) {
        if (error.code === 11000 && error.keyPattern?.orderNumber) {
          retryCount++;
          console.log(`Order number collision detected, retry ${retryCount}/${maxRetries}`);
          
          if (retryCount >= maxRetries) {
            orderNumber = `TAW-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
            order = await Order.create({
              orderNumber,
              customer,
              items: orderItems,
              totalAmount,
              discountAmount,
              finalAmount,
              shippingCost: shippingCostAmount,
              paymentMethod: paymentMethod || 'cash_on_delivery',
            });
            break;
          }
          
          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        }
        
        throw error;
      }
    }

    // ✅ Send order confirmation emails (don't await - send asynchronously)
    sendOrderEmails(order).catch(err => {
      console.error('Email sending failed:', err);
    });

    res.status(201).json({
      success: true,
      message: 'Order placed successfully!',
      data: order,
    });
  } catch (error) {
    console.error('Order creation error:', error);
    
    if (error.code === 11000 && error.keyPattern?.orderNumber) {
      return res.status(409).json({
        success: false,
        message: 'Order number conflict, please try again',
      });
    }
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', '),
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

    // Exclude counter documents from order queries
    query.__type = { $ne: 'counter' };

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
              stockItem.reserved = Math.max(0, (stockItem.reserved || 0) - item.quantity);
              await offer.save();
            }
          }
        } else {
          const product = await Product.findById(item.product);
          if (product) {
            const stockItem = product.stockBySize?.find(s => s.size === item.size);
            if (stockItem) {
              stockItem.reserved = Math.max(0, (stockItem.reserved || 0) - item.quantity);
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
            stockItem.reserved = Math.max(0, (stockItem.reserved || 0) - item.quantity);
            await offer.save();
          }
        }
      } else {
        const product = await Product.findById(item.product);
        if (product) {
          const stockItem = product.stockBySize?.find(s => s.size === item.size);
          if (stockItem) {
            stockItem.reserved = Math.max(0, (stockItem.reserved || 0) - item.quantity);
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

    // Base query to exclude counters
    const baseQuery = { __type: { $ne: 'counter' } };

    const [overall, todayStats, monthlyStats, statusBreakdown] = await Promise.all([
      // Overall stats
      Order.aggregate([
        { $match: baseQuery },
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
            ...baseQuery,
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
            ...baseQuery,
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
        { $match: baseQuery },
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

    // Prevent deleting counter documents
    if (order.__type === 'counter') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete counter documents',
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
              stockItem.reserved = Math.max(0, (stockItem.reserved || 0) - item.quantity);
              await offer.save();
            }
          }
        } else {
          const product = await Product.findById(item.product);
          if (product) {
            const stockItem = product.stockBySize?.find(s => s.size === item.size);
            if (stockItem) {
              stockItem.reserved = Math.max(0, (stockItem.reserved || 0) - item.quantity);
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