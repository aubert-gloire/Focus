// popup.js

const $ = id => document.getElementById(id);

const views = { idle: $('view-idle'), active: $('view-active'), summary: $('view-summary') };

// Idle inputs
const taskInput     = $('task-input');
const urlInput      = $('url-input');
const durationInput = $('duration-input');
const budgetInput   = $('budget-input');
const strictToggle  = $('strict-toggle');
const voiceToggle   = $('voice-toggle');
const schedToggle   = $('schedule-toggle');
const schedFields   = $('schedule-fields');
const delayInput    = $('delay-input');
const schedStatus   = $('schedule-status');

// Active
const activeTaskText = $('active-task-text');
const statDuration   = $('stat-duration');
const statRemaining  = $('stat-remaining');
const statOffTask    = $('stat-offtask');
const statOverrides  = $('stat-overrides');
const relevanceBar   = $('relevance-bar');
const relevanceScore = $('relevance-score');
const strictIndicator = $('strict-indicator');

// Header
const statusDot   = $('status-dot');
const streakBadge = $('streak-badge');

// ─── View switcher ────────────────────────────────────────────────────────────

function showView(name) {
  Object.entries(views).forEach(([k, el]) => { el.hidden = k !== name; });
}

// ─── Polling ──────────────────────────────────────────────────────────────────

let pollInterval = null;

function startPolling() { pollInterval = setInterval(refreshStats, 2000); }
function stopPolling()  { clearInterval(pollInterval); pollInterval = null; }

async function refreshStats() {
  const { session } = await sendMsg({ type: 'GET_SESSION' });
  if (!session) return;

  const elapsedMin = Math.floor((Date.now() - session.startTime) / 1000 / 60);
  statDuration.textContent  = elapsedMin + 'm';
  statOffTask.textContent   = session.offTaskCount;

  // Remaining time
  if (session.expectedDurationMin > 0) {
    const rem = session.expectedDurationMin - elapsedMin;
    statRemaining.textContent = rem > 0 ? rem + 'm' : 'Done';
    statRemaining.style.color = rem <= 0 ? 'var(--red)' : 'var(--accent)';
  } else {
    statRemaining.textContent = '—';
  }

  // Overrides left
  if (session.distractionBudget > 0) {
    const left = Math.max(0, session.distractionBudget - (session.overridesUsed || 0));
    statOverrides.textContent = left;
    statOverrides.style.color = left === 0 ? 'var(--red)' : 'var(--accent)';
  } else {
    statOverrides.textContent = session.strictMode ? '0' : '∞';
  }

  // Strict indicator
  strictIndicator.hidden = !session.strictMode &&
    !(session.distractionBudget > 0 && session.overridesUsed >= session.distractionBudget);

  // Relevance bar
  const switches    = (session.events || []).filter(e => e.type === 'tab_switch');
  const lastSwitch  = [...switches].reverse()[0];
  if (lastSwitch) {
    const pct = lastSwitch.isDistracted ? (lastSwitch.prob || 100) : (100 - (lastSwitch.prob || 0));
    relevanceBar.style.width      = Math.min(pct, 100) + '%';
    relevanceBar.style.background = lastSwitch.isDistracted ? 'var(--red)' : 'var(--green)';
    relevanceScore.textContent    = lastSwitch.isDistracted
      ? `Blocked — ${lastSwitch.prob ?? '—'}% distraction`
      : `On task — ${lastSwitch.reason || 'relevant'}`;
  }

  // Decision log
  const logEl = $('decision-log');
  if (logEl) {
    logEl.innerHTML = '';
    const recent = switches.slice(-5).reverse();
    if (recent.length === 0) {
      logEl.innerHTML = '<p style="font-size:11px;color:var(--muted);text-align:center;padding:4px">No tab switches yet</p>';
    } else {
      recent.forEach(e => {
        const entry = document.createElement('div');
        entry.className = `log-entry ${e.isDistracted ? 'blocked' : 'allowed'}`;
        entry.innerHTML = `
          <span class="log-domain">${e.domain || '—'}</span>
          <span class="log-score">${e.isDistracted ? 'BLOCKED' : 'allowed'} · ${e.prob ?? '—'}%</span>
        `;
        logEl.appendChild(entry);
      });
    }
  }
}

// ─── Voice feedback ───────────────────────────────────────────────────────────

function speakIfEnabled(text) {
  chrome.storage.local.get('voiceEnabled', ({ voiceEnabled }) => {
    if (voiceEnabled === false) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  });
}

chrome.storage.local.get('voiceEnabled', ({ voiceEnabled }) => {
  voiceToggle.checked = voiceEnabled !== false;
});

