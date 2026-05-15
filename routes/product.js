const express = require('express');
const router = express.Router();
const {
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
  processOrderStock,
  releaseOrderStock,
  getStockTracking,
  getProductStockHistory,
  toggleProductStatus
} = require('../controllers/productController');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

// ========== PUBLIC ROUTES (No Auth Required) ==========
router.get('/', getProducts);
router.get('/stats', getProductStats);
router.get('/export', exportProducts);

// ========== PROTECTED ROUTES (Auth Required) ==========

// ✅ IMPORTANT: Specific routes MUST come before /:id routes

// Stock tracking dashboard
router.get('/stock-tracking', protect, authorize('admin'), getStockTracking);

// Low stock products
router.get('/low-stock', protect, authorize('admin'), getLowStockProducts);

// Process order stock deduction
router.post('/process-order-stock', protect, authorize('admin'), processOrderStock);

// Release reserved stock
router.post('/release-order-stock', protect, authorize('admin'), releaseOrderStock);

// Bulk delete
router.delete('/bulk', protect, authorize('admin'), bulkDeleteProducts);

router.patch('/:id/toggle-status', protect, authorize('admin'), toggleProductStatus);


// Product Management
router.post(
  '/',
  protect,
  authorize('admin'),
  upload.fields([
    { name: 'mainImage', maxCount: 1 },
    { name: 'images', maxCount: 10 },
  ]),
  createProduct
);

// ✅ These /:id routes must come AFTER specific routes
router.get('/:id', getProductById);
router.put(
  '/:id',
  protect,
  authorize('admin'),
  upload.fields([
    { name: 'mainImage', maxCount: 1 },
    { name: 'images', maxCount: 10 },
  ]),
  updateProduct
);
router.delete('/:id', protect, authorize('admin'), deleteProduct);
router.patch('/:id/stock', protect, authorize('admin'), updateProductStock);
router.get('/:id/stock-history/:size', protect, authorize('admin'), getProductStockHistory);

module.exports = router;