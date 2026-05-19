// blocked.js — countdown logic for the distraction-blocked page

const COUNTDOWN_SECONDS = 10;
const CIRCUMFERENCE = 2 * Math.PI * 35; // matches r="35" in SVG

// ─── Read URL params ──────────────────────────────────────────────────────────

const params       = new URLSearchParams(location.search);
const task         = params.get('task')         || 'your task';
const duration     = parseInt(params.get('duration'), 10) || 0;
const returnUrl    = params.get('returnUrl')    || '';
const blockedUrl   = params.get('blockedUrl')   || '';
const blockedTitle = params.get('blockedTitle') || blockedUrl;
const prob         = parseInt(params.get('prob'), 10) || 100;
const reason       = params.get('reason')       || '';
const strictMode   = params.get('strict')       === '1';

// ─── Populate page ────────────────────────────────────────────────────────────

document.getElementById('blocked-site').textContent = blockedTitle || blockedUrl;
document.getElementById('task-name').textContent    = task;
document.getElementById('duration-info').textContent =
  duration > 0 ? `Expected session: ${duration} minutes` : '';

// ML score bar
const mlBar   = document.getElementById('ml-bar');
const mlLabel = document.getElementById('ml-label');
setTimeout(() => { mlBar.style.width = prob + '%'; }, 100);
mlLabel.textContent = reason || `${prob}% distraction probability`;

// ─── Countdown ────────────────────────────────────────────────────────────────

let remaining = COUNTDOWN_SECONDS;
const numberEl  = document.getElementById('countdown-number');
const textEl    = document.getElementById('countdown-text');
const ringFill  = document.getElementById('ring-fill');

ringFill.style.strokeDasharray  = CIRCUMFERENCE;
ringFill.style.strokeDashoffset = 0;

function tick() {
  remaining--;
  numberEl.textContent = remaining;
  textEl.textContent   = remaining;

  const progress = remaining / COUNTDOWN_SECONDS;
  ringFill.style.strokeDashoffset = CIRCUMFERENCE * (1 - progress);

  if (remaining <= 0) {
    clearInterval(timer);
    goBack();
  }
}

const timer = setInterval(tick, 1000);

// ─── Navigation ───────────────────────────────────────────────────────────────

function goBack() {
  if (returnUrl) {
    location.href = returnUrl;
  } else {
    history.back();
  }
}

document.getElementById('btn-return').addEventListener('click', () => {
  clearInterval(timer);
  goBack();
});

// Hide override in strict mode
if (strictMode) {
  const overrideBtn = document.getElementById('btn-override');
  overrideBtn.style.display = 'none';
  document.getElementById('countdown-label').textContent =
    'Strict mode — returning you to your task in ' + COUNTDOWN_SECONDS + 's';
}

document.getElementById('btn-override').addEventListener('click', () => {
  clearInterval(timer);
  try {
    const domain = new URL(blockedUrl).hostname.replace('www.', '');
    chrome.runtime.sendMessage({ type: 'OVERRIDE_BLOCK', domain });
  } catch (_) {}
  location.href = blockedUrl;
});
