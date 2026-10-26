/**
 * ANURAG SAHU PORTFOLIO — STANDALONE INTERACTIVE ENGINE
 * Author: Anurag Sahu
 */

const SERVER_HOST = window.location.hostname || 'localhost';
const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? `http://${SERVER_HOST}:5001/api`
  : `/api`;

document.addEventListener('DOMContentLoaded', () => {
  if (typeof THREE === 'undefined') {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(initParticleBackground);
    } else {
      setTimeout(initParticleBackground, 300);
    }
  }
  initCLI();
  initLiveTelemetryTracking();
  initScrollProgress();

  initCategoryFilters();
  initScrollReveal();
  initContactForm();
  initCmsDynamicHydration();
});

/* -------------------------------------------------------------------------- */
/* Real-Time Live Telemetry Tracking Engine                                  */
/* -------------------------------------------------------------------------- */
function initLiveTelemetryTracking() {
  const currentPath = window.location.pathname + (window.location.hash || '');
  sendTelemetry('page_view', { path: currentPath || '/' });
  startVisitorHeartbeat();

  // Track section views on hash changes
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash || '';
    if (hash && hash.length > 1) {
      sendTelemetry('page_view', { path: '/' + hash.replace('#', '') });
    }
  });

  // Track anchor clicks for in-page navigation
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', () => {
      const hash = link.getAttribute('href');
      if (hash && hash.length > 1) {
        sendTelemetry('page_view', { path: '/' + hash.replace('#', '') });
      }
    });
  });

  document.querySelectorAll('button, a').forEach((el) => {
    const text = (el.textContent || '').toLowerCase();
    const href = (el.getAttribute('href') || '').toLowerCase();

    if (text.includes('resume') || href.includes('resume')) {
      el.addEventListener('click', () => sendTelemetry('resume_download', { label: 'Resume PDF Clicked' }));
    } else if (href.includes('github.com')) {
      el.addEventListener('click', () => sendTelemetry('github_click', { url: href }));
    } else if (href.includes('linkedin.com')) {
      el.addEventListener('click', () => sendTelemetry('linkedin_click', { url: href }));
    }
  });
}

let cachedDeviceModel = null;
window.__userGpsLocation = null;

function getGpuRenderer() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return '';
    const raw = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '';
    const match = raw.match(/Renderer:\s*([^,)]+)/i) || raw.match(/\(([^,)]+)\)/);
    return match ? match[1].trim() : raw.replace(/ANGLE\s*\(/i, '').replace(/\)/g, '').trim();
  } catch (e) {
    return '';
  }
}

