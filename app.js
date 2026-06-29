const state = {
  data: null,
  risk: 'all',
  store: 'all',
  chart: null
};

const $ = (id) => document.getElementById(id);

const STATUS_ORDER = { Error: 5, Red: 4, Orange: 3, Yellow: 2, Green: 1, Gray: 0 };
const STATUS_LABELS = {
  Error: '오류',
  Red: '중단',
  Orange: '조치',
  Yellow: '주의',
  Green: '정상',
  Gray: '대기'
};

document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  loadDashboard();
});

function bindEvents() {
  $('refreshBtn').addEventListener('click', loadDashboard);
  $('copyBriefBtn').addEventListener('click', copyBrief);
  $('storeFilter').addEventListener('change', (event) => {
    state.store = event.target.value;
    render();
  });
  $('riskFilter').querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => {
      state.risk = button.dataset.risk;
      $('riskFilter').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === button));
      render();
    });
  });
  $('dialogClose').addEventListener('click', () => $('storeDialog').close());
}

async function loadDashboard() {
  showLoading(true);
  hideError();
  try {
    const response = await fetch('/api/weather-ops-data', { cache: 'no-store' });
    if (response.status === 401) {
      window.location.href = '/api/auth';
      return;
    }
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    state.data = normalize(payload);
    ensureStoreOptions();
    render();
    const warnings = freshnessWarnings();
    if (state.data.system.apiWarning) {
      showError(state.data.system.apiWarning);
    } else if (warnings.length) {
      showWarning(warnings.join(' · '));
    }
  } catch (error) {
    showError(`데이터를 불러오지 못했습니다. ${error.message || error}`);
  } finally {
    showLoading(false);
  }
}

function normalize(payload) {
  const stores = (payload.stores || []).map((store) => ({
    id: store.id || store.store_id || slug(store.name || store.store_name),
    name: store.name || store.store_name || '-',
    region: store.region || '',
    dri: store.dri || store.owner || '-',
    status: normalizeStatus(store.status || store.risk || 'Green'),
    weather: normalizeWeatherLabel(store),
    weatherDetail: normalizeWeatherDetail(store),
    weatherData: typeof store.weather === 'object' && store.weather !== null ? store.weather : (store.weatherData || store.weather_data || {}),
    trigger: store.trigger || '-',
    riskScore: Number(store.riskScore || store.risk_score || 0),
    openIssueCount: Number(store.openIssueCount || store.open_issue_count || 0),
    asStatus: store.asStatus || store.as_status || '-',
    recoveryStatus: store.recoveryStatus || store.recovery_status || '-',
    crmReady: normalizeBoolean(store.crmReady ?? store.crm_ready ?? store.crmReadyYn ?? store.crm_ready_yn),
    nextAction: store.nextAction || store.next_action || '-'
  }));

  stores.sort((a, b) => (STATUS_ORDER[b.status] || 0) - (STATUS_ORDER[a.status] || 0) || b.riskScore - a.riskScore);

  return {
    version: payload.version || 'unknown',
    generatedAt: payload.generatedAt || payload.generated_at || new Date().toISOString(),
    source: payload.source || 'unknown',
    summary: payload.summary || {},
    stores,
    opsActions: payload.opsActions || payload.ops_actions || [],
    marketingActions: payload.marketingActions || payload.marketing_actions || [],
    recovery: payload.recovery || {},
    system: payload.system || {},
    visuals: payload.visuals || {},
    weatherTimeline: payload.weatherTimeline || payload.weather_timeline || []
  };
}

function normalizeStatus(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('error') || text.includes('오류') || text.includes('실패') || text.includes('unauthorized') || text.includes('권한')) return 'Error';
  if (text.includes('red')) return 'Red';
  if (text.includes('제한') || text.includes('중단') || text.includes('위험')) return 'Red';
  if (text.includes('orange')) return 'Orange';
  if (text.includes('경계') || text.includes('즉시')) return 'Orange';
  if (text.includes('yellow')) return 'Yellow';
  if (text.includes('주의') || text.includes('관찰')) return 'Yellow';
  if (text.includes('gray') || text.includes('unknown') || text.includes('대기') || text.includes('미확정')) return 'Gray';
  if (text.includes('green') || text.includes('정상') || text.includes('완료')) return 'Green';
  return 'Green';
}

function normalizeWeatherLabel(store) {
  if (typeof store.weather === 'object' && store.weather !== null) {
    return store.weather.label || store.weather.triggerLabel || store.weather.trigger_label || store.trigger || '-';
  }
  return store.weather || store.trigger || '-';
}

function normalizeWeatherDetail(store) {
  if (typeof store.weather === 'object' && store.weather !== null) {
    return store.weather.summary || store.weather.detail || store.weather.peakTime || store.weather.peak_time || '';
  }
  return store.weatherDetail || store.weather_detail || '';
}

