// backend/routes/orderRoutes.js
const express = require('express');
const router = express.Router();
const {
  createOrder,
  getOrders,
  getOrder,
  updateOrderStatus,
  cancelOrder,
  trackOrder,
  getOrderStats,
  deleteOrder,
} = require('../controllers/orderController');
const { protect, authorize } = require('../middleware/auth');

// Public routes
router.post('/post', createOrder);
router.get('/track/:orderNumber', trackOrder);
router.patch('/:id/cancel', cancelOrder);

// Admin routes
router.get('/', protect, authorize('admin'), getOrders);
router.get('/stats', protect, authorize('admin'), getOrderStats);
router.get('/:id', protect, authorize('admin'), getOrder);
router.patch('/:id/status', protect, authorize('admin'), updateOrderStatus);
router.delete('/:id', protect, authorize('admin'), deleteOrder);

module.exports = router;
