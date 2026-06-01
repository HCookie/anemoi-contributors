// App State
const state = {
  snapshotDate: null,
  repo: 'all_repos',
  metric: 'issues',
  mode: 'counts',
  hideBots: true,
  focusOrg: null,    // legacy donut-click focus (only one org soft-highlighted)
  isolateOrg: null,  // hard-isolate: only this org appears in every chart
  hiddenOrgs: [],    // explicitly removed orgs (additive to hideBots)
  trendMetric: 'issues',
  sortColumn: 'total',
  sortAscending: false
};

// Data
let currentSnapshot = null;
let allHistory = [];
let manifest = null;
let allOrgs = [];
let colorMap = {};

// Metric config
const METRICS = [
  { key: 'issues', label: 'Issues' },
  { key: 'pull_requests', label: 'Pull Requests' },
  { key: 'total_reviews', label: 'Total Reviews' },
  { key: 'unique_reviews', label: 'Unique Reviews' }
];

const PR_TYPE_ORDER = ['feat', 'fix', 'refactor', 'perf', 'test', 'docs', 'ci', 'build', 'chore', 'style'];
const HIDDEN_ORGS = ['Bots', 'CodeAgents'];

// ECharts color palette
const COLORS = [
  '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272', '#fc8452', '#9a60b4', 
  '#ea7ccc', '#d4a373', '#e06c75', '#56b6c2', '#c678dd', '#98c379', '#61afef', '#e5c07b'
];

// Charts
const charts = {};

// ============================================================================
// Initialization
// ============================================================================

async function init() {
  try {
    // Load manifest
    const manifestRes = await fetch('data/manifest.json');
    manifest = await manifestRes.json();
    
    // Parse hash or use latest
    parseHash();
    
    // Load data
    await loadSnapshot(state.snapshotDate || manifest.latest);
    
    // Load all history for trends
    await loadAllHistory();
    
    // Setup UI
    setupSnapshotSelector();
    setupFilters();
    
    // Render
    renderAll();
  } catch (err) {
    console.error('Initialization failed:', err);
  }
}

function parseHash() {
  const hash = window.location.hash.slice(1);
  const params = new URLSearchParams(hash);
  
  if (params.has('date')) state.snapshotDate = params.get('date');
  if (params.has('repo')) state.repo = params.get('repo');
  if (params.has('metric')) state.metric = params.get('metric');
  if (params.has('mode')) state.mode = params.get('mode');
}

function updateHash() {
  const params = new URLSearchParams();
  if (state.snapshotDate) params.set('date', state.snapshotDate);
  if (state.repo !== 'all_repos') params.set('repo', state.repo);
  if (state.metric !== 'issues') params.set('metric', state.metric);
  if (state.mode !== 'counts') params.set('mode', state.mode);
  
  window.location.hash = params.toString();
}

async function loadSnapshot(date) {
  const path = date === manifest.latest ? 'data/latest.json' : `data/history/${date}.json`;
  const res = await fetch(path);
  currentSnapshot = await res.json();
  state.snapshotDate = date;
  
  // Build org list and color map
  buildOrgList();
  updateSubtitle();
  
  // Reconcile state.hiddenOrgs against the new snapshot's allOrgs
  state.hiddenOrgs = state.hiddenOrgs.filter(o => allOrgs.includes(o));
  if (state.hideBots) {
    HIDDEN_ORGS.forEach(o => {
      if (allOrgs.includes(o) && !state.hiddenOrgs.includes(o)) {
        state.hiddenOrgs.push(o);
      }
    });
  }
  if (state.isolateOrg && !allOrgs.includes(state.isolateOrg)) {
    state.isolateOrg = null;
  }
}

async function loadAllHistory() {
  allHistory = [];
  for (const date of manifest.history) {
    try {
      const res = await fetch(`data/history/${date}.json`);
      const snap = await res.json();
      allHistory.push({ date, data: snap });
    } catch (err) {
      console.warn(`Failed to load history/${date}.json:`, err);
    }
  }
  allHistory.sort((a, b) => a.date.localeCompare(b.date));
}

function buildOrgList() {
  const orgSet = new Set();
  
  for (const repoData of Object.values(currentSnapshot.repos)) {
    for (const metric of METRICS) {
      if (repoData[metric.key]) {
        Object.keys(repoData[metric.key]).forEach(org => orgSet.add(org));
      }
    }
  }
  
  allOrgs = Array.from(orgSet).sort();
  
  // Build stable color map
  colorMap = {};
  allOrgs.forEach((org, i) => {
    colorMap[org] = COLORS[i % COLORS.length];
  });
}

