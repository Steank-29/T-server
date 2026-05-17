const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load env vars
dotenv.config();

// Import routes
const authRoutes = require('./routes/auth');
const contactRoutes = require('./routes/contact');
const productRoutes = require('./routes/product');
const offerRoutes = require('./routes/offer');
const orderRoutes = require('./routes/order');

// Create Express app
const app = express();

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('📁 Uploads directory created');
}

// Allowed origins for CORS
const allowedOrigins = [
  'https://tawakkol.vercel.app',
  'https://www.tawakkol.tn',
  'http://www.tawakkol.tn',
  'https://tawakkol.tn',
  'http://tawakkol.tn',
  'http://localhost:2909',  // For local development
  'http://localhost:3000',    // Common React dev port
  '3.12.251.153', '3.20.63.178', '3.77.67.4', '3.79.134.69', '3.105.133.239',
  '3.105.190.221', '3.133.226.214', '3.149.57.90', '3.212.128.62', '5.161.61.238',
  '5.161.73.160', '5.161.75.7', '5.161.113.195', '5.161.117.52', '5.161.177.47',
  '5.161.194.92', '5.161.215.244', '5.223.43.32', '5.223.53.147', '5.223.57.22',
  '18.116.205.62', '18.180.208.214', '18.192.166.72', '18.193.252.127', '24.144.78.39',
  '24.144.78.185', '34.198.201.66', '45.55.123.175', '45.55.127.146', '49.13.24.81',
  '49.13.130.29', '49.13.134.145', '49.13.164.148', '49.13.167.123', '52.15.147.27',
  '52.22.236.30', '52.28.162.93', '52.59.43.236', '52.87.72.16', '54.64.67.106',
  '54.79.28.129', '54.87.112.51', '54.167.223.174', '54.249.170.27', '63.178.84.147',
  '64.225.81.248', '64.225.82.147', '69.162.124.227', '69.162.124.235', '69.162.124.238',
  '78.46.190.63', '78.46.215.1', '78.47.98.55', '78.47.173.76', '88.99.80.227',
  '91.99.101.207', '128.140.41.193', '128.140.106.114', '129.212.132.140', '134.199.240.137',
  '138.197.53.117', '138.197.53.138', '138.197.54.143', '138.197.54.247', '138.197.63.92',
  '139.59.50.44', '142.132.180.39', '143.198.249.237', '143.198.250.89', '143.244.196.21',
  '143.244.196.211', '143.244.221.177', '144.126.251.21', '146.190.9.187', '152.42.149.135',
  '157.90.155.240', '157.90.156.63', '159.69.158.189', '159.223.243.219', '161.35.247.201',
  '167.99.18.52', '167.235.143.113', '168.119.53.160', '168.119.96.239', '168.119.123.75',
  '170.64.250.64', '170.64.250.132', '170.64.250.235', '178.156.181.172', '178.156.184.20',
  '178.156.185.127', '178.156.185.231', '178.156.187.238', '178.156.189.113', '178.156.189.249',
  '188.166.201.79', '206.189.241.133', '209.38.49.1', '209.38.49.206', '209.38.49.226',
  '209.38.51.43', '209.38.53.7', '209.38.124.252', '216.144.248.18', '216.144.248.19',
  '216.144.248.21', '216.144.248.22', '216.144.248.23', '216.144.248.24', '216.144.248.25',
  '216.144.248.26', '216.144.248.27', '216.144.248.28', '216.144.248.29', '216.144.248.30',
  '216.245.221.83'
];

// CORS configuration
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('❌ Blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400, // 24 hours
}));

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware in development
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  // These options are no longer needed in newer versions of Mongoose
  // but kept for backward compatibility
})
  .then(() => {
    console.log('✅ MongoDB Connected Successfully');
    console.log(`📦 Database: ${mongoose.connection.host}`);
  })
  .catch(err => {
    console.error('❌ MongoDB Connection Error:', err.message);
    process.exit(1);
  });

// Monitor MongoDB connection
mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ MongoDB Disconnected');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB Error:', err.message);
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/products', productRoutes);
app.use('/api/offers', offerRoutes);
app.use('/api/orders', orderRoutes);

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true,
    message: `${process.env.APP_NAME} API is running`,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

// API info route
app.get('/api', (req, res) => {
  res.json({
    success: true,
    app: process.env.APP_NAME || 'Tawakkol API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      contact: '/api/contact',
      products: '/api/products',
      offers: '/api/offers',
      orders: '/api/orders',
      health: '/api/health',
    },
  });
});

// Root route
app.get('/', (req, res) => {
  res.json({ 
    success: true,
    app: process.env.APP_NAME || 'Tawakkol',
    version: '1.0.0',
    description: 'E-commerce API for Tawakkol brand',
  });
});

// 404 handler for undefined routes
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.originalUrl}`,
  });
});

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);

  // Multer file size error
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      message: 'File size too large. Maximum size is 5MB',
    });
  }

  // Multer file type error
  if (err.message && err.message.includes('Only image files')) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  // CORS error
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      message: 'CORS blocked: Origin not allowed',
    });
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(val => val.message);
    return res.status(400).json({
      success: false,
      message: 'Validation Error',
      errors: messages,
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(400).json({
      success: false,
      message: `Duplicate value for ${field}. This ${field} already exists.`,
    });
  }

  // Mongoose cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: `Invalid ${err.path}: ${err.value}`,
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token. Please log in again.',
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Your token has expired. Please log in again.',
    });
  }

  // Default server error
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Rejection:', err.message);
  // Close server & exit process
  // server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err.message);
  // Close server & exit process
  // server.close(() => process.exit(1));
});

// Start server
const PORT = process.env.PORT || 6060;
const server = app.listen(PORT, () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🚀 ${process.env.APP_NAME || 'Tawakkol'} Server Running`);
  console.log(`📍 API: ${process.env.API_URL}/api`);
  console.log(`🏥 Health: ${process.env.API_URL}/api/health`);
  console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('💤 Process terminated');
    mongoose.connection.close(false, () => {
      process.exit(0);
    });
  });
});

module.exports = app;
