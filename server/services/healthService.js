const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const emailConfig = require('../config/emailConfig');

/**
 * Perform genuine system health diagnostic checks
 * Returns status (HEALTHY, DEGRADED, ERROR) and latency for each service
 * Never exposes credentials, connection strings, or stack traces.
 */
async function checkSystemHealth() {
  const checkedAt = new Date().toISOString();

  // 1. Database Check
  let dbStatus = 'UNKNOWN';
  let dbLatencyMs = 0;
  let dbMessage = 'Database connection not initialized';

  try {
    const startDb = Date.now();
    const readyState = mongoose.connection ? mongoose.connection.readyState : 0;

    if (readyState === 1) {
      if (mongoose.connection.db) {
        await mongoose.connection.db.admin().ping();
      }
      dbLatencyMs = Date.now() - startDb;
      dbStatus = 'HEALTHY';
      dbMessage = 'MongoDB connection active and responding';
    } else if (readyState === 2) {
      dbStatus = 'DEGRADED';
      dbMessage = 'MongoDB connection is connecting';
    } else {
      dbStatus = 'DEGRADED';
      dbMessage = 'Operating in lightweight offline/fallback mode';
    }
  } catch (err) {
    dbStatus = 'ERROR';
    dbMessage = 'Database query failed or timed out';
  }

  // 2. Backend API Engine Check
  let apiStatus = 'HEALTHY';
  let apiLatencyMs = 0;
  let uptimeFormatted = '';
  let memoryFormatted = '';

  try {
    const startApi = process.hrtime();
    const uptimeSec = Math.floor(process.uptime());
    const hours = Math.floor(uptimeSec / 3600);
    const mins = Math.floor((uptimeSec % 3600) / 60);
    const secs = uptimeSec % 60;
    uptimeFormatted = `${hours}h ${mins}m ${secs}s`;

    const mem = process.memoryUsage();
    memoryFormatted = `${Math.round(mem.heapUsed / 1024 / 1024)}MB / ${Math.round(mem.heapTotal / 1024 / 1024)}MB`;

    const diff = process.hrtime(startApi);
    apiLatencyMs = Math.round((diff[0] * 1e9 + diff[1]) / 1e6);
  } catch (err) {
    apiStatus = 'DEGRADED';
  }

  // 3. Authentication Service Check
  let authStatus = 'HEALTHY';
  let authLatencyMs = 0;
  let authMessage = 'JWT authentication subsystem operational';

  try {
    const startAuth = Date.now();
    const secret = process.env.JWT_SECRET || 'anuragsahu-fallback-secret-2026';
    const testPayload = { probe: 'health', timestamp: Date.now() };
    const testToken = jwt.sign(testPayload, secret, { expiresIn: '60s' });
    const decoded = jwt.verify(testToken, secret);

    if (decoded && decoded.probe === 'health') {
      authLatencyMs = Date.now() - startAuth;
      authStatus = 'HEALTHY';
    } else {
      authStatus = 'ERROR';
      authMessage = 'JWT cryptographic verification failed';
    }
  } catch (err) {
    authStatus = 'ERROR';
    authMessage = 'Authentication service verification failed';
  }

  // 4. Email Service Check
  let emailStatus = 'HEALTHY';
  let emailMessage = '';
  let emailProvider = emailConfig.provider || 'smtp';

  if (emailConfig.isConfigured) {
    emailStatus = 'HEALTHY';
    emailMessage = `Configured for delivery via ${emailConfig.host || 'SMTP'}`;
  } else {
    emailStatus = 'DEGRADED';
    emailMessage = 'SMTP credentials not configured (running in diagnostic fallback mode)';
  }

  // 5. Storage Service Check
  let storageStatus = 'HEALTHY';
  let storageLatencyMs = 0;
  let storageMessage = 'Media uploads directory writable';

  try {
    const startStorage = Date.now();
    const uploadsDir = path.join(__dirname, '../../public/uploads');

    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Verify write permissions
    fs.accessSync(uploadsDir, fs.constants.W_OK | fs.constants.R_OK);
    storageLatencyMs = Date.now() - startStorage;
    storageStatus = 'HEALTHY';
  } catch (err) {
    storageStatus = 'DEGRADED';
    storageMessage = 'Uploads directory access restricted or in-memory fallback';
  }

  // Overall system status
  let overallStatus = 'HEALTHY';
  if (dbStatus === 'ERROR' || authStatus === 'ERROR') {
    overallStatus = 'ERROR';
  } else if (dbStatus === 'DEGRADED' || emailStatus === 'DEGRADED' || storageStatus === 'DEGRADED') {
    overallStatus = 'DEGRADED';
  }

  return {
    overallStatus,
    checkedAt,
    services: {
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
        message: dbMessage,
      },
      api: {
        status: apiStatus,
        latencyMs: apiLatencyMs,
        uptime: uptimeFormatted,
        memoryUsage: memoryFormatted,
        nodeVersion: process.version,
      },
      authentication: {
        status: authStatus,
        latencyMs: authLatencyMs,
        message: authMessage,
      },
      email: {
        status: emailStatus,
        provider: emailProvider,
        message: emailMessage,
        recipientConfigured: Boolean(emailConfig.recipientEmail),
      },
      storage: {
        status: storageStatus,
        latencyMs: storageLatencyMs,
        message: storageMessage,
      },
    },
  };
}

module.exports = { checkSystemHealth };