function detectVisitorDevice() {
  if (cachedDeviceModel && cachedDeviceModel.isComplete) return cachedDeviceModel;
  const ua = navigator.userAgent || '';
  const gpu = getGpuRenderer();
  let model = '';

  const w = window.screen ? window.screen.width : 0;
  const h = window.screen ? window.screen.height : 0;
  const dpr = window.devicePixelRatio || 1;
  const maxD = Math.max(w, h);
  const minD = Math.min(w, h);

  if (/iPhone/i.test(ua)) {
    if (minD === 440 && maxD === 956) model = 'iPhone 16 Pro Max';
    else if (minD === 402 && maxD === 874) model = 'iPhone 16 Pro';
    else if (minD === 430 && maxD === 932) {
      model = gpu.includes('A17') ? 'iPhone 15 Pro Max' : 'iPhone 14 Pro Max / 15 Plus';
    } else if (minD === 393 && maxD === 852) {
      model = gpu.includes('A17') ? 'iPhone 15 Pro' : 'iPhone 15 / 14 Pro';
    } else if (minD === 428 && maxD === 926) {
      model = 'iPhone 14 Plus / 13 Pro Max';
    } else if (minD === 390 && maxD === 844) {
      model = 'iPhone 14 / 13 / 13 Pro / 12 / 12 Pro';
    } else if (minD === 414 && maxD === 896) {
      model = dpr >= 3 ? 'iPhone 11 Pro Max / XS Max' : 'iPhone 11 / XR';
    } else if (minD === 375 && maxD === 812) {
      model = 'iPhone 11 Pro / XS / X / 13 mini';
    } else if (minD === 375 && maxD === 667) {
      model = 'iPhone SE (3rd/2nd Gen) / 8';
    } else {
      model = 'Apple iPhone';
    }

    const iosMatch = ua.match(/OS (\d+[_.]\d+)/);
    const iosVer = iosMatch ? 'iOS ' + iosMatch[1].replace(/_/g, '.') : 'iOS';
    model = `${model} [${iosVer}${gpu ? `, ${gpu}` : ''}]`;
  } else if (/iPad/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    model = `Apple iPad [iPadOS${gpu ? `, ${gpu}` : ''}]`;
  } else if (/Android/i.test(ua)) {
    const androidMatch = ua.match(/Android\s+([0-9.]+)?;\s*([^;)]+)/i);
    let rawModel = '';
    let androidVer = '';
    if (androidMatch) {
      androidVer = androidMatch[1] ? `Android ${androidMatch[1]}` : 'Android';
      rawModel = androidMatch[2] ? androidMatch[2].split('Build')[0].trim() : '';
    }

    let friendlyName = rawModel;
    if (/SM-S928/i.test(rawModel)) friendlyName = 'Samsung Galaxy S24 Ultra';
    else if (/SM-S926/i.test(rawModel)) friendlyName = 'Samsung Galaxy S24+';
    else if (/SM-S921/i.test(rawModel)) friendlyName = 'Samsung Galaxy S24';
    else if (/SM-S918/i.test(rawModel)) friendlyName = 'Samsung Galaxy S23 Ultra';
    else if (/SM-S916/i.test(rawModel)) friendlyName = 'Samsung Galaxy S23+';
    else if (/SM-S911/i.test(rawModel)) friendlyName = 'Samsung Galaxy S23';
    else if (/SM-S908/i.test(rawModel)) friendlyName = 'Samsung Galaxy S22 Ultra';
    else if (/SM-G998/i.test(rawModel)) friendlyName = 'Samsung Galaxy S21 Ultra';
    else if (/SM-A[0-9]{3}/i.test(rawModel)) friendlyName = `Samsung Galaxy ${rawModel}`;
    else if (/Pixel 9 Pro/i.test(rawModel)) friendlyName = 'Google Pixel 9 Pro';
    else if (/Pixel 9/i.test(rawModel)) friendlyName = 'Google Pixel 9';
    else if (/Pixel 8 Pro/i.test(rawModel)) friendlyName = 'Google Pixel 8 Pro';
    else if (/Pixel 8/i.test(rawModel)) friendlyName = 'Google Pixel 8';
    else if (/Pixel 7/i.test(rawModel)) friendlyName = 'Google Pixel 7';
    else if (/CPH2[0-9]{3}/i.test(rawModel)) friendlyName = `OnePlus / Oppo (${rawModel})`;
    else if (/2[234][0-9]{2}P[A-Z0-9]+/i.test(rawModel)) friendlyName = `Xiaomi / POCO (${rawModel})`;

    model = `${friendlyName || 'Android Mobile'} [${androidVer}${gpu ? `, ${gpu}` : ''}]`;
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    const macMatch = ua.match(/Mac OS X (\d+[._]\d+)/);
    const macVer = macMatch ? 'macOS ' + macMatch[1].replace(/_/g, '.') : 'macOS';
    const chip = gpu ? (gpu.startsWith('Apple') ? gpu : `Apple ${gpu}`) : 'Apple Silicon';
    
    // Distinguish MacBook Air vs MacBook Pro vs iMac vs Mac Studio based on screen resolution and aspect ratio
    let macType = 'Apple Mac';
    if ((minD >= 800 && minD <= 960 && maxD >= 1200 && maxD <= 1500) || (minD === 832 && maxD === 1280) || (minD === 956 && maxD === 1470) || (minD === 900 && maxD === 1440)) {
      macType = 'Apple MacBook Air';
    } else if ((minD >= 960 && minD <= 1120 && maxD >= 1500 && maxD <= 1750) || (minD === 982 && maxD === 1512) || (minD === 1117 && maxD === 1728) || (minD === 1050 && maxD === 1680)) {
      macType = 'Apple MacBook Pro';
    } else if (minD >= 1150 && maxD >= 1920) {
      macType = 'Apple iMac / Mac Display';
    } else {
      macType = 'Apple MacBook';
    }
    
    const ram = navigator.deviceMemory ? `${navigator.deviceMemory}GB RAM` : '';
    const details = [chip, ram, macVer].filter(Boolean).join(' • ');
    model = `${macType} [${details}]`;
  } else if (/Windows/i.test(ua)) {
    let winVer = 'Windows 11 / 10 PC';
    if (/Windows NT 6.3/i.test(ua)) winVer = 'Windows 8.1 PC';
    else if (/Windows NT 6.1/i.test(ua)) winVer = 'Windows 7 PC';
    const cores = navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} Cores` : '';
    const ram = navigator.deviceMemory ? `${navigator.deviceMemory}GB RAM` : '';
    const hwDetails = [cores, ram, gpu].filter(Boolean).join(' • ');
    model = `${winVer}${hwDetails ? ` [${hwDetails}]` : ''}`;
  } else if (/Linux/i.test(ua)) {
    model = /Ubuntu/i.test(ua) ? `Ubuntu Linux PC [${gpu || 'Standard'}]` : `Linux PC [${gpu || 'Standard'}]`;
  } else {
    model = `Desktop PC [${gpu || 'Standard'}]`;
  }

  let browser = 'Chrome';
  if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
  else if (/Firefox/i.test(ua)) browser = 'Firefox';
  else if (/Edg/i.test(ua)) browser = 'Edge';

  cachedDeviceModel = {
    deviceModel: model,
    browser,
    gpuRenderer: gpu,
    label: `${model} • ${browser}`,
    isComplete: false,
  };

  // High Entropy Client Hints (for Chromium Android/Desktop)
  if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
    navigator.userAgentData.getHighEntropyValues(['model', 'platform', 'platformVersion']).then((hints) => {
      if (hints && hints.model) {
        let clean = hints.model;
        if (/SM-S928/i.test(clean)) clean = 'Samsung Galaxy S24 Ultra';
        else if (/SM-S918/i.test(clean)) clean = 'Samsung Galaxy S23 Ultra';
        else if (/Pixel 8 Pro/i.test(clean)) clean = 'Google Pixel 8 Pro';
        else if (/Pixel 8/i.test(clean)) clean = 'Google Pixel 8';
        cachedDeviceModel = {
          deviceModel: `${clean} [${gpu || 'GPU'}]`,
          browser,
          gpuRenderer: gpu,
          label: `${clean} • ${browser}`,
          isComplete: true,
        };
      }
    }).catch(() => {});
  }

  return cachedDeviceModel;
}

function initAccurateGeolocation() {
  // Silent / Non-intrusive: GPS permission prompt disabled to protect recruiter UX.
  // Geo-location is resolved unobtrusively via server-side IP lookup.
}

async function checkVpnStatus() {
  // Passive check: never block or show alert modals to recruiters / enterprise VPN users
}

function showVpnWarningModal(data = {}) {
  // Disabled: never block visitors or corporate recruiters
}

function dismissVpnModal() {
  const modal = document.getElementById('vpn-warning-modal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.add('hidden');
  }
}
window.showVpnWarningModal = showVpnWarningModal;
window.dismissVpnModal = dismissVpnModal;

function getClientGeoHint() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    let countryCode = 'IN';
    let country = 'India';
    if (tz.includes('Calcutta') || tz.includes('Kolkata') || tz.includes('Asia/Colombo')) {
      countryCode = 'IN'; country = 'India';
    } else if (tz.includes('New_York') || tz.includes('Los_Angeles') || tz.includes('Chicago')) {
      countryCode = 'US'; country = 'United States';
    } else if (tz.includes('London')) {
      countryCode = 'GB'; country = 'United Kingdom';
    }
    return { countryCode, country, timeZone: tz };
  } catch (e) {
    return { countryCode: 'IN', country: 'India' };
  }
}

function startVisitorHeartbeat() {
  let sessId = sessionStorage.getItem('as_visitor_sess');
  if (!sessId) {
    sessId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    sessionStorage.setItem('as_visitor_sess', sessId);
  }

  const devInfo = detectVisitorDevice();
  const geo = getClientGeoHint();

  async function ping() {
    try {
      const res = await fetch('/api/analytics/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'heartbeat',
          path: window.location.pathname + (window.location.hash || ''),
          metadata: {
            device: devInfo.label,
            deviceModel: devInfo.deviceModel,
            browser: devInfo.browser,
            gpuRenderer: devInfo.gpuRenderer || '',
            sessId,
            ...geo,
          }
        })
      });
      if (res.ok) {
        const json = await res.json();
        if (json && json.activeUsersCount) {
          try {
            const bc = new BroadcastChannel('anurag_portfolio_realtime');
            bc.postMessage({ type: 'telemetry_updated', activeUsers: json.activeUsersCount });
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  ping();
  setInterval(ping, 25000);
}

function sendTelemetry(type, metadata = {}) {
  try {
    const path = metadata.path || window.location.pathname + (window.location.hash || '');
    const geo = getClientGeoHint();
    const devInfo = detectVisitorDevice();

    const dpr = window.devicePixelRatio || 1;
    const screenInfo = `${window.screen.width}×${window.screen.height}${dpr > 1 ? ` @${dpr}x` : ''}`;
    const conn = navigator.connection ? `${navigator.connection.effectiveType || ''}`.toUpperCase().trim() : '';

    fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        path: path || '/',
        metadata: {
          ...metadata,
          ...geo,
          device: devInfo.label,
          deviceModel: devInfo.deviceModel,
          browser: devInfo.browser,
          gpuRenderer: devInfo.gpuRenderer || '',
          screen: screenInfo,
          connection: conn || 'WiFi / Mobile',
          referrer: document.referrer || '',
          gpsLocation: window.__userGpsLocation || null,
          hasGps: Boolean(window.__userGpsLocation?.hasGps),
        }
      })
    }).then(async (res) => {
      if (res.ok) {
        try {
          const bc = new BroadcastChannel('anurag_portfolio_realtime');
          bc.postMessage({ type: 'telemetry_event', eventType: type, path: path || '/' });
        } catch (e) {}
      }
    }).catch(() => {});
  } catch (e) {}
}

/* -------------------------------------------------------------------------- */
/* 1. Ambient Background Particle Network (Zero Cursor Tracking)              */
/* -------------------------------------------------------------------------- */
function initParticleBackground() {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return; // Three.js is using WebGL context on bg-canvas

  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  const particles = [];
  const particleCount = Math.min(Math.floor(width / 20), 45);

  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -(Math.random() * 0.35 + 0.1),
      radius: Math.random() * 1.5 + 1,
      color: Math.random() > 0.5 ? 'rgba(6, 182, 212, ' : 'rgba(139, 92, 246, ',
      alpha: Math.random() * 0.4 + 0.15,
    });
  }

  function animate() {
    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0) p.x = width;
      if (p.x > width) p.x = 0;
      if (p.y < 0) p.y = height;
      if (p.y > height) p.y = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = p.color + p.alpha + ')';
      ctx.fill();

      for (let j = i + 1; j < particles.length; j++) {
        const p2 = particles[j];
        const dx = p.x - p2.x;
        const dy = p.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 100) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = `rgba(6, 182, 212, ${0.1 * (1 - dist / 100)})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }

    requestAnimationFrame(animate);
  }

  animate();

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });
}