function updateSubtitle() {
  const months = currentSnapshot.months || 6;
  const repos = Object.keys(currentSnapshot.repos);
  const subtitle = `Snapshot: ${state.snapshotDate} | Rolling window: ${months} month${months !== 1 ? 's' : ''} | Repos: ${repos.join(', ')}`;
  document.getElementById('subtitle-text').textContent = subtitle;
  
  // Update methodology intro
  const methodIntro = `Data collected from the GitHub API via PyGithub, covering activity in the ${months * 30} days prior to ${state.snapshotDate} across the following repositories: ${repos.join(', ')}.`;
  document.getElementById('methodology-intro').textContent = methodIntro;
}

// ============================================================================
// UI Setup
// ============================================================================

function setupSnapshotSelector() {
  const sel = document.getElementById('snapshot-selector');
  sel.innerHTML = '';
  
  const latestOpt = document.createElement('option');
  latestOpt.value = manifest.latest;
  latestOpt.textContent = `Latest (${manifest.latest})`;
  sel.appendChild(latestOpt);
  
  manifest.history.forEach(date => {
    if (date === manifest.latest) return;
    const opt = document.createElement('option');
    opt.value = date;
    opt.textContent = date;
    sel.appendChild(opt);
  });
  
  sel.value = state.snapshotDate || manifest.latest;
  
  sel.addEventListener('change', async (e) => {
    await loadSnapshot(e.target.value);
    
    // Rebuild repo pills (new snapshot may have different repos)
    const repoPills = document.getElementById('repo-pills');
    repoPills.innerHTML = '';
    const allPill = createPill('All Repos', 'all_repos', state.repo === 'all_repos');
    allPill.addEventListener('click', () => selectRepo('all_repos'));
    repoPills.appendChild(allPill);
    Object.keys(currentSnapshot.repos).forEach(repo => {
      const pill = createPill(repo, repo, state.repo === repo);
      pill.addEventListener('click', () => selectRepo(repo));
      repoPills.appendChild(pill);
    });
    
    // Refresh org pills (new snapshot may have different orgs)
    renderOrgPills();
    
    renderAll();
    updateHash();
  });
}

function setupFilters() {
  // Repo pills
  const repoPills = document.getElementById('repo-pills');
  repoPills.innerHTML = '';
  
  const allPill = createPill('All Repos', 'all_repos', state.repo === 'all_repos');
  allPill.addEventListener('click', () => selectRepo('all_repos'));
  repoPills.appendChild(allPill);
  
  Object.keys(currentSnapshot.repos).forEach(repo => {
    const pill = createPill(repo, repo, state.repo === repo);
    pill.addEventListener('click', () => selectRepo(repo));
    repoPills.appendChild(pill);
  });
  
  // Metric pills
  const metricPills = document.getElementById('metric-pills');
  metricPills.innerHTML = '';
  
  METRICS.forEach(m => {
    const pill = createPill(m.label, m.key, state.metric === m.key);
    pill.addEventListener('click', () => selectMetric(m.key));
    metricPills.appendChild(pill);
  });
  
  // Mode pills
  document.querySelectorAll('[data-mode]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === state.mode);
    btn.addEventListener('click', () => selectMode(btn.dataset.mode));
  });
  
  // Hide bots toggle — also syncs the org-pill row so there's one source of truth
  const hideBotsToggle = document.getElementById('hide-bots');
  hideBotsToggle.checked = state.hideBots;
  hideBotsToggle.addEventListener('change', (e) => {
    state.hideBots = e.target.checked;
    if (e.target.checked) {
      HIDDEN_ORGS.forEach(o => {
        if (allOrgs.includes(o) && !state.hiddenOrgs.includes(o)) state.hiddenOrgs.push(o);
      });
    } else {
      state.hiddenOrgs = state.hiddenOrgs.filter(o => !HIDDEN_ORGS.includes(o));
    }
    if (typeof renderOrgPills === 'function') renderOrgPills();
    renderAll();
  });
  
  // Trend metric pills
  const trendPills = document.getElementById('trend-metric-pills');
  trendPills.innerHTML = '';
  
  METRICS.forEach(m => {
    const pill = createPill(m.label, m.key, state.trendMetric === m.key);
    pill.addEventListener('click', () => {
      state.trendMetric = m.key;
      document.querySelectorAll('#trend-metric-pills .pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      renderTrendsChart();
    });
    trendPills.appendChild(pill);
  });
  
  // Clear org filter
  document.getElementById('clear-org-filter').addEventListener('click', () => {
    state.focusOrg = null;
    document.getElementById('clear-org-filter').style.display = 'none';
    renderAll();
  });

  // Org Solo/Hide/Reset controls
  setupOrgFilter();
}

