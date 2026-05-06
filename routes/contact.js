const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const {
  createContact,
  getContacts,
  updateContactStatus,
  deleteContact
} = require('../controllers/contactController');
const { protect, authorize } = require('../middleware/auth');

// @route   POST /api/contact
// @desc    Submit contact form (Public)
router.post('/', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('message').trim().isLength({ min: 10 }).withMessage('Message must be at least 10 characters')
], createContact);

// @route   GET /api/contact
// @desc    Get all contacts (Admin only)
router.get('/', protect, authorize('admin'), getContacts);

// @route   PATCH /api/contact/:id
// @desc    Update contact status (Admin only)
router.patch('/:id', protect, authorize('admin'), updateContactStatus);

// @route   DELETE /api/contact/:id
// @desc    Delete contact (Admin only)
router.delete('/:id', protect, authorize('admin'), deleteContact);

module.exports = router;