// background.js — FOCUS service worker

importScripts('ml/tfidf.js', 'ml/classifier.js');

// ─── Known distraction domains ────────────────────────────────────────────────

const KNOWN_DISTRACTIONS = new Set([
  'instagram.com', 'twitter.com', 'x.com', 'facebook.com',
  'tiktok.com', 'snapchat.com', 'pinterest.com', 'messenger.com'
]);

// ─── In-memory state ──────────────────────────────────────────────────────────

let session  = null;
let _weights = null;

// ─── First install → onboarding ───────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
  }
});

// ─── Browser startup → clear leftover session ─────────────────────────────────

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.remove('activeSession');
  session = null;
});

// ─── Tab listeners ────────────────────────────────────────────────────────────

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    await ensureSession();
    const tab = await chrome.tabs.get(tabId);
    if (tab.url && tab.status === 'complete') handleTabChange(tab);
  } catch (_) {}
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (
    changeInfo.status === 'complete' &&
    tab.active && tab.url &&
    !tab.url.startsWith('chrome://') &&
    !tab.url.startsWith('chrome-extension://')
  ) {
    await ensureSession();
    handleTabChange(tab);
  }
});

// Restore session from storage if the service worker was killed mid-session
async function ensureSession() {
  if (!session) {
    const { activeSession } = await chrome.storage.local.get('activeSession');
    if (activeSession) session = activeSession;
  }
}

// ─── Core tab handler ─────────────────────────────────────────────────────────

async function handleTabChange(tab) {
  if (!session) return;

  const now   = Date.now();
  const url   = tab.url   || '';
  const title = tab.title || '';

  if (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('moz-extension://') ||
    url === '' ||
    url.includes(chrome.runtime.getURL('blocked.html'))
  ) return;

  // Log dwell on previous tab
  if (session.currentTabId !== null && session.tabStartTime) {
    const dwellMs = now - session.tabStartTime;
    if (session.currentTabDistracted) {
      session.offTaskMs = (session.offTaskMs || 0) + dwellMs;
    }
    session.events.push({
      type: 'dwell', timestamp: now,
      domain: extractDomain(session.currentTabUrl), dwellMs
    });
  }

  session.currentTabId         = tab.id;
  session.currentTabTitle      = title;
  session.currentTabUrl        = url;
  session.tabStartTime         = now;
  session.currentTabDistracted = false;
  session.switchCount++;

  const domain = extractDomain(url);
  const { isDistracted, prob, reason } = await classifyTab(title, domain);

  // Check if distraction budget exhausted → force strict
  const budgetExhausted = isBudgetExhausted();
  const effectiveStrict = session.strictMode || budgetExhausted;

  session.events.push({
    type: 'tab_switch', timestamp: now,
    title, domain, isDistracted,
    prob: Math.round(prob * 100), reason
  });

  if (session.events.length > 200) session.events = session.events.slice(-200);

  if (isDistracted) {
    session.offTaskCount++;
    session.currentTabDistracted = true;
    redirectToBlocked(tab.id, title, url, prob, reason, effectiveStrict);
  }

  await persistSession();
}

// ─── Distraction budget ───────────────────────────────────────────────────────

function isBudgetExhausted() {
  if (!session || session.distractionBudget === 0) return false;
  return session.overridesUsed >= session.distractionBudget;
}

// ─── Classifier ───────────────────────────────────────────────────────────────

async function classifyTab(tabTitle, tabDomain) {
  if (session.taskDomain && tabDomain.includes(session.taskDomain)) {
    return { isDistracted: false, prob: 0.0, reason: 'Task domain' };
  }
  if (KNOWN_DISTRACTIONS.has(tabDomain)) {
    return { isDistracted: true, prob: 1.0, reason: 'Known distraction' };
  }
  const weights = await getWeights();
  if (weights) {
    const features  = buildFeatureVector(tabTitle, tabDomain);
    const prob      = inferDistraction(features, weights);
    const threshold = weights._meta?.threshold ?? 0.45;
    return {
      isDistracted: prob > threshold,
      prob,
      reason: `ML — ${Math.round(prob * 100)}% distraction probability`
    };
  }
  const score = computeRelevance(session.task, tabTitle + ' ' + tabDomain);
  return {
    isDistracted: score < 0.10,
    prob:   score < 0.10 ? 0.9 : 0.1,
    reason: `TF-IDF relevance: ${Math.round(score * 100)}%`
  };
}