// ============================================================================
// Org picker — compact trigger + popover with search and per-row solo
// ============================================================================

// Module-scoped search query so re-renders preserve it while the panel is open.
let _orgSearchQuery = '';
let _orgPickerOutsideListener = null;

function setupOrgFilter() {
  const trigger     = document.getElementById('org-picker-trigger');
  const panel       = document.getElementById('org-picker-panel');
  const searchInput = document.getElementById('org-picker-search-input');
  if (!trigger || !panel) return;

  // Default behaviour: bots hidden, mirroring the "Mute bots & agents" toggle.
  if (state.hideBots) {
    HIDDEN_ORGS.forEach(o => {
      if (allOrgs.includes(o) && !state.hiddenOrgs.includes(o)) state.hiddenOrgs.push(o);
    });
  }

  // Trigger open/close
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = panel.hidden;
    if (willOpen) {
      panel.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      _orgSearchQuery = '';
      if (searchInput) { searchInput.value = ''; setTimeout(() => searchInput.focus(), 0); }
      renderOrgPickerList();
      // Outside-click to close (installed once)
      if (!_orgPickerOutsideListener) {
        _orgPickerOutsideListener = (ev) => {
          if (panel.hidden) return;
          if (!panel.contains(ev.target) && !trigger.contains(ev.target)) {
            panel.hidden = true;
            trigger.setAttribute('aria-expanded', 'false');
          }
        };
        document.addEventListener('click', _orgPickerOutsideListener);
        document.addEventListener('keydown', (ev) => {
          if (ev.key === 'Escape' && !panel.hidden) {
            panel.hidden = true;
            trigger.setAttribute('aria-expanded', 'false');
          }
        });
      }
    } else {
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    }
  });

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      _orgSearchQuery = (e.target.value || '').toLowerCase().trim();
      renderOrgPickerList();
    });
  }

  const allBtn   = document.getElementById('org-all-btn');
  const noneBtn  = document.getElementById('org-none-btn');
  const resetBtn = document.getElementById('org-reset-btn');

  if (allBtn) allBtn.addEventListener('click', () => {
    state.hiddenOrgs = [];
    state.isolateOrg = null;
    state.hideBots = false;
    const cb = document.getElementById('hide-bots'); if (cb) cb.checked = false;
    refreshOrgPicker();
    renderAll();
  });
  if (noneBtn) noneBtn.addEventListener('click', () => {
    state.hiddenOrgs = [...allOrgs];
    state.isolateOrg = null;
    refreshOrgPicker();
    renderAll();
  });
  if (resetBtn) resetBtn.addEventListener('click', () => {
    state.isolateOrg = null;
    state.focusOrg = null;
    state.hiddenOrgs = allOrgs.filter(o => HIDDEN_ORGS.includes(o));
    state.hideBots = true;
    const cb = document.getElementById('hide-bots'); if (cb) cb.checked = true;
    refreshOrgPicker();
    renderAll();
  });

  refreshOrgPicker();
}

function refreshOrgPicker() {
  updateOrgPickerTrigger();
  // Only re-render the list if the panel is open (saves work, preserves focus).
  const panel = document.getElementById('org-picker-panel');
  if (panel && !panel.hidden) renderOrgPickerList();
}

function updateOrgPickerTrigger() {
  const summary = document.getElementById('org-picker-summary');
  if (!summary) return;
  const hidden = new Set(state.hiddenOrgs);
  const visibleCount = allOrgs.filter(o => !hidden.has(o)).length;
  // Show up to four colour dots for visible orgs, ordered by total
  // contribution so the most prominent orgs appear in the trigger.
  const totals = orgTotalsMap();
  const dots = allOrgs
    .filter(o => !hidden.has(o))
    .sort((a, b) => (totals[b] || 0) - (totals[a] || 0))
    .slice(0, 4)
    .map(o => `<span class="org-picker-swatch-dot" style="background:${colorMap[o] || 'transparent'}"></span>`)
    .join('');
  summary.innerHTML =
    `<span>${visibleCount} of ${allOrgs.length} organisations</span>` +
    `<span class="org-picker-swatches" aria-hidden="true">${dots}</span>`;
}

