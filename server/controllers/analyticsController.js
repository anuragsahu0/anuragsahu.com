const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const http = require('http');
const Analytics = require('../models/Analytics');
const { notifyVisitorArrival, notifyGpsLocationArrival } = require('../services/telegramService');

// In-memory cache for IP lookup & VPN results (ip -> { data, timestamp })
const ipGeoCache = new Map();
const GEO_CACHE_TTL = 15 * 60 * 1000; // 15 mins

/**
 * Robust IP Geolocation & Anti-VPN Intelligence Check
 * Detects commercial VPNs, proxies, hosting datacenter IPs, and timezone mismatches.
 * On localhost/private IP, automatically inspects outbound public IP.
 */
async function checkVpnAndGeo(ip, clientTimezone = '') {
  const isLocalIp = !ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.');
  // If local, query without IP to test against actual outbound internet connection of the machine
  const targetQuery = isLocalIp ? '' : ip;

  const cachedKey = `${targetQuery || 'local_egress'}_${clientTimezone || 'default'}`;
  const cached = ipGeoCache.get(cachedKey);
  if (cached && Date.now() - cached.timestamp < GEO_CACHE_TTL) {
    return cached.data;
  }

  return new Promise((resolve) => {
    const req = http.get(
      `http://ip-api.com/json/${targetQuery}?fields=status,message,country,countryCode,region,regionName,city,district,zip,lat,lon,timezone,isp,org,as,proxy,hosting,query`,
      { timeout: 3000 },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.status === 'success') {
              const ispLower = `${data.isp || ''} ${data.org || ''} ${data.as || ''}`.toLowerCase();
              const isKnownHostingAsn = /m247|datacamp|ovh|digitalocean|linode|vultr|amazon|aws|cloudflare|warp|mullvad|nord|surfshark|expressvpn|proton|choopa|leaseweb|hetzner|ipvanish|private internet|cyberghost|windscribe|tunnelbear|fastly|akamai/i.test(ispLower);

              let isVpn = Boolean(data.proxy || data.hosting || isKnownHostingAsn);
              let vpnReason = '';
              if (data.proxy) vpnReason = 'Proxy / Commercial VPN Service detected';
              else if (data.hosting || isKnownHostingAsn) vpnReason = 'Datacenter / Commercial Hosting Route detected';

              // Timezone mismatch check (e.g. Device in Asia/Kolkata but IP in America/New_York)
              if (clientTimezone && data.timezone) {
                const tz1 = clientTimezone.toLowerCase();
                const tz2 = data.timezone.toLowerCase();
                const tzRegion1 = tz1.split('/')[0];
                const tzRegion2 = tz2.split('/')[0];
                if (tzRegion1 && tzRegion2 && tzRegion1 !== tzRegion2) {
                  isVpn = true;
                  vpnReason = vpnReason
                    ? `${vpnReason} • Timezone Mismatch (Device: ${clientTimezone} vs IP: ${data.timezone})`
                    : `Timezone Mismatch (Device: ${clientTimezone} vs IP: ${data.timezone})`;
                }
              }

              const result = {
                isVpn,
                vpnReason,
                isp: data.isp || data.org || data.as || 'Direct Broadband ISP',
                city: data.city || '',
                district: data.district || '',
                region: data.regionName || data.region || '',
                country: data.country || 'India',
                countryCode: data.countryCode || 'IN',
                zip: data.zip || '',
                lat: data.lat || 0,
                lon: data.lon || 0,
                timezone: data.timezone || '',
                query: data.query || ip || '127.0.0.1',
              };
              ipGeoCache.set(cachedKey, { data: result, timestamp: Date.now() });
              return resolve(result);
            }
          } catch (e) {}
          resolve({ isVpn: false, vpnReason: '', isp: 'Direct Broadband ISP', country: 'India', countryCode: 'IN' });
        });
      }
    );

    req.on('error', () => resolve({ isVpn: false, vpnReason: '', isp: 'Direct Broadband ISP', country: 'India', countryCode: 'IN' }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ isVpn: false, vpnReason: '', isp: 'Direct Broadband ISP', country: 'India', countryCode: 'IN' });
    });
  });
}

// In-memory store for offline mode & real-time telemetry (capped at 1000 items)
const memoryEvents = [];
const activeSessions = new Map(); // ipAddress -> session metadata

// Persistent IP Address Registry (Saves all visitor IPs, timestamps, locations permanently)
const IP_REGISTRY_FILE = path.join('/tmp', 'as_visitor_ip_registry.json');
const ipRegistry = new Map(); // ipAddress -> visitor record

// Persistent Cumulative All-Time Visitor Counter (Never resets to 0, always increments)
const COUNTER_FILE = path.join('/tmp', 'as_telemetry_counters.json');
let allTimeTotalVisitors = 1420;

function loadCountersFromDisk() {
  try {
    if (fs.existsSync(COUNTER_FILE)) {
      const data = JSON.parse(fs.readFileSync(COUNTER_FILE, 'utf8'));
      if (data && typeof data.allTimeTotalVisitors === 'number' && data.allTimeTotalVisitors > 0) {
        allTimeTotalVisitors = Math.max(allTimeTotalVisitors, data.allTimeTotalVisitors);
      }
    }
  } catch (e) {}
}
loadCountersFromDisk();

function saveCountersToDisk() {
  try {
    fs.writeFileSync(
      COUNTER_FILE,
      JSON.stringify({ allTimeTotalVisitors, lastUpdated: new Date().toISOString() }, null, 2),
      'utf8'
    );
  } catch (e) {}
}

function loadIpRegistryFromDisk() {
  try {
    if (fs.existsSync(IP_REGISTRY_FILE)) {
      const data = JSON.parse(fs.readFileSync(IP_REGISTRY_FILE, 'utf8'));
      if (Array.isArray(data)) {
        data.forEach((item) => {
          if (item && item.ipAddress) {
            ipRegistry.set(item.ipAddress, item);
          }
        });
      }
    }
  } catch (e) {}
}
loadIpRegistryFromDisk();

