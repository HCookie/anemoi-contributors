// PR Types Deep Dive Module
// Self-contained module for comprehensive PR type analysis

window.TYPES_MODULE = (() => {
  'use strict';

  // Module state
  const moduleState = {
    includeBots: false,
    trendMode: 'counts'
  };

  // Type color palette (consistent across all charts)
  const TYPE_COLORS = {
    feat: '#16a34a',      // green
    fix: '#dc2626',       // red
    refactor: '#9333ea',  // purple
    perf: '#ea580c',      // orange
    test: '#eab308',      // yellow
    docs: '#2563eb',      // blue
    ci: '#0891b2',        // cyan
    build: '#be123c',     // rose
    chore: '#6b7280',     // gray
    style: '#db2777',     // pink
    other: '#334155'      // slate
  };

  const PR_TYPE_ORDER = ['feat', 'fix', 'refactor', 'perf', 'test', 'docs', 'ci', 'build', 'chore', 'style'];

  // Chart instances
  const charts = {};

  // ============================================================================
  // Template
  // ============================================================================

  function template() {
    return `
      <style>
        .types-mod-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        .types-mod-header h2 {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 600;
        }
        .types-mod-toggle {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.9rem;
        }
        .types-mod-toggle input[type="checkbox"] {
          width: 40px;
          height: 22px;
          appearance: none;
          background: var(--border-1);
          border-radius: 11px;
          position: relative;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .types-mod-toggle input[type="checkbox"]:checked {
          background: var(--accent-primary);
        }
        .types-mod-toggle input[type="checkbox"]::before {
          content: '';
          position: absolute;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: white;
          top: 3px;
          left: 3px;
          transition: all 0.15s ease;
        }
        .types-mod-toggle input[type="checkbox"]:checked::before {
          transform: translateX(18px);
        }
        .types-mod-grid {
          display: grid;
          gap: 20px;
        }
        .types-mod-grid-2 {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(450px, 1fr));
          gap: 20px;
          margin-bottom: 20px;
        }
        .types-mod-subcard {
          background: var(--bg-tint);
          padding: 16px;
          border-radius: 8px;
        }
        .types-mod-subcard h3 {
          font-size: 1rem;
          font-weight: 600;
          margin-bottom: 12px;
        }
        .types-mod-chart {
          width: 100%;
          height: 400px;
        }
        .types-mod-chart-sm {
          width: 100%;
          height: 300px;
        }
        .types-mod-chart-xs {
          width: 100%;
          height: 200px;
        }
        .types-mod-repo-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 16px;
          margin-top: 12px;
        }
        .types-mod-repo-item h4 {
          font-size: 0.85rem;
          font-weight: 600;
          margin-bottom: 8px;
          color: var(--fg-1);
        }
        .types-mod-controls {
          display: flex;
          gap: 8px;
          margin-bottom: 12px;
        }
        .types-mod-placeholder {
          padding: 40px;
          text-align: center;
          color: var(--fg-2);
          font-style: italic;
        }
        .types-mod-balance-bar {
          display: flex;
          align-items: center;
          margin-bottom: 8px;
        }
        .types-mod-balance-label {
          width: 120px;
          font-size: 0.9rem;
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .types-mod-balance-track {
          flex: 1;
          height: 24px;
          display: flex;
          position: relative;
          background: var(--bg-tint);
          border-radius: 4px;
          overflow: hidden;
        }
        .types-mod-balance-feat,
        .types-mod-balance-fix {
          height: 100%;
          transition: width 0.3s ease;
        }
        .types-mod-balance-feat {
          background: #16a34a;
        }
        .types-mod-balance-fix {
          background: #dc2626;
        }
        .types-mod-balance-midline {
          position: absolute;
          left: 50%;
          top: 0;
          bottom: 0;
          width: 2px;
          background: var(--fg-1);
          opacity: 0.5;
        }
        .types-mod-balance-count {
          width: 80px;
          text-align: right;
          font-size: 0.85rem;
          color: var(--fg-2);
        }
      </style>
      
      <div class="card">
        <div class="types-mod-header">
          <h2>PR Types Deep Dive</h2>
          <label class="types-mod-toggle">
            <input type="checkbox" id="types-mod-include-bots">
            <span>Include bots in PR-type data</span>
          </label>
        </div>
        
        <div class="types-mod-grid">
          <!-- 1. Project-wide PR type composition -->
          <div class="types-mod-subcard">
            <h3>Project-wide PR type composition</h3>
            <div id="types-mod-chart-composition" class="types-mod-chart-sm"></div>
          </div>
          
          <!-- 2 & 3 in grid -->
          <div class="types-mod-grid-2">
            <div class="types-mod-subcard">
              <h3>Organisation PR-type personality</h3>
              <div id="types-mod-chart-personality" class="types-mod-chart"></div>
            </div>
            
            <div class="types-mod-subcard">
              <h3>PR-type trends over time</h3>
              <div class="types-mod-controls">
                <button class="pill active" data-trend-mode="counts">Counts</button>
                <button class="pill" data-trend-mode="percent">Percent</button>
              </div>
              <div id="types-mod-chart-trends" class="types-mod-chart"></div>
              <div id="types-mod-trends-placeholder" class="types-mod-placeholder" style="display: none;">
                Not enough historical data (need at least 2 snapshots)
              </div>
            </div>
          </div>
          
          <!-- 4. Type breakdown per repo -->
          <div class="types-mod-subcard" id="types-mod-repo-breakdown">
            <h3>Type breakdown per repository</h3>
            <div id="types-mod-repo-grid" class="types-mod-repo-grid"></div>
            <div id="types-mod-single-repo-chart" class="types-mod-chart-sm" style="display: none;"></div>
          </div>
          
          <!-- 5. Org specialisation heatmap -->
          <div class="types-mod-subcard">
            <h3>Organisation specialisation heatmap</h3>
            <div id="types-mod-chart-heatmap" class="types-mod-chart"></div>
          </div>
          
          <!-- 6. Feat vs Fix balance -->
          <div class="types-mod-subcard">
            <h3>Feature vs Fix Balance (Innovators vs Stabilizers)</h3>
            <div id="types-mod-balance-container"></div>
          </div>
        </div>
      </div>
    `;
  }

  // ============================================================================
  // Mount (setup event handlers)
  // ============================================================================

  function mount(rootEl) {
    // Toggle handler
    const toggle = rootEl.querySelector('#types-mod-include-bots');
    toggle.checked = moduleState.includeBots;
    toggle.addEventListener('change', (e) => {
      moduleState.includeBots = e.target.checked;
      const ctx = window.__getCtx();
      if (ctx) render(ctx);
    });

    // Trend mode handlers
    rootEl.querySelectorAll('[data-trend-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        moduleState.trendMode = btn.dataset.trendMode;
        rootEl.querySelectorAll('[data-trend-mode]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const ctx = window.__getCtx();
        if (ctx) renderTrendsChart(ctx);
      });
    });

    // Resize handler
    const resizeHandler = () => {
      Object.values(charts).forEach(chart => {
        if (chart && typeof chart.resize === 'function') {
          chart.resize();
        }
      });
    };
    window.addEventListener('resize', resizeHandler);

    // Store cleanup
    rootEl._cleanup = () => {
      window.removeEventListener('resize', resizeHandler);
      Object.values(charts).forEach(chart => {
        if (chart && typeof chart.dispose === 'function') {
          chart.dispose();
        }
      });
    };
  }

  // ============================================================================
  // Data Helpers
  // ============================================================================

  function getFilteredOrgs(ctx) {
    const hiddenOrgs = moduleState.includeBots ? [] : ctx.HIDDEN_ORGS;
    return ctx.allOrgs.filter(org => !hiddenOrgs.includes(org));
  }

  function getPRTypeData(ctx, repo) {
    const { snapshot } = ctx;
    if (repo === 'all_repos') {
      const agg = {};
      for (const repoData of Object.values(snapshot.repos)) {
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
      return snapshot.repos[repo]?.pull_requests_by_type || {};
    }
  }

  function getOrderedTypes(prTypeData) {
    const types = Object.keys(prTypeData);
    const ordered = PR_TYPE_ORDER.filter(t => types.includes(t));
    const other = types.filter(t => !PR_TYPE_ORDER.includes(t) && t !== 'other').sort();
    if (types.includes('other')) other.push('other');
    return [...ordered, ...other];
  }

  function sumTypeAcrossOrgs(prTypeData, type, orgs) {
    return orgs.reduce((sum, org) => sum + (prTypeData[type]?.[org] || 0), 0);
  }

  // ============================================================================
  // Render
  // ============================================================================

  function render(ctx) {
    renderCompositionChart(ctx);
    renderPersonalityChart(ctx);
    renderTrendsChart(ctx);
    renderRepoBreakdown(ctx);
    renderHeatmapChart(ctx);
    renderBalanceChart(ctx);
  }

  // ============================================================================
  // 1. Project-wide PR type composition (donut)
  // ============================================================================

  function renderCompositionChart(ctx) {
    const el = document.getElementById('types-mod-chart-composition');
    if (!el) return;

    if (!charts.composition) {
      charts.composition = echarts.init(el);
    }

    const orgs = getFilteredOrgs(ctx);
    const prTypeData = getPRTypeData(ctx, ctx.state.repo);
    const types = getOrderedTypes(prTypeData);

    const data = types.map(type => {
      const value = sumTypeAcrossOrgs(prTypeData, type, orgs);
      return {
        name: type,
        value: value,
        itemStyle: { color: TYPE_COLORS[type] || TYPE_COLORS.other }
      };
    }).filter(d => d.value > 0);

    const total = data.reduce((sum, d) => sum + d.value, 0);

    const option = {
      tooltip: {
        trigger: 'item',
        formatter: (params) => {
          const pct = ((params.value / total) * 100).toFixed(1);
          return `${params.name}: ${params.value} (${pct}%)`;
        }
      },
      legend: {
        type: 'scroll',
        orient: 'vertical',
        right: 10,
        top: 20,
        bottom: 20
      },
      series: [{
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
        },
        label: {
          formatter: '{b}: {d}%'
        }
      }]
    };

    charts.composition.setOption(option, { notMerge: true });
  }

  // ============================================================================
  // 2. Org PR-type personality (stacked horizontal bar, percent)
  // ============================================================================

  function renderPersonalityChart(ctx) {
    const el = document.getElementById('types-mod-chart-personality');
    if (!el) return;

    if (!charts.personality) {
      charts.personality = echarts.init(el);
    }

    const orgs = getFilteredOrgs(ctx);
    const prTypeData = getPRTypeData(ctx, ctx.state.repo);
    const types = getOrderedTypes(prTypeData);

    // Calculate total PRs per org
    const orgTotals = orgs.map(org => {
      const total = types.reduce((sum, type) => sum + (prTypeData[type]?.[org] || 0), 0);
      return { org, total };
    }).filter(o => o.total > 0);

    // Sort by total descending, take top 12
    orgTotals.sort((a, b) => b.total - a.total);
    const topOrgs = orgTotals.slice(0, 12).map(o => o.org);

    // Build series (one per type)
    const series = types.map(type => {
      const data = topOrgs.map(org => {
        const count = prTypeData[type]?.[org] || 0;
        const total = orgTotals.find(o => o.org === org).total;
        return total > 0 ? (count / total * 100) : 0;
      });

      return {
        name: type,
        type: 'bar',
        stack: 'total',
        data: data,
        itemStyle: { color: TYPE_COLORS[type] || TYPE_COLORS.other },
        emphasis: { focus: 'series' },
        tooltip: {
          valueFormatter: (value) => {
            // Find raw count
            const orgIdx = topOrgs.indexOf(topOrgs[series[0].data.indexOf(value)]);
            const org = topOrgs[orgIdx];
            const count = prTypeData[type]?.[org] || 0;
            return `${count} (${value.toFixed(1)}%)`;
          }
        }
      };
    });

    const option = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' }
      },
      legend: {
        type: 'scroll',
        bottom: 0
      },
      grid: {
        left: '15%',
        right: '4%',
        bottom: '15%',
        top: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'value',
        max: 100,
        axisLabel: { formatter: '{value}%' }
      },
      yAxis: {
        type: 'category',
        data: topOrgs,
        inverse: true
      },
      series: series
    };

    charts.personality.setOption(option, { notMerge: true });
  }

  // ============================================================================
  // 3. PR-type trends over time (stacked area)
  // ============================================================================

  function renderTrendsChart(ctx) {
    const el = document.getElementById('types-mod-chart-trends');
    const placeholder = document.getElementById('types-mod-trends-placeholder');
    if (!el) return;

    if (ctx.history.length < 2) {
      el.style.display = 'none';
      if (placeholder) placeholder.style.display = 'block';
      return;
    }

    el.style.display = 'block';
    if (placeholder) placeholder.style.display = 'none';

    if (!charts.trends) {
      charts.trends = echarts.init(el);
    }

    const orgs = getFilteredOrgs(ctx);
    const dates = ctx.history.map(h => h.date);

    // Collect all types across all history
    const allTypesSet = new Set();
    ctx.history.forEach(h => {
      const prData = getPRTypeData({ ...ctx, snapshot: h.data }, ctx.state.repo);
      Object.keys(prData).forEach(t => allTypesSet.add(t));
    });
    const allTypes = getOrderedTypes(Object.fromEntries([...allTypesSet].map(t => [t, {}])));

    // Build series (one per type)
    const series = allTypes.map(type => {
      const data = ctx.history.map(h => {
        const prData = getPRTypeData({ ...ctx, snapshot: h.data }, ctx.state.repo);
        return sumTypeAcrossOrgs(prData, type, orgs);
      });

      return {
        name: type,
        type: 'line',
        stack: moduleState.trendMode === 'counts' ? null : 'total',
        areaStyle: moduleState.trendMode === 'counts' ? null : {},
        data: data,
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: { width: 2, color: TYPE_COLORS[type] || TYPE_COLORS.other },
        itemStyle: { color: TYPE_COLORS[type] || TYPE_COLORS.other },
        emphasis: { focus: 'series' }
      };
    });

    const option = {
      tooltip: {
        trigger: 'axis'
      },
      legend: {
        type: 'scroll',
        bottom: 0
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
        name: moduleState.trendMode === 'counts' ? 'Count' : 'Percentage',
        axisLabel: moduleState.trendMode === 'percent' ? { formatter: '{value}%' } : {}
      },
      series: series
    };

    if (moduleState.trendMode === 'percent') {
      option.yAxis.max = 100;
      // Normalize to percentage
      option.series.forEach(s => {
        s.data = s.data.map((val, idx) => {
          const total = series.reduce((sum, ser) => sum + ser.data[idx], 0);
          return total > 0 ? (val / total * 100) : 0;
        });
      });
    }

    charts.trends.setOption(option, { notMerge: true });
  }

  // ============================================================================
  // 4. Type breakdown per repo (small multiples)
  // ============================================================================

  function renderRepoBreakdown(ctx) {
    const grid = document.getElementById('types-mod-repo-grid');
    const singleChart = document.getElementById('types-mod-single-repo-chart');
    if (!grid || !singleChart) return;

    const orgs = getFilteredOrgs(ctx);

    if (ctx.state.repo === 'all_repos') {
      // Show small multiples
      grid.style.display = 'grid';
      singleChart.style.display = 'none';
      grid.innerHTML = '';

      const repos = Object.keys(ctx.snapshot.repos);
      repos.forEach((repo, idx) => {
        const prTypeData = getPRTypeData(ctx, repo);
        const types = getOrderedTypes(prTypeData);

        const itemDiv = document.createElement('div');
        itemDiv.className = 'types-mod-repo-item';
        itemDiv.innerHTML = `<h4>${repo}</h4><div id="types-mod-repo-${idx}" class="types-mod-chart-xs"></div>`;
        grid.appendChild(itemDiv);

        const chartEl = itemDiv.querySelector(`#types-mod-repo-${idx}`);
        const chart = echarts.init(chartEl);
        charts[`repo-${idx}`] = chart;

        const data = types.map(type => {
          const value = sumTypeAcrossOrgs(prTypeData, type, orgs);
          return {
            name: type,
            value: value,
            itemStyle: { color: TYPE_COLORS[type] || TYPE_COLORS.other }
          };
        }).filter(d => d.value > 0);

        const option = {
          tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' }
          },
          grid: {
            left: '10%',
            right: '5%',
            bottom: '15%',
            top: '5%',
            containLabel: true
          },
          xAxis: {
            type: 'category',
            data: data.map(d => d.name),
            axisLabel: { rotate: 45, fontSize: 10 }
          },
          yAxis: {
            type: 'value',
            axisLabel: { fontSize: 10 }
          },
          series: [{
            type: 'bar',
            data: data.map(d => ({ value: d.value, itemStyle: d.itemStyle }))
          }]
        };

        chart.setOption(option);
      });
    } else {
      // Show single large chart for selected repo
      grid.style.display = 'none';
      singleChart.style.display = 'block';

      if (!charts.singleRepo) {
        charts.singleRepo = echarts.init(singleChart);
      }

      const prTypeData = getPRTypeData(ctx, ctx.state.repo);
      const types = getOrderedTypes(prTypeData);

      const data = types.map(type => {
        const value = sumTypeAcrossOrgs(prTypeData, type, orgs);
        return {
          name: type,
          value: value,
          itemStyle: { color: TYPE_COLORS[type] || TYPE_COLORS.other }
        };
      }).filter(d => d.value > 0);

      const option = {
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' }
        },
        grid: {
          left: '3%',
          right: '4%',
          bottom: '10%',
          containLabel: true
        },
        xAxis: {
          type: 'category',
          data: data.map(d => d.name)
        },
        yAxis: {
          type: 'value'
        },
        series: [{
          type: 'bar',
          data: data.map(d => ({ value: d.value, itemStyle: d.itemStyle }))
        }]
      };

      charts.singleRepo.setOption(option, { notMerge: true });
    }
  }

  // ============================================================================
  // 5. Org specialisation heatmap (orgs × types)
  // ============================================================================

  function renderHeatmapChart(ctx) {
    const el = document.getElementById('types-mod-chart-heatmap');
    if (!el) return;

    if (!charts.heatmap) {
      charts.heatmap = echarts.init(el);
    }

    const orgs = getFilteredOrgs(ctx);
    const prTypeData = getPRTypeData(ctx, ctx.state.repo);
    const types = getOrderedTypes(prTypeData);

    // Calculate total PRs per org
    const orgTotals = orgs.map(org => {
      const total = types.reduce((sum, type) => sum + (prTypeData[type]?.[org] || 0), 0);
      return { org, total };
    }).filter(o => o.total > 0);

    // Sort by total descending
    orgTotals.sort((a, b) => b.total - a.total);
    const sortedOrgs = orgTotals.map(o => o.org);

    // Build heatmap data
    const data = [];
    sortedOrgs.forEach((org, orgIdx) => {
      const total = orgTotals.find(o => o.org === org).total;
      types.forEach((type, typeIdx) => {
        const count = prTypeData[type]?.[org] || 0;
        const percent = total > 0 ? (count / total * 100) : 0;
        data.push([typeIdx, orgIdx, percent, count]);
      });
    });

    const option = {
      tooltip: {
        position: 'top',
        formatter: (params) => {
          const [typeIdx, orgIdx, percent, count] = params.data;
          return `${sortedOrgs[orgIdx]} - ${types[typeIdx]}<br/>${count} PRs (${percent.toFixed(1)}%)`;
        }
      },
      grid: {
        left: '15%',
        right: '10%',
        bottom: '10%',
        top: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: types,
        splitArea: { show: true }
      },
      yAxis: {
        type: 'category',
        data: sortedOrgs,
        inverse: true,
        splitArea: { show: true }
      },
      visualMap: {
        min: 0,
        max: 100,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: '0%',
        inRange: {
          color: ['#e0f2fe', '#0c4a6e']
        },
        text: ['High %', 'Low %'],
        textStyle: { fontSize: 10 }
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
    };

    charts.heatmap.setOption(option, { notMerge: true });
  }

  // ============================================================================
  // 6. Feat vs Fix balance chart
  // ============================================================================

  function renderBalanceChart(ctx) {
    const container = document.getElementById('types-mod-balance-container');
    if (!container) return;

    const orgs = getFilteredOrgs(ctx);
    const prTypeData = getPRTypeData(ctx, ctx.state.repo);

    // Calculate feat+fix totals per org
    const balances = orgs.map(org => {
      const feat = prTypeData.feat?.[org] || 0;
      const fix = prTypeData.fix?.[org] || 0;
      const total = feat + fix;
      return { org, feat, fix, total };
    }).filter(b => b.total >= 3);

    // Sort by total descending
    balances.sort((a, b) => b.total - a.total);

    // Render as HTML bars
    container.innerHTML = '';

    if (balances.length === 0) {
      container.innerHTML = '<div class="types-mod-placeholder">No organisations with sufficient feat+fix data</div>';
      return;
    }

    balances.forEach(({ org, feat, fix, total }) => {
      const featPct = (feat / total * 100);
      const fixPct = (fix / total * 100);

      const bar = document.createElement('div');
      bar.className = 'types-mod-balance-bar';
      bar.innerHTML = `
        <div class="types-mod-balance-label" title="${org}">${org}</div>
        <div class="types-mod-balance-track">
          <div class="types-mod-balance-feat" style="width: ${featPct}%"></div>
          <div class="types-mod-balance-fix" style="width: ${fixPct}%"></div>
          <div class="types-mod-balance-midline"></div>
        </div>
        <div class="types-mod-balance-count">${feat}/${fix}</div>
      `;
      container.appendChild(bar);
    });
  }

  // ============================================================================
  // Public API
  // ============================================================================

  return {
    id: 'types-module',
    template,
    mount,
    render
  };
})();
