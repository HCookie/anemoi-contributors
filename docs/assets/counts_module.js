// Counts & Composition Deep Dive Module
window.COUNTS_MODULE = {
  id: 'counts-module',

  // Internal state
  _charts: {},
  _internalMetric: 'issues',

  template() {
    return `
      <div class="card">
        <div class="card-header">
          <h2>Counts & Composition Deep Dive</h2>
          <div class="pill-group" id="counts-mod-metric-pills"></div>
        </div>

        <style>
          .counts-mod-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
          }
          .counts-mod-radar-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
            margin-top: 10px;
          }
          .counts-mod-radar-item {
            background: var(--bg-tint);
            padding: 12px;
            border-radius: 8px;
          }
          .counts-mod-radar-title {
            font-size: 0.9rem;
            font-weight: 600;
            text-align: center;
            margin-bottom: 8px;
            color: var(--text);
          }
          .counts-mod-section {
            margin-bottom: 30px;
            padding: 20px;
            background: var(--bg-tint);
            border-radius: 8px;
          }
          .counts-mod-section-title {
            font-size: 1.1rem;
            font-weight: 600;
            margin-bottom: 16px;
            color: var(--text);
          }
          .counts-mod-chart {
            width: 100%;
            height: 300px;
          }
          .counts-mod-chart-large {
            width: 100%;
            height: 400px;
          }
          .counts-mod-empty {
            text-align: center;
            color: var(--text-light);
            padding: 40px;
            font-size: 0.95rem;
          }
          .counts-mod-note {
            text-align: center;
            color: var(--text-light);
            padding: 20px;
            font-size: 0.9rem;
            font-style: italic;
          }
          .counts-mod-info {
            display: inline-block;
            margin-left: 6px;
            cursor: help;
            color: var(--accent);
            font-weight: bold;
            font-size: 0.85em;
          }
          .counts-mod-toggle-group {
            display: flex;
            gap: 12px;
            align-items: center;
            margin-bottom: 12px;
          }
          .counts-mod-toggle-label {
            font-size: 0.9rem;
            color: var(--text);
          }
        </style>

        <div class="counts-mod-section">
          <div class="counts-mod-section-title">1. Per-Repo Activity Shape (Radar)</div>
          <div id="counts-mod-radar-container"></div>
        </div>

        <div class="counts-mod-grid">
          <div>
            <div class="counts-mod-section-title">
              2. Contribution Concentration
              <span class="counts-mod-info" title="Gini coefficient: 0 = perfectly equal distribution, 1 = all activity from one org">ⓘ</span>
            </div>
            <div id="counts-mod-gini" class="counts-mod-chart"></div>
          </div>

          <div>
            <div class="counts-mod-section-title">3. PR vs Review Engagement</div>
            <div class="counts-mod-toggle-group">
              <label class="toggle counts-mod-toggle-label">
                <input type="checkbox" id="counts-mod-log-toggle">
                <span>Log scale</span>
              </label>
            </div>
            <div id="counts-mod-scatter" class="counts-mod-chart"></div>
          </div>
        </div>

        <div class="counts-mod-section">
          <div class="counts-mod-section-title">4. Issue → PR Funnel by Repo</div>
          <div id="counts-mod-funnel" class="counts-mod-chart-large"></div>
        </div>

        <div class="counts-mod-section" id="counts-mod-bump-section">
          <div class="counts-mod-section-title">5. Ranking Changes (First vs Latest Snapshot)</div>
          <div id="counts-mod-bump" class="counts-mod-chart-large"></div>
        </div>

        <div class="counts-mod-section" id="counts-mod-heatmap-section">
          <div class="counts-mod-section-title">6. Activity Intensity Heatmap (Orgs × Repos)</div>
          <div id="counts-mod-heatmap" class="counts-mod-chart-large"></div>
        </div>
      </div>
    `;
  },

  mount(rootEl) {
    const self = this;

    // Setup metric pills
    const metricPills = rootEl.querySelector('#counts-mod-metric-pills');
    const METRICS = window.__getCtx().METRICS;

    METRICS.forEach(m => {
      const pill = document.createElement('button');
      pill.className = `pill ${m.key === self._internalMetric ? 'active' : ''}`;
      pill.textContent = m.label;
      pill.dataset.value = m.key;
      pill.addEventListener('click', () => {
        self._internalMetric = m.key;
        metricPills.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        self.render(window.__getCtx());
      });
      metricPills.appendChild(pill);
    });

    // Log scale toggle for scatter
    const logToggle = rootEl.querySelector('#counts-mod-log-toggle');
    logToggle.addEventListener('change', () => {
      self.render(window.__getCtx());
    });

    // Resize handler
    this._resizeHandler = () => {
      Object.values(self._charts).forEach(chart => {
        if (chart && chart.resize) chart.resize();
      });
    };
    window.addEventListener('resize', this._resizeHandler);
  },

  render(ctx) {
    this._renderRadar(ctx);
    this._renderGini(ctx);
    this._renderScatter(ctx);
    this._renderFunnel(ctx);
    this._renderBump(ctx);
    this._renderHeatmap(ctx);
  },

  // ============================================================================
  // 1. Per-Repo Radar (small multiples)
  // ============================================================================
  _renderRadar(ctx) {
    const container = document.getElementById('counts-mod-radar-container');
    if (!container) return;

    const repos = Object.keys(ctx.snapshot.repos);
    const orgs = ctx.allOrgs.filter(org => !ctx.state.hideBots || !ctx.HIDDEN_ORGS.includes(org));

    // Find top N orgs by total across all metrics and repos
    const orgTotals = {};
    orgs.forEach(org => {
      let total = 0;
      repos.forEach(repo => {
        const repoData = ctx.snapshot.repos[repo];
        ['issues', 'pull_requests', 'total_reviews', 'unique_reviews'].forEach(metric => {
          total += repoData[metric]?.[org] || 0;
        });
      });
      orgTotals[org] = total;
    });

    const topOrgs = orgs
      .filter(o => orgTotals[o] > 0)
      .sort((a, b) => orgTotals[b] - orgTotals[a])
      .slice(0, 6);

    if (topOrgs.length === 0) {
      container.innerHTML = '<div class="counts-mod-empty">No data available</div>';
      return;
    }

    // Dispose old radar chart instances
    Object.keys(this._charts).forEach(id => {
      if (id.startsWith('counts-mod-radar-')) {
        try { this._charts[id].dispose(); } catch (_) {}
        delete this._charts[id];
      }
    });

    container.innerHTML = '<div class="counts-mod-radar-grid"></div>';
    const grid = container.querySelector('.counts-mod-radar-grid');

    repos.forEach(repo => {
      const slug = repo.replace(/[^A-Za-z0-9_-]/g, '_');
      const chartId = `counts-mod-radar-${slug}`;

      const item = document.createElement('div');
      item.className = 'counts-mod-radar-item';
      item.innerHTML = `
        <div class="counts-mod-radar-title">${repo}</div>
        <div id="${chartId}" style="height: 260px;"></div>
      `;
      grid.appendChild(item);

      const chartEl = document.getElementById(chartId);
      if (!chartEl) return;
      const chart = echarts.init(chartEl);
      this._charts[chartId] = chart;

      const repoData = ctx.snapshot.repos[repo];

      // Per-repo max so each radar fills its own space
      const repoMax = { issues: 0, pull_requests: 0, total_reviews: 0, unique_reviews: 0 };
      ['issues', 'pull_requests', 'total_reviews', 'unique_reviews'].forEach(metric => {
        topOrgs.forEach(org => {
          repoMax[metric] = Math.max(repoMax[metric], repoData[metric]?.[org] || 0);
        });
      });

      const indicators = [
        { name: 'Issues',    max: repoMax.issues || 1 },
        { name: 'PRs',       max: repoMax.pull_requests || 1 },
        { name: 'Total rev', max: repoMax.total_reviews || 1 },
        { name: 'Uniq rev',  max: repoMax.unique_reviews || 1 }
      ];

      const data = topOrgs.map(org => ({
        name: org,
        value: [
          repoData.issues?.[org] || 0,
          repoData.pull_requests?.[org] || 0,
          repoData.total_reviews?.[org] || 0,
          repoData.unique_reviews?.[org] || 0
        ],
        lineStyle: { color: ctx.colorMap[org], width: 1.5 },
        areaStyle: { color: ctx.colorMap[org], opacity: 0.10 },
        itemStyle: { color: ctx.colorMap[org] }
      }));

      chart.setOption({
        tooltip: { trigger: 'item' },
        radar: {
          indicator: indicators,
          radius: '60%',
          splitNumber: 3,
          axisName: { fontSize: 10, color: '#6B7783' },
          splitLine: { lineStyle: { color: '#E8EDF2' } },
          splitArea: { areaStyle: { color: ['#FFFFFF', '#F4F7FA'] } },
          axisLine: { lineStyle: { color: '#E8EDF2' } }
        },
        series: [{
          type: 'radar',
          symbolSize: 4,
          data
        }]
      }, { notMerge: true });
    });
  },

  // ============================================================================
  // 2. Contribution Concentration (Gini coefficient)
  // ============================================================================
  _renderGini(ctx) {
    const chart = this._getChart('counts-mod-gini');
    if (!chart) return;

    const repos = Object.keys(ctx.snapshot.repos);
    const metric = this._internalMetric;
    const orgs = ctx.allOrgs.filter(org => !ctx.state.hideBots || !ctx.HIDDEN_ORGS.includes(org));

    const giniData = repos.map(repo => {
      const repoData = ctx.snapshot.repos[repo];
      const values = orgs.map(org => repoData[metric]?.[org] || 0).filter(v => v > 0);
      const gini = values.length > 0 ? this._calculateGini(values) : 0;
      return { repo, gini };
    });

    if (giniData.every(d => d.gini === 0)) {
      chart.setOption({
        title: { text: 'No data', left: 'center', top: 'middle', textStyle: { color: '#999' } },
        series: []
      }, { notMerge: true });
      return;
    }

    chart.setOption({
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params) => {
          const gini = params[0].value;
          const interpretation = this._giniInterpretation(gini);
          return `${params[0].name}<br/>Gini: ${gini.toFixed(3)}<br/>${interpretation}`;
        }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '15%',
        top: '10%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: giniData.map(d => d.repo),
        axisLabel: { rotate: 45, interval: 0 }
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 1,
        axisLabel: { formatter: '{value}' }
      },
      series: [{
        type: 'bar',
        data: giniData.map(d => ({
          value: d.gini,
          itemStyle: { color: this._giniColor(d.gini) }
        })),
        barMaxWidth: 40
      }]
    }, { notMerge: true });
  },

  _calculateGini(values) {
    if (values.length === 0) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const n = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);
    if (sum === 0) return 0;

    let numerator = 0;
    sorted.forEach((val, i) => {
      numerator += (i + 1) * val;
    });

    return (2 * numerator) / (n * sum) - (n + 1) / n;
  },

  _giniColor(gini) {
    if (gini < 0.3) return '#10b981'; // green - very equal
    if (gini < 0.6) return '#f59e0b'; // amber - moderate
    return '#ef4444'; // red - concentrated
  },

  _giniInterpretation(gini) {
    if (gini < 0.3) return 'Very equal distribution';
    if (gini < 0.6) return 'Moderate concentration';
    return 'Concentrated distribution';
  },

  // ============================================================================
  // 3. PR vs Review Engagement (scatter)
  // ============================================================================
  _renderScatter(ctx) {
    const chart = this._getChart('counts-mod-scatter');
    if (!chart) return;

    const logToggle = document.getElementById('counts-mod-log-toggle');
    const useLog = logToggle && logToggle.checked;

    const repoData = this._getRepoData(ctx, 'all_repos');
    const orgs = ctx.allOrgs.filter(org => !ctx.state.hideBots || !ctx.HIDDEN_ORGS.includes(org));

    const data = orgs.map(org => {
      const prs = repoData.pull_requests?.[org] || 0;
      const reviews = repoData.total_reviews?.[org] || 0;
      const issues = repoData.issues?.[org] || 0;
      const total = prs + reviews + issues;
      return {
        name: org,
        value: [prs, reviews, total],
        itemStyle: { color: ctx.colorMap[org] }
      };
    }).filter(d => d.value[0] > 0 || d.value[1] > 0);

    if (data.length === 0) {
      chart.setOption({
        title: { text: 'No data', left: 'center', top: 'middle', textStyle: { color: '#999' } },
        series: []
      }, { notMerge: true });
      return;
    }

    chart.setOption({
      tooltip: {
        trigger: 'item',
        formatter: (params) => {
          return `${params.data.name}<br/>PRs: ${params.value[0]}<br/>Reviews: ${params.value[1]}<br/>Total activity: ${params.value[2]}`;
        }
      },
      grid: {
        left: '10%',
        right: '4%',
        bottom: '10%',
        top: '5%',
        containLabel: true
      },
      xAxis: {
        type: useLog ? 'log' : 'value',
        name: 'Pull Requests',
        nameLocation: 'middle',
        nameGap: 25,
        min: useLog ? 1 : 0
      },
      yAxis: {
        type: useLog ? 'log' : 'value',
        name: 'Total Reviews',
        nameLocation: 'middle',
        nameGap: 40,
        min: useLog ? 1 : 0
      },
      series: [{
        type: 'scatter',
        symbolSize: (val) => Math.sqrt(val[2]) * 2,
        data: data
      }]
    }, { notMerge: true });
  },

  // ============================================================================
  // 4. Issue → PR Funnel by Repo
  // ============================================================================
  _renderFunnel(ctx) {
    const chart = this._getChart('counts-mod-funnel');
    if (!chart) return;

    const repos = Object.keys(ctx.snapshot.repos);
    const orgs = ctx.allOrgs.filter(org => !ctx.state.hideBots || !ctx.HIDDEN_ORGS.includes(org));

    const funnelData = repos.map(repo => {
      const repoData = ctx.snapshot.repos[repo];
      let issues = 0;
      let prs = 0;
      orgs.forEach(org => {
        issues += repoData.issues?.[org] || 0;
        prs += repoData.pull_requests?.[org] || 0;
      });
      return { repo, issues, prs };
    });

    if (funnelData.every(d => d.issues === 0 && d.prs === 0)) {
      chart.setOption({
        title: { text: 'No data', left: 'center', top: 'middle', textStyle: { color: '#999' } },
        series: []
      }, { notMerge: true });
      return;
    }

    chart.setOption({
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params) => {
          const repo = params[0].name;
          const issues = params.find(p => p.seriesName === 'Issues')?.value || 0;
          const prs = params.find(p => p.seriesName === 'PRs')?.value || 0;
          return `${repo}<br/>Issues: ${issues}<br/>PRs: ${prs}`;
        }
      },
      legend: {
        data: ['Issues', 'PRs'],
        bottom: 0
      },
      grid: {
        left: '15%',
        right: '4%',
        bottom: '10%',
        top: '5%',
        containLabel: true
      },
      yAxis: {
        type: 'category',
        data: funnelData.map(d => d.repo)
      },
      xAxis: {
        type: 'value'
      },
      series: [
        {
          name: 'Issues',
          type: 'bar',
          data: funnelData.map(d => d.issues),
          itemStyle: { color: '#3b82f6' }
        },
        {
          name: 'PRs',
          type: 'bar',
          data: funnelData.map(d => d.prs),
          itemStyle: { color: '#10b981' }
        }
      ]
    }, { notMerge: true });
  },

  // ============================================================================
  // 5. Ranking Changes (bump chart)
  // ============================================================================
  _renderBump(ctx) {
    const section = document.getElementById('counts-mod-bump-section');
    const chart = this._getChart('counts-mod-bump');
    if (!chart || !section) return;

    if (ctx.history.length < 2) {
      section.innerHTML = `
        <div class="counts-mod-section-title">5. Ranking Changes (First vs Latest Snapshot)</div>
        <div class="counts-mod-note">Need at least 2 snapshots for ranking comparison</div>
      `;
      return;
    }

    section.innerHTML = `
      <div class="counts-mod-section-title">5. Ranking Changes (First vs Latest Snapshot)</div>
      <div id="counts-mod-bump" class="counts-mod-chart-large"></div>
    `;

    // Re-init chart after DOM update
    this._charts['counts-mod-bump'] = echarts.init(document.getElementById('counts-mod-bump'));
    const bumpChart = this._charts['counts-mod-bump'];

    const firstSnapshot = ctx.history[0].data;
    const latestSnapshot = ctx.history[ctx.history.length - 1].data;
    const metric = this._internalMetric;

    const repos = Object.keys(ctx.snapshot.repos);
    const orgs = ctx.allOrgs.filter(org => !ctx.state.hideBots || !ctx.HIDDEN_ORGS.includes(org));

    // Calculate totals for first and latest snapshots
    const calcTotals = (snapshot) => {
      const totals = {};
      orgs.forEach(org => {
        let total = 0;
        repos.forEach(repo => {
          const repoData = snapshot.repos[repo];
          if (repoData && repoData[metric]) {
            total += repoData[metric][org] || 0;
          }
        });
        totals[org] = total;
      });
      return totals;
    };

    const firstTotals = calcTotals(firstSnapshot);
    const latestTotals = calcTotals(latestSnapshot);

    // Get top orgs from latest
    const topOrgs = orgs
      .filter(o => latestTotals[o] > 0 || firstTotals[o] > 0)
      .sort((a, b) => latestTotals[b] - latestTotals[a])
      .slice(0, 10);

    if (topOrgs.length === 0) {
      bumpChart.setOption({
        title: { text: 'No data', left: 'center', top: 'middle', textStyle: { color: '#999' } },
        series: []
      }, { notMerge: true });
      return;
    }

    // Calculate ranks
    const calcRanks = (totals) => {
      const sorted = Object.entries(totals)
        .filter(([org, _]) => topOrgs.includes(org))
        .sort((a, b) => b[1] - a[1]);
      const ranks = {};
      sorted.forEach(([org, _], idx) => {
        ranks[org] = idx + 1;
      });
      return ranks;
    };

    const firstRanks = calcRanks(firstTotals);
    const latestRanks = calcRanks(latestTotals);

    const series = topOrgs.map(org => {
      const firstRank = firstRanks[org] || topOrgs.length + 1;
      const latestRank = latestRanks[org] || topOrgs.length + 1;
      const change = firstRank - latestRank;

      let color = '#9ca3af'; // unchanged
      if (change > 0) color = '#10b981'; // climbed
      if (change < 0) color = '#ef4444'; // dropped

      return {
        name: org,
        type: 'line',
        data: [firstRank, latestRank],
        lineStyle: { color: color, width: 2 },
        itemStyle: { color: color },
        symbol: 'circle',
        symbolSize: 8,
        label: {
          show: true,
          formatter: (params) => {
            if (params.dataIndex === 0) return `${org} (#${params.value})`;
            return `#${params.value}`;
          },
          position: params => params.dataIndex === 0 ? 'left' : 'right',
          fontSize: 11
        }
      };
    });

    bumpChart.setOption({
      tooltip: {
        trigger: 'item',
        formatter: (params) => {
          const org = params.seriesName;
          const rankChange = firstRanks[org] - latestRanks[org];
          const arrow = rankChange > 0 ? '↑' : rankChange < 0 ? '↓' : '→';
          return `${org}<br/>First: #${firstRanks[org]}<br/>Latest: #${latestRanks[org]}<br/>${arrow} ${Math.abs(rankChange)}`;
        }
      },
      grid: {
        left: '20%',
        right: '20%',
        bottom: '5%',
        top: '5%',
        containLabel: false
      },
      xAxis: {
        type: 'category',
        data: [ctx.history[0].date, ctx.history[ctx.history.length - 1].date],
        boundaryGap: false,
        axisLabel: { fontSize: 11 }
      },
      yAxis: {
        type: 'value',
        inverse: true,
        min: 1,
        max: topOrgs.length,
        interval: 1,
        axisLabel: { formatter: '#{value}' }
      },
      series: series
    }, { notMerge: true });
  },

  // ============================================================================
  // 6. Activity Heatmap
  // ============================================================================
  _renderHeatmap(ctx) {
    const section = document.getElementById('counts-mod-heatmap-section');
    const chart = this._getChart('counts-mod-heatmap');
    if (!chart || !section) return;

    if (ctx.state.repo !== 'all_repos') {
      section.innerHTML = '<div class="counts-mod-note">Heatmap is only shown when "All Repos" is selected</div>';
      return;
    }

    section.innerHTML = `
      <div class="counts-mod-section-title">6. Activity Intensity Heatmap (Orgs × Repos)</div>
      <div id="counts-mod-heatmap" class="counts-mod-chart-large"></div>
    `;

    // Re-init chart after DOM update
    this._charts['counts-mod-heatmap'] = echarts.init(document.getElementById('counts-mod-heatmap'));
    const heatChart = this._charts['counts-mod-heatmap'];

    const repos = Object.keys(ctx.snapshot.repos);
    const metric = this._internalMetric;

    // Calculate org totals to sort
    const orgs = ctx.allOrgs.filter(org => !ctx.state.hideBots || !ctx.HIDDEN_ORGS.includes(org));
    const orgTotals = {};
    orgs.forEach(org => {
      let sum = 0;
      repos.forEach(repo => {
        sum += ctx.snapshot.repos[repo][metric]?.[org] || 0;
      });
      orgTotals[org] = sum;
    });

    const sortedOrgs = orgs
      .filter(o => orgTotals[o] > 0)
      .sort((a, b) => orgTotals[b] - orgTotals[a]);

    if (sortedOrgs.length === 0) {
      heatChart.setOption({
        title: { text: 'No data', left: 'center', top: 'middle', textStyle: { color: '#999' } },
        series: []
      }, { notMerge: true });
      return;
    }

    const data = [];
    let maxValue = 0;

    sortedOrgs.forEach((org, orgIdx) => {
      repos.forEach((repo, repoIdx) => {
        const value = ctx.snapshot.repos[repo][metric]?.[org] || 0;
        data.push([repoIdx, orgIdx, value]);
        maxValue = Math.max(maxValue, value);
      });
    });

    heatChart.setOption({
      tooltip: {
        position: 'top',
        formatter: (params) => {
          const [repoIdx, orgIdx, value] = params.value;
          return `${sortedOrgs[orgIdx]} × ${repos[repoIdx]}<br/>${metric}: ${value}`;
        }
      },
      grid: {
        left: '15%',
        right: '4%',
        bottom: '10%',
        top: '5%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: repos,
        axisLabel: { rotate: 45, interval: 0 }
      },
      yAxis: {
        type: 'category',
        data: sortedOrgs,
        axisLabel: { interval: 0 }
      },
      visualMap: {
        min: 0,
        max: maxValue,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: '0%',
        inRange: {
          color: ['#f0f0f0', '#d4e4f7', '#91c7e8', '#5a9fd4', '#2563eb', '#1d4ed8']
        }
      },
      series: [{
        type: 'heatmap',
        data: data,
        label: {
          show: false
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        }
      }]
    }, { notMerge: true });
  },

  // ============================================================================
  // Helpers
  // ============================================================================
  _getChart(id) {
    if (!this._charts[id]) {
      const el = document.getElementById(id);
      if (el) {
        this._charts[id] = echarts.init(el);
      }
    }
    return this._charts[id];
  },

  _getRepoData(ctx, repo) {
    if (repo === 'all_repos') {
      const agg = {};
      ['issues', 'pull_requests', 'total_reviews', 'unique_reviews'].forEach(m => {
        agg[m] = {};
        for (const repoData of Object.values(ctx.snapshot.repos)) {
          if (repoData[m]) {
            for (const [org, count] of Object.entries(repoData[m])) {
              agg[m][org] = (agg[m][org] || 0) + count;
            }
          }
        }
      });
      return agg;
    } else {
      return ctx.snapshot.repos[repo] || {};
    }
  }
};

// Expose a global getter for context (to be called by app.js or inline)
if (!window.__getCtx) {
  window.__getCtx = function() {
    // This will be overridden by the main app if integrated
    return {
      snapshot: window.currentSnapshot || {},
      history: window.allHistory || [],
      state: window.state || {},
      colorMap: window.colorMap || {},
      allOrgs: window.allOrgs || [],
      HIDDEN_ORGS: window.HIDDEN_ORGS || [],
      METRICS: window.METRICS || [],
      echarts: window.echarts
    };
  };
}