function orgTotalsMap() {
  const totals = {};
  if (!currentSnapshot) return totals;
  for (const org of allOrgs) {
    let t = 0;
    for (const repoData of Object.values(currentSnapshot.repos)) {
      for (const m of METRICS) {
        t += repoData[m.key]?.[org] || 0;
      }
    }
    totals[org] = t;
  }
  return totals;
}

function renderOrgPickerList() {
  const list = document.getElementById('org-picker-list');
  if (!list) return;

  const hidden = new Set(state.hiddenOrgs);
  const totals = orgTotalsMap();
  const query = _orgSearchQuery;

  const filtered = allOrgs.filter(o => !query || o.toLowerCase().includes(query));

  if (filtered.length === 0) {
    list.innerHTML = `<div class="org-picker-empty">No organisations match “${escapeHtml(query)}”.</div>`;
    return;
  }

  // Sort: visible (selected) first, then by total contribution descending,
  // then alphabetical as a tie-breaker.
  filtered.sort((a, b) => {
    const aHid = hidden.has(a) ? 1 : 0;
    const bHid = hidden.has(b) ? 1 : 0;
    if (aHid !== bHid) return aHid - bHid;
    const ta = totals[a] || 0, tb = totals[b] || 0;
    if (tb !== ta) return tb - ta;
    return a.localeCompare(b);
  });

  list.innerHTML = filtered.map(o => {
    const isHidden = hidden.has(o);
    const swatch = colorMap[o] || 'transparent';
    const total = (totals[o] || 0).toLocaleString();
    return `<label class="org-picker-row${isHidden ? ' is-hidden' : ''}" data-org="${o}" role="option" aria-selected="${!isHidden}">
      <input type="checkbox" ${isHidden ? '' : 'checked'} aria-label="${escapeHtml(o)}" />
      <span class="org-swatch" style="background:${swatch}"></span>
      <span class="org-name">${escapeHtml(o)}</span>
      <span class="org-count">${total}</span>
      <button type="button" class="org-solo-btn" data-solo="${o}" title="Show only this organisation">solo</button>
    </label>`;
  }).join('');

  // Wire up row clicks
  list.querySelectorAll('.org-picker-row').forEach(row => {
    const org = row.dataset.org;
    const cb = row.querySelector('input[type="checkbox"]');

    // Clicking the label toggles. The native checkbox click event also
    // bubbles up, but the label handles it once via change.
    cb.addEventListener('change', () => {
      if (cb.checked) {
        state.hiddenOrgs = state.hiddenOrgs.filter(o => o !== org);
      } else if (!state.hiddenOrgs.includes(org)) {
        state.hiddenOrgs.push(org);
      }
      state.isolateOrg = null;
      // Refresh visible-state classes without rebuilding (preserves scroll/focus)
      row.classList.toggle('is-hidden', !cb.checked);
      row.setAttribute('aria-selected', String(cb.checked));
      updateOrgPickerTrigger();
      renderAll();
    });

    const soloBtn = row.querySelector('.org-solo-btn');
    if (soloBtn) {
      soloBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        state.hiddenOrgs = allOrgs.filter(o => o !== org);
        state.isolateOrg = null;
        renderOrgPickerList();
        updateOrgPickerTrigger();
        renderAll();
      });
    }
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// Refresh hook called after a snapshot change.
function refreshOrgSelect() {
  refreshOrgPicker();
}

// Back-compat: other places (the snapshot-change handler) call renderOrgPills.
function renderOrgPills() {
  refreshOrgPicker();
}

// Expose so the modules' ctx can use the same visibility logic.
window.getVisibleOrgs = getVisibleOrgs;

function createPill(label, value, active) {
  const pill = document.createElement('button');
  pill.className = `pill ${active ? 'active' : ''}`;
  pill.textContent = label;
  pill.dataset.value = value;
  return pill;
}

function selectRepo(repo) {
  state.repo = repo;
  document.querySelectorAll('#repo-pills .pill').forEach(p => {
    p.classList.toggle('active', p.dataset.value === repo);
  });
  renderAll();
  updateHash();
}

function selectMetric(metric) {
  state.metric = metric;
  document.querySelectorAll('#metric-pills .pill').forEach(p => {
    p.classList.toggle('active', p.dataset.value === metric);
  });
  renderAll();
  updateHash();
}

function selectMode(mode) {
  state.mode = mode;
  document.querySelectorAll('[data-mode]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  renderMainChart();
  renderPRTypesChart();
  updateHash();
}

// ============================================================================
// Data helpers
// ============================================================================

function getVisibleOrgs() {
  let orgs = allOrgs.filter(org => !state.hideBots || !HIDDEN_ORGS.includes(org));
  if (state.isolateOrg) {
    orgs = orgs.filter(o => o === state.isolateOrg);
  }
  if (state.hiddenOrgs && state.hiddenOrgs.length) {
    const hidden = new Set(state.hiddenOrgs);
    orgs = orgs.filter(o => !hidden.has(o));
  }
  return orgs;
}

function getRepoData(repo) {
  if (repo === 'all_repos') {
    // Aggregate across all repos
    const agg = {};
    METRICS.forEach(m => {
      agg[m.key] = {};
      for (const repoData of Object.values(currentSnapshot.repos)) {
        if (repoData[m.key]) {
          for (const [org, count] of Object.entries(repoData[m.key])) {
            agg[m.key][org] = (agg[m.key][org] || 0) + count;
          }
        }
      }
    });
    return agg;
  } else {
    return currentSnapshot.repos[repo] || {};
  }
}

function getPRTypeData(repo) {
  if (repo === 'all_repos') {
    const agg = {};
    for (const repoData of Object.values(currentSnapshot.repos)) {
      if (repoData.pull_requests_by_type) {
        for (const [type, orgCounts] of Object.entries(repoData.pull_requests_by_type)) {
          if (!agg[type]) agg[type] = {};
          for (const [org, count] of Object.entries(orgCounts)) {
            agg[type][org] = (agg[type][org] || 0) + count;
          }
        }
      }
    }
    return agg;
  } else {
    return currentSnapshot.repos[repo]?.pull_requests_by_type || {};
  }
}

function getPRTypeLabels(prTypeData) {
  const types = Object.keys(prTypeData);
  const ordered = PR_TYPE_ORDER.filter(t => types.includes(t));
  const other = types.filter(t => !PR_TYPE_ORDER.includes(t) && t !== 'other').sort();
  if (types.includes('other')) other.push('other');
  return [...ordered, ...other];
}

// ============================================================================
// Rendering
// ============================================================================

function renderAll() {
  updateActiveFilterLabels();
  renderKPIs();
  renderMainChart();
  renderOrgDonut();
  renderPRTypesChart();
  renderTreemap();
  renderTrendsChart();
  renderTable();
  // Notify the per-section modules (trends/counts/types) so they re-render
  // with the latest visible-orgs set. The hook is installed by index.html
  // once the modules are mounted.
  if (typeof window.__renderModules === 'function') {
    try { window.__renderModules(); } catch (e) { console.error('module render hook failed', e); }
  }
}

// Make the current filter selection visible across the dashboard:
// - rewrite chart card titles to include the active metric + repo
// - mark the active KPI tile and the active metric column in the table header
function updateActiveFilterLabels() {
  const metricLabel = (METRICS.find(m => m.key === state.metric) || {}).label || state.metric;
  const repoLabel   = state.repo === 'all_repos' ? 'all repositories' : state.repo;
  const modeLabel   = state.mode === 'percent' ? '% share' : 'counts';

  const setTitle = (selector, text) => {
    const el = document.querySelector(selector);
    if (el) el.textContent = text;
  };

  // Donut / treemap / PR types (headline card title is now static; pills show the metric)
  setTitle('.bento .col-4 h2', `Share of ${metricLabel.toLowerCase()} · ${repoLabel}`);
  setTitle('.bento .col-7 h2', `Merged PR types · ${repoLabel} (${modeLabel})`);
  setTitle('.bento .col-5 h2', `Treemap of ${metricLabel.toLowerCase()} by repository`);

  // Highlight the active metric column in the roster table
  document.querySelectorAll('#org-table thead th').forEach(th => {
    th.classList.toggle('th-active', th.dataset.sort === state.metric);
  });

  // Highlight the active KPI tile so the chosen metric is unmistakable
  document.querySelectorAll('#kpi-strip .kpi-card').forEach(card => {
    card.classList.toggle('kpi-active', card.dataset.metric === state.metric);
  });
}

function renderKPIs() {
  const kpiStrip = document.getElementById('kpi-strip');
  kpiStrip.innerHTML = '';
  
  const repoData = getRepoData(state.repo);
  
  // Find previous snapshot for delta calculation
  let prevSnapshot = null;
  const currentIdx = allHistory.findIndex(h => h.date === state.snapshotDate);
  if (currentIdx > 0) {
    prevSnapshot = allHistory[currentIdx - 1].data;
  }
  
  METRICS.forEach(m => {
    const current = Object.values(repoData[m.key] || {}).reduce((a, b) => a + b, 0);
    let delta = null;
    let deltaClass = 'neutral';
    
    if (prevSnapshot) {
      const prevData = state.repo === 'all_repos' 
        ? Object.values(prevSnapshot.repos).reduce((acc, r) => {
            for (const [org, count] of Object.entries(r[m.key] || {})) {
              acc[org] = (acc[org] || 0) + count;
            }
            return acc;
          }, {})
        : prevSnapshot.repos[state.repo]?.[m.key] || {};
      
      const prev = Object.values(prevData).reduce((a, b) => a + b, 0);
      delta = current - prev;
      deltaClass = delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral';
    }
    
    const card = document.createElement('div');
    card.className = 'kpi-card';
    card.dataset.metric = m.key;
    card.innerHTML = `
      <div class="kpi-label">${m.label}</div>
      <div class="kpi-value">${current.toLocaleString()}</div>
      ${delta !== null ? `<div class="kpi-delta ${deltaClass}">${delta > 0 ? '+' : ''}${delta.toLocaleString()}</div>` : ''}
    `;
    kpiStrip.appendChild(card);
  });
}

function renderMainChart() {
  if (!charts.main) {
    charts.main = echarts.init(document.getElementById('main-chart'));
  }
  
  const orgs = getVisibleOrgs();
  const repoData = getRepoData(state.repo);
  const metricData = repoData[state.metric] || {};
  
  const repos = state.repo === 'all_repos' ? [...Object.keys(currentSnapshot.repos), 'All'] : [state.repo];
  
  const series = orgs.map(org => ({
    name: org,
    type: 'bar',
    stack: 'total',
    data: repos.map(r => {
      if (r === 'All') {
        return metricData[org] || 0;
      }
      if (state.repo === 'all_repos') {
        return currentSnapshot.repos[r]?.[state.metric]?.[org] || 0;
      }
      return metricData[org] || 0;
    }),
    itemStyle: { color: colorMap[org] },
    emphasis: { focus: 'series' }
  }));
  
  const option = {
    tooltip: {
      // Hover a single bar segment → show only that org's value, not the
      // whole stack at that x position.
      trigger: 'item',
      formatter: (p) => {
        const swatch = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.color};margin-right:6px;vertical-align:middle"></span>`;
        const unit = state.mode === 'percent' ? '%' : '';
        const val = typeof p.value === 'number' ? (state.mode === 'percent' ? p.value.toFixed(1) : p.value.toLocaleString()) : p.value;
        return `${swatch}<strong>${p.seriesName}</strong><br/>${p.name}: ${val}${unit}`;
      }
    },
    legend: {
      type: 'scroll',
      bottom: 0,
      selected: state.focusOrg ? Object.fromEntries(orgs.map(o => [o, o === state.focusOrg])) : undefined
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '15%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: repos
    },
    yAxis: {
      type: 'value',
      name: state.mode === 'percent' ? 'Percentage' : 'Count'
    },
    series: series
  };
  
  if (state.mode === 'percent') {
    option.yAxis.max = 100;
    option.yAxis.axisLabel = { formatter: '{value}%' };
    option.tooltip.valueFormatter = (value) => value.toFixed(1) + '%';
    
    // Normalize to percentage
    option.series.forEach(s => {
      s.data = s.data.map((val, idx) => {
        const total = series.reduce((sum, ser) => sum + ser.data[idx], 0);
        return total > 0 ? (val / total * 100) : 0;
      });
    });
  }
  
  charts.main.setOption(option, { notMerge: true });
}

function renderOrgDonut() {
  if (!charts.donut) {
    charts.donut = echarts.init(document.getElementById('org-donut'));
    // No click handler — slices are not selectable. Org filtering is done
    // through the dedicated picker in the filter bar.
  }
  // Defensively hide the legacy "Clear org focus" button — it's no longer
  // reachable but the DOM node still exists.
  const clearBtn = document.getElementById('clear-org-filter');
  if (clearBtn) clearBtn.style.display = 'none';
  
  const orgs = getVisibleOrgs();
  const repoData = getRepoData(state.repo);
  const metricData = repoData[state.metric] || {};
  
  const data = orgs.map(org => ({
    name: org,
    value: metricData[org] || 0,
    itemStyle: { color: colorMap[org] }
  })).filter(d => d.value > 0);
  
  const option = {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)'
    },
    legend: {
      type: 'scroll',
      orient: 'vertical',
      right: 10,
      top: 20,
      bottom: 20,
      selected: state.focusOrg ? Object.fromEntries(orgs.map(o => [o, o === state.focusOrg])) : undefined
    },
    series: [{
      name: state.metric,
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['40%', '50%'],
      data: data,
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowOffsetX: 0,
          shadowColor: 'rgba(0, 0, 0, 0.5)'
        }
      }
    }]
  };
  
  charts.donut.setOption(option, { notMerge: true });
}