// ─── Feature vector ───────────────────────────────────────────────────────────

function buildFeatureVector(tabTitle, tabDomain) {
  const taskLower  = session.task.toLowerCase();
  const tabContext = (tabTitle + ' ' + tabDomain).toLowerCase();
  const tfidfScore = computeRelevance(session.task, tabContext);
  const domainMatch    = (session.taskDomain && tabDomain.includes(session.taskDomain)) ? 1 : 0;
  const isDistraction  = KNOWN_DISTRACTIONS.has(tabDomain) ? 1 : 0;
  const taskWords      = taskLower.match(/[a-z]{3,}/g) || [];
  const titleLower     = tabTitle.toLowerCase();
  const hits           = taskWords.filter(w => titleLower.includes(w)).length;
  const kwOverlap      = taskWords.length > 0 ? hits / taskWords.length : 0;
  const domainName     = tabDomain.replace(/\.(com|org|io|net|edu|co|gov).*$/, '');
  const domainInTask   = domainName && taskLower.includes(domainName) ? 1 : 0;
  return [tfidfScore, domainMatch, isDistraction, kwOverlap, domainInTask];
}

// ─── Weights loader ───────────────────────────────────────────────────────────

async function getWeights() {
  if (_weights) return _weights;
  try {
    const res = await fetch(chrome.runtime.getURL('ml/weights.json'));
    _weights  = await res.json();
    return _weights;
  } catch (_) { return null; }
}

// ─── Tab blocking ─────────────────────────────────────────────────────────────

function redirectToBlocked(tabId, blockedTitle, blockedUrl, prob = 1.0, reason = '', strictMode = false) {
  const params = new URLSearchParams({
    task: session.task, duration: String(session.expectedDurationMin),
    returnUrl: session.taskUrl, blockedUrl, blockedTitle,
    prob: String(Math.round(prob * 100)), reason,
    strict: strictMode ? '1' : '0'
  });
  chrome.tabs.update(tabId, {
    url: chrome.runtime.getURL('blocked.html') + '?' + params.toString()
  });
}

// ─── Scan all open tabs on session start ──────────────────────────────────────

async function scanAllOpenTabs() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    const url = tab.url || '';
    if (
      !tab.id || !url ||
      url.startsWith('chrome://') ||
      url.startsWith('chrome-extension://') ||
      url.startsWith('moz-extension://') ||
      url.includes(chrome.runtime.getURL('blocked.html'))
    ) continue;
    const domain = extractDomain(url);
    const title  = tab.title || '';
    const { isDistracted, prob, reason } = await classifyTab(title, domain);
    if (isDistracted) {
      session.offTaskCount++;
      session.events.push({
        type: 'tab_switch', timestamp: Date.now(),
        title, domain, isDistracted: true,
        prob: Math.round(prob * 100), reason, scannedOnStart: true
      });
      const budgetExhausted = isBudgetExhausted();
      redirectToBlocked(tab.id, title, url, prob, reason, session.strictMode || budgetExhausted);
    }
  }
  await persistSession();
}

// ─── Duration + schedule alarms ───────────────────────────────────────────────