voiceToggle.addEventListener('change', () => {
  chrome.storage.local.set({ voiceEnabled: voiceToggle.checked });
});

// ─── Schedule toggle ──────────────────────────────────────────────────────────

schedToggle.addEventListener('change', () => {
  schedFields.hidden = !schedToggle.checked;
});

// ─── Start session ────────────────────────────────────────────────────────────

$('btn-start').addEventListener('click', async () => {
  const task = taskInput.value.trim();
  if (!task) { taskInput.style.borderColor = 'var(--red)'; return; }
  taskInput.style.borderColor = '';

  const taskUrl             = urlInput.value.trim();
  const expectedDurationMin = parseInt(durationInput.value, 10) || 0;
  const distractionBudget   = parseInt(budgetInput.value, 10) ?? 3;
  const strictMode          = strictToggle.checked;

  // Scheduled start
  if (schedToggle.checked) {
    const delayMin = parseInt(delayInput.value, 10);
    if (!delayMin || delayMin < 1) { delayInput.style.borderColor = 'var(--red)'; return; }
    delayInput.style.borderColor = '';
    await sendMsg({ type: 'SCHEDULE_SESSION', task, taskUrl, durationMin: expectedDurationMin, delayMin, strictMode, budget: distractionBudget });
    const fireAt = new Date(Date.now() + delayMin * 60000);
    schedStatus.textContent = `Scheduled for ${fireAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    return;
  }

  await sendMsg({ type: 'START_SESSION', task, taskUrl, expectedDurationMin, strictMode, distractionBudget });
  activeTaskText.textContent = task;
  if (strictMode) strictIndicator.hidden = false;
  setStatusDot('active');
  showView('active');
  startPolling();
  speakIfEnabled(`Session started. Good luck with ${task}.`);
});

// ─── Stop session ─────────────────────────────────────────────────────────────

$('btn-stop').addEventListener('click', async () => {
  stopPolling();
  const { log } = await sendMsg({ type: 'STOP_SESSION' });
  if (log) {
    renderSummary(log);
    speakIfEnabled(
      `Session complete. You scored ${log.focusPct} percent focus with ${log.blocksCount} block${log.blocksCount === 1 ? '' : 's'}.`
    );
  }
  setStatusDot('stopped');
  showView('summary');
});

// ─── Summary ──────────────────────────────────────────────────────────────────

function renderSummary(log) {
  $('sum-duration').textContent = (log.durationMin || 0) + 'm';
  $('sum-focus').textContent    = (log.focusPct   || 0) + '%';
  $('sum-blocks').textContent   = log.blocksCount || 0;

  if (log.streak && log.streak.count > 1) {
    $('sum-streak').textContent = `🔥 ${log.streak.count}-day focus streak!`;
  }

  $('sum-message').textContent =
    (log.focusPct || 0) >= 80 ? 'Solid session. You stayed on track.' :
    (log.focusPct || 0) >= 50 ? 'Decent — a few drifts but you recovered.' :
                                 'Lots of blocks today. Keep going.';
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function openDashboard() {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
}
$('btn-dashboard').addEventListener('click', openDashboard);
$('btn-dashboard-summary').addEventListener('click', openDashboard);

// ─── New session ──────────────────────────────────────────────────────────────

$('btn-new').addEventListener('click', () => {
  taskInput.value     = '';
  urlInput.value      = '';
  durationInput.value = '';
  budgetInput.value   = '';
  strictToggle.checked = false;
  schedToggle.checked  = false;
  schedFields.hidden   = true;
  schedStatus.textContent = '';
  setStatusDot('idle');
  showView('idle');
});

// ─── Status dot ───────────────────────────────────────────────────────────────

function setStatusDot(state) {
  statusDot.className = `dot dot--${state}`;
}

// ─── Load streak on open ──────────────────────────────────────────────────────

async function loadStreak() {
  const { appState, history } = await sendMsg({ type: 'GET_APP_STATE' });
  const streak = appState?.streak;
  if (streak && streak.count > 0) {
    streakBadge.textContent = `🔥 ${streak.count} day${streak.count > 1 ? 's' : ''}`;
    streakBadge.hidden = false;
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  await loadStreak();
  const { session } = await sendMsg({ type: 'GET_SESSION' });
  if (session) {
    activeTaskText.textContent = session.task;
    if (session.strictMode) strictIndicator.hidden = false;
    setStatusDot('active');
    showView('active');
    startPolling();
    refreshStats();
  } else {
    setStatusDot('idle');
    showView('idle');
  }
}

function sendMsg(message) {
  return new Promise(resolve => chrome.runtime.sendMessage(message, resolve));
}

init();