function renderPRTypesChart() {
  if (!charts.prTypes) {
    charts.prTypes = echarts.init(document.getElementById('pr-types-chart'));
  }
  
  const orgs = getVisibleOrgs();
  const prTypeData = getPRTypeData(state.repo);
  const types = getPRTypeLabels(prTypeData);
  
  const series = orgs.map(org => ({
    name: org,
    type: 'bar',
    stack: 'total',
    data: types.map(t => prTypeData[t]?.[org] || 0),
    itemStyle: { color: colorMap[org] },
    emphasis: { focus: 'series' }
  }));
  
  const option = {
    tooltip: {
      trigger: 'item',
      formatter: (p) => {
        const swatch = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.color};margin-right:6px;vertical-align:middle"></span>`;
        const unit = state.mode === 'percent' ? '%' : '';
        const val = typeof p.value === 'number' ? (state.mode === 'percent' ? p.value.toFixed(1) : p.value.toLocaleString()) : p.value;
        return `${swatch}<strong>${p.seriesName}</strong><br/>${p.name}: ${val}${unit}`;
      }
    },
    legend: {
      type: 'scroll',
      bottom: 0,
      selected: state.focusOrg ? Object.fromEntries(orgs.map(o => [o, o === state.focusOrg])) : undefined
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '15%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: types
    },
    yAxis: {
      type: 'value',
      name: state.mode === 'percent' ? 'Percentage' : 'Count'
    },
    series: series
  };
  
  if (state.mode === 'percent') {
    option.yAxis.max = 100;
    option.yAxis.axisLabel = { formatter: '{value}%' };
    option.tooltip.valueFormatter = (value) => value.toFixed(1) + '%';
    
    option.series.forEach(s => {
      s.data = s.data.map((val, idx) => {
        const total = series.reduce((sum, ser) => sum + ser.data[idx], 0);
        return total > 0 ? (val / total * 100) : 0;
      });
    });
  }
  
  charts.prTypes.setOption(option, { notMerge: true });
}

