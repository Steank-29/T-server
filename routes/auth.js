const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const {
  signup,
  signin,
  forgotPassword,
  resetPassword,
  getMe,
  updateProfile,
  changePassword,
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
  logout,
} = require('../controllers/authController');
const { protect, authorize } = require('../middleware/auth');

// ==================== Public Routes ====================

// @route   POST /api/auth/signup
// @desc    Register user
router.post('/signup', [
  body('name').trim().notEmpty().withMessage('Full name is required'),
  body('email').isEmail().withMessage('Please provide a valid email').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.password) throw new Error('Passwords do not match');
    return true;
  }),
  body('dateOfBirth').notEmpty().withMessage('Date of birth is required'),
  body('gender').isIn(['male', 'female']).withMessage('Invalid gender'),
], signup);

// @route   POST /api/auth/signin
// @desc    Login user
router.post('/signin', [
  body('email').isEmail().withMessage('Please provide a valid email').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
], signin);

// @route   POST /api/auth/forgot-password
// @desc    Forgot password
router.post('/forgot-password', [
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('dateOfBirth').notEmpty().withMessage('Date of birth is required'),
], forgotPassword);

// @route   POST /api/auth/reset-password/:token
// @desc    Reset password
router.post('/reset-password/:token', [
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
], resetPassword);

// ==================== Private Routes (Authenticated User) ====================

router.use(protect);

// @route   GET /api/auth/me
// @desc    Get current user
router.get('/me', getMe);

// @route   PUT /api/auth/me
// @desc    Update profile
router.put('/me', [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('email').optional().isEmail().withMessage('Please provide a valid email'),
], updateProfile);

// @route   PUT /api/auth/change-password
// @desc    Change password
router.put('/change-password', [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
], changePassword);

// @route   POST /api/auth/logout
// @desc    Logout user
router.post('/logout', logout);

// ==================== Admin Routes ====================

// @route   GET /api/auth/users
// @desc    Get all users (Admin)
router.get('/users', authorize('admin'), getUsers);

// @route   GET /api/auth/users/:id
// @desc    Get single user (Admin)
router.get('/users/:id', authorize('admin'), getUserById);

// @route   PUT /api/auth/users/:id
// @desc    Update user (Admin)
router.put('/users/:id', authorize('admin'), updateUser);

// @route   DELETE /api/auth/users/:id
// @desc    Delete user (Admin)
router.delete('/users/:id', authorize('admin'), deleteUser);

module.exports = router;