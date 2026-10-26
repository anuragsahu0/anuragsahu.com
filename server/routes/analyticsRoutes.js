const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const {
  trackEvent,
  checkVpnEndpoint,
  reverseGeocodeEndpoint,
  getAnalyticsSummary,
  getRealtimeAnalytics,
  getIpLogs,
  clearIpLogs,
  syncVault,
} = require('../controllers/analyticsController');

// ─── Public Telemetry Ingestion (Rate-Limited, Bot-Filtered, Safe) ───────────
router.post('/analytics/track', trackEvent);

// ─── Protected Telemetry & IP Intelligence (Admin Auth Required) ────────────
router.get('/analytics/summary', verifyToken, getAnalyticsSummary);
router.get('/analytics/realtime', verifyToken, getRealtimeAnalytics);
router.get('/admin/analytics/realtime', verifyToken, getRealtimeAnalytics);
router.get('/analytics/ip-logs', verifyToken, getIpLogs);
router.get('/admin/analytics/ip-logs', verifyToken, getIpLogs);
router.delete('/admin/analytics/ip-logs', verifyToken, clearIpLogs);
router.post('/analytics/sync-vault', verifyToken, syncVault);
router.post('/admin/analytics/sync-vault', verifyToken, syncVault);
router.get('/analytics/reverse-geocode', verifyToken, reverseGeocodeEndpoint);
router.post('/analytics/reverse-geocode', verifyToken, reverseGeocodeEndpoint);

// ─── Non-sensitive VPN Check (Internal/Telemetry diagnostic) ────────────────
router.get('/security/vpn-check', checkVpnEndpoint);
router.post('/security/vpn-check', checkVpnEndpoint);

module.exports = router;
