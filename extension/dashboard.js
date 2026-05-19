// dashboard.js — FOCUS analytics dashboard

const $ = id => document.getElementById(id);

// ─── Grade helper ─────────────────────────────────────────────────────────────

function grade(pct) {
  if (pct >= 85) return { label: 'S', cls: 'grade-s' };
  if (pct >= 70) return { label: 'A', cls: 'grade-a' };
  if (pct >= 50) return { label: 'B', cls: 'grade-b' };
  return { label: 'C', cls: 'grade-c' };
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function dateStr(ts) {
  return new Date(ts).toISOString().split('T')[0];
}

function last7Days() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().split('T')[0];
  });
}

function shortDate(isoStr) {
  const d = new Date(isoStr + 'T00:00:00');
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ─── Draw bar chart ───────────────────────────────────────────────────────────

function drawChart(days, scores) {
  const canvas = $('focus-chart');
  const ctx    = canvas.getContext('2d');
  const W      = canvas.offsetWidth;
  const H      = 180;
  canvas.width  = W * devicePixelRatio;
  canvas.height = H * devicePixelRatio;
  ctx.scale(devicePixelRatio, devicePixelRatio);

  const pad   = { top: 10, right: 16, bottom: 32, left: 36 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom;
  const barW   = (chartW / days.length) * 0.55;
  const gap    = chartW / days.length;

  // Grid lines
  ctx.strokeStyle = '#2a2d3a';
  ctx.lineWidth   = 1;
  [0, 25, 50, 75, 100].forEach(v => {
    const y = pad.top + chartH - (v / 100) * chartH;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + chartW, y);
    ctx.stroke();
    ctx.fillStyle = '#7b7f94';
    ctx.font      = '10px Segoe UI, sans-serif';
    ctx.fillText(v + '%', 0, y + 4);
  });

  // Bars
  days.forEach((day, i) => {
    const x    = pad.left + i * gap + (gap - barW) / 2;
    const pct  = scores[i];
    const barH = pct !== null ? (pct / 100) * chartH : 0;
    const y    = pad.top + chartH - barH;

    if (pct !== null) {
      const g = ctx.createLinearGradient(0, y, 0, y + barH);
      g.addColorStop(0, '#6c63ff');
      g.addColorStop(1, '#3d3880');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, [4, 4, 0, 0]);
      ctx.fill();

      // Score label on bar
      ctx.fillStyle = '#e8eaf0';
      ctx.font      = 'bold 11px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(pct + '%', x + barW / 2, y - 4);
    } else {
      // No data
      ctx.fillStyle = '#2a2d3a';
      ctx.beginPath();
      ctx.roundRect(x, pad.top + chartH - 4, barW, 4, [2, 2, 0, 0]);
      ctx.fill();
    }

    // Day label
    ctx.fillStyle   = '#7b7f94';
    ctx.font        = '10px Segoe UI, sans-serif';
    ctx.textAlign   = 'center';
    ctx.fillText(shortDate(day), x + barW / 2, pad.top + chartH + 18);
  });
}

// ─── Build domain aggregates from history ────────────────────────────────────

function aggregateDomains(history) {
  const counts = {};
  history.forEach(s => {
    (s.topDomains || []).forEach(({ domain, count }) => {
      counts[domain] = (counts[domain] || 0) + count;
    });
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7);
}

// ─── Render sessions list ─────────────────────────────────────────────────────

function renderSessions(history) {
  const el = $('sessions-list');
  if (!history.length) { el.innerHTML = '<p class="empty">No sessions yet</p>'; return; }

  el.innerHTML = '';
  [...history].reverse().slice(0, 8).forEach(s => {
    const g    = grade(s.focusPct);
    const item = document.createElement('div');
    item.className = 'session-item';
    item.innerHTML = `
      <div>
        <div class="session-task">${s.task}</div>
        <div class="session-meta">${shortDate(s.date)} · ${s.durationMin}min · ${s.blocksCount} blocks</div>
      </div>
      <span class="grade ${g.cls}">${g.label} · ${s.focusPct}%</span>
    `;
    el.appendChild(item);
  });
}

// ─── Render domain list ───────────────────────────────────────────────────────

function renderDomains(history) {
  const el      = $('domain-list');
  const domains = aggregateDomains(history);
  if (!domains.length) { el.innerHTML = '<p class="empty">No data yet</p>'; return; }

  const max = domains[0][1];
  el.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'domain-list';
  domains.forEach(([domain, count]) => {
    const row = document.createElement('div');
    row.className = 'domain-row';
    row.innerHTML = `
      <span class="domain-name">${domain}</span>
      <div class="domain-bar-bg">
        <div class="domain-bar-fill" style="width:${Math.round((count / max) * 100)}%"></div>
      </div>
      <span class="domain-count">${count}x</span>
    `;
    wrap.appendChild(row);
  });
  el.appendChild(wrap);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

chrome.storage.local.get(['sessionHistory', 'appState'], ({ sessionHistory = [], appState = {} }) => {
  const history = sessionHistory;
  const streak  = appState.streak || { count: 0, lastDate: null };

  // Streak display
  if (streak.count > 0) {
    $('streak-display').textContent = `🔥 ${streak.count}-day streak`;
  }

  // Summary cards
  const totalMin  = history.reduce((s, h) => s + (h.durationMin || 0), 0);
  const totalHrs  = (totalMin / 60).toFixed(1);
  const avgFocus  = history.length
    ? Math.round(history.reduce((s, h) => s + (h.focusPct || 0), 0) / history.length)
    : null;

  $('card-sessions').textContent = history.length;
  $('card-hours').textContent    = totalHrs + 'h';
  $('card-streak').textContent   = streak.count;
  $('card-avg').textContent      = avgFocus !== null ? avgFocus + '%' : '—';

  // 7-day chart
  const days   = last7Days();
  const byDate = {};
  history.forEach(s => {
    if (!byDate[s.date]) byDate[s.date] = [];
    byDate[s.date].push(s.focusPct);
  });
  const scores = days.map(d => {
    const daySessions = byDate[d];
    if (!daySessions || !daySessions.length) return null;
    return Math.round(daySessions.reduce((a, b) => a + b, 0) / daySessions.length);
  });
  drawChart(days, scores);

  // Sessions list + domains
  renderSessions(history);
  renderDomains(history);
});
