const rateLimit = require('express-rate-limit');

// Strict limiter for auth endpoints (login/register)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  message: { error: 'Too many authentication attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// General API limiter
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// Demo page limiter (generate endpoint)
const demoLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { error: 'Too many demo requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// Demo chat limiter
const demoChatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,
  message: { error: 'Too many chat messages, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = { authLimiter, generalLimiter, demoLimiter, demoChatLimiter };