/* -------------------------------------------------------------------------- */
/* 2. Command Line CLI Terminal Overlay Modal                                 */
/* -------------------------------------------------------------------------- */
function initCLI() {
  const btn = document.getElementById('btn-terminal-trigger');
  const modal = document.getElementById('terminal-modal');
  const closeBtn = document.querySelector('.term-close');
  const input = document.getElementById('terminal-input');
  const body = document.getElementById('terminal-body');

  if (!btn || !modal || !input || !body) return;

  function toggleModal(show) {
    if (show) {
      modal.classList.add('active');
      input.focus();
    } else {
      modal.classList.remove('active');
    }
  }

  btn.addEventListener('click', () => toggleModal(true));
  if (closeBtn) closeBtn.addEventListener('click', () => toggleModal(false));

  modal.addEventListener('click', (e) => {
    if (e.target === modal) toggleModal(false);
  });

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const isCurrentlyOpen = modal.classList.contains('active') || modal.classList.contains('open');
      toggleModal(!isCurrentlyOpen);
    }
    if (e.key === 'Escape') {
      toggleModal(false);
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const val = input.value.trim().toLowerCase();
      if (!val) return;

      appendLog(`anurag@dev:~$ ${val}`, '#06b6d4');

      if (val === 'help') {
        appendLog('Available commands: resume, contact, skills, projects, clear', '#9ca3af');
      } else if (val === 'resume') {
        appendLog('Downloading ATS Resume PDF...', '#10b981');
        sendTelemetry('resume_download', { from: 'cli' });
        window.open('assets/resume.pdf', '_blank');
      } else if (val === 'contact') {
        appendLog('Email: shivasahu0612@gmail.com', '#06b6d4');
        copyEmail();
      } else if (val === 'skills') {
        appendLog('STACK: React 18, Node.js, Express, Python, PyTorch, MongoDB, PostgreSQL, C++', '#9ca3af');
      } else if (val === 'projects') {
        appendLog('1. AI Finance Controller (Completed) | 2. Restaurant Management System (Coming Soon) | 3. Smart College ERP (Coming Soon)', '#9ca3af');
      } else if (val === 'clear') {
        body.innerHTML = '';
      } else {
        appendLog(`Command not found: '${val}'. Type 'help' for options.`, '#ef4444');
      }

      input.value = '';
      body.scrollTop = body.scrollHeight;
    }
  });

  function appendLog(text, color) {
    const div = document.createElement('div');
    div.className = 'terminal-line';
    div.style.color = color || '#f9fafb';
    div.textContent = text;
    body.appendChild(div);
  }
}