chrome.alarms.create('duration_check', { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'duration_check' && session) {
    const elapsedMin = (Date.now() - session.startTime) / 1000 / 60;
    if (
      session.expectedDurationMin > 0 &&
      elapsedMin >= session.expectedDurationMin &&
      !session.durationAlertSent
    ) {
      session.durationAlertSent = true;
      chrome.notifications.create({
        type: 'basic', iconUrl: 'icons/icon48.png',
        title: 'FOCUS — Session time is up',
        message: `Your ${session.expectedDurationMin}-minute session on "${session.task}" has ended.`,
        priority: 2
      });
      speak(`Time is up. Your ${session.expectedDurationMin} minute session has ended.`);
      await persistSession();
    }
  }

  if (alarm.name === 'scheduled_session') {
    const { appState = {} } = await chrome.storage.local.get('appState');
    const sched = appState.schedule;
    if (sched && sched.task) {
      await startSession(sched.task, sched.taskUrl, sched.durationMin, sched.strictMode, sched.budget);
    }
  }
});

// ─── Voice feedback ───────────────────────────────────────────────────────────

async function speak(text) {
  const { voiceEnabled } = await chrome.storage.local.get('voiceEnabled');
  if (voiceEnabled === false) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  const url = tab.url || '';
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('moz-extension://')) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: t => {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(t);
        u.rate = 0.95;
        window.speechSynthesis.speak(u);
      },
      args: [text]
    });
  } catch (_) {}
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch (_) { return url; }
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

async function persistSession() {
  if (!session) return;
  await chrome.storage.local.set({ activeSession: session });
}

// ─── Streak updater ───────────────────────────────────────────────────────────

async function updateStreak() {
  const { appState = {} } = await chrome.storage.local.get('appState');
  const streak  = appState.streak || { count: 0, lastDate: null };
  const today   = todayStr();
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  if (streak.lastDate === today) {
    // already updated today — no change
  } else if (streak.lastDate === yesterday) {
    streak.count++;
  } else {
    streak.count = 1;
  }
  streak.lastDate = today;
  appState.streak = streak;
  await chrome.storage.local.set({ appState });
  return streak;
}

// ─── Session summary compression ─────────────────────────────────────────────

function buildSummary(completed) {
  const durationMin = Math.round((completed.endTime - completed.startTime) / 1000 / 60);
  const focusPct    = completed.switchCount > 0
    ? Math.round(((completed.switchCount - completed.offTaskCount) / completed.switchCount) * 100)
    : 100;

  // Top 3 distraction domains
  const domainCounts = {};
  (completed.events || [])
    .filter(e => e.type === 'tab_switch' && e.isDistracted)
    .forEach(e => { domainCounts[e.domain] = (domainCounts[e.domain] || 0) + 1; });
  const topDomains = Object.entries(domainCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([domain, count]) => ({ domain, count }));

  return {
    taskId:        completed.taskId,
    task:          completed.task,
    taskUrl:       completed.taskUrl,
    date:          todayStr(),
    startTime:     completed.startTime,
    endTime:       completed.endTime,
    durationMin,
    focusPct,
    blocksCount:   completed.offTaskCount,
    overridesUsed: completed.overridesUsed || 0,
    switchCount:   completed.switchCount,
    topDomains,
    strictMode:    completed.strictMode || false
  };
}

// ─── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.type) {

    case 'START_SESSION':
      startSession(msg.task, msg.taskUrl, msg.expectedDurationMin, msg.strictMode, msg.distractionBudget)
        .then(() => sendResponse({ ok: true }));
      return true;

    case 'STOP_SESSION':
      stopSession().then((log) => sendResponse({ ok: true, log }));
      return true;

    case 'GET_SESSION':
      sendResponse({ session });
      break;

    case 'GET_APP_STATE':
      chrome.storage.local.get(['appState', 'sessionHistory'], (data) => {
        sendResponse({ appState: data.appState || {}, history: data.sessionHistory || [] });
      });
      return true;

    case 'SCHEDULE_SESSION':
      scheduleSession(msg.task, msg.taskUrl, msg.durationMin, msg.delayMin, msg.strictMode, msg.budget)
        .then(() => sendResponse({ ok: true }));
      return true;

    case 'CANCEL_SCHEDULE':
      chrome.alarms.clear('scheduled_session');
      chrome.storage.local.get('appState', ({ appState = {} }) => {
        delete appState.schedule;
        chrome.storage.local.set({ appState });
      });
      sendResponse({ ok: true });
      break;

    case 'OVERRIDE_BLOCK':
      if (session) {
        session.overridesUsed = (session.overridesUsed || 0) + 1;
        const left = session.distractionBudget - session.overridesUsed;
        if (left === 1) speak('Heads up — only one override left.');
        if (left <= 0 && session.distractionBudget > 0) speak('No overrides left. Strict mode is now active.');
        persistSession();
      }
      sendResponse({ ok: true });
      break;
  }
});

