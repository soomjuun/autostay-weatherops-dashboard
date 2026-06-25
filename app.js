const state = {
  data: null,
  risk: 'all',
  store: 'all',
  chart: null
};

const $ = (id) => document.getElementById(id);

const STATUS_ORDER = { Error: 5, Red: 4, Orange: 3, Yellow: 2, Green: 1, Gray: 0 };
const PIN_POSITIONS = {
  ilsan: [28, 31],
  goyang: [43, 26],
  jayuro: [21, 47],
  hanam: [68, 44],
  gwangmyeong: [48, 69],
  seongsu: [59, 57],
  anseong: [72, 77]
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
    weather: store.weather || store.trigger || '-',
    weatherDetail: store.weatherDetail || store.weather_detail || '',
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
    const pos = PIN_POSITIONS[store.id] || fallbackPosition(index);
    return `
      <button class="store-pin status-${store.status}" style="left:${pos[0]}%;top:${pos[1]}%" type="button" data-store="${escapeAttr(store.id)}">
        <strong>${escapeHtml(store.name)}</strong>
        <span>${escapeHtml(store.weather)} · ${escapeHtml(store.dri)}</span>
        <span class="badge ${store.status}">${store.status}</span>
      </button>
    `;
  }).join('');
  $('metroMap').querySelectorAll('.store-pin').forEach((button) => {
    button.addEventListener('click', () => openStoreDialog(button.dataset.store));
  });
}

function fallbackPosition(index) {
  const positions = [[30,30], [50,28], [68,40], [38,56], [58,62], [72,75], [25,76]];
  return positions[index % positions.length];
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
        }
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