/* -------------------------------------------------------------------------- */
/* 3. Global Toast Notification                                              */
/* -------------------------------------------------------------------------- */
function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(window.__toastTimeout);
  window.__toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

function fallbackCopyText(text) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  textArea.style.top = '0';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    document.execCommand('copy');
  } catch (err) {}
  document.body.removeChild(textArea);
}

function copyEmail(e) {
  const email = 'shivasahu0612@gmail.com';
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(email).catch(() => {
      fallbackCopyText(email);
    });
  } else {
    fallbackCopyText(email);
  }
  showToast('✓ EMAIL COPIED: ' + email);
  try {
    sendTelemetry('email_copied', { email });
  } catch (err) {}
}

window.copyEmail = copyEmail;
window.showToast = showToast;


async function syncProjectStatuses() {
  localStorage.setItem('ag_proj_status_01', 'Completed');
  localStorage.setItem('ag_proj_status_02', 'Coming Soon');

  // 1. Apply local storage immediately (High Priority - Rate-limit proof)
  ['01', '02', '03'].forEach(num => {
    const status = num === '01' ? 'Completed' : (num === '02' ? 'Coming Soon' : (localStorage.getItem(`ag_proj_status_${num}`) || 'Coming Soon'));
    if (status) {
      applyBadgeUI(num, status);
    }
  });

  // 2. Fetch from backend API /api/settings first (Same Origin - No 429 Rate Limit!)
  try {
    const res = await fetch('/api/settings');
    if (res.ok) {
      const data = await res.json();
      if (data && data.settings) {
        ['01', '02', '03'].forEach(num => {
          if (num === '01') {
            localStorage.setItem('ag_proj_status_01', 'Completed');
            applyBadgeUI('01', 'Completed');
            return;
          }
          if (num === '02') {
            localStorage.setItem('ag_proj_status_02', 'Coming Soon');
            applyBadgeUI('02', 'Coming Soon');
            return;
          }
          const val = data.settings[`ag_proj_status_${num}`];
          if (val === 'Completed' || val === 'Coming Soon') {
            localStorage.setItem(`ag_proj_status_${num}`, val);
            applyBadgeUI(num, val);
          }
        });
        return; // Success! No need to hit rate-limited third party APIs
      }
    }
  } catch (e) {}
}

function applyBadgeUI(num, status) {
  const badge = document.getElementById(`main-project-status-${num}`);
  const actualStatus = num === '01' ? 'Completed' : status;
  if (badge && actualStatus) {
    if (actualStatus === 'Completed') {
      badge.textContent = '🟢 Status: Completed';
      badge.style.color = '#10b981';
      badge.style.background = 'rgba(16,185,129,0.1)';
      badge.style.border = '1px solid rgba(16,185,129,0.3)';
    } else {
      badge.textContent = '🟡 Status: Coming Soon';
      badge.style.color = '#f59e0b';
      badge.style.background = 'rgba(245,158,11,0.1)';
      badge.style.border = '1px solid rgba(245,158,11,0.3)';
    }
  }
}

window.addEventListener('storage', (e) => {
  if (e.key && e.key.startsWith('ag_proj_status_')) {
    syncProjectStatuses();
  }
});

function initRedTypewriter() {
  // Disabled per user request (static Dream | Grow | Lead text)
}

function initSkillsFlipCards() {
  const cards = document.querySelectorAll('#skills .flip-card');
  cards.forEach((card) => {
    const inner = card.querySelector('.flip-card-inner');
    if (!inner) return;

    // Keyboard accessibility: Enter or Space toggles 3D flip
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        inner.classList.toggle('flipped');
        card.setAttribute('aria-expanded', inner.classList.contains('flipped') ? 'true' : 'false');
      }
    });
  });
}

function bootApp() {
  if (typeof initParticleBackground === 'function') initParticleBackground();
  initCLI();
  initLiveTelemetryTracking();
  syncProjectStatuses();
  setInterval(syncProjectStatuses, 1000);
  initScrollProgress();
  initSkillsFlipCards();

  initCategoryFilters();
  initScrollReveal();
  initContactForm();
  initNavScrollSpy();
}

/* -------------------------------------------------------------------------- */
/* Reel Custom Cursor Follower Engine                                         */
/* -------------------------------------------------------------------------- */
function initReelCustomCursor() {
  // Mouse tracer effect disabled per user request
  const dot = document.getElementById('custom-cursor');
  const follower = document.getElementById('custom-cursor-follower');
  if (dot) dot.remove();
  if (follower) follower.remove();
}