// ─── Session lifecycle ────────────────────────────────────────────────────────

async function startSession(task, taskUrl, expectedDurationMin, strictMode = false, distractionBudget = 3) {
  const taskDomain = extractDomain(taskUrl || '');
  session = {
    taskId:              `task_${Date.now()}`,
    task,
    taskUrl:             taskUrl || '',
    taskDomain,
    expectedDurationMin: expectedDurationMin || 0,
    strictMode:          strictMode || false,
    distractionBudget:   distractionBudget ?? 3,
    overridesUsed:       0,
    startTime:           Date.now(),
    currentTabId:        null,
    currentTabTitle:     '',
    currentTabUrl:       '',
    currentTabDistracted: false,
    tabStartTime:        null,
    switchCount:         0,
    offTaskCount:        0,
    offTaskMs:           0,
    durationAlertSent:   false,
    events:              []
  };
  await chrome.storage.local.set({ activeSession: session });

  // Badge on extension icon so the user always knows a session is running
  chrome.action.setBadgeText({ text: 'ON' });
  chrome.action.setBadgeBackgroundColor({ color: '#6c63ff' });

  // Session-start notification
  chrome.notifications.create('session_start', {
    type: 'basic', iconUrl: 'icons/icon48.png',
    title: 'FOCUS — Session started',
    message: `Tracking: "${task}". Stay focused.`,
    priority: 2
  });

  await scanAllOpenTabs();
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab) handleTabChange(activeTab);
}

async function stopSession() {
  if (!session) return null;
  const completed  = { ...session, endTime: Date.now() };
  const summary    = buildSummary(completed);
  const durationMin = summary.durationMin;
  const focusPct   = summary.focusPct;

  // Update streak
  const streak = await updateStreak();

  // Save summary to history (keep last 30)
  const { sessionHistory = [] } = await chrome.storage.local.get('sessionHistory');
  const updated = [...sessionHistory, summary].slice(-30);
  await chrome.storage.local.set({ sessionHistory: updated });

  // Stop notification
  const streakMsg = streak.count > 1 ? ` 🔥 ${streak.count}-day streak!` : '';
  chrome.notifications.create({
    type:    'basic',
    iconUrl: 'icons/icon48.png',
    title:   'FOCUS — Session complete',
    message: `${durationMin}min on "${completed.task}" · Focus: ${focusPct}% · ${completed.offTaskCount} blocks${streakMsg}`,
    priority: 2
  });

  chrome.action.setBadgeText({ text: '' });
  await chrome.storage.local.remove('activeSession');
  session = null;
  return { ...summary, streak };
}

async function scheduleSession(task, taskUrl, durationMin, delayMin, strictMode, budget) {
  const fireTime = Date.now() + delayMin * 60 * 1000;
  chrome.alarms.create('scheduled_session', { when: fireTime });

  const { appState = {} } = await chrome.storage.local.get('appState');
  appState.schedule = { task, taskUrl, durationMin, strictMode, budget, fireTime };
  await chrome.storage.local.set({ appState });
}

// ─── Restore session on service worker restart ────────────────────────────────

chrome.storage.local.get('activeSession', ({ activeSession }) => {
  if (activeSession) {
    session = activeSession;
    chrome.action.setBadgeText({ text: 'ON' });
    chrome.action.setBadgeBackgroundColor({ color: '#6c63ff' });
  }
});
