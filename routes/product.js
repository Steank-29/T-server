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
} = require('../controllers/productController');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

// ========== PUBLIC ROUTES (No Auth Required) ==========
// Note: Some routes are public but with limited data (you might want to hide stock info for public)
router.get('/', getProducts);
router.get('/stats', getProductStats);
router.get('/export', exportProducts);
router.get('/:id', getProductById);

// ========== PROTECTED ROUTES (Auth Required) ==========

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
router.delete('/bulk', protect, authorize('admin'), bulkDeleteProducts);

// Stock Management Routes
router.get('/low-stock', protect, authorize('admin'), getLowStockProducts);
router.patch('/:id/stock', protect, authorize('admin'), updateProductStock);

// Optional: Additional stock management endpoints (uncomment as needed)
// router.get('/:id/stock/:size', protect, authorize('admin'), getProductStockBySize);
// router.post('/:id/stock/reserve', protect, authorize('admin'), reserveStock);
// router.post('/:id/stock/release', protect, authorize('admin'), releaseStock);
// router.post('/:id/stock/confirm', protect, authorize('admin'), confirmStockDeduction);

module.exports = router;