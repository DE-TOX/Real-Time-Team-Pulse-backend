const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Import routes
const authRoutes = require('./routes/auth');
const teamRoutes = require('./routes/teams');
const aiRoutes = require('./routes/ai');
const redisRoutes = require('./routes/redis');

// Import middleware
const { securityHeaders } = require('./middleware/auth');

// Import Swagger
const { specs, serve, setup } = require('./config/swagger');

// Initialize services
const { connectRedis } = require('./config/redis');
const { testConnection } = require('./config/huggingface');

// Global rate limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", process.env.SUPABASE_URL || "*"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

app.use(securityHeaders);
app.use(globalLimiter);

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Trust proxy for rate limiting (if behind reverse proxy)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Swagger API Documentation
app.use('/api-docs', serve, setup);

// Redirect root to API docs
app.get('/', (req, res) => {
  res.redirect('/api-docs');
});


// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Team Pulse API'
  });
});

// API routes
app.get('/api', (req, res) => {
  res.json({ 
    message: 'Team Pulse API is running!',
    version: '1.0.0'
  });
});
// Route mounting
app.use('/api/auth', authRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/redis', redisRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Initialize connections and start server
const startServer = async () => {
  console.log('🚀 Starting Team Pulse API...');
  
  // Test connections
  console.log('🔧 Testing service connections...');
  
  const redis = connectRedis();
  if (redis) {
    console.log('✅ Redis connection ready');
  } else {
    console.log('⚠️  Redis not configured');
  }
// Test HuggingFace 
setTimeout(async () => {
    const hfReady = await testConnection();
    if (hfReady) {
      console.log('✅ HuggingFace API ready');
    } else {
      console.log('⚠️  HuggingFace API not configured');
    }
  }, 1000);

  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    console.log(`🔐 Auth API: http://localhost:${PORT}/api/auth`);
    console.log(`🤖 AI API: http://localhost:${PORT}/api/ai`);
    console.log(`📡 Redis API: http://localhost:${PORT}/api/redis`);
  });1
};
// Graceful shutdown
const gracefulShutdown = () => { 
    console.log(' Shutting down gracefully...'); 
    const { closeConnections } = require('./config/redis'); 
    closeConnections(); 
    process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);


startServer();  