/* -------------------------------------------------------------------------- */
/* Active Navigation HUD Scroll Spy Engine                                    */
/* -------------------------------------------------------------------------- */
function initNavScrollSpy() {
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('#hud-header .hud-nav a');
  if (!sections.length || !navLinks.length) return;

  window.addEventListener('scroll', () => {
    let currentId = '';
    const scrollPos = window.scrollY + 200;

    sections.forEach((sec) => {
      const top = sec.offsetTop;
      const height = sec.offsetHeight;
      if (scrollPos >= top && scrollPos < top + height) {
        currentId = sec.getAttribute('id');
      }
    });

    if (currentId) {
      navLinks.forEach((link) => {
        const href = link.getAttribute('href');
        if (href === `#${currentId}`) {
          link.classList.add('active');
        } else {
          link.classList.remove('active');
        }
      });
    }
  }, { passive: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootApp);
} else {
  bootApp();
}

/* -------------------------------------------------------------------------- */
/* 5. Scroll Reading Progress Bar Engine                                     */
/* -------------------------------------------------------------------------- */
function initScrollProgress() {
  const progressBar = document.getElementById('scroll-progress');
  if (!progressBar) return;

  window.addEventListener('scroll', () => {
    const windowHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    if (windowHeight <= 0) return;
    const scrolledPercent = (window.scrollY / windowHeight) * 100;
    progressBar.style.width = `${Math.min(100, Math.max(0, scrolledPercent))}%`;
  });
}

/* -------------------------------------------------------------------------- */
/* 6. GPU-Accelerated 3D Tilt Card Interaction Handler                       */
/* -------------------------------------------------------------------------- */
function init3DTiltCards() {
  // 3D corner tilt effect disabled per user request
}

/* -------------------------------------------------------------------------- */
/* 7. Interactive Project Category Filtering Engine                           */
/* -------------------------------------------------------------------------- */
function initCategoryFilters() {
  const filterBtns = document.querySelectorAll('.filter-btn');
  const projectCards = document.querySelectorAll('#roadmap .glass-panel');

  if (!filterBtns.length) return;

  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      const filterValue = btn.getAttribute('data-filter');

      projectCards.forEach((card) => {
        const text = (card.textContent || '').toLowerCase();
        if (filterValue === 'all') {
          card.style.display = 'block';
          card.style.opacity = '1';
        } else if (filterValue === 'enterprise' && (text.includes('enterprise') || text.includes('restaurant') || text.includes('saas') || text.includes('backend') || text.includes('02'))) {
          card.style.display = 'block';
          card.style.opacity = '1';
        } else {
          card.style.display = 'none';
        }
      });
    });
  });
}

/* -------------------------------------------------------------------------- */
/* 8. Intersection Observer Scroll Reveal Engine                              */
/* -------------------------------------------------------------------------- */
function initScrollReveal() {
  const revealElements = document.querySelectorAll('section, .glass-panel, .section-header');

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('reveal-on-scroll', 'is-visible');
        }
      });
    },
    { threshold: 0.1 }
  );

  revealElements.forEach((el) => {
    el.classList.add('reveal-on-scroll');
    observer.observe(el);
  });
}

/* -------------------------------------------------------------------------- */
/* 9. Direct Recruiter Contact Form Submission Engine                         */
/* -------------------------------------------------------------------------- */
function initContactForm() {
  const contactForm = document.getElementById('contact-form');
  if (!contactForm) return;

  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nameInput = document.getElementById('contact-fullname');
    const emailInput = document.getElementById('contact-email');
    const msgInput = document.getElementById('contact-msg');
    const submitBtn = document.getElementById('contact-submit-btn');

    if (!nameInput || !emailInput || !msgInput) return;

    const fullName = nameInput.value.trim();
    const email = emailInput.value.trim();
    const message = msgInput.value.trim();

    if (!fullName || !email || !message) {
      showToast('Please fill out all required fields');
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>Sending Message...</span>';
    }

    // 1. Store locally (both legacy & modern keys)
    const newMsg = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      fullName,
      email,
      company: 'Direct Inquiry',
      subject: `📩 Portfolio Inquiry from ${fullName}`,
      message,
      status: 'unread',
      createdAt: new Date().toISOString()
    };
    try {
      const existingMsgs = JSON.parse(localStorage.getItem('ag_admin_messages') || localStorage.getItem('anuragsahu_contact_messages') || '[]');
      existingMsgs.unshift(newMsg);
      localStorage.setItem('ag_admin_messages', JSON.stringify(existingMsgs));
      localStorage.setItem('anuragsahu_contact_messages', JSON.stringify(existingMsgs));
    } catch (e) {}

    // 2. Direct Cloud Email Delivery (FormSubmit relay directly to shivasahu0612@gmail.com)
    let emailRelaySent = false;
    try {
      const fd = new FormData();
      fd.append('name', fullName);
      fd.append('email', email);
      fd.append('subject', `📩 NEW DIRECT MESSAGE from ${fullName}`);
      fd.append('message', `You received a new inquiry on your portfolio website!\n\nSENDER NAME: ${fullName}\nSENDER EMAIL: ${email}\n\nMESSAGE CONTENT:\n"${message}"\n\nTimestamp: ${new Date().toLocaleString()}`);
      fd.append('_replyto', email);
      fd.append('_autoresponse', `Dear ${fullName},\n\nThank you for contacting us!\n\nYour message has been successfully received by Team Anurag Sahu.\n\nTeam Anurag Sahu will contact you within 24-48 hours at ${email}.\n\nBest regards,\nTeam Anurag Sahu\nhttps://anuragsahu.com`);
      fd.append('_template', 'table');
      fd.append('_captcha', 'false');

      fetch('https://formsubmit.co/ajax/shivasahu0612@gmail.com', {
        method: 'POST',
        body: fd
      }).then(r => { if (r.ok) emailRelaySent = true; }).catch(() => {});
    } catch (e) {}

    // 3. Real-Time Backend API Delivery
    try {
      const devInfo = typeof detectVisitorDevice === 'function' ? detectVisitorDevice() : {};
      const geo = typeof getClientGeoHint === 'function' ? getClientGeoHint() : {};
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          name: fullName,
          email,
          company: 'Direct Inquiry',
          subject: `📩 Portfolio Inquiry from ${fullName}`,
          message,
          metadata: {
            ...geo,
            device: devInfo.label || 'Desktop PC',
            deviceModel: devInfo.deviceModel || 'Desktop PC',
            browser: devInfo.browser || '',
            gpuRenderer: devInfo.gpuRenderer || '',
            gpsLocation: window.__userGpsLocation || null,
            hasGps: Boolean(window.__userGpsLocation?.hasGps),
          }
        }),
      });

      const json = await res.json().catch(() => null);

      if (res.ok || emailRelaySent) {
        sendTelemetry('contact_submission', { sender: fullName, email });
        showToast('✓ Message Received! Dispatched to Anurag Sahu.');
        showSuccessModal(fullName, email);
        contactForm.reset();
      } else {
        const errorMsg =
          json?.error?.message || json?.message || (res.status === 429 ? 'Too many submissions. Please wait a moment.' : 'Could not deliver message. Please try again.');
        showToast(errorMsg);
      }
    } catch (err) {
      if (emailRelaySent) {
        showToast('✓ Message Received! Dispatched to Anurag Sahu.');
        showSuccessModal(fullName, email);
        contactForm.reset();
      } else {
        showToast('Network error. Please check your connection and try again.');
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>Send Message</span><i data-lucide="send" style="width: 16px;"></i>';
        if (window.lucide) window.lucide.createIcons();
      }
    }
  });
}