function renderTreemap() {
  if (!charts.treemap) {
    charts.treemap = echarts.init(document.getElementById('treemap-chart'));
  }
  
  const orgs = getVisibleOrgs();
  const repoData = getRepoData(state.repo);
  
  let data = [];
  
  if (state.repo === 'all_repos') {
    // Nested: repos -> orgs
    data = Object.keys(currentSnapshot.repos).map(repo => {
      const children = orgs.map(org => {
        const value = currentSnapshot.repos[repo]?.[state.metric]?.[org] || 0;
        return value > 0 ? {
          name: org,
          value: value,
          itemStyle: { color: colorMap[org] }
        } : null;
      }).filter(Boolean);
      
      return children.length > 0 ? {
        name: repo,
        children: children
      } : null;
    }).filter(Boolean);
  } else {
    // Flat: just orgs
    data = orgs.map(org => {
      const value = repoData[state.metric]?.[org] || 0;
      return value > 0 ? {
        name: org,
        value: value,
        itemStyle: { color: colorMap[org] }
      } : null;
    }).filter(Boolean);
  }
  
  const option = {
    tooltip: {
      formatter: (params) => `${params.name}: ${params.value}`
    },
    series: [{
      type: 'treemap',
      data: state.repo === 'all_repos' ? data : [{ name: state.repo, children: data }],
      leafDepth: 1,
      label: {
        show: true,
        formatter: '{b}'
      },
      upperLabel: {
        show: true,
        height: 30
      },
      levels: [
        {
          itemStyle: {
            borderColor: '#555',
            borderWidth: 4,
            gapWidth: 4
          }
        },
        {
          colorSaturation: [0.3, 0.6],
          itemStyle: {
            borderColorSaturation: 0.7,
            gapWidth: 2,
            borderWidth: 2
          }
        }
      ]
    }]
  };
  
  charts.treemap.setOption(option, { notMerge: true });
}

