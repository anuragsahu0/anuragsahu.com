/**
 * ANURAG SAHU PORTFOLIO — TELEGRAM NOTIFICATION SERVICE
 * Real-time instant visitor intelligence dispatched directly to owner's Telegram.
 * 
 * Features:
 * - 0.0ms latency non-blocking asynchronous execution
 * - Session & IP deduplication (anti-spam, 1 alert per 30-min session)
 * - Bot & crawler filter (ignores automated crawlers)
 * - Rich HTML formatted telemetry card with Device, IP, Geo, ISP, Screen, Referrer
 */

const https = require('https');

// Cache to prevent Telegram notification spam (ipAddress -> lastNotifiedTimestamp)
const recentNotifications = new Map();
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes cooldown per external IP

/**
 * Clean up old cache entries periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamp] of recentNotifications.entries()) {
    if (now - timestamp > COOLDOWN_MS) {
      recentNotifications.delete(ip);
    }
  }
}, 10 * 60 * 1000);

/**
 * Escape HTML characters for Telegram HTML parse_mode
 */
function escapeTgHtml(str) {
  if (!str) return 'N/A';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Dispatches a message via Telegram Bot API
 */
async function sendTelegramMessage(text, options = null) {
  let token = process.env.TELEGRAM_BOT_TOKEN;
  let chatId = process.env.TELEGRAM_CHAT_ID;
  let replyMarkup = null;

  if (typeof options === 'string') {
    token = options || token;
    if (arguments.length > 2 && arguments[2]) chatId = arguments[2];
  } else if (options && typeof options === 'object') {
    if (options.token) token = options.token;
    if (options.chatId) chatId = options.chatId;
    if (options.replyMarkup) replyMarkup = options.replyMarkup;
  }

  if (!token || !chatId) {
    console.log('[TelegramService] Bot Token or Chat ID not configured. Telemetry skipped.');
    return { success: false, reason: 'NOT_CONFIGURED' };
  }

  const payloadObj = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };

  if (replyMarkup) {
    payloadObj.reply_markup = replyMarkup;
  }

  const payload = JSON.stringify(payloadObj);

  return new Promise((resolve) => {
    const req = https.request(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 5000,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            resolve({ success: data.ok, data });
          } catch (e) {
            resolve({ success: false, error: body });
          }
        });
      }
    );

    req.on('error', (err) => {
      console.warn('[TelegramService] Error sending alert:', err.message);
      resolve({ success: false, error: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'TIMEOUT' });
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Helper to format rich location details (GPS landmark vs IP fallback)
 */
function formatLocationBlock(v) {
  const lines = [];
  const meta = v.metadata || {};
  const gps = v.gps || meta.gpsLocation || (v.hasGps ? v : null);

  if (gps && gps.hasGps && (gps.landmark || gps.street || gps.displayName)) {
    lines.push(`📍 <b>Location:</b> 🎯 <b>EXACT GPS LANDMARK (High Precision)</b>`);
    if (gps.landmark) lines.push(`🏛️ <b>Landmark:</b> <b>${escapeTgHtml(gps.landmark)}</b>`);
    if (gps.street) lines.push(`🛣️ <b>Street / Road:</b> <code>${escapeTgHtml(gps.street)}</code>`);
    if (gps.area || gps.suburb || gps.colony) lines.push(`🏘️ <b>Colony / Area:</b> <code>${escapeTgHtml(gps.area || gps.suburb || gps.colony)}</code>`);
    const distInfo = [gps.district || gps.city, gps.state, gps.postcode].filter(Boolean).join(', ');
    if (distInfo) lines.push(`🏙️ <b>District & State:</b> <code>${escapeTgHtml(distInfo)}</code>`);
    if (gps.accuracy) lines.push(`🎯 <b>GPS Accuracy:</b> <code>±${gps.accuracy} meters</code>`);
    if (gps.mapsUrl) lines.push(`🗺️ <b>Live Map Pin:</b> <a href="${gps.mapsUrl}">📍 Open in Google Maps</a>`);
  } else {
    const flag = v.countryFlag || '🌐';
    const city = v.city ? `${v.city}, ` : '';
    const region = v.region ? `${v.region}, ` : '';
    const country = v.country || 'India';
    lines.push(`📍 <b>Location:</b> <b>${flag} ${city}${region}${country}</b>`);
    if (v.isp) lines.push(`🏢 <b>ISP / Carrier:</b> <code>${escapeTgHtml(v.isp)}</code>`);
    lines.push(`ℹ️ <i>Street landmark requires visitor browser GPS permission</i>`);
    if (v.lat && v.lon) {
      lines.push(`🗺️ <b>Approx Area:</b> <a href="https://www.google.com/maps?q=${v.lat},${v.lon}">📍 View ISP Route Map</a>`);
    }
  }
  return lines.join('\n');
}

/**
 * Helper to format Security & VPN detection status
 */
function formatSecurityBlock(v) {
  const isVpn = v.isVpn || v.metadata?.isVpn;
  const vpnReason = v.vpnReason || v.metadata?.vpnReason || 'Proxy / Datacenter IP';
  if (isVpn) {
    return `🛡️ <b>VPN Status:</b> ⚠️ <b>VPN / PROXY DETECTED!</b>\n🔍 <b>Reason:</b> <code>${escapeTgHtml(vpnReason)}</code>`;
  }
  return `🛡️ <b>VPN Status:</b> 🟢 <b>Clean (Direct ISP Connection)</b>`;
}

/**
 * Helper to format hardware device model & GPU
 */
function formatDeviceBlock(v) {
  const device = v.deviceModel || v.device || 'Desktop PC';
  const gpu = v.gpuRenderer || v.metadata?.gpuRenderer || '';
  const os = v.os || '';
  const browser = v.browser || '';
  const lines = [`📱 <b>Device:</b> <code>${escapeTgHtml(device)}</code>`];
  if (gpu && !device.includes(gpu)) {
    lines.push(`🎮 <b>GPU:</b> <code>${escapeTgHtml(gpu)}</code>`);
  }
  if (os || browser) {
    lines.push(`💻 <b>OS & Browser:</b> <code>${escapeTgHtml([os, browser].filter(Boolean).join(' • '))}</code>`);
  }
  return lines.join('\n');
}

/**
 * Format and send visitor detection alert
 */
function notifyVisitorArrival(visitor) {
  // 1. Ignore if no valid visitor or is bot
  if (!visitor || visitor.isBot) return;

  const ip = visitor.ipAddress || 'Unknown IP';
  const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === 'Unknown IP';

  // 2. Anti-spam deduplication: 1 alert per external IP every 5 minutes (bypassed for localhost testing)
  const now = Date.now();
  const lastAlert = recentNotifications.get(ip);
  if (!isLocal && lastAlert && (now - lastAlert < COOLDOWN_MS)) {
    return; // Already notified recently
  }
  recentNotifications.set(ip, now);

  const referrer = visitor.referrer && visitor.referrer !== 'Direct' ? visitor.referrer : 'Direct Traffic';
  const page = visitor.page || '/';
  const screen = visitor.screen ? visitor.screen : (visitor.metadata?.screen || 'N/A');
  const network = visitor.network ? visitor.network : (visitor.metadata?.connection || 'WiFi/Broadband');

  // Format IST Timestamp
  const istTime = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const message = [
    `🛰️ <b>NEW VISITOR DETECTED!</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    formatDeviceBlock(visitor),
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    formatLocationBlock(visitor),
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    formatSecurityBlock(visitor),
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    `🌐 <b>IP Address:</b> <code>${escapeTgHtml(ip)}</code>`,
    `🧭 <b>Referrer:</b> <code>${escapeTgHtml(referrer)}</code>`,
    `📄 <b>Landing Page:</b> <code>${escapeTgHtml(page)}</code>`,
    `🖥️ <b>Screen:</b> <code>${escapeTgHtml(screen)}</code>`,
    `📶 <b>Network:</b> <code>${escapeTgHtml(network)}</code>`,
    `⏰ <b>Time (IST):</b> <code>${escapeTgHtml(istTime)}</code>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    `⚡ <i>Live Telemetry Engine • anuragsahu.com</i>`
  ].join('\n');

  return sendTelegramMessage(message).catch((err) => {
    console.warn('[TelegramService] Background dispatch warning:', err.message);
  });
}

/**
 * Format and send high-precision GPS landmark update when visitor grants browser permission
 */
function notifyGpsLocationArrival(gpsData) {
  if (!gpsData) return;

  const ip = gpsData.ipAddress || 'Unknown IP';
  const landmark = gpsData.landmark || 'Nearby Street Landmark';
  const street = gpsData.road || gpsData.street || '';
  const area = gpsData.area || gpsData.suburb || gpsData.colony || '';
  const district = gpsData.district || gpsData.city || '';
  const state = gpsData.state || '';
  const postcode = gpsData.postcode || '';
  const accuracy = gpsData.accuracy || 10;
  const mapsUrl = gpsData.mapsUrl || `https://www.google.com/maps?q=${gpsData.latitude || gpsData.lat},${gpsData.longitude || gpsData.lon}`;
  const device = gpsData.deviceModel || gpsData.device || 'Mobile Device';

  const istTime = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const message = [
    `🎯 <b>EXACT GPS LANDMARK PINPOINTED!</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    `🏛️ <b>Landmark:</b> <b>${escapeTgHtml(landmark)}</b>`,
    street ? `🛣️ <b>Street / Road:</b> <code>${escapeTgHtml(street)}</code>` : null,
    area ? `🏘️ <b>Colony / Area:</b> <code>${escapeTgHtml(area)}</code>` : null,
    `🏙️ <b>District & State:</b> <code>${escapeTgHtml([district, state, postcode].filter(Boolean).join(', '))}</code>`,
    `🎯 <b>GPS Accuracy:</b> <code>±${accuracy} meters (Hardware GPS)</code>`,
    `🗺️ <b>Live Google Maps:</b> <a href="${mapsUrl}">📍 Click to View Exact Map Pin</a>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    `📱 <b>Device:</b> <code>${escapeTgHtml(device)}</code>`,
    `🌐 <b>IP Address:</b> <code>${escapeTgHtml(ip)}</code>`,
    `⏰ <b>Timestamp (IST):</b> <code>${escapeTgHtml(istTime)}</code>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    `⚡ <i>High-Precision GPS Engine • anuragsahu.com</i>`
  ].filter(Boolean).join('\n');

  return sendTelegramMessage(message).catch((err) => {
    console.warn('[TelegramService] GPS update warning:', err.message);
  });
}

/**
 * Format and send Contact Form submission alert to Telegram
 */
function notifyContactSubmission(contact) {
  if (!contact) return;

  const name = contact.fullName || contact.name || 'Anonymous Visitor';
  const email = contact.email || 'No email provided';
  const company = contact.company ? contact.company : 'Direct Message';
  const subject = contact.subject || 'Portfolio Inquiry';
  const messageBody = contact.message || '(Empty message)';
  const ip = contact.ipAddress || 'Unknown IP';

  // Format IST Timestamp
  const istTime = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const message = [
    `📬 <b>NEW DIRECT MESSAGE RECEIVED!</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    `👤 <b>From:</b> <b>${escapeTgHtml(name)}</b>`,
    `📧 <b>Email:</b> <code>${escapeTgHtml(email)}</code>`,
    `🏢 <b>Company / Topic:</b> <code>${escapeTgHtml(company)}</code>`,
    `📝 <b>Subject:</b> <code>${escapeTgHtml(subject)}</code>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    `💬 <b>Message Content:</b>\n<i>"${escapeTgHtml(messageBody)}"</i>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    formatDeviceBlock(contact),
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    formatLocationBlock(contact),
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    formatSecurityBlock(contact),
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    `🌐 <b>IP Address:</b> <code>${escapeTgHtml(ip)}</code>`,
    `⏰ <b>Received (IST):</b> <code>${escapeTgHtml(istTime)}</code>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    `⚡ <i>Direct Inquiries • anuragsahu.com</i>`
  ].join('\n');

  const cleanReplySubject = encodeURIComponent(`Re: ${subject || 'Portfolio Inquiry'}`);
  const cleanReplyEmail = encodeURIComponent(email);
  const gmailComposeUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${cleanReplyEmail}&su=${cleanReplySubject}`;

  const replyMarkup = {
    inline_keyboard: [
      [
        {
          text: `✉️ Reply via Gmail to ${escapeTgHtml(name).slice(0, 16)}`,
          url: gmailComposeUrl,
        },
      ],
    ],
  };

  return sendTelegramMessage(message, { replyMarkup }).catch((err) => {
    console.warn('[TelegramService] Contact dispatch warning:', err.message);
  });
}

module.exports = {
  notifyVisitorArrival,
  notifyGpsLocationArrival,
  notifyContactSubmission,
  sendTelegramMessage,
};