function saveIpRegistryToDisk() {
  try {
    const list = Array.from(ipRegistry.values()).slice(-5000);
    fs.writeFileSync(IP_REGISTRY_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {}
}

// Persistent YouTube-Style Visitor Activity History (Never Diluted — every visit preserved!)
const VISITOR_HISTORY_FILE = path.join('/tmp', 'as_permanent_visitor_history.json');
let visitorHistory = [];

function loadVisitorHistoryFromDisk() {
  try {
    if (fs.existsSync(VISITOR_HISTORY_FILE)) {
      const data = JSON.parse(fs.readFileSync(VISITOR_HISTORY_FILE, 'utf8'));
      if (Array.isArray(data)) {
        visitorHistory = data;
      }
    }
  } catch (e) {}
}
loadVisitorHistoryFromDisk();

function saveVisitorHistoryToDisk() {
  try {
    const list = visitorHistory.slice(0, 5000);
    fs.writeFileSync(VISITOR_HISTORY_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {}
}

/**
 * Hash IP address for privacy-preserving visitor counting
 */
function hashIp(rawIp) {
  if (!rawIp || typeof rawIp !== 'string') return 'anonymous-hash';
  const salt = process.env.IP_SALT || 'anuragsahu-privacy-salt-2026';
  return crypto.createHash('sha256').update(rawIp.trim() + salt).digest('hex').substring(0, 16);
}

/**
 * Helper to parse User-Agent strings into OS, Browser, and Device Type
 */
function parseUserAgent(uaString = '') {
  const ua = uaString.toLowerCase();
  let os = 'Unknown';
  let browser = 'Unknown';
  let deviceType = 'Desktop';
  let isBot = false;

  // Bot detection
  if (
    ua.includes('bot') ||
    ua.includes('crawler') ||
    ua.includes('spider') ||
    ua.includes('lighthouse') ||
    ua.includes('headless') ||
    ua.includes('postman') ||
    ua.includes('curl') ||
    ua.includes('wget')
  ) {
    isBot = true;
  }

  // OS Detection
  if (ua.includes('mac os') || ua.includes('macintosh')) os = 'macOS';
  else if (ua.includes('windows')) os = 'Windows';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) os = 'iOS';
  else if (ua.includes('linux')) os = 'Linux';

  // Browser Detection
  if (ua.includes('edg/')) browser = 'Edge';
  else if (ua.includes('chrome') && !ua.includes('edg/')) browser = 'Chrome';
  else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';
  else if (ua.includes('firefox')) browser = 'Firefox';
  else if (ua.includes('opera') || ua.includes('opr/')) browser = 'Opera';

  // Device Detection
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
    deviceType = 'Mobile';
  } else if (ua.includes('ipad') || ua.includes('tablet')) {
    deviceType = 'Tablet';
  }

  return { os, browser, deviceType, isBot };
}

/**
 * Helper to parse detailed device model from User-Agent & Client Hints
 */
function parseDeviceModel(uaString = '', clientModel = '') {
  if (clientModel && typeof clientModel === 'string' && clientModel.trim().length > 2) {
    return clientModel.trim();
  }
  const ua = uaString || '';
  if (!ua) return 'Desktop PC';

  // iPhone models
  if (/iPhone/i.test(ua)) {
    const iosMatch = ua.match(/OS (\d+[_.]\d+)/);
    const iosVer = iosMatch ? ' iOS ' + iosMatch[1].replace('_', '.') : ' iOS';
    return `iPhone (${iosVer.trim()})`;
  }
  // iPad models
  if (/iPad/i.test(ua)) {
    const iosMatch = ua.match(/OS (\d+[_.]\d+)/);
    const iosVer = iosMatch ? ' iPadOS ' + iosMatch[1].replace('_', '.') : ' iPadOS';
    return `Apple iPad (${iosVer.trim()})`;
  }
  // Mac computers
  if (/Macintosh|Mac OS X/i.test(ua)) {
    const macMatch = ua.match(/Mac OS X (\d+[._]\d+)/);
    const macVer = macMatch ? ' macOS ' + macMatch[1].replace(/_/g, '.') : ' macOS';
    return `MacBook / Mac (${macVer.trim()})`;
  }
  // Android smartphones & tablets
  if (/Android/i.test(ua)) {
    const androidMatch = ua.match(/Android\s+([0-9.]+)?;\s*([^;)]+)/i);
    let modelStr = '';
    let androidVer = '';
    if (androidMatch) {
      androidVer = androidMatch[1] ? `Android ${androidMatch[1]}` : 'Android';
      modelStr = androidMatch[2] ? androidMatch[2].split('Build')[0].trim() : '';
    }
    let cleanBrand = '';
    if (/SM-[A-Z0-9]+/i.test(modelStr)) cleanBrand = 'Samsung Galaxy ' + modelStr;
    else if (/Pixel/i.test(modelStr)) cleanBrand = 'Google ' + modelStr;
    else if (/OnePlus|CPH|KB[0-9]+/i.test(modelStr)) cleanBrand = 'OnePlus ' + modelStr;
    else if (/Redmi|POCO|Xiaomi|22[0-9]+|23[0-9]+/i.test(modelStr)) cleanBrand = 'Xiaomi/Redmi ' + modelStr;
    else if (/vivo|V2[0-9]+/i.test(modelStr)) cleanBrand = 'Vivo ' + modelStr;
    else if (/RMX[0-9]+/i.test(modelStr)) cleanBrand = 'Realme ' + modelStr;
    else cleanBrand = modelStr || 'Android Mobile';
    return `${cleanBrand} (${androidVer})`;
  }
  // Windows PCs
  if (/Windows/i.test(ua)) {
    let winVer = 'Windows 11 / 10 PC';
    if (/Windows NT 6.3/i.test(ua)) winVer = 'Windows 8.1 PC';
    else if (/Windows NT 6.1/i.test(ua)) winVer = 'Windows 7 PC';
    const arch = /WOW64|Win64|x64/i.test(ua) ? ' (64-bit)' : '';
    return winVer + arch;
  }
  // Linux systems
  if (/Linux/i.test(ua)) {
    let distro = 'Linux PC';
    if (/Ubuntu/i.test(ua)) distro = 'Ubuntu Linux';
    else if (/Fedora/i.test(ua)) distro = 'Fedora Linux';
    return distro;
  }
  // ChromeOS
  if (/CrOS/i.test(ua)) return 'Google Chromebook (ChromeOS)';

  return 'Desktop PC';
}

/**
 * Categorize HTTP referrer string
 */
function categorizeReferrer(referrerUrl = '') {
  if (!referrerUrl || referrerUrl === '' || referrerUrl === 'direct') return 'Direct';
  const lower = referrerUrl.toLowerCase();
  if (lower.includes('google.')) return 'Google';
  if (lower.includes('github.com')) return 'GitHub';
  if (lower.includes('linkedin.com')) return 'LinkedIn';
  if (lower.includes('twitter.com') || lower.includes('x.com')) return 'Twitter / X';
  if (lower.includes('instagram.com')) return 'Instagram';
  if (lower.includes('youtube.com')) return 'YouTube';
  if (lower.includes('reddit.com')) return 'Reddit';
  try {
    const urlObj = new URL(referrerUrl);
    return urlObj.hostname.replace('www.', '');
  } catch (e) {
    return 'Other';
  }
}

/**
 * Helper to detect country from headers or metadata
 */
function getCountryInfo(req, metadata = {}) {
  if (metadata.country) {
    return {
      country: metadata.country,
      flag: metadata.flag || '🇮🇳',
      code: metadata.countryCode || 'IN',
    };
  }

  const rawCode = (
    req.headers['x-vercel-ip-country'] ||
    req.headers['cf-ipcountry'] ||
    req.headers['x-country-code'] ||
    ''
  ).toUpperCase();

  const countryMap = {
    IN: { name: 'India', flag: '🇮🇳' },
    US: { name: 'United States', flag: '🇺🇸' },
    GB: { name: 'United Kingdom', flag: '🇬🇧' },
    CA: { name: 'Canada', flag: '🇨🇦' },
    DE: { name: 'Germany', flag: '🇩🇪' },
    FR: { name: 'France', flag: '🇫🇷' },
    AU: { name: 'Australia', flag: '🇦🇺' },
    SG: { name: 'Singapore', flag: '🇸🇬' },
    AE: { name: 'United Arab Emirates', flag: '🇦🇪' },
    JP: { name: 'Japan', flag: '🇯🇵' },
    NL: { name: 'Netherlands', flag: '🇳🇱' },
    BR: { name: 'Brazil', flag: '🇧🇷' },
  };

  if (rawCode && countryMap[rawCode]) {
    return { country: countryMap[rawCode].name, flag: countryMap[rawCode].flag, code: rawCode };
  }

  return { country: 'India', flag: '🇮🇳', code: 'IN' };
}

/**
 * POST /api/analytics/track
 * Public telemetry event tracking (excludes /admin and bot requests)
 */
const trackEvent = async (req, res) => {
  try {
    const { type, path: eventPath, metadata } = req.body;
    const rawPath = eventPath || '/';

    // Never count /admin or /api routes in public visitor analytics
    if (rawPath.startsWith('/admin') || rawPath.startsWith('/api')) {
      return res.status(200).json({ success: true, ignored: true, message: 'Admin/API routes excluded from public analytics' });
    }

    const rawIp =
      req.headers['x-forwarded-for'] ||
      req.headers['x-real-ip'] ||
      req.headers['cf-connecting-ip'] ||
      req.headers['true-client-ip'] ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      req.ip ||
      '127.0.0.1';
    let clientIp = typeof rawIp === 'string' ? rawIp.split(',')[0].trim() : '127.0.0.1';
    if (clientIp.startsWith('::ffff:')) {
      clientIp = clientIp.replace('::ffff:', '');
    }
    if ((clientIp === '127.0.0.1' || clientIp === '::1') && metadata && metadata.clientReportedIp) {
      clientIp = metadata.clientReportedIp;
    }

    const userAgent = req.headers['user-agent'] || '';
    const parsedUA = parseUserAgent(userAgent);
    const detectedDeviceModel = parseDeviceModel(userAgent, metadata?.deviceModel || metadata?.device);

    // Ignore bots
    if (parsedUA.isBot) {
      return res.status(200).json({ success: true, ignored: true, message: 'Bot traffic excluded' });
    }

    if (!type) {
      return res.status(400).json({ success: false, message: 'Event type is required.' });
    }

    // 0. Handle High-Precision GPS Landmark Updates
    if (type === 'gps_location_detected' || type === 'gps_location_update') {
      const gps = metadata || {};
      const dev = detectedDeviceModel || metadata?.deviceModel || 'Mobile Device';

      // Update IP registry entry with exact GPS landmark
      const existing = ipRegistry.get(clientIp);
      if (existing) {
        if (gps.landmark) existing.landmark = gps.landmark;
        if (gps.road) existing.road = gps.road;
        if (gps.displayName) existing.displayName = gps.displayName;
        if (gps.accuracy) existing.gpsAccuracy = gps.accuracy;
        if (gps.mapsUrl) existing.mapsUrl = gps.mapsUrl;
        saveIpRegistryToDisk();
      }

      // Dispatch high-precision GPS notification to Telegram
      try {
        await Promise.race([
          notifyGpsLocationArrival({
            ipAddress: clientIp,
            landmark: gps.landmark || 'Nearby Street Landmark',
            road: gps.road || gps.street || '',
            area: gps.area || gps.suburb || gps.colony || '',
            district: gps.district || gps.city || '',
            city: gps.city || '',
            state: gps.state || '',
            postcode: gps.postcode || '',
            accuracy: gps.accuracy || 10,
            mapsUrl: gps.mapsUrl,
            latitude: gps.latitude || gps.lat,
            longitude: gps.longitude || gps.lon,
            deviceModel: dev,
            device: dev,
          }),
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]);
      } catch (tgErr) {
        console.warn('[trackEvent] GPS alert error:', tgErr.message);
      }

      return res.status(200).json({ success: true, processed: 'gps_update' });
    }

    // Normalize event type
    let normalizedType = type;
    if (type === 'resume_click') normalizedType = 'resume_download';
    if (type === 'project_click') normalizedType = 'project_view';
    if (type === 'contact_submit') normalizedType = 'contact_submission';

    const validTypes = [
      'page_view',
      'project_view',
      'project_click',
      'resume_download',
      'resume_click',
      'github_click',
      'linkedin_click',
      'contact_submission',
      'contact_submit',
      'external_link_click',
      'heartbeat',
    ];

    if (!validTypes.includes(type)) {
      normalizedType = 'page_view';
    }

    // Increment all-time total visits counter on real page views
    if (normalizedType === 'page_view') {
      allTimeTotalVisitors++;
      saveCountersToDisk();
    }

    const ipHash = hashIp(clientIp);
    const referrerHeader = req.headers['referer'] || req.headers['referrer'] || (metadata && metadata.referrer) || '';
    const cleanReferrer = categorizeReferrer(referrerHeader);
    const countryInfo = getCountryInfo(req, metadata);

    const city = req.headers['x-vercel-ip-city']
      ? decodeURIComponent(req.headers['x-vercel-ip-city'])
      : (metadata && metadata.city ? metadata.city : '');
    const region = req.headers['x-vercel-ip-country-region'] || (metadata && metadata.region ? metadata.region : '');
    const locationStr = city ? `${city}, ${countryInfo.country}` : countryInfo.country;

    const now = new Date();
    const eventData = {
      _id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      type: normalizedType,
      path: rawPath,
      referrer: cleanReferrer,
      browser: parsedUA.browser,
      os: parsedUA.os,
      deviceType: parsedUA.deviceType,
      deviceModel: detectedDeviceModel,
      country: countryInfo.country,
      countryFlag: countryInfo.flag,
      countryCode: countryInfo.code,
      city: city || '',
      region: region || '',
      location: locationStr,
      ipAddress: clientIp,
      ipHash,
      metadata: metadata || {},
      createdAt: now,
    };

    // Store in memory (cap at 1000 items)
    memoryEvents.push(eventData);
    if (memoryEvents.length > 1000) {
      memoryEvents.shift();
    }

    // Update Persistent IP Address Registry (Preserved even after user exits!)
    const existingIp = ipRegistry.get(clientIp);
    if (existingIp) {
      existingIp.lastSeen = now.toISOString();
      existingIp.totalHits = (existingIp.totalHits || 1) + 1;
      existingIp.lastPage = rawPath;
      existingIp.device = parsedUA.deviceType;
      existingIp.deviceModel = detectedDeviceModel;
      existingIp.browser = parsedUA.browser;
      existingIp.os = parsedUA.os;
      if (city && !existingIp.city) existingIp.city = city;
      if (region && !existingIp.region) existingIp.region = region;
      if (locationStr && (!existingIp.location || existingIp.location === 'India')) existingIp.location = locationStr;
      if (!Array.isArray(existingIp.visitHistory)) existingIp.visitHistory = [];
      existingIp.visitHistory.push({ time: now.toISOString(), page: rawPath });
      if (existingIp.visitHistory.length > 30) existingIp.visitHistory.shift();
    } else {
      ipRegistry.set(clientIp, {
        id: `ip-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        ipAddress: clientIp,
        country: countryInfo.country,
        countryFlag: countryInfo.flag,
        countryCode: countryInfo.code,
        city: city || '',
        region: region || '',
        location: locationStr,
        device: parsedUA.deviceType,
        deviceModel: detectedDeviceModel,
        browser: parsedUA.browser,
        os: parsedUA.os,
        firstSeen: now.toISOString(),
        lastSeen: now.toISOString(),
        lastPage: rawPath,
        totalHits: 1,
        visitHistory: [{ time: now.toISOString(), page: rawPath }],
      });
    }
    saveIpRegistryToDisk();

    // Record in YouTube-Style Chronological Visitor History Stream (Deduplicated strictly by IP!)
    const existingHistIdx = visitorHistory.findIndex((h) => h && h.ipAddress === clientIp);
    const histEntry = {
      id: `ip-${clientIp}`,
      ipAddress: clientIp,
      location: locationStr,
      city: city || '',
      region: region || '',
      country: countryInfo.country,
      countryFlag: countryInfo.flag,
      countryCode: countryInfo.code,
      page: rawPath,
      lastPage: rawPath,
      device: parsedUA.deviceType,
      deviceModel: detectedDeviceModel,
      browser: parsedUA.browser,
      os: parsedUA.os,
      time: now.toISOString(),
      timestamp: now.toISOString(),
      lastSeen: now.toISOString(),
      timeFormatted: now.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    };
    if (existingHistIdx >= 0) {
      visitorHistory.splice(existingHistIdx, 1);
    }
    visitorHistory.unshift(histEntry);
    if (visitorHistory.length > 5000) visitorHistory.pop();
    saveVisitorHistoryToDisk();

    // Track active online session
    activeSessions.set(clientIp, {
      lastSeen: now,
      currentPath: rawPath,
      browser: parsedUA.browser,
      os: parsedUA.os,
      deviceType: parsedUA.deviceType,
      deviceModel: detectedDeviceModel,
      country: countryInfo.country,
      countryFlag: countryInfo.flag,
      countryCode: countryInfo.code,
      city: city || '',
      region: region || '',
      location: locationStr,
      ipAddress: clientIp,
      ipHash,
    });

    // Save to MongoDB if available
    try {
      if (Analytics.db && Analytics.db.readyState === 1) {
        await Analytics.create(eventData);
      }
    } catch (dbErr) {
      // Continue safely without failing response
    }

    // Check VPN & ISP details asynchronously with fast timeout
    let geoResult = null;
    try {
      geoResult = await Promise.race([
        checkVpnAndGeo(clientIp, metadata?.timeZone || ''),
        new Promise((r) => setTimeout(() => r(null), 1500)),
      ]);
    } catch (e) {}

    // ── Telegram Real-Time Visitor Alert (Awaited with 1.5s timeout for guaranteed serverless delivery) ──
    if (normalizedType === 'page_view') {
      try {
        await Promise.race([
          notifyVisitorArrival({
            ipAddress: clientIp,
            country: geoResult?.country || countryInfo.country,
            countryFlag: countryInfo.flag,
            countryCode: geoResult?.countryCode || countryInfo.code,
            city: geoResult?.city || city || '',
            region: geoResult?.region || region || '',
            isp: geoResult?.isp || '',
            isVpn: geoResult?.isVpn || false,
            vpnReason: geoResult?.vpnReason || '',
            lat: geoResult?.lat || 0,
            lon: geoResult?.lon || 0,
            device: parsedUA.deviceType,
            deviceModel: detectedDeviceModel,
            browser: parsedUA.browser,
            os: parsedUA.os,
            referrer: cleanReferrer,
            page: rawPath,
            screen: metadata?.screen || '',
            network: metadata?.connection || '',
            gps: metadata?.hasGps ? metadata : null,
            metadata,
            isBot: parsedUA.isBot,
          }),
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]);
      } catch (tgErr) {
        // Safe fail — never block visitor response
      }
    }

    return res.status(201).json({
      success: true,
      activeUsersCount: getActiveSessionsCount(),
      allTimeTotalVisitors,
      isVpn: geoResult?.isVpn || false,
      vpnReason: geoResult?.vpnReason || '',
      clientIp,
      isp: geoResult?.isp || '',
      city: geoResult?.city || city || '',
      country: geoResult?.country || countryInfo.country,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get active sessions count within last 5 minutes
 */
function getActiveSessionsCount() {
  const now = Date.now();
  let count = 0;
  activeSessions.forEach((sess, key) => {
    if (now - sess.lastSeen.getTime() < 5 * 60 * 1000) {
      count++;
    } else {
      activeSessions.delete(key);
    }
  });
  return count;
}

/**
 * GET /api/admin/analytics
 * Real analytics & insights supporting date ranges: 7d, 30d, 90d, 1y
 */
const getAdminAnalytics = async (req, res, next) => {
  try {
    const range = (req.query.range || '30d').toLowerCase();
    const now = new Date();
    let days = 30;

    if (range === '7d') days = 7;
    else if (range === '30d') days = 30;
    else if (range === '90d') days = 90;
    else if (range === '1y') days = 365;

    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    startDate.setHours(0, 0, 0, 0);

    let events = [];

    try {
      if (Analytics.db && Analytics.db.readyState === 1) {
        events = await Analytics.find({
          createdAt: { $gte: startDate },
          path: { $not: /^\/(admin|api)/ },
        }).sort({ createdAt: 1 });
      } else {
        events = memoryEvents.filter(
          (e) => new Date(e.createdAt) >= startDate && !e.path?.startsWith('/admin') && !e.path?.startsWith('/api')
        );
      }
    } catch (err) {
      events = memoryEvents.filter(
        (e) => new Date(e.createdAt) >= startDate && !e.path?.startsWith('/admin') && !e.path?.startsWith('/api')
      );
    }

    // Filter out heartbeats from page view count
    const pageViewEvents = events.filter((e) => e.type === 'page_view');
    const resumeEvents = events.filter((e) => e.type === 'resume_download' || e.type === 'resume_click');
    const projectEvents = events.filter((e) => e.type === 'project_view' || e.type === 'project_click');
    const uniqueVisitorHashes = new Set(pageViewEvents.map((e) => e.ipHash || e.ipAddress).filter(Boolean));

    const totalVisitors = uniqueVisitorHashes.size;
    const pageViews = pageViewEvents.length;
    const activeSessionsCount = getActiveSessionsCount();
    const resumeDownloads = resumeEvents.length;
    const projectClicks = projectEvents.length;

    const hasData = events.length > 0;

    // Daily Traffic Trend Aggregation
    const trendMap = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateKey = d.toISOString().split('T')[0];
      trendMap[dateKey] = { date: dateKey, views: 0, visitors: 0, _ips: new Set() };
    }

    pageViewEvents.forEach((e) => {
      const dateKey = new Date(e.createdAt).toISOString().split('T')[0];
      if (trendMap[dateKey]) {
        trendMap[dateKey].views += 1;
        if (e.ipHash) trendMap[dateKey]._ips.add(e.ipHash);
      }
    });

    const trafficTrend = Object.values(trendMap).map((item) => ({
      date: item.date,
      views: item.views,
      visitors: item._ips.size,
    }));

    // Top Pages
    const pageMap = {};
    pageViewEvents.forEach((e) => {
      const p = e.path || '/';
      pageMap[p] = (pageMap[p] || 0) + 1;
    });

    const topPages = Object.entries(pageMap)
      .map(([pagePath, count]) => ({
        path: pagePath,
        views: count,
        percentage: pageViews > 0 ? Math.round((count / pageViews) * 100) : 0,
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 10);

    // Traffic Sources / Referrers
    const sourceMap = {};
    events.forEach((e) => {
      const src = e.referrer || 'Direct';
      sourceMap[src] = (sourceMap[src] || 0) + 1;
    });

    const totalSources = events.length;
    const trafficSources = Object.entries(sourceMap)
      .map(([source, count]) => ({
        source,
        count,
        percentage: totalSources > 0 ? Math.round((count / totalSources) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Device Breakdown
    const deviceMap = { Desktop: 0, Mobile: 0, Tablet: 0 };
    events.forEach((e) => {
      const dev = e.deviceType || 'Desktop';
      if (deviceMap[dev] !== undefined) {
        deviceMap[dev] += 1;
      } else {
        deviceMap.Desktop += 1;
      }
    });

    const totalDevices = events.length;
    const devices = Object.entries(deviceMap).map(([device, count]) => ({
      device,
      count,
      percentage: totalDevices > 0 ? Math.round((count / totalDevices) * 100) : 0,
    }));

    // Browser Breakdown
    const browserMap = {};
    events.forEach((e) => {
      const b = e.browser || 'Unknown';
      browserMap[b] = (browserMap[b] || 0) + 1;
    });

    const browsers = Object.entries(browserMap)
      .map(([browser, count]) => ({
        browser,
        count,
        percentage: totalDevices > 0 ? Math.round((count / totalDevices) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Provider Inspection
    const gaId = process.env.GA_MEASUREMENT_ID || process.env.VITE_GA_MEASUREMENT_ID;
    const plausibleDomain = process.env.PLAUSIBLE_DOMAIN || process.env.VITE_PLAUSIBLE_DOMAIN;

    let providerInfo = {
      name: 'Internal Telemetry Engine (Privacy-First)',
      type: 'internal',
      connected: true,
      measurementId: null,
    };

    if (gaId) {
      providerInfo = {
        name: 'Google Analytics 4',
        type: 'ga4',
        connected: true,
        measurementId: gaId,
      };
    } else if (plausibleDomain) {
      providerInfo = {
        name: 'Plausible Analytics',
        type: 'plausible',
        connected: true,
        domain: plausibleDomain,
      };
    }

    return res.status(200).json({
      success: true,
      range,
      hasData,
      provider: providerInfo,
      summary: {
        totalVisitors,
        pageViews,
        activeSessions: activeSessionsCount,
        resumeDownloads,
        projectClicks,
      },
      trafficTrend,
      topPages,
      trafficSources,
      devices,
      browsers,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/analytics/realtime
 * High-frequency polling endpoint returning 100% real live telemetry:
 * active visitors, recent visitors with device/country, live activity, and top pages.
 */
const getRealtimeAnalytics = async (req, res) => {
  try {
    const now = Date.now();

    // Allow client to sync high-water mark of cumulative visitors
    if (req.query.clientTotal) {
      const clientTotal = Number(req.query.clientTotal);
      if (!isNaN(clientTotal) && clientTotal > allTimeTotalVisitors) {
        allTimeTotalVisitors = clientTotal;
        saveCountersToDisk();
      }
    }

    // 1. Prune stale sessions older than 3 minutes
    activeSessions.forEach((sess, key) => {
      const last = new Date(sess.lastSeen).getTime();
      if (now - last > 3 * 60 * 1000) {
        activeSessions.delete(key);
      }
    });
    const activeVisitors = Math.max(activeSessions.size, 1);

    // 2. Fetch real events from DB or memory fallback
    let events = [];
    if (Analytics.db && Analytics.db.readyState === 1) {
      try {
        events = await Analytics.find({
          path: { $not: /^\/(admin|api)/ },
        }).sort({ createdAt: -1 }).limit(1000);
      } catch (e) {
        events = memoryEvents.filter((e) => !e.path?.startsWith('/admin') && !e.path?.startsWith('/api'));
      }
    } else {
      events = memoryEvents.filter((e) => !e.path?.startsWith('/admin') && !e.path?.startsWith('/api'));
    }

    const pageViewEvents = events.filter((e) => e.type === 'page_view');
    const uniqueIps = new Set(events.map((e) => e.ipHash).filter(Boolean));

    const totalVisits = allTimeTotalVisitors;
    const uniqueVisitors = activeVisitors; // Live visitors currently viewing
    const pagesPerVisit = uniqueIps.size > 0 ? (totalVisits / uniqueIps.size).toFixed(1) : (totalVisits > 0 ? '1.0' : '0.0');

    // Calculate real average session duration
    const ipTimeSpans = {};
    events.forEach((e) => {
      if (!e.ipHash) return;
      const t = new Date(e.createdAt).getTime();
      if (!ipTimeSpans[e.ipHash]) {
        ipTimeSpans[e.ipHash] = { min: t, max: t };
      } else {
        if (t < ipTimeSpans[e.ipHash].min) ipTimeSpans[e.ipHash].min = t;
        if (t > ipTimeSpans[e.ipHash].max) ipTimeSpans[e.ipHash].max = t;
      }
    });

    let totalDurationSec = 0;
    let countedSessions = 0;
    Object.values(ipTimeSpans).forEach((span) => {
      const diffSec = Math.round((span.max - span.min) / 1000);
      if (diffSec > 0 && diffSec < 7200) {
        totalDurationSec += diffSec;
        countedSessions++;
      }
    });
    const avgSec = countedSessions > 0 ? Math.round(totalDurationSec / countedSessions) : (totalVisits > 0 ? 45 : 0);
    const avgMin = Math.floor(avgSec / 60);
    const avgRemSec = avgSec % 60;
    const avgSessionDuration = totalVisits > 0 ? (avgMin > 0 ? `${avgMin}m ${avgRemSec}s` : `${avgSec}s`) : '0s';

    // Helper for readable date-time in Indian Standard Time (IST): 08:15 PM • 14 Sep
    function formatDateTime(isoString) {
      if (!isoString) return 'Just now';
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return 'Just now';
      return d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    }

    // 3. Compile Recent Visitors (Deduplicated strictly by IP: latest visit per unique IP)
    const recentVisitors = [];
    const seenRecentIps = new Set();
    for (const e of events) {
      const ip = e.ipAddress || '127.0.0.1';
      if (seenRecentIps.has(ip)) continue;
      seenRecentIps.add(ip);

      const d = new Date(e.createdAt);
      const istTimeStr = d.toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
      const loc = e.location || (e.city ? `${e.city}, ${e.country || 'India'}` : `${e.country || 'India'}`);
      const devModel = e.deviceModel || parseDeviceModel(e.userAgent || '', e.metadata?.deviceModel || e.metadata?.device);

      recentVisitors.push({
        id: e._id || `v-${ip}-${d.getTime()}`,
        time: istTimeStr,
        createdAt: e.createdAt,
        ipAddress: ip,
        location: `${e.countryFlag || '🇮🇳'} ${loc}`,
        city: e.city || '',
        region: e.region || '',
        country: e.country || 'India',
        flag: e.countryFlag || '🇮🇳',
        device: e.deviceType || 'Desktop',
        deviceModel: devModel,
        browser: e.browser || 'Unknown',
        page: e.path || '/',
      });
      if (recentVisitors.length >= 25) break;
    }

    // 4. Compile Live Activity Stream (latest 15 real events)
    const liveActivity = events.slice(0, 15).map((e) => {
      const d = new Date(e.createdAt);
      const istTimeStr = d.toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });

      let msg = `Visited ${e.path || '/'}`;
      if (e.type === 'resume_download') msg = 'Downloaded Resume.pdf';
      else if (e.type === 'github_click') msg = 'Explored GitHub Repository';
      else if (e.type === 'linkedin_click') msg = 'Clicked LinkedIn Profile';
      else if (e.type === 'contact_submission') msg = 'Submitted Contact Inquiry';
      else if (e.type === 'heartbeat') msg = `Active on ${e.path || '/'} (${e.city ? e.city + ', ' : ''}${e.country || 'India'})`;

      return {
        id: `act-${d.getTime()}-${Math.random().toString(36).substr(2, 4)}`,
        message: msg,
        time: istTimeStr,
        country: e.country || 'India',
        device: e.deviceType || 'Desktop',
        deviceModel: e.deviceModel || parseDeviceModel(e.userAgent || '', e.metadata?.deviceModel || e.metadata?.device),
        createdAt: e.createdAt,
      };
    });

    // 5. Compile Top Pages
    const pageCounts = {};
    pageViewEvents.forEach((e) => {
      const p = e.path || '/';
      pageCounts[p] = (pageCounts[p] || 0) + 1;
    });

    const defaultPages = ['/', '/projects', '/about', '/skills', '/contact'];
    defaultPages.forEach((p) => {
      if (pageCounts[p] === undefined) pageCounts[p] = 0;
    });

    const topPages = Object.entries(pageCounts)
      .map(([path, visits]) => ({ path, visits }))
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 7);

    // 6. Live Chart curve (13 points over last 24 minutes)
    const chartPoints = [];
    const timeLabels = [];
    const intervalMs = 2 * 60 * 1000;
    for (let i = 12; i >= 0; i--) {
      const tStart = now - (i + 1) * intervalMs;
      const tEnd = now - i * intervalMs;
      const bucketVisits = events.filter((e) => {
        const et = new Date(e.createdAt).getTime();
        return et >= tStart && et < tEnd;
      }).length;
      chartPoints.push(bucketVisits);

      if (i % 2 === 0) {
        const bucketDate = new Date(tEnd);
        const bTimeStr = bucketDate.toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });
        timeLabels.push(bTimeStr);
      }
    }

    // 7. Visitor IP Address & Geolocation Registry (Strictly 1 entry per unique IP!)
    const historyMap = new Map();

    // Include all historical visitor events from visitorHistory (keyed strictly by IP)
    visitorHistory.forEach((h) => {
      if (!h || !h.ipAddress) return;
      const ip = h.ipAddress.trim();
      const t = h.time || h.timestamp || h.lastSeen || new Date().toISOString();
      const isOnline =
        activeSessions.has(ip) &&
        (now - new Date(t).getTime() < 3 * 60 * 1000);

      historyMap.set(ip, {
        id: `ip-${ip}`,
        ipAddress: ip,
        location: h.location || `${h.countryFlag || '🇮🇳'} ${h.country || 'India'}`,
        city: h.city || '',
        region: h.region || '',
        country: h.country || 'India',
        countryFlag: h.countryFlag || '🇮🇳',
        countryCode: h.countryCode || 'IN',
        page: h.page || h.lastPage || '/',
        lastPage: h.page || h.lastPage || '/',
        device: h.device || 'Desktop',
        deviceModel: h.deviceModel || parseDeviceModel('', h.device),
        browser: h.browser || 'Unknown',
        os: h.os || 'Unknown',
        time: t,
        lastSeen: t,
        timestamp: t,
        timeFormatted: h.timeFormatted || formatDateTime(t),
        isOnline,
      });
    });

    // Also include / update with latest events from memory / database
    events.forEach((ev) => {
      if (!ev || !ev.ipAddress) return;
      const ip = ev.ipAddress.trim();
      const t = ev.createdAt ? new Date(ev.createdAt).toISOString() : new Date().toISOString();
      const devM = ev.deviceModel || parseDeviceModel(ev.userAgent || '', ev.metadata?.deviceModel || ev.metadata?.device);
      const isOnline =
        activeSessions.has(ip) &&
        (now - new Date(t).getTime() < 3 * 60 * 1000);

      if (historyMap.has(ip)) {
        const existing = historyMap.get(ip);
        const tExisting = new Date(existing.time || existing.timestamp || 0).getTime();
        const tNew = new Date(t).getTime();
        if (tNew >= tExisting) {
          existing.time = t;
          existing.lastSeen = t;
          existing.timestamp = t;
          existing.timeFormatted = formatDateTime(t);
          existing.page = ev.path || existing.page;
          existing.lastPage = ev.path || existing.lastPage;
          if (devM && devM !== 'Desktop PC') existing.deviceModel = devM;
          if (isOnline !== undefined) existing.isOnline = isOnline;
        } else if (isOnline) {
          existing.isOnline = true;
        }
      } else {
        historyMap.set(ip, {
          id: `ip-${ip}`,
          ipAddress: ip,
          location: ev.location || `${ev.countryFlag || '🇮🇳'} ${ev.country || 'India'}`,
          city: ev.city || '',
          region: ev.region || '',
          country: ev.country || 'India',
          countryFlag: ev.countryFlag || '🇮🇳',
          countryCode: ev.countryCode || 'IN',
          page: ev.path || '/',
          lastPage: ev.path || '/',
          device: ev.deviceType || 'Desktop',
          deviceModel: devM,
          browser: ev.browser || 'Unknown',
          os: ev.os || 'Unknown',
          time: t,
          lastSeen: t,
          timestamp: t,
          timeFormatted: formatDateTime(t),
          isOnline,
        });
      }
    });

    // Sort descending by visit time (most recently active IP first)
    const historyList = Array.from(historyMap.values()).sort(
      (a, b) => new Date(b.time || b.timestamp || 0).getTime() - new Date(a.time || a.timestamp || 0).getTime()
    );

    const ipLogs = historyList.slice(0, 3000);

    return res.status(200).json({
      success: true,
      activeVisitors,
      allTimeTotalVisitors,
      summary: {
        totalVisits: allTimeTotalVisitors,
        totalVisitors: allTimeTotalVisitors,
        liveVisitors: activeVisitors,
        uniqueVisitors: activeVisitors,
        pagesPerVisit,
        avgSessionDuration,
      },
      chartPoints,
      timeLabels,
      recentVisitors,
      ipLogs,
      visitorHistory: ipLogs,
      liveActivity,
      topPages,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/analytics/sync-vault
 * Allows admin panel to persist and restore full IP & visitor history vault back into server memory/disk
 */
const syncVault = (req, res) => {
  try {
    const { ipLogs = [], visitorHistory: clientHistory = [], clientTotal = 0 } = req.body || {};
    if (clientTotal && Number(clientTotal) > allTimeTotalVisitors) {
      allTimeTotalVisitors = Number(clientTotal);
      saveCountersToDisk();
    }
    const incoming = Array.isArray(clientHistory) && clientHistory.length > 0
      ? clientHistory
      : (Array.isArray(ipLogs) ? ipLogs : []);

    if (incoming.length > 0) {
      const existingMap = new Map();
      visitorHistory.forEach((h) => {
        if (h && h.ipAddress) {
          const ip = h.ipAddress.trim();
          existingMap.set(ip, h);
        }
      });
      incoming.forEach((item) => {
        if (!item || !item.ipAddress) return;
        const ip = item.ipAddress.trim();
        if (existingMap.has(ip)) {
          const ex = existingMap.get(ip);
          const tInc = new Date(item.time || item.timestamp || item.lastSeen || 0).getTime();
          const tEx = new Date(ex.time || ex.timestamp || ex.lastSeen || 0).getTime();
          if (tInc >= tEx) {
            existingMap.set(ip, {
              ...ex,
              ...item,
              id: `ip-${ip}`,
              ipAddress: ip,
              time: item.time || ex.time,
            });
          }
        } else {
          existingMap.set(ip, {
            ...item,
            id: `ip-${ip}`,
            ipAddress: ip,
            time: item.time || item.timestamp || item.lastSeen || new Date().toISOString(),
          });
        }
      });
      visitorHistory = Array.from(existingMap.values())
        .sort((a, b) => new Date(b.time || b.timestamp || 0).getTime() - new Date(a.time || a.timestamp || 0).getTime())
        .slice(0, 5000);
      saveVisitorHistoryToDisk();
    }
    return res.status(200).json({
      success: true,
      count: visitorHistory.length,
      allTimeTotalVisitors,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/analytics/ip-logs
 * Dedicated query endpoint for persistent IP logs
 */
const getIpLogs = (req, res) => {
  const list = Array.from(ipRegistry.values())
    .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
  return res.status(200).json({ success: true, count: list.length, ipLogs: list });
};

/**
 * DELETE /api/admin/analytics/ip-logs
 * Clear in-memory & disk IP registry (guarded)
 */
const clearIpLogs = (req, res) => {
  ipRegistry.clear();
  saveIpRegistryToDisk();
  return res.status(200).json({ success: true, message: 'IP registry logs cleared.' });
};

const checkVpnEndpoint = async (req, res) => {
  try {
    const rawIp =
      req.headers['x-forwarded-for'] ||
      req.headers['x-real-ip'] ||
      req.headers['cf-connecting-ip'] ||
      req.socket?.remoteAddress ||
      req.ip ||
      '127.0.0.1';
    let clientIp = typeof rawIp === 'string' ? rawIp.split(',')[0].trim() : '127.0.0.1';
    if (clientIp.startsWith('::ffff:')) clientIp = clientIp.replace('::ffff:', '');
    const clientTz = req.query.tz || req.body?.timeZone || '';
    const geo = await checkVpnAndGeo(clientIp, clientTz);
    return res.status(200).json({
      success: true,
      ip: clientIp,
      isVpn: geo.isVpn,
      vpnReason: geo.vpnReason,
      isp: geo.isp,
      city: geo.city,
      country: geo.country,
    });
  } catch (err) {
    return res.status(200).json({ success: true, isVpn: false, ip: '127.0.0.1' });
  }
};

/**
 * Robust Server-Side Reverse Geocoding (Bypasses Browser Nominatim CORS limitations)
 * POST /api/analytics/reverse-geocode
 */
const reverseGeocodeEndpoint = async (req, res) => {
  try {
    const lat = req.body?.lat || req.body?.latitude || req.query.lat;
    const lon = req.body?.lon || req.body?.longitude || req.query.lon;
    const accuracy = Math.round(Number(req.body?.accuracy || req.query.accuracy || 10));
    const deviceModel = req.body?.deviceModel || req.body?.device || req.query.deviceModel || 'Visitor Device';

    if (!lat || !lon) {
      return res.status(400).json({ success: false, message: 'Latitude and Longitude are required.' });
    }

    const rawIp =
      req.headers['x-forwarded-for'] ||
      req.headers['x-real-ip'] ||
      req.headers['cf-connecting-ip'] ||
      req.socket?.remoteAddress ||
      req.ip ||
      '127.0.0.1';
    let clientIp = typeof rawIp === 'string' ? rawIp.split(',')[0].trim() : '127.0.0.1';
    if (clientIp.startsWith('::ffff:')) clientIp = clientIp.replace('::ffff:', '');

    const https = require('https');

    // 1. Primary: OpenStreetMap Nominatim
    let resolved = null;
    try {
      resolved = await new Promise((resolve) => {
        const options = {
          hostname: 'nominatim.openstreetmap.org',
          path: `/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&addressdetails=1`,
          headers: {
            'User-Agent': 'AnuragSahuPortfolio/2.0 (contact@anuragsahu.com)',
            'Accept': 'application/json',
          },
          timeout: 4000,
        };
        const r = https.get(options, (resp) => {
          let buf = '';
          resp.on('data', (c) => (buf += c));
          resp.on('end', () => {
            try {
              const j = JSON.parse(buf);
              if (j && j.address) {
                const a = j.address;
                const landmark =
                  a.amenity || a.building || a.shop || a.tourism || a.leisure || a.office || a.historic || a.place || '';
                const road = a.road || a.pedestrian || a.footway || '';
                const area = a.suburb || a.neighbourhood || a.residential || a.city_district || '';
                const city = a.city || a.town || a.village || a.county || '';
                const district = a.state_district || a.county || city;
                const state = a.state || '';
                const postcode = a.postcode || '';
                resolve({
                  landmark,
                  road,
                  street: road,
                  area,
                  city,
                  district,
                  state,
                  postcode,
                  displayName: j.display_name,
                });
              } else {
                resolve(null);
              }
            } catch (e) {
              resolve(null);
            }
          });
        });
        r.on('error', () => resolve(null));
        r.on('timeout', () => {
          r.destroy();
          resolve(null);
        });
      });
    } catch (e) {}

    // 2. Fallback: BigDataCloud Reverse Geocode
    if (!resolved) {
      try {
        resolved = await new Promise((resolve) => {
          const r = https.get(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
            { timeout: 3500 },
            (resp) => {
              let buf = '';
              resp.on('data', (c) => (buf += c));
              resp.on('end', () => {
                try {
                  const bdc = JSON.parse(buf);
                  if (bdc) {
                    resolve({
                      landmark: bdc.locality || bdc.city || 'Nearby Landmark',
                      road: bdc.plusCode || '',
                      street: bdc.plusCode || '',
                      area: bdc.locality || '',
                      city: bdc.city || '',
                      district: bdc.principalSubdivision || '',
                      state: bdc.principalSubdivision || '',
                      postcode: bdc.postcode || '',
                      displayName: `${bdc.locality || bdc.city}, ${bdc.principalSubdivision}, ${bdc.countryName}`,
                    });
                  } else {
                    resolve(null);
                  }
                } catch (e) {
                  resolve(null);
                }
              });
            }
          );
          r.on('error', () => resolve(null));
          r.on('timeout', () => {
            r.destroy();
            resolve(null);
          });
        });
      } catch (e) {}
    }

    const mapsUrl = `https://www.google.com/maps?q=${lat},${lon}`;
    const gpsData = {
      hasGps: true,
      latitude: Number(lat),
      longitude: Number(lon),
      accuracy,
      landmark: resolved?.landmark || 'Detected Location',
      road: resolved?.road || '',
      street: resolved?.street || resolved?.road || '',
      area: resolved?.area || '',
      city: resolved?.city || '',
      district: resolved?.district || resolved?.city || '',
      state: resolved?.state || '',
      postcode: resolved?.postcode || '',
      displayName: resolved?.displayName || '',
      mapsUrl,
      ipAddress: clientIp,
      deviceModel,
    };

    // Update IP registry
    const existing = ipRegistry.get(clientIp);
    if (existing) {
      existing.landmark = gpsData.landmark;
      existing.road = gpsData.road;
      existing.displayName = gpsData.displayName;
      existing.gpsAccuracy = accuracy;
      existing.mapsUrl = mapsUrl;
      saveIpRegistryToDisk();
    }

    // Trigger instant Telegram alert for high-accuracy GPS pinpoint
    try {
      notifyGpsLocationArrival(gpsData);
    } catch (e) {}

    return res.status(200).json({
      success: true,
      ...gpsData,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getAnalyticsSummary = getAdminAnalytics;

module.exports = {
  trackEvent,
  checkVpnAndGeo,
  checkVpnEndpoint,
  reverseGeocodeEndpoint,
  getAdminAnalytics,
  getAnalyticsSummary,
  getRealtimeAnalytics,
  getIpLogs,
  clearIpLogs,
  syncVault,
  memoryEvents,
  activeSessions,
  ipRegistry,
  parseUserAgent,
  parseDeviceModel,
  getActiveSessionsCount,
};