function showSuccessModal(name, email) {
  const modal = document.getElementById('contact-success-modal');
  const card = document.getElementById('contact-success-modal-card');
  const msg = document.getElementById('contact-success-modal-msg');
  if (msg) {
    msg.innerHTML = `<div style="text-align: center; space-y: 6px;">
      <span style="display:inline-block; padding: 4px 12px; border-radius: 999px; background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.4); color: #10b981; font-size: 11px; font-weight: bold; margin-bottom: 8px;">
        ✓ Message Dispatched to shivasahu0612@gmail.com
      </span>
      <div style="font-size: 13px; color: #ffffff; font-weight: 700;">
        Thank you <strong style="color:#06b6d4;">${name}</strong>!
      </div>
      <div style="font-size: 12px; color: #cbd5e1; margin-top: 8px; line-height: 1.6;">
        Your message has been delivered directly to <strong>Anurag Sahu</strong>.
        <br/><br/>
        An auto-confirmation email has been sent to <strong style="color:#ffffff;">${email}</strong>:
        <br/>
        <em style="color:#10b981; font-style: normal; font-weight: bold; display: inline-block; margin-top: 4px;">"Thank you for contacting us! Team Anurag Sahu will contact you in 24-48 hours."</em>
      </div>
    </div>`;
  }
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.remove('hidden');
    if (card) {
      card.style.transform = 'scale(0.85)';
      card.style.opacity = '0';
      card.style.transition = 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
      setTimeout(() => {
        card.style.transform = 'scale(1)';
        card.style.opacity = '1';
      }, 10);
    }
  }
}

window.closeSuccessModal = function() {
  const modal = document.getElementById('contact-success-modal');
  const card = document.getElementById('contact-success-modal-card');
  const contactForm = document.getElementById('contact-form') || document.getElementById('m-contact-form');
  
  if (card) {
    card.style.transform = 'scale(0.85)';
    card.style.opacity = '0';
  }
  setTimeout(() => {
    if (modal) {
      modal.style.display = 'none';
      modal.classList.add('hidden');
    }
    if (contactForm) contactForm.reset();
  }, 150);
};

window.openGtaModal = function() {
  const modal = document.getElementById('gta-re-modal');
  const card = document.getElementById('gta-re-modal-card');
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    if (card) {
      card.style.transform = 'scale(0.95)';
      card.style.opacity = '0';
      setTimeout(() => {
        card.style.transform = 'scale(1)';
        card.style.opacity = '1';
      }, 10);
    }
  }
};

window.closeGtaModal = function() {
  const modal = document.getElementById('gta-re-modal');
  const card = document.getElementById('gta-re-modal-card');
  if (card) {
    card.style.transform = 'scale(0.95)';
    card.style.opacity = '0';
  }
  setTimeout(() => {
    if (modal) {
      modal.style.display = 'none';
      modal.classList.add('hidden');
    }
    document.body.style.overflow = '';
  }, 150);
};

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (typeof window.closeGtaModal === 'function') window.closeGtaModal();
  }
});

/* -------------------------------------------------------------------------- */
/* Phase 8 — Live CMS & Website Integration Engine                            */
/* Admin → Database → Public Read API (/api/public/site) → Public DOM        */
/* -------------------------------------------------------------------------- */

const CMS_SITE_CACHE_KEY = 'as_public_site_cache';

async function initCmsDynamicHydration() {
  await initCmsIntegration();
}