function ensureStoreOptions() {
  const select = $('storeFilter');
  const current = select.value || state.store;
  select.innerHTML = '<option value="all">전체 지점</option>' + state.data.stores
    .map((store) => `<option value="${escapeAttr(store.id)}">${escapeHtml(store.name)}</option>`)
    .join('');
  select.value = state.data.stores.some((store) => store.id === current) ? current : 'all';
  state.store = select.value;
}

function render() {
  if (!state.data) return;
  renderHero();
  renderKpis();
  renderMap();
  renderActions();
  renderRecoveryChart();
  renderRecoveryQueue();
  renderStatusBar();
  renderRiskMatrix();
  renderRecoveryFunnel();
  renderRecoveryStageHeatmap();
  renderRecoveryComparison();
  renderStoreTable();
  renderTimeline();
  renderSystem();
}

function filteredStores() {
  return state.data.stores.filter((store) => {
    const riskMatch = state.risk === 'all' || store.status === state.risk;
    const storeMatch = state.store === 'all' || store.id === state.store;
    return riskMatch && storeMatch;
  });
}

function renderHero() {
  const { summary } = state.data;
  const status = normalizeStatus(summary.overallStatus || summary.overall_status || topStatus(state.data.stores));
  const warnings = freshnessWarnings();
  $('overallStatus').textContent = status;
  $('overallStatus').className = `status-word text-${status}`;
  $('headline').textContent = summary.headline || '오늘 운영 조치와 회복 액션을 확인하세요.';
  $('heroMeta').innerHTML = [
    `업데이트 ${formatDateTime(state.data.generatedAt)}`,
    `버전 ${state.data.version}`,
    state.data.source && state.data.source.startsWith('sample') ? '샘플 데이터' : '실데이터 연결',
    ...warnings.map((warning) => `주의: ${warning}`)
  ].map((text) => `<span class="meta-pill${text.startsWith('주의:') ? ' warning' : ''}">${escapeHtml(text)}</span>`).join('');
}

function renderKpis() {
  const summary = state.data.summary || {};
  const items = [
    ['즉시 조치', summary.immediateCount ?? summary.immediate_count ?? 0, 'Orange/Red 확인'],
    ['주의 관찰', summary.watchCount ?? summary.watch_count ?? 0, 'Yellow 및 회복 관찰'],
    ['AS 차단', summary.asBlockedCount ?? summary.as_blocked_count ?? 0, '정상화 전 유도 금지'],
    ['회복 조치', summary.recoveryActionCount ?? summary.recovery_action_count ?? 0, 'D+1/D+2 액션'],
    ['CRM 가능', summary.crmReadyCount ?? summary.crm_ready_count ?? 0, '마케팅 실행 후보'],
    ['성과 대기', summary.dataWaitCount ?? summary.data_wait_count ?? 0, '매출/처리대수 확정 전'],
    ['시스템 오류', summary.systemError24h ?? summary.system_error_24h ?? 0, '최근 24시간']
  ];
  $('kpiStrip').innerHTML = items.map(([label, value, note]) => `
    <div class="kpi">
      <div class="kpi-label">${escapeHtml(label)}</div>
      <div class="kpi-value">${escapeHtml(value)}</div>
      <div class="kpi-note">${escapeHtml(note)}</div>
    </div>
  `).join('');
}

function renderMap() {
  const stores = filteredStores();
  $('mapCount').textContent = `${stores.length}개 지점`;
  $('metroMap').innerHTML = stores.map((store, index) => {
    return `
      <button class="store-pin status-${store.status}" type="button" data-store="${escapeAttr(store.id)}">
        <span class="pin-top">
          <strong>${escapeHtml(store.name)}</strong>
          <span class="badge ${store.status}">${escapeHtml(levelLabel(store.status))}</span>
        </span>
        <span class="pin-meta">${escapeHtml(store.weather)} · ${escapeHtml(store.dri)}</span>
        <span class="pin-action">${escapeHtml(store.nextAction)}</span>
      </button>
    `;
  }).join('');
  $('metroMap').querySelectorAll('.store-pin').forEach((button) => {
    button.addEventListener('click', () => openStoreDialog(button.dataset.store));
  });
}

function renderActions() {
  $('opsActions').innerHTML = renderActionList(state.data.opsActions, '사업운영팀');
  $('marketingActions').innerHTML = renderActionList(state.data.marketingActions, '마케팅팀');
}