function renderTrendsChart() {
  if (allHistory.length < 2 || state.snapshotDate !== manifest.latest) {
    document.getElementById('trends-card').style.display = 'none';
    return;
  }
  
  document.getElementById('trends-card').style.display = 'block';
  
  if (!charts.trends) {
    charts.trends = echarts.init(document.getElementById('trends-chart'));
  }
  
  const orgs = getVisibleOrgs();
  const dates = allHistory.map(h => h.date);
  
  const series = orgs.map(org => {
    const data = allHistory.map(h => {
      let total = 0;
      for (const repoData of Object.values(h.data.repos)) {
        total += repoData[state.trendMetric]?.[org] || 0;
      }
      return total;
    });
    
    return {
      name: org,
      type: 'line',
      data: data,
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: { width: 2, color: colorMap[org] },
      itemStyle: { color: colorMap[org] },
      emphasis: { focus: 'series' }
    };
  });
  
  const option = {
    tooltip: {
      trigger: 'axis'
    },
    legend: {
      type: 'scroll',
      bottom: 0,
      selected: state.focusOrg ? Object.fromEntries(orgs.map(o => [o, o === state.focusOrg])) : undefined
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '15%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: dates,
      boundaryGap: false
    },
    yAxis: {
      type: 'value',
      name: 'Count'
    },
    series: series
  };
  
  charts.trends.setOption(option, { notMerge: true });
}