async function initCmsIntegration() {
  function setMetaTag(attribute, key, content) {
    if (!content) return;
    let el = document.querySelector(`meta[${attribute}="${key}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attribute, key);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  }

  function setLinkTag(rel, href, type) {
    if (!href) return;
    let el = document.querySelector(`link[rel="${rel}"]`);
    if (!el) {
      el = document.createElement('link');
      el.setAttribute('rel', rel);
      document.head.appendChild(el);
    }
    el.setAttribute('href', href);
    if (type) el.setAttribute('type', type);
  }

  function applyCmsData(site) {
    if (!site) return;

    // ─── 1. SEO & Metadata Rehydration ──────────────────────────────────────
    if (site.seo) {
      const seo = site.seo;
      if (seo.title) {
        document.title = seo.title;
        setMetaTag('name', 'title', seo.title);
      }
      if (seo.description) setMetaTag('name', 'description', seo.description);
      if (seo.canonicalUrl) setLinkTag('canonical', seo.canonicalUrl);
      if (seo.keywords) setMetaTag('name', 'keywords', seo.keywords);
      if (seo.author) setMetaTag('name', 'author', seo.author);
      if (seo.robotsDirective) setMetaTag('name', 'robots', seo.robotsDirective);

      if (seo.openGraph) {
        if (seo.openGraph.title) setMetaTag('property', 'og:title', seo.openGraph.title);
        if (seo.openGraph.description) setMetaTag('property', 'og:description', seo.openGraph.description);
        if (seo.openGraph.image) setMetaTag('property', 'og:image', seo.openGraph.image);
        if (seo.openGraph.url) setMetaTag('property', 'og:url', seo.openGraph.url);
      }

      if (seo.twitter) {
        if (seo.twitter.card) setMetaTag('name', 'twitter:card', seo.twitter.card);
        if (seo.twitter.title) setMetaTag('name', 'twitter:title', seo.twitter.title);
        if (seo.twitter.description) setMetaTag('name', 'twitter:description', seo.twitter.description);
        if (seo.twitter.image) setMetaTag('name', 'twitter:image', seo.twitter.image);
      }

      if (seo.faviconUrl) {
        const ext = seo.faviconUrl.split('.').pop().toLowerCase();
        const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'png' ? 'image/png' : 'image/webp';
        setLinkTag('icon', seo.faviconUrl, mime);
      }
      if (seo.appleTouchIconUrl) {
        setLinkTag('apple-touch-icon', seo.appleTouchIconUrl);
      }
    }

    // ─── 2. Active Resume Rehydration ───────────────────────────────────────
    if (site.resume && site.resume.url) {
      const resumeUrl = site.resume.url;
      document.querySelectorAll('a').forEach((link) => {
        const href = (link.getAttribute('href') || '').toLowerCase();
        const text = (link.textContent || '').toLowerCase();
        if (
          href.includes('resume') ||
          text.includes('resume') ||
          link.id === 'hero-resume-btn' ||
          link.id === 'footer-resume-btn'
        ) {
          link.setAttribute('href', resumeUrl);
          link.setAttribute('target', '_blank');
          link.setAttribute('rel', 'noopener noreferrer');
        }
      });
    }

    // ─── 3. Global Settings & Maintenance ───────────────────────────────────
    if (site.settings) {
      const settings = site.settings;

      if (settings.maintenanceMode && !window.location.pathname.startsWith('/admin')) {
        if (!document.getElementById('maintenance-banner')) {
          const banner = document.createElement('div');
          banner.id = 'maintenance-banner';
          banner.style.cssText =
            'position:fixed;top:0;left:0;right:0;z-index:99999;background:#b45309;color:#fff;text-align:center;padding:10px 16px;font-size:12px;font-family:monospace;font-weight:600;box-shadow:0 2px 10px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;gap:8px;';
          banner.innerHTML = `<span>⚠️ ${settings.maintenanceMessage || 'System undergoing scheduled optimization.'}</span>`;
          document.body.prepend(banner);
        }
      } else {
        const banner = document.getElementById('maintenance-banner');
        if (banner) banner.remove();
      }

      if (settings.contactFormEnabled === false) {
        const submitBtn = document.querySelector('#contact-form button[type="submit"]');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Submissions Temporarily Paused';
          submitBtn.style.opacity = '0.6';
          submitBtn.style.cursor = 'not-allowed';
        }
      }

      if (settings.resumeButtonEnabled === false) {
        document.querySelectorAll('a').forEach((link) => {
          const text = (link.textContent || '').toLowerCase();
          if (text.includes('resume')) {
            link.style.display = 'none';
          }
        });
      }

      if (settings.footerText) {
        const footerSpan = document.querySelector('footer .footer-content span');
        if (footerSpan) footerSpan.textContent = settings.footerText;
      }
    }

    // ─── 4. Hero Section Rehydration ────────────────────────────────────────
    if (site.hero) {
      const hero = site.hero;
      if (hero.mainHeading) {
        const heroTitle = document.querySelector('.hero-title');
        if (heroTitle) {
          heroTitle.textContent = hero.mainHeading + (hero.highlightedText ? ` ${hero.highlightedText}` : '');
        }
      }

      if (hero.description || hero.subtitle) {
        const heroSubtitle = document.querySelector('.hero-subtitle');
        if (heroSubtitle) {
          heroSubtitle.innerHTML = hero.description || hero.subtitle;
        }
      }

      if (hero.supportingText) {
        const tagline = document.querySelector('.hero-tagline');
        if (tagline) {
          const spans = tagline.querySelectorAll('span');
          if (spans.length >= 3) {
            spans[2].textContent = hero.supportingText;
          }
        }
      }

      // Header pill is locked to 'Dream | Grow | Lead' per user instruction
      const typewriter = document.getElementById('red-typewriter-text');
      if (typewriter) typewriter.textContent = 'Dream | Grow | Lead';

      const primaryCta = document.querySelector('.hero-actions a.btn-primary');
      if (primaryCta) {
        if (hero.primaryCtaLabel) {
          const span = primaryCta.querySelector('span');
          if (span) span.textContent = hero.primaryCtaLabel;
        }
        if (hero.primaryCtaUrl) primaryCta.setAttribute('href', hero.primaryCtaUrl);
      }

      if (hero.profileImage) {
        const portraitImg = document.querySelector('.portrait-inner-frame img');
        if (portraitImg && hero.profileImage !== '/assets/anurag-portrait-sm.webp') {
          portraitImg.src = hero.profileImage;
        }
      }
    }

    // ─── 5. Profile & Contact Rehydration ───────────────────────────────────
    if (site.profile) {
      const profile = site.profile;
      if (profile.email) {
        document.querySelectorAll('a[href^="mailto:"]').forEach((a) => {
          a.setAttribute('href', `mailto:${profile.email}`);
          if (a.textContent.includes('@')) a.textContent = profile.email;
        });
      }
      if (profile.github) {
        document.querySelectorAll('a[href*="github.com"]').forEach((a) => {
          a.setAttribute('href', profile.github);
        });
      }
      if (profile.linkedin) {
        document.querySelectorAll('a[href*="linkedin.com"]').forEach((a) => {
          a.setAttribute('href', profile.linkedin);
        });
      }
    }

    // ─── 6. About Section Rehydration ───────────────────────────────────────
    if (site.about) {
      const about = site.about;
      if (about.title) {
        const heading = document.getElementById('about-heading');
        if (heading) heading.textContent = about.title;
      }

      let narrativeText = '';
      if (about.personalNarrative && about.personalNarrative.length) {
        narrativeText = about.personalNarrative.map((p) => p.text).join(' ');
      } else if (about.description) {
        narrativeText = about.description;
      }

      if (narrativeText) {
        const paraEl = document.getElementById('about-char-para');
        if (paraEl) {
          paraEl.textContent = narrativeText;
          window.dispatchEvent(new Event('scroll'));
        }
      }
    }

    // ─── 7. Coding Profiles / Social Links ──────────────────────────────────
    if (site.socialLinks && site.socialLinks.length) {
      site.socialLinks.forEach((link) => {
        const p = (link.platform || '').toLowerCase();
        if (p.includes('leetcode')) {
          const el = document.getElementById('leetcode-link-card');
          if (el && link.url) el.setAttribute('href', link.url);
        } else if (p.includes('geeks') || p.includes('gfg')) {
          const el = document.getElementById('gfg-link-card');
          if (el && link.url) el.setAttribute('href', link.url);
        }
      });
    }

    // ─── 8. Projects Section Dynamic Rehydration ────────────────────────────
    if (site.projects && site.projects.length) {
      const formatStatus = (st) => {
        const s = (st || '').toUpperCase();
        if (s === 'COMPLETED') {
          return { label: 'Completed', symbol: '🟢', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.3)', color: '#10b981' };
        }
        if (s === 'WORKING' || s === 'IN_PROGRESS') {
          return { label: 'Working', symbol: '🟢', bg: 'rgba(6,182,212,0.1)', border: 'rgba(6,182,212,0.3)', color: '#06b6d4' };
        }
        return { label: 'Coming Soon', symbol: '🟡', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', color: '#f59e0b' };
      };

      // In-place badge update for standard cards
      site.projects.forEach((proj, i) => {
        const idxStr = `0${i + 1}`.slice(-2);
        const badge = document.getElementById(`main-project-status-${idxStr}`);
        if (badge) {
          const fs = formatStatus(proj.status);
          badge.textContent = `${fs.symbol} Status: ${fs.label}`;
          badge.style.background = fs.bg;
          badge.style.borderColor = fs.border;
          badge.style.color = fs.color;
        }
      });
    }

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      try {
        window.lucide.createIcons();
      } catch (e) {}
    }
  }

  // 1. Instant Cache Hydration (0ms Stale-While-Revalidate)
  try {
    const rawCache = localStorage.getItem(CMS_SITE_CACHE_KEY) || sessionStorage.getItem(CMS_SITE_CACHE_KEY);
    if (rawCache) {
      const cachedData = JSON.parse(rawCache);
      applyCmsData(cachedData);
    }
  } catch (e) {}

  // 2. Fresh Network Fetch & Live Rehydration
  try {
    const res = await fetch(`${API_BASE}/public/site`);
    if (res.ok) {
      const json = await res.json();
      if (json && json.success && json.data) {
        applyCmsData(json.data);
        try {
          sessionStorage.setItem(CMS_SITE_CACHE_KEY, JSON.stringify(json.data));
          localStorage.setItem(CMS_SITE_CACHE_KEY, JSON.stringify(json.data));
        } catch (e) {}
      }
    }
  } catch (err) {
    console.debug('[initCmsIntegration] Falling back to bundled content:', err.message);
  }

  // 3. Real-Time Cross-Tab Broadcast Channel Listener
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const bc = new BroadcastChannel('anurag_portfolio_realtime');
      bc.addEventListener('message', async (ev) => {
        if (ev && ev.data && (ev.data.type === 'cms_content_updated' || ev.data.type === 'project_updated')) {
          if (ev.data.data) {
            applyCmsData(ev.data.data);
          }
          try {
            const res = await fetch(`${API_BASE}/public/site?_t=${Date.now()}`);
            if (res.ok) {
              const json = await res.json();
              if (json && json.success && json.data) {
                applyCmsData(json.data);
                try {
                  sessionStorage.setItem(CMS_SITE_CACHE_KEY, JSON.stringify(json.data));
                  localStorage.setItem(CMS_SITE_CACHE_KEY, JSON.stringify(json.data));
                } catch (e) {}
              }
            }
          } catch (e) {}
        }
      });
    } catch (e) {}
  }
}


