const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/offerController');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

// ==================== PUBLIC ROUTES ====================
// Anyone can view offers (but stock info may be limited based on your implementation)
router.get('/', getOffers);
router.get('/:id', getOfferById);
router.post('/validate-promo', validatePromoCode);

// ==================== PROTECTED ROUTES ====================
router.use(protect);

// Statistics and export (admin only)
router.get('/stats', authorize('admin'), getOfferStats);
router.get('/export', authorize('admin'), exportOffers);

// Stock management routes (admin only)
router.get('/low-stock', authorize('admin'), getLowStockOffers);
router.patch('/:id/stock', authorize('admin'), updateOfferStock);

// Bulk operations (admin only)
router.delete('/bulk', authorize('admin'), bulkDeleteOffers);

// Create offer (admin only)
router.post(
  '/',
  authorize('admin'),
  upload.fields([
    { name: 'mainImage', maxCount: 1 },
    { name: 'images', maxCount: 10 },
  ]),
  createOffer
);

// Update offer (admin only)
router.put(
  '/:id',
  authorize('admin'),
  upload.fields([
    { name: 'mainImage', maxCount: 1 },
    { name: 'images', maxCount: 10 },
  ]),
  updateOffer
);

// Delete offer (admin only)
router.delete('/:id', authorize('admin'), deleteOffer);

// Toggle routes (admin only)
router.patch('/:id/toggle-status', authorize('admin'), toggleOfferStatus);
router.patch('/:id/toggle-featured', authorize('admin'), toggleOfferFeatured);

module.exports = router;