function renderActionList(items, fallbackTeam) {
  const filtered = (items || []).filter((item) => state.store === 'all' || slug(item.store) === state.store || findStoreId(item.store) === state.store);
  if (!filtered.length) return '<div class="action-item"><div class="action-body">현재 필터 기준 조치 항목이 없습니다.</div></div>';
  return filtered.map((item) => `
    <div class="action-item">
      <div class="action-top">
        <span class="priority">${escapeHtml(item.priority || 'P1')}</span>
        <span class="action-store">${escapeHtml(item.store || fallbackTeam)}</span>
      </div>
      <div class="action-body">${escapeHtml(item.action || '-')}</div>
      <div class="action-foot">
        <span>담당 ${escapeHtml(item.owner || item.team || fallbackTeam)}</span>
        <span>기한 ${escapeHtml(item.due || item.status || '-')}</span>
        ${item.estimatedAudience ? `<span>대상 ${Number(item.estimatedAudience).toLocaleString('ko-KR')}명</span>` : ''}
      </div>
    </div>
  `).join('');
}

function renderRecoveryChart() {
  if (typeof Chart === 'undefined') {
    $('recoveryChartWrap').innerHTML = '<div class="empty-state">회복률 차트 라이브러리 로딩 대기 중입니다.</div>';
    return;
  }
  if (!$('recoveryChart')) {
    $('recoveryChartWrap').innerHTML = '<canvas id="recoveryChart"></canvas>';
  }
  const recovery = state.data.recovery || {};
  const selectedSeries = getRecoverySeries(recovery);
  const labels = selectedSeries.labels || recovery.labels || ['D-day', 'D+1', 'D+2'];
  const processedRate = selectedSeries.processedRate || selectedSeries.processed_rate || recovery.processedRate || recovery.processed_rate || [];
  const revenueRate = selectedSeries.revenueRate || selectedSeries.revenue_rate || recovery.revenueRate || recovery.revenue_rate || [];
  const ctx = $('recoveryChart');
  if (state.chart) state.chart.destroy();
  state.chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: state.store === 'all' ? '처리대수 회복률' : `${storeNameById(state.store)} 처리대수 회복률`,
          data: processedRate,
          borderColor: '#0f6b9f',
          backgroundColor: 'rgba(15,107,159,.12)',
          tension: .35,
          fill: true
        },
        {
          label: state.store === 'all' ? '매출 회복률' : `${storeNameById(state.store)} 매출 회복률`,
          data: revenueRate,
          borderColor: '#c05621',
          backgroundColor: 'rgba(192,86,33,.08)',
          tension: .35,
          fill: false
        },
        referenceLineDataset('기준 100%', labels, 100, '#64748b'),
        referenceLineDataset('조치 기준 90%', labels, 90, '#c05621')
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}%` } }
      },
      scales: {
        y: { suggestedMin: 0, suggestedMax: 120, ticks: { callback: (value) => `${value}%` } }
      }
    }
  });
}

function renderStatusBar() {
  const rows = statusDistributionRows();
  const stores = filteredStores();
  const total = rows.reduce((sum, row) => sum + Number(row.count || 0), 0);
  if (!total) {
    $('statusStrip').innerHTML = '<div class="empty-state">현재 필터 기준 지점이 없습니다.</div>';
    return;
  }
  const focusStores = stores.filter((store) => store.status !== 'Green' && store.status !== 'Gray').slice(0, 4);
  const fallbackStores = focusStores.length ? focusStores : stores.slice(0, 3);
  const summary = rows.map((row) => `
    <span class="status-count status-${row.status}">
      <b>${escapeHtml(levelLabel(row.status))}</b>${Number(row.count || 0)}개
    </span>
  `).join('');
  const segments = rows.map((row) => `
    <span class="status-segment status-${row.status}" style="flex-grow:${Number(row.count || 0)}">
      ${escapeHtml(levelLabel(row.status))} ${Number(row.count || 0)}
    </span>
  `).join('');
  $('statusStrip').innerHTML = `
    <div class="status-summary">${summary}</div>
    <div class="status-bar" aria-label="오늘 지점 상태">${segments}</div>
    <div class="status-note">총 ${total}개 지점 · 높은 심각도 순으로 표시</div>
    <div class="status-focus">
      <div class="status-focus-title">${focusStores.length ? '우선 확인 지점' : '현재 관찰 지점'}</div>
      <div class="status-focus-list">
        ${fallbackStores.map((store) => `
          <button class="status-focus-item status-${store.status}" type="button" data-store="${escapeAttr(store.id)}">
            <span class="focus-top">
              <strong>${escapeHtml(store.name)}</strong>
              <span class="badge ${store.status}">${escapeHtml(levelLabel(store.status))}</span>
            </span>
            <span class="focus-meta">${escapeHtml(store.weather)} · ${escapeHtml(store.recoveryStatus)} · CRM ${store.crmReady ? '가능' : '대기'}</span>
            <span class="focus-action">${escapeHtml(store.nextAction)}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
  $('statusStrip').querySelectorAll('.status-focus-item').forEach((button) => {
    button.addEventListener('click', () => openStoreDialog(button.dataset.store));
  });
}

function renderRiskMatrix() {
  const rows = riskMatrixRows().filter((row) => state.store === 'all' || row.storeId === state.store);
  if (!rows.length) {
    $('riskMatrix').innerHTML = '<div class="empty-state">현재 필터 기준 리스크 데이터가 없습니다.</div>';
    return;
  }
  const columns = activeRiskColumns(rows);
  const gridStyle = `grid-template-columns:minmax(112px,1.25fr) repeat(${columns.length}, minmax(64px,1fr))`;
  $('riskMatrix').innerHTML = `
    <div class="matrix-row matrix-head" style="${gridStyle}">
      <div class="matrix-store">지점</div>
      ${columns.map((column) => `<div>${escapeHtml(column.label)}</div>`).join('')}
    </div>
    ${rows.map((row) => `
      <div class="matrix-row${isNormalRiskRow(row, columns) ? ' is-muted' : ''}" style="${gridStyle}">
        <div class="matrix-store">${escapeHtml(row.store)}</div>
        ${columns.map((column) => {
          const cell = matrixCellForColumn(row, column);
          const level = normalizeStatus(cell.level);
          return `<div class="matrix-cell ${level}" title="${escapeAttr(row.store)} ${escapeAttr(cell.label)} ${escapeAttr(levelLabel(level))}">${escapeHtml(levelLabel(level))}</div>`;
        }).join('')}
      </div>
    `).join('')}
  `;
}

function renderRecoveryFunnel() {
  const rows = recoveryFunnelRows();
  const max = Math.max(...rows.map((row) => Number(row.count || 0)), 1);
  $('recoveryFunnel').innerHTML = rows.map((row, index) => {
    const count = Number(row.count || 0);
    const width = Math.max(8, Math.round(count / max * 100));
    const previous = index > 0 ? Number(rows[index - 1].count || 0) : null;
    const conversion = previous && previous > 0 ? Math.round(count / previous * 100) : null;
    const dropoff = previous !== null ? Math.max(0, previous - count) : null;
    return `
      <div class="funnel-item">
        <div class="funnel-label"><span>${escapeHtml(row.label)}</span><b>${count.toLocaleString('ko-KR')}</b></div>
        <div class="funnel-track"><span style="width:${width}%"></span></div>
        <div class="funnel-note">${index === 0 ? '시작 단계' : `전 단계 대비 ${conversion === null ? '-' : `${conversion}%`} 유지 · ${dropoff.toLocaleString('ko-KR')}건 이탈`}</div>
      </div>
    `;
  }).join('');
}

function renderRecoveryStageHeatmap() {
  const stores = filteredStores();
  const recovery = state.data.recovery || {};
  const labels = recovery.labels || ['D-day', 'D+1', 'D+2'];
  const gridStyle = `grid-template-columns:minmax(86px,1.05fr) repeat(${labels.length}, minmax(58px,.8fr))`;
  if (!stores.length) {
    $('recoveryStageHeatmap').innerHTML = '<div class="empty-state">현재 필터 기준 회복 데이터가 없습니다.</div>';
    return;
  }
  $('recoveryStageHeatmap').innerHTML = `
    <div class="heat-legend">
      <span><i class="level-good"></i>100% 이상</span>
      <span><i class="level-watch"></i>90~99%</span>
      <span><i class="level-action"></i>90% 미만</span>
    </div>
    <div class="heat-row heat-head" style="${gridStyle}">
      <div>지점</div>
      ${labels.map((label) => `<div>${escapeHtml(label)}</div>`).join('')}
    </div>
    ${stores.map((store) => {
      const series = rateSeriesForStore(store.id, recovery, false);
      const processed = series.processedRate || [];
      const revenue = series.revenueRate || [];
      return `
        <div class="heat-row" style="${gridStyle}">
          <div class="heat-store"><strong>${escapeHtml(store.name)}</strong><span>${escapeHtml(levelLabel(store.status))}</span></div>
          ${labels.map((label, index) => {
            const processedRate = numericOrNull(processed[index]);
            const revenueRate = numericOrNull(revenue[index]);
            return `
              <div class="heat-cell ${recoveryRateLevel(processedRate)}">
                <b>${formatPercent(processedRate)}</b>
                <span>매출 ${formatPercent(revenueRate)}</span>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }).join('')}
  `;
}

function renderRecoveryComparison() {
  const rows = recoveryGapRows();
  if (!rows.length) {
    $('recoveryComparison').innerHTML = '<div class="empty-state">현재 필터 기준 이용/매출 회복 비교 데이터가 없습니다.</div>';
    return;
  }
  $('recoveryComparison').innerHTML = rows.map((row) => {
    const processed = numericOrNull(row.processedRate ?? row.processed_rate);
    const revenue = numericOrNull(row.revenueRate ?? row.revenue_rate);
    const gap = numericOrNull(row.gap ?? (processed !== null && revenue !== null ? processed - revenue : null));
    const processedPos = ratePosition(processed);
    const revenuePos = ratePosition(revenue);
    const left = Math.min(processedPos, revenuePos);
    const width = Math.max(2, Math.abs(processedPos - revenuePos));
    return `
      <div class="comparison-row">
        <div class="comparison-top">
          <strong>${escapeHtml(row.store || storeNameById(row.storeId))}</strong>
          <span>${escapeHtml(formatSignedPercentPoint(gap))} · ${escapeHtml(recoveryGapMeaning(gap))}</span>
        </div>
        <div class="dumbbell" aria-label="${escapeAttr(row.store)} 이용 회복 ${formatPercent(processed)}, 매출 회복 ${formatPercent(revenue)}">
          <span class="dumbbell-range" style="left:${left}%;width:${width}%"></span>
          <span class="dumbbell-dot processed" style="left:${processedPos}%"></span>
          <span class="dumbbell-dot revenue" style="left:${revenuePos}%"></span>
        </div>
        <div class="comparison-foot">
          <span><i class="legend-dot processed"></i>이용 ${formatPercent(processed)}</span>
          <span><i class="legend-dot revenue"></i>매출 ${formatPercent(revenue)}</span>
        </div>
      </div>
    `;
  }).join('') + `
    <div class="comparison-legend">
      <span><i class="legend-dot processed"></i>이용 회복률</span>
      <span><i class="legend-dot revenue"></i>매출 회복률</span>
      <span>갭이 클수록 결제/단가/구독 믹스 확인 필요</span>
    </div>
  `;
}

function renderRecoveryQueue() {
  const queue = (state.data.recovery && state.data.recovery.queue) || [];
  const filtered = queue.filter((item) => state.store === 'all' || slug(item.store) === state.store || findStoreId(item.store) === state.store);
  if (!filtered.length) {
    $('recoveryQueue').innerHTML = '<div class="queue-item"><div class="queue-body">현재 필터 기준 회복 큐가 없습니다.</div></div>';
    return;
  }
  $('recoveryQueue').innerHTML = filtered.map((item) => `
    <div class="queue-item">
      <div class="queue-top">
        <span class="queue-store">${escapeHtml(item.store || '-')}</span>
        <span class="badge ${queueStatusClass(item.status)}">${escapeHtml(item.status || '-')}</span>
      </div>
      <div class="queue-body">${escapeHtml(item.stage || '-')} · 처리대수 회복률 ${formatPercent(item.processedRecoveryRate ?? item.processed_recovery_rate)}</div>
      <div class="queue-foot">
        <span>CRM ${escapeHtml(item.crmAllowed || item.crm_allowed || '-')}</span>
        <span>다음 ${escapeHtml(item.next || '-')}</span>
      </div>
    </div>
  `).join('');
}

function renderStoreTable() {
  const rows = filteredStores();
  $('storeTable').innerHTML = rows.map((store) => `
    <tr>
      <td><strong>${escapeHtml(store.name)}</strong><br><span class="muted">${escapeHtml(store.region)}</span></td>
      <td><span class="badge ${store.status}">${store.status}</span><br><span class="muted">점수 ${store.riskScore}</span></td>
      <td>${escapeHtml(store.weather)}<br><span class="muted">${escapeHtml(store.weatherDetail || store.trigger)}</span></td>
      <td>${escapeHtml(store.asStatus)}</td>
      <td>${escapeHtml(store.recoveryStatus)}<br><span class="muted">CRM ${store.crmReady ? '가능' : '대기'}</span></td>
      <td>${escapeHtml(store.dri)}</td>
      <td>${escapeHtml(store.nextAction)}</td>
    </tr>
  `).join('') || '<tr><td colspan="7">현재 필터 기준 지점이 없습니다.</td></tr>';
}

function renderTimeline() {
  const items = state.data.weatherTimeline || [];
  $('weatherTimeline').innerHTML = items.map((item) => `
    <div class="timeline-item">
      <div class="timeline-time">${escapeHtml(item.time || '-')}</div>
      <div class="timeline-label">${escapeHtml(item.label || '-')}</div>
      <span class="badge ${normalizeStatus(item.risk || 'Green')}">${normalizeStatus(item.risk || 'Green')}</span>
    </div>
  `).join('') || '<div class="timeline-item"><div class="timeline-label">타임라인 데이터가 없습니다.</div></div>';
}

function renderSystem() {
  const system = state.data.system || {};
  const items = [
    ['마지막 요약', system.lastSummaryAt || system.last_summary_at || '-'],
    ['매출 동기화', system.lastRevenueSyncAt || system.last_revenue_sync_at || '-'],
    ['Apps Script', system.appsScriptVersion || system.apps_script_version || state.data.version],
    ['데이터 상태', system.dataFreshness || system.data_freshness || state.data.source]
  ];
  $('systemStatus').innerHTML = items.map(([label, value]) => `
    <div class="system-item">
      <div class="system-label">${escapeHtml(label)}</div>
      <div class="system-value">${escapeHtml(formatMaybeDate(value))}</div>
    </div>
  `).join('');
}

function referenceLineDataset(label, labels, value, color) {
  return {
    label,
    data: labels.map(() => value),
    borderColor: color,
    backgroundColor: 'transparent',
    borderDash: [6, 6],
    pointRadius: 0,
    tension: 0,
    fill: false
  };
}

function statusDistributionRows() {
  const stores = filteredStores();
  return ['Error', 'Red', 'Orange', 'Yellow', 'Green', 'Gray']
    .map((status) => ({ status, count: stores.filter((store) => store.status === status).length }))
    .filter((row) => row.count > 0);
}

function levelLabel(status) {
  return STATUS_LABELS[normalizeStatus(status)] || STATUS_LABELS.Green;
}

function riskMatrixRows() {
  const provided = state.data.visuals && state.data.visuals.riskMatrix;
  const rows = Array.isArray(provided) && provided.length ? provided : deriveRiskMatrixRows();
  const visibleStoreIds = new Set(filteredStores().map((store) => store.id));
  return rows.filter((row) => visibleStoreIds.has(row.storeId || findStoreId(row.store)));
}

function activeRiskColumns(rows) {
  const activeKeys = new Set();
  const columnsByKey = new Map();
  rows.forEach((row) => {
    (row.cells || []).forEach((cell) => {
      const key = cell.key || cell.label;
      if (!columnsByKey.has(key)) columnsByKey.set(key, { key, label: cell.label || key });
      if (normalizeStatus(cell.level) !== 'Green') activeKeys.add(key);
    });
  });
  const columns = [...columnsByKey.values()].filter((column) => activeKeys.has(column.key));
  return columns.length ? columns : [{ key: 'normal', label: '정상' }];
}

function matrixCellForColumn(row, column) {
  if (column.key === 'normal') return { key: 'normal', label: '정상', level: 'Green' };
  return (row.cells || []).find((cell) => (cell.key || cell.label) === column.key)
    || { key: column.key, label: column.label, level: 'Green' };
}

function isNormalRiskRow(row, columns) {
  return columns.every((column) => normalizeStatus(matrixCellForColumn(row, column).level) === 'Green');
}

function deriveRiskMatrixRows() {
  const triggers = [
    ['rain', '강수', ['강수', '비', '우천']],
    ['wind', '강풍', ['강풍', '풍속', '바람']],
    ['cold', '한파', ['한파', '동파', '저온']],
    ['snow', '대설', ['대설', '적설', '눈', '결빙']],
    ['dust', '대기질', ['미세먼지', '황사', '대기질', 'pm']],
    ['heat', '폭염', ['폭염', '고온', '더위']]
  ];
  return state.data.stores.map((store) => {
    const text = `${store.weather} ${store.weatherDetail} ${store.trigger} ${store.nextAction}`.toLowerCase();
    return {
      storeId: store.id,
      store: store.name,
      cells: triggers.map(([key, label, words]) => ({
        key,
        label,
        level: words.some((word) => text.includes(String(word).toLowerCase())) ? store.status : 'Green'
      })).concat([
        { key: 'as', label: 'AS', level: queueStatusClass(store.asStatus) === 'Red' ? 'Red' : 'Green' },
        { key: 'recovery', label: '회복', level: recoveryCellLevel(store.recoveryStatus) }
      ])
    };
  });
}

function recoveryFunnelRows() {
  const provided = state.data.visuals && state.data.visuals.recoveryFunnel;
  if (Array.isArray(provided) && provided.length) return provided;
  const queue = (state.data.recovery && state.data.recovery.queue) || [];
  const crmReadyCount = state.data.stores.filter((store) => store.crmReady).length;
  return [
    { key: 'detected', label: '하락 감지', count: queue.length },
    { key: 'action', label: '조치 필요', count: queue.filter((item) => !String(item.status || '').includes('완료')).length },
    { key: 'normalized', label: '정상화 통과', count: queue.filter((item) => !String(item.status || '').includes('차단')).length },
    { key: 'crmQueued', label: 'CRM 후보', count: crmReadyCount },
    { key: 'crmSent', label: '발송/실행', count: queue.filter((item) => String(item.next || '').includes('발송')).length },
    { key: 'revisited', label: '재방문 회수', count: 0 }
  ];
}

function recoveryGapRows() {
  const provided = state.data.visuals && (state.data.visuals.recoveryGapByStore || state.data.visuals.recovery_gap_by_store);
  const rows = Array.isArray(provided) && provided.length ? provided : deriveRecoveryGapRows();
  const visibleStoreIds = new Set(filteredStores().map((store) => store.id));
  return rows
    .map((row) => ({ ...row, storeId: row.storeId || row.store_id || findStoreId(row.store) }))
    .filter((row) => state.store === 'all' || visibleStoreIds.has(row.storeId))
    .slice(0, 8);
}

function deriveRecoveryGapRows() {
  const recovery = state.data.recovery || {};
  return state.data.stores.map((store) => {
    const series = rateSeriesForStore(store.id, recovery);
    const processed = lastNumber(series.processedRate);
    const revenue = lastNumber(series.revenueRate);
    return {
      storeId: store.id,
      store: store.name,
      processedRate: processed,
      revenueRate: revenue,
      gap: processed !== null && revenue !== null ? processed - revenue : null
    };
  }).filter((row) => row.gap !== null).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
}

function rateSeriesForStore(storeId, recovery, allowGlobalFallback = true) {
  const series = recovery.storeSeries || recovery.store_series || {};
  const selected = series[storeId] || {};
  return {
    processedRate: selected.processedRate || selected.processed_rate || (allowGlobalFallback ? recovery.processedRate || recovery.processed_rate : []) || [],
    revenueRate: selected.revenueRate || selected.revenue_rate || (allowGlobalFallback ? recovery.revenueRate || recovery.revenue_rate : []) || []
  };
}

function numericOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function recoveryRateLevel(value) {
  if (value === null) return 'level-wait';
  if (value >= 100) return 'level-good';
  if (value >= 90) return 'level-watch';
  return 'level-action';
}

function ratePosition(value) {
  const safe = value === null ? 0 : Math.max(0, Math.min(120, Number(value)));
  return Math.round(safe / 120 * 100);
}

function formatSignedPercentPoint(value) {
  if (value === null || value === undefined || value === '') return '갭 -';
  const number = Number(value);
  if (!Number.isFinite(number)) return '갭 -';
  return `갭 ${number > 0 ? '+' : ''}${Math.round(number)}%p`;
}

function recoveryGapMeaning(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '비교 데이터 대기';
  if (Math.abs(number) < 3) return '이용·매출 균형';
  if (number > 0) return '이용 회복, 매출 지연';
  return '매출 우위, 단가·결제 믹스 확인';
}

function recoveryCellLevel(value) {
  const text = String(value || '');
  if (text.includes('차단') || text.includes('필요')) return 'Orange';
  if (text.includes('대기') || text.includes('관찰') || text.includes('준비')) return 'Yellow';
  return 'Green';
}

function openStoreDialog(storeId) {
  const store = state.data.stores.find((item) => item.id === storeId);
  if (!store) return;
  $('dialogTitle').textContent = store.name;
  $('dialogBody').innerHTML = [
    ['상태', store.status],
    ['기상/트리거', `${store.weather} · ${store.weatherDetail || store.trigger}`],
    ['DRI', store.dri],
    ['AS 상태', store.asStatus],
    ['회복 상태', store.recoveryStatus],
    ['CRM 가능 여부', store.crmReady ? '가능' : '대기'],
    ['다음 액션', store.nextAction]
  ].map(([label, value]) => `
    <div class="detail-row"><b>${escapeHtml(label)}</b><span>${escapeHtml(value)}</span></div>
  `).join('');
  $('storeDialog').showModal();
}

async function copyBrief() {
  if (!state.data) return;
  const summary = state.data.summary || {};
  const topStores = state.data.stores
    .filter((store) => ['Error', 'Red', 'Orange'].includes(store.status))
    .slice(0, 5)
    .map((store) => `- ${store.name}: ${store.status} / ${store.nextAction}`)
    .join('\n') || '- 즉시 조치 지점 없음';
  const text = [
    `[OPS] Weather Ops Dashboard | ${formatDateTime(state.data.generatedAt)}`,
    `전체 상태: ${summary.overallStatus || summary.overall_status || topStatus(state.data.stores)}`,
    `즉시 조치: ${summary.immediateCount ?? summary.immediate_count ?? 0} / 회복 조치: ${summary.recoveryActionCount ?? summary.recovery_action_count ?? 0} / CRM 가능: ${summary.crmReadyCount ?? summary.crm_ready_count ?? 0} / 성과 대기: ${summary.dataWaitCount ?? summary.data_wait_count ?? 0}`,
    '',
    '우선 지점',
    topStores
  ].join('\n');
  try {
    await navigator.clipboard.writeText(text);
    showToast('Slack 공유용 요약을 클립보드에 복사했습니다.');
  } catch (error) {
    showError('클립보드 복사에 실패했습니다. 브라우저 권한을 확인한 뒤 다시 시도하세요.');
  }
}

function topStatus(stores) {
  return (stores || []).reduce((top, store) => (STATUS_ORDER[store.status] > STATUS_ORDER[top] ? store.status : top), 'Green');
}

function findStoreId(storeName) {
  const target = normalizeStoreName(storeName);
  const found = state.data.stores.find((store) => normalizeStoreName(store.name) === target)
    || state.data.stores.find((store) => normalizeStoreName(store.name).includes(target) || target.includes(normalizeStoreName(store.name)));
  return found ? found.id : slug(storeName);
}

function normalizeStoreName(value) {
  return String(value || '').replace(/\s+/g, '').replace(/[()0-9]/g, '').toLowerCase();
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value;
  const text = String(value || '').trim().toLowerCase();
  if (!text || ['n', 'no', 'false', '0', '불가', '불필요', '대기'].includes(text)) return false;
  return ['y', 'yes', 'true', '1', '가능', '필요'].includes(text);
}

function storeNameById(storeId) {
  const store = state.data.stores.find((item) => item.id === storeId);
  return store ? store.name : '선택 지점';
}

function getRecoverySeries(recovery) {
  if (state.store === 'all') return {};
  const series = recovery.storeSeries || recovery.store_series || {};
  return series[state.store] || {};
}

function queueStatusClass(status) {
  const text = String(status || '').toLowerCase();
  if (text.includes('차단') || text.includes('red') || text.includes('중단') || text.includes('불가')) return 'Red';
  if (text.includes('완료') || text.includes('정상') || text.includes('green')) return 'Green';
  if (text.includes('대기') || text.includes('미확정') || text.includes('데이터')) return 'Gray';
  if (text.includes('주의') || text.includes('관찰') || text.includes('yellow')) return 'Yellow';
  return 'Orange';
}

function formatPercent(value) {
  if (value === null || value === undefined || value === '') return '-';
  return `${escapeHtml(value)}%`;
}

function lastNumber(values) {
  const list = Array.isArray(values) ? values : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const value = Number(list[i]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function freshnessWarnings() {
  const system = state.data && state.data.system ? state.data.system : {};
  const summary = state.data && state.data.summary ? state.data.summary : {};
  const provided = system.freshnessWarnings || system.freshness_warnings || [];
  const warnings = Array.isArray(provided) ? [...provided] : [];
  const revenueAge = hoursSince(system.lastRevenueSyncAt || system.last_revenue_sync_at);
  const generatedAge = hoursSince(state.data && state.data.generatedAt);
  const systemErrorCount = Number(summary.systemError24h ?? summary.system_error_24h ?? system.systemError24h ?? system.system_error_24h ?? 0);
  const dataWaitCount = Number(summary.dataWaitCount ?? summary.data_wait_count ?? 0);
  if (revenueAge !== null && revenueAge > 30) warnings.push('매출 원천 동기화 30시간 초과');
  if (generatedAge !== null && generatedAge > 4) warnings.push('대시보드 데이터 생성 4시간 초과');
  if (systemErrorCount > 0) warnings.push(`시스템 오류 ${systemErrorCount}건`);
  if (dataWaitCount > 0) warnings.push(`성과 확정 대기 ${dataWaitCount}건`);
  return [...new Set(warnings)];
}

function hoursSince(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return (Date.now() - date.getTime()) / 36e5;
}

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9가-힣]/g, '');
}

function formatDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value || '-');
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function formatMaybeDate(value) {
  const date = new Date(value);
  if (Number.isFinite(date.getTime()) && String(value).includes('T')) return formatDateTime(value);
  return value;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function showLoading(visible) {
  $('loadingOverlay').style.display = visible ? 'grid' : 'none';
}

function showError(message) {
  showBanner(message, 'error');
}

function showWarning(message) {
  showBanner(message, 'warning');
}

function showBanner(message, type) {
  const banner = $('errorBanner');
  banner.textContent = message;
  banner.className = `global-banner ${type || 'error'}`;
  banner.hidden = false;
}

function hideError() {
  const banner = $('errorBanner');
  banner.hidden = true;
  banner.textContent = '';
}

function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.hidden = true;
    toast.textContent = '';
  }, 2400);
}