function renderTable() {
  const orgs = getVisibleOrgs();
  const repoData = getRepoData(state.repo);
  
  const rows = orgs.map(org => {
    const row = { org };
    let total = 0;
    METRICS.forEach(m => {
      const val = repoData[m.key]?.[org] || 0;
      row[m.key] = val;
      total += val;
    });
    row.total = total;
    
    // Build sparkline data
    row.sparkline = allHistory.map(h => {
      let t = 0;
      if (state.repo === 'all_repos') {
        for (const r of Object.values(h.data.repos)) {
          t += r.pull_requests?.[org] || 0;
        }
      } else {
        t = h.data.repos[state.repo]?.pull_requests?.[org] || 0;
      }
      return t;
    });
    
    return row;
  }).filter(r => r.total > 0);
  
  // Sort
  rows.sort((a, b) => {
    const col = state.sortColumn;
    if (col === 'org') {
      return state.sortAscending ? a.org.localeCompare(b.org) : b.org.localeCompare(a.org);
    } else {
      return state.sortAscending ? a[col] - b[col] : b[col] - a[col];
    }
  });
  
  const tbody = document.querySelector('#org-table tbody');
  tbody.innerHTML = '';
  
  rows.forEach(row => {
    const tr = document.createElement('tr');
    if (row.org === 'ECMWF') tr.classList.add('ecmwf');
    if (state.focusOrg && row.org !== state.focusOrg) tr.classList.add('dimmed');
    
    tr.innerHTML = `
      <td>${row.org}</td>
      <td>${row.issues.toLocaleString()}</td>
      <td>${row.pull_requests.toLocaleString()}</td>
      <td>${row.total_reviews.toLocaleString()}</td>
      <td>${row.unique_reviews.toLocaleString()}</td>
      <td><strong>${row.total.toLocaleString()}</strong></td>
      <td>${renderSparkline(row.sparkline)}</td>
    `;
    
    tbody.appendChild(tr);
  });
  
  // Setup sort handlers
  document.querySelectorAll('#org-table th[data-sort]').forEach(th => {
    th.onclick = () => {
      const col = th.dataset.sort;
      if (state.sortColumn === col) {
        state.sortAscending = !state.sortAscending;
      } else {
        state.sortColumn = col;
        state.sortAscending = false;
      }
      renderTable();
    };
  });
}

function renderSparkline(data) {
  if (data.length === 0) return '';
  
  const max = Math.max(...data, 1);
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 80;
    const y = 24 - (v / max) * 20;
    return `${x},${y}`;
  }).join(' ');
  
  return `<svg class="sparkline" viewBox="0 0 80 24">
    <polyline fill="none" stroke="#2563eb" stroke-width="1.5" points="${points}"/>
  </svg>`;
}

// ============================================================================
// Window resize handling
// ============================================================================

window.addEventListener('resize', () => {
  Object.values(charts).forEach(chart => chart.resize());
});

// ============================================================================
// Expose to window so the per-section modules can read live state via __getCtx
// ============================================================================
window.state = state;
window.METRICS = METRICS;
window.HIDDEN_ORGS = HIDDEN_ORGS;
window.renderAll = renderAll;

Object.defineProperty(window, 'currentSnapshot', { get: () => currentSnapshot });
Object.defineProperty(window, 'allHistory',      { get: () => allHistory });
Object.defineProperty(window, 'allOrgs',         { get: () => allOrgs });
Object.defineProperty(window, 'colorMap',        { get: () => colorMap });

// ============================================================================
// Start
// ============================================================================

init();
