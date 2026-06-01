// ============================================================================
// Trends Deep Dive Module
// A self-contained module that adds trends-over-time visualisations
// ============================================================================

window.TRENDS_MODULE = {
  id: 'trends-module',
  
  // Internal state
  _charts: {},
  _selectedMetric: null,
  _stackMode: 'absolute', // 'absolute' or 'percent'
  _areaMode: 'stacked', // 'stacked' or 'stream'
  
  // ============================================================================
  // Template
  // ============================================================================
  
  template() {
    return `
      <style>
        .trends-mod-container { }
        .trends-mod-metric-pills { margin-bottom: 20px; }
        .trends-mod-sub-card {
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 20px;
          background: var(--bg-tint);
        }
        .trends-mod-sub-card h3 {
          font-size: 1.1rem;
          font-weight: 600;
          margin-bottom: 12px;
          color: var(--text);
        }
        .trends-mod-chart {
          width: 100%;
          height: 350px;
        }
        .trends-mod-controls {
          display: flex;
          gap: 12px;
          margin-bottom: 12px;
          flex-wrap: wrap;
        }
        .trends-mod-caption {
          font-size: 0.85rem;
          font-style: italic;
          color: var(--text-light);
          margin-top: 8px;
        }
        .trends-mod-empty {
          padding: 40px;
          text-align: center;
          color: var(--text-light);
          font-size: 1.1rem;
        }
        .trends-mod-org-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 0.95rem;
        }
        .trends-mod-org-badge {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 12px;
          background: var(--bg);
          border: 1px solid var(--border);
        }
        .trends-mod-org-badge.new {
          background: #dcfce7;
          border-color: #16a34a;
          color: #15803d;
        }
        .trends-mod-org-badge.returning {
          background: #fee2e2;
          border-color: #dc2626;
          color: #b91c1c;
        }
        .trends-mod-two-col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }
        @media (max-width: 768px) {
          .trends-mod-two-col {
            grid-template-columns: 1fr;
          }
        }
      </style>
      
      <div class="card trends-mod-container">
        <div class="card-header">
          <h2>Trends Deep Dive</h2>
          <div class="pill-group trends-mod-metric-pills" id="trends-mod-metric-pills"></div>
        </div>
        
        <div id="trends-mod-content"></div>
      </div>
    `;
  },
  
  // ============================================================================
  // Mount
  // ============================================================================
  
  mount(rootEl) {
    // Wire up metric pills
    const pillsContainer = rootEl.querySelector('#trends-mod-metric-pills');
    
    pillsContainer.addEventListener('click', (e) => {
      if (e.target.classList.contains('pill')) {
        const metric = e.target.dataset.metric;
        this._selectedMetric = metric;
        
        // Update pill active state
        pillsContainer.querySelectorAll('.pill').forEach(p => {
          p.classList.toggle('active', p.dataset.metric === metric);
        });
        
        // Re-render
        const ctx = window.__getCtx();
        this.render(ctx);
      }
    });
    
    // Resize handler
    window.addEventListener('resize', () => {
      Object.values(this._charts).forEach(chart => {
        if (chart && typeof chart.resize === 'function') {
          chart.resize();
        }
      });
    });
  },
  
  // ============================================================================
  // Render
  // ============================================================================
  
  render(ctx) {
    const { snapshot, history, state, colorMap, allOrgs, HIDDEN_ORGS, METRICS, echarts } = ctx;
    
    // Initialize selected metric if not set
    if (!this._selectedMetric) {
      this._selectedMetric = state.metric;
    }
    
    // Render metric pills
    this._renderMetricPills(METRICS);
    
    // Get content container
    const content = document.getElementById('trends-mod-content');
    
    // Guard: need at least 2 snapshots
    if (history.length < 2) {
      content.innerHTML = `
        <div class="trends-mod-empty">
          📊 Need at least 2 snapshots to display trends over time
        </div>
      `;
      return;
    }
    
    // Build sub-cards HTML (only once)
    if (!content.querySelector('.trends-mod-sub-card')) {
      content.innerHTML = `
        <div class="trends-mod-sub-card">
          <h3>Activity Over Time</h3>
          <div class="trends-mod-controls">
            <div class="pill-group">
              <button class="pill active" data-stack-mode="absolute">Absolute</button>
              <button class="pill" data-stack-mode="percent">Percent</button>
            </div>
            <div class="pill-group">
              <button class="pill active" data-area-mode="stacked">Stacked</button>
              <button class="pill" data-area-mode="stream">Stream</button>
            </div>
          </div>
          <div id="trends-mod-area-chart" class="trends-mod-chart"></div>
        </div>
        
        <div class="trends-mod-sub-card">
          <h3>Growth & Momentum</h3>
          <div id="trends-mod-growth-chart" class="trends-mod-chart"></div>
        </div>
        
        <div class="trends-mod-sub-card">
          <h3>Activity Heatmap</h3>
          <div id="trends-mod-heatmap-chart" class="trends-mod-chart"></div>
        </div>
        
        <div class="trends-mod-sub-card">
          <h3>Cumulative Contributions</h3>
          <div id="trends-mod-cumulative-chart" class="trends-mod-chart"></div>
          <div class="trends-mod-caption">
            Note: Snapshots are rolling windows, so cumulative totals are approximate and may overlap.
          </div>
        </div>
        
        <div class="trends-mod-sub-card">
          <h3>New & Returning Contributors</h3>
          <div class="trends-mod-two-col">
            <div>
              <h4 style="font-size: 0.95rem; margin-bottom: 8px; color: var(--text-light);">🆕 New Contributors</h4>
              <div class="trends-mod-org-list" id="trends-mod-new-orgs"></div>
            </div>
            <div>
              <h4 style="font-size: 0.95rem; margin-bottom: 8px; color: var(--text-light);">🔄 Returning Contributors</h4>
              <div class="trends-mod-org-list" id="trends-mod-returning-orgs"></div>
            </div>
          </div>
        </div>
      `;
      
      // Wire up area chart controls
      const areaCard = content.querySelector('.trends-mod-sub-card');
      areaCard.querySelectorAll('[data-stack-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
          this._stackMode = btn.dataset.stackMode;
          areaCard.querySelectorAll('[data-stack-mode]').forEach(b => {
            b.classList.toggle('active', b.dataset.stackMode === this._stackMode);
          });
          this._renderAreaChart(ctx);
        });
      });
      
      areaCard.querySelectorAll('[data-area-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
          this._areaMode = btn.dataset.areaMode;
          areaCard.querySelectorAll('[data-area-mode]').forEach(b => {
            b.classList.toggle('active', b.dataset.areaMode === this._areaMode);
          });
          this._renderAreaChart(ctx);
        });
      });
    }
    
    // Render all charts
    this._renderAreaChart(ctx);
    this._renderGrowthChart(ctx);
    this._renderHeatmapChart(ctx);
    this._renderCumulativeChart(ctx);
    this._renderNewReturningOrgs(ctx);
  },
  
  // ============================================================================
  // Metric Pills
  // ============================================================================
  
  _renderMetricPills(METRICS) {
    const container = document.getElementById('trends-mod-metric-pills');
    container.innerHTML = '';
    
    METRICS.forEach(m => {
      const pill = document.createElement('button');
      pill.className = `pill ${m.key === this._selectedMetric ? 'active' : ''}`;
      pill.textContent = m.label;
      pill.dataset.metric = m.key;
      container.appendChild(pill);
    });
  },
  
  // ============================================================================
  // Data Helpers
  // ============================================================================
  
  _getVisibleOrgs(allOrgs, HIDDEN_ORGS, state) {
    return allOrgs.filter(org => !state.hideBots || !HIDDEN_ORGS.includes(org));
  },
  
  _getMetricForOrg(snapshot, repo, metric, org) {
    if (repo === 'all_repos') {
      let total = 0;
      for (const repoData of Object.values(snapshot.repos || {})) {
        total += repoData[metric]?.[org] || 0;
      }
      return total;
    } else {
      return snapshot.repos?.[repo]?.[metric]?.[org] || 0;
    }
  },
  
  // ============================================================================
  // Chart 1: Stacked Area Chart
  // ============================================================================
  
  _renderAreaChart(ctx) {
    const { history, state, colorMap, allOrgs, HIDDEN_ORGS, echarts } = ctx;
    
    if (!this._charts.area) {
      this._charts.area = echarts.init(document.getElementById('trends-mod-area-chart'));
    }
    
    const orgs = this._getVisibleOrgs(allOrgs, HIDDEN_ORGS, state);
    const dates = history.map(h => h.date);
    
    // Build series
    const series = orgs.map(org => {
      const data = history.map(h => {
        return this._getMetricForOrg(h.data, state.repo, this._selectedMetric, org);
      });
      
      return {
        name: org,
        type: 'line',
        stack: this._areaMode === 'stacked' ? 'total' : undefined,
        areaStyle: this._areaMode === 'stream' ? { origin: 'auto' } : {},
        data: data,
        smooth: true,
        emphasis: { focus: 'series' },
        lineStyle: { width: 0 },
        itemStyle: { color: colorMap[org] }
      };
    });
    
    const option = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' }
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
        boundaryGap: false,
        data: dates
      },
      yAxis: {
        type: 'value',
        name: this._stackMode === 'percent' ? 'Percentage' : 'Count'
      },
      series: series
    };
    
    // Apply percent normalization
    if (this._stackMode === 'percent') {
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
    
    this._charts.area.setOption(option, { notMerge: true });
  },
  
  // ============================================================================
  // Chart 2: Growth / Momentum Bar Chart
  // ============================================================================
  
  _renderGrowthChart(ctx) {
    const { history, state, allOrgs, HIDDEN_ORGS, echarts } = ctx;
    
    if (!this._charts.growth) {
      this._charts.growth = echarts.init(document.getElementById('trends-mod-growth-chart'));
    }
    
    const orgs = this._getVisibleOrgs(allOrgs, HIDDEN_ORGS, state);
    const firstSnap = history[0].data;
    const lastSnap = history[history.length - 1].data;
    
    // Compute growth
    const growthData = orgs.map(org => {
      const first = this._getMetricForOrg(firstSnap, state.repo, this._selectedMetric, org);
      const last = this._getMetricForOrg(lastSnap, state.repo, this._selectedMetric, org);
      
      if (first === 0 && last === 0) return null;
      
      const pctChange = first === 0 ? (last > 0 ? 100 : 0) : ((last - first) / first) * 100;
      
      return {
        org,
        first,
        last,
        pctChange
      };
    }).filter(Boolean);
    
    // Sort by pctChange descending
    growthData.sort((a, b) => b.pctChange - a.pctChange);
    
    const option = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params) => {
          const p = params[0];
          const d = growthData[p.dataIndex];
          return `${p.name}<br/>` +
                 `Change: <b>${p.value.toFixed(1)}%</b><br/>` +
                 `First: ${d.first} → Last: ${d.last}`;
        }
      },
      grid: {
        left: '20%',
        right: '4%',
        bottom: '3%',
        top: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'value',
        name: '% Change',
        axisLabel: { formatter: '{value}%' }
      },
      yAxis: {
        type: 'category',
        data: growthData.map(d => d.org),
        axisLabel: {
          interval: 0
        }
      },
      series: [{
        type: 'bar',
        data: growthData.map(d => ({
          value: d.pctChange,
          itemStyle: {
            color: d.pctChange >= 0 ? '#16a34a' : '#dc2626'
          }
        }))
      }]
    };
    
    this._charts.growth.setOption(option, { notMerge: true });
  },
  
  // ============================================================================
  // Chart 3: Activity Heatmap
  // ============================================================================
  
  _renderHeatmapChart(ctx) {
    const { history, state, allOrgs, HIDDEN_ORGS, echarts } = ctx;
    
    if (!this._charts.heatmap) {
      this._charts.heatmap = echarts.init(document.getElementById('trends-mod-heatmap-chart'));
    }
    
    const orgs = this._getVisibleOrgs(allOrgs, HIDDEN_ORGS, state);
    const dates = history.map(h => h.date);
    
    // Compute totals per org (for sorting)
    const orgTotals = orgs.map(org => {
      const total = history.reduce((sum, h) => {
        return sum + this._getMetricForOrg(h.data, state.repo, this._selectedMetric, org);
      }, 0);
      return { org, total };
    });
    
    orgTotals.sort((a, b) => b.total - a.total);
    const sortedOrgs = orgTotals.map(o => o.org);
    
    // Build heatmap data
    const data = [];
    history.forEach((h, dateIdx) => {
      sortedOrgs.forEach((org, orgIdx) => {
        const value = this._getMetricForOrg(h.data, state.repo, this._selectedMetric, org);
        data.push([dateIdx, orgIdx, value]);
      });
    });
    
    const maxVal = Math.max(...data.map(d => d[2]), 1);
    
    const option = {
      tooltip: {
        position: 'top',
        formatter: (params) => {
          const org = sortedOrgs[params.data[1]];
          const date = dates[params.data[0]];
          const val = params.data[2];
          return `${org}<br/>${date}<br/><b>${val}</b>`;
        }
      },
      grid: {
        left: '15%',
        right: '4%',
        bottom: '10%',
        top: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: dates,
        splitArea: { show: true }
      },
      yAxis: {
        type: 'category',
        data: sortedOrgs,
        splitArea: { show: true },
        axisLabel: { interval: 0 }
      },
      visualMap: {
        min: 0,
        max: maxVal,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: '0%',
        inRange: {
          color: ['#f0f9ff', '#0ea5e9', '#0369a1', '#075985']
        }
      },
      series: [{
        name: this._selectedMetric,
        type: 'heatmap',
        data: data,
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        }
      }]
    };
    
    this._charts.heatmap.setOption(option, { notMerge: true });
  },
  
  // ============================================================================
  // Chart 4: Cumulative Contributions
  // ============================================================================
  
  _renderCumulativeChart(ctx) {
    const { history, state, colorMap, allOrgs, HIDDEN_ORGS, echarts } = ctx;
    
    if (!this._charts.cumulative) {
      this._charts.cumulative = echarts.init(document.getElementById('trends-mod-cumulative-chart'));
    }
    
    const orgs = this._getVisibleOrgs(allOrgs, HIDDEN_ORGS, state);
    const dates = history.map(h => h.date);
    
    // Build cumulative series
    const series = orgs.map(org => {
      let cumulative = 0;
      const data = history.map(h => {
        const val = this._getMetricForOrg(h.data, state.repo, this._selectedMetric, org);
        cumulative += val;
        return cumulative;
      });
      
      return {
        name: org,
        type: 'line',
        data: data,
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
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
        name: 'Cumulative Count'
      },
      series: series
    };
    
    this._charts.cumulative.setOption(option, { notMerge: true });
  },
  
  // ============================================================================
  // Chart 5: New & Returning Contributors
  // ============================================================================
  
  _renderNewReturningOrgs(ctx) {
    const { history, state, allOrgs, HIDDEN_ORGS } = ctx;
    
    const orgs = this._getVisibleOrgs(allOrgs, HIDDEN_ORGS, state);
    const firstSnap = history[0].data;
    const lastSnap = history[history.length - 1].data;
    
    const newOrgs = [];
    const returningOrgs = [];
    
    orgs.forEach(org => {
      const first = this._getMetricForOrg(firstSnap, state.repo, this._selectedMetric, org);
      const last = this._getMetricForOrg(lastSnap, state.repo, this._selectedMetric, org);
      
      if (first === 0 && last > 0) {
        newOrgs.push(org);
      } else if (first > 0 && last === 0) {
        returningOrgs.push(org);
      }
    });
    
    // Render new orgs
    const newContainer = document.getElementById('trends-mod-new-orgs');
    if (newOrgs.length === 0) {
      newContainer.innerHTML = '<div style="color: var(--text-light); font-style: italic;">No new contributors in this period</div>';
    } else {
      newContainer.innerHTML = newOrgs.map(org => 
        `<span class="trends-mod-org-badge new">${org}</span>`
      ).join('');
    }
    
    // Render returning orgs
    const returningContainer = document.getElementById('trends-mod-returning-orgs');
    if (returningOrgs.length === 0) {
      returningContainer.innerHTML = '<div style="color: var(--text-light); font-style: italic;">No contributors dropped off in this period</div>';
    } else {
      returningContainer.innerHTML = returningOrgs.map(org => 
        `<span class="trends-mod-org-badge returning">${org}</span>`
      ).join('');
    }
  }
};
