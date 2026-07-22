const state = {
  data: null,
  risk: 'all',
  store: 'all',
  vulnerability: 'all',
  activeTab: 'overview',
  chart: null,
  loading: false,
  lastLoadedAt: 0,
  refreshTimer: null,
  dialogTrigger: null
};
const EXPECTED_PACK_VERSION = '';
const DASHBOARD_CACHE_KEY = 'weatherOpsDashboard:lastSuccess:v2';
const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const WEATHER_SIGNAL_REFRESH_HOURS = 2;
const WEATHER_SIGNAL_STALE_HOURS = 3;

const $ = (id) => document.getElementById(id);

const STATUS_ORDER = { Error: 5, Red: 4, Orange: 3, Yellow: 2, Green: 1, Gray: 0 };
const STATUS_LABELS = {
  Error: '오류',
  Red: '제한확인',
  Orange: '조치',
  Yellow: '주의',
  Green: '정상',
  Gray: '대기'
};
const SUMMARY_SCHEDULES = [
  { hour: 9, minute: 10 }
];
const SUMMARY_GRACE_MINUTES = 45;
const PROD_MODE_HELP = '이 대시보드는 운영 반영 대상(prod) dashboard payload를 기준으로 집계합니다. shadow/test 실행 기록은 원장 검증에는 사용되지만 화면 집계에서는 제외됩니다.';
const WEATHER_SIGNAL_HELP = '기상 신호는 최신 Action_Log/Alert_Log 기준의 API 감지 결과이며 2시간마다 무알림 갱신됩니다. shadow 신호도 실제 API 기반일 수 있으며, 공식 운영 액션 원장 반영 전 상태로 분리 표시합니다.';
const WEATHER_API_HELP = '기상 수치는 현재 실황과 오늘 남은 운영시간 예보를 구분해 표시합니다. Apps Script payload에 실황 또는 예보 필드가 없는 값은 표시하지 않으며, 운영 상태와 기상 신호는 분리해서 봐야 합니다.';
const WEATHER_THRESHOLD_HELP = '임계값: 강수 Yellow=POP 60% 또는 PCP 0.1mm+, Orange=POP 80% 또는 PCP 5mm+, Red=PCP 15mm+. 풍속 7/10/14m/s, 한파 0/-5/-10도, 적설 0.1/1/5cm, 폭염 30/33/35도, PM10 81/151/300, PM2.5 36/76/150 기준입니다.';
const STATIC_HELP_ITEMS = [
  ['.source-strip h2', '단기예보·실황·대기질은 공식 prod 판단의 원천 가용성을, AWS·레이더·기상특보는 신규 shadow 검증 상태를 보여줍니다. shadow 검증 결과는 공식 운영 등급과 액션을 자동 변경하지 않습니다.', '기상 원천 상태 기준'],
  ['.map-panel h2', `지점 운영 매트릭스는 공식 prod 운영 상태, 최신 기상 신호, shadow 검증과 AS·CS·회복 게이트를 한 행에서 비교합니다. ${WEATHER_SIGNAL_HELP}`, '지점 운영 매트릭스 기준'],
  ['.priority-panel h2', '우선 확인 큐는 오늘 공식 미완료 액션을 먼저 표시하고, 그다음 최신 기상 신호의 즉시확인·사전점검 지점을 위험도순으로 최대 3건 보여줍니다.', '우선 확인 큐 기준'],
  ['.weather-comparison-panel h2', `현재 강수 실황과 오늘 예보 최대강수를 같은 축에서 비교합니다. 수치가 없는 지점은 추정하지 않습니다. ${WEATHER_API_HELP}`, '강수 비교 기준'],
  ['.source-health-panel h2', '공식 운영 판단에 필요한 원천과 신규 shadow 검증 원천의 가용성을 축약해 표시합니다. 부분 결측은 전체 기상 실패와 분리합니다.', '데이터 상태 기준'],
  ['.queue-panel h2', '회복 큐는 기상 영향 이후 처리대수·매출 회복, AS 차단, CRM 가능 여부를 함께 보는 실행 대기열입니다.', '회복 큐 기준'],
  ['#recoveryChartPanel h2', '지점 필터를 선택하면 D-day, D+1, D+2 처리대수·매출 회복률을 표시합니다. 100%는 기준선 회복, 90% 미만은 조치 검토 구간입니다.', '회복률 기준'],
  ['.action-panel h2', '오늘 조치할 항목은 미완료 운영 액션을 사업운영팀과 마케팅팀으로 나눕니다. 운영 제한·AS 차단·회복 조치가 우선입니다.', '조치 항목 기준'],
  ['.risk-panel h2', `오늘 기상 리스크는 활성 리스크 컬럼만 보여줍니다. ${WEATHER_SIGNAL_HELP} ${WEATHER_THRESHOLD_HELP}`, '기상 리스크 기준'],
  ['.funnel-panel h2', '회복 실행 단계는 하락 감지부터 CRM 후보, 발송, 재방문 회수까지 전환 흐름을 보여줍니다. AS 차단은 정상화 전 단계로 별도 표시합니다.', '회복 실행 기준'],
  ['.small-multiple-panel h2', '지점별 회복 진행은 처리대수 회복률을 색상으로, 매출 회복률을 보조 수치로 표시합니다. 100% 이상 정상, 90~99% 관찰, 90% 미만 조치 기준입니다.', '회복 진행 기준'],
  ['.gap-panel h2', '처리대수 회복률과 매출 회복률의 차이를 비교합니다. 처리대수만 회복된 지점은 결제, 단가, 구독·쿠폰 믹스를 추가 확인합니다.', '회복 갭 기준'],
  ['.table-panel h2', `지점별 상태 표는 운영 상태, 기상 신호, AS·다운타임, CS·고객 안내, 회복, 담당, 다음 액션을 한 줄로 비교합니다. ${WEATHER_API_HELP}`, '지점별 상태 기준'],
  ['.timeline-panel h2', '오늘 운영 타임라인은 오픈 전, 피크 전, 마감 전 점검 시점을 전체 상태와 함께 보여주는 운영 리마인더입니다.', '타임라인 기준'],
  ['.system-panel h2', '시스템 상태는 요약 실행, 매출 동기화, 시트 버전, 대시보드 payload 연결 상태, 판단 가능성, 최신 기상 신호를 표시합니다.', '시스템 상태 기준']
];

checkAuthSession();

document.addEventListener('DOMContentLoaded', () => {
  decorateDashboardHelp();
  bindEvents();
  loadDashboard();
  startAutoRefresh();
});

function checkAuthSession() {
  fetch('/api/check', { cache: 'no-store' })
    .then((response) => {
      if (response.status === 401) window.location.href = '/api/auth';
    })
    .catch(() => {});
}

function bindEvents() {
  bindDashboardTabs();
  $('refreshBtn').addEventListener('click', () => loadDashboard({ fresh: true }));
  $('copyBriefBtn').addEventListener('click', copyBrief);
  $('storeFilter').addEventListener('change', (event) => {
    state.store = event.target.value;
    state.vulnerability = 'all';
    render();
  });
  $('riskFilter').querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => {
      state.risk = button.dataset.risk;
      state.vulnerability = 'all';
      updateRiskFilterState();
      render();
    });
  });
  const vulnerabilitySummary = $('siteVulnerabilitySummary');
  if (vulnerabilitySummary) {
    vulnerabilitySummary.addEventListener('click', (event) => {
      const button = event.target.closest('[data-vulnerability-filter]');
      if (!button) return;
      const selected = button.dataset.vulnerabilityFilter || 'all';
      state.vulnerability = state.vulnerability === selected ? 'all' : selected;
      state.risk = 'all';
      state.store = 'all';
      $('storeFilter').value = 'all';
      updateRiskFilterState();
      render();
      setActiveTab('overview');
      $('metroMap').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!state.lastLoadedAt || Date.now() - state.lastLoadedAt >= AUTO_REFRESH_INTERVAL_MS) {
      loadDashboard({ fresh: true, silent: true });
    }
  });
  window.addEventListener('online', () => loadDashboard({ fresh: true, silent: true }));
  $('dialogClose').addEventListener('click', closeStoreDialog);
  $('storeDialog').addEventListener('close', () => {
    if (!state.dialogTrigger) return;
    state.dialogTrigger.setAttribute('aria-expanded', 'false');
    state.dialogTrigger.focus();
    state.dialogTrigger = null;
  });
  updateRiskFilterState();
}

function bindDashboardTabs() {
  const tabs = [...document.querySelectorAll('[data-tab-target]')];
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => setActiveTab(tab.dataset.tabTarget, { focus: true }));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      let nextIndex = index;
      if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = tabs.length - 1;
      setActiveTab(tabs[nextIndex].dataset.tabTarget, { focus: true });
    });
  });
  document.querySelectorAll('[data-open-tab]').forEach((button) => {
    button.addEventListener('click', () => setActiveTab(button.dataset.openTab, { focus: true, scroll: true }));
  });
  setActiveTab(state.activeTab);
}

function setActiveTab(tabName, options = {}) {
  const available = [...document.querySelectorAll('[data-tab-panel]')].map((panel) => panel.dataset.tabPanel);
  const next = available.includes(tabName) ? tabName : 'overview';
  state.activeTab = next;
  document.querySelectorAll('[data-tab-target]').forEach((tab) => {
    const active = tab.dataset.tabTarget === next;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
    tab.tabIndex = active ? 0 : -1;
    if (active && options.focus) tab.focus();
  });
  document.querySelectorAll('[data-tab-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.tabPanel !== next;
  });
  if (next === 'recovery' && state.chart) requestAnimationFrame(() => state.chart.resize());
  if (options.scroll) document.querySelector('.dashboard-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeStoreDialog() {
  const dialog = $('storeDialog');
  const trigger = state.dialogTrigger;
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
  state.dialogTrigger = null;
  if (dialog && dialog.open) dialog.close();
  if (trigger) trigger.focus();
}

function startAutoRefresh() {
  if (state.refreshTimer) window.clearInterval(state.refreshTimer);
  state.refreshTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible') loadDashboard({ silent: true });
  }, AUTO_REFRESH_INTERVAL_MS);
}

function decorateDashboardHelp() {
  STATIC_HELP_ITEMS.forEach(([selector, message, label]) => {
    const target = document.querySelector(selector);
    if (!target || target.querySelector('.info-tip')) return;
    target.insertAdjacentHTML('beforeend', ` ${renderInfoTip(message, label)}`);
  });
}

function updateRiskFilterState() {
  $('riskFilter').querySelectorAll('button').forEach((button) => {
    const active = button.dataset.risk === state.risk;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

async function loadDashboard(options = {}) {
  if (state.loading) return;
  state.loading = true;
  if (!options.silent) showLoading(true);
  hideError();
  try {
    const url = options.fresh ? '/api/weather-ops-data?fresh=1' : '/api/weather-ops-data';
    const response = await fetch(url, { cache: 'no-store' });
    if (response.status === 401) {
      window.location.href = '/api/auth';
      return;
    }
    const payload = await parseJsonResponse(response);
    if (!response.ok || payload.source === 'non_json_response') throw new Error(formatApiError(payload, response.status));
    state.data = normalize(payload);
    state.lastLoadedAt = Date.now();
    cacheDashboardData(state.data);
    ensureStoreOptions();
    render();
    if (state.data.system.apiWarning) {
      showError(state.data.system.apiWarning);
    }
  } catch (error) {
    console.warn('Weather Ops dashboard load failed', error);
    const cached = restoreCachedDashboardData();
    const readableError = userFacingErrorMessage(error && error.message ? error.message : error);
    if (cached) {
      state.data = cached.data;
      ensureStoreOptions();
      render();
      showError(`데이터 갱신 실패. 마지막 성공 데이터(${formatDateTime(state.data.generatedAt) || formatDateTime(cached.cachedAt) || '저장본'})를 표시합니다. ${readableError}`);
    } else {
      renderFatalErrorState(readableError);
      showError(`데이터를 불러오지 못했습니다. ${readableError}`);
    }
  } finally {
    state.loading = false;
    if (!options.silent) showLoading(false);
  }
}

function formatApiError(payload, status) {
  if (payload && payload.source === 'upstream_timeout') return '데이터 서버 응답 지연으로 갱신하지 못했습니다.';
  if (payload && ['missing_config', 'upstream_config_error', 'upstream_auth_error'].includes(payload.source)) {
    return '대시보드 API 설정 확인이 필요합니다.';
  }
  return userFacingErrorMessage((payload && (payload.error || payload.detail)) || `HTTP ${status}`);
}

function cacheDashboardData(data) {
  try {
    if (!data || !Array.isArray(data.stores) || !data.stores.length) return;
    sessionStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify({
      cachedAt: new Date().toISOString(),
      data
    }));
  } catch (_) {}
}

function restoreCachedDashboardData() {
  try {
    const raw = sessionStorage.getItem(DASHBOARD_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.data || !Array.isArray(parsed.data.stores) || !parsed.data.stores.length) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function userFacingErrorMessage(message) {
  const text = String(message || '').trim();
  const lower = text.toLowerCase();
  if (!text) return '잠시 후 새로고침으로 다시 시도하세요.';
  if (lower.includes('timeout') || text.includes('응답 지연') || text.includes('timed out')) {
    return '데이터 서버 응답 지연입니다. 새로고침으로 다시 시도하세요.';
  }
  if (text.includes('WEATHER_OPS_') || text.includes('TOKEN') || text.includes('환경변수') || text.includes('Script Property')) {
    return '대시보드 API 설정 확인이 필요합니다. 관리자 설정 확인 후 새로고침하세요.';
  }
  if (lower.includes('unauthorized') || lower.includes('authorization')) {
    return '대시보드 인증 설정 확인이 필요합니다. 관리자 설정 확인 후 새로고침하세요.';
  }
  return text.split('|')[0].trim() || '잠시 후 새로고침으로 다시 시도하세요.';
}

function renderFatalErrorState(message) {
  const text = message || '잠시 후 새로고침으로 다시 시도하세요.';
  if (state.chart) {
    state.chart.destroy();
    state.chart = null;
  }
  $('overallStatus').textContent = '연결 오류';
  $('overallStatus').className = 'status-word text-Red';
  $('headline').textContent = '데이터를 불러오지 못했습니다.';
  $('heroMeta').innerHTML = `<span class="meta-pill">실데이터 연결 실패${renderInfoTip(text, '연결 오류')}</span>`;
  $('kpiStrip').innerHTML = '';
  const decision = $('decisionBanner');
  if (decision) {
    decision.hidden = true;
    decision.innerHTML = '';
  }
  const sourceSummary = $('sourceDecisionSummary');
  const sourceStrip = $('weatherSourceStrip');
  const sourceDetail = $('weatherSourceDetailBody');
  const sourceMode = $('enhancedModeTag');
  if (sourceSummary) {
    sourceSummary.innerHTML = '<div class="source-decision-item danger"><span>원천 연결</span><strong>확인 필요</strong></div>';
  }
  if (sourceStrip) sourceStrip.innerHTML = '';
  if (sourceDetail) sourceDetail.innerHTML = `<div class="source-detail-row"><b>연결 오류</b><span>${escapeHtml(text)}</span></div>`;
  if (sourceMode) sourceMode.textContent = '연결 실패';
  const vulnerabilitySummary = $('siteVulnerabilitySummary');
  if (vulnerabilitySummary) vulnerabilitySummary.innerHTML = '';
  const vulnerabilityContract = $('siteVulnerabilityContractStatus');
  if (vulnerabilityContract) vulnerabilityContract.innerHTML = '';
  $('mapCount').textContent = '0개 지점';
  $('metroMap').innerHTML = `<div class="empty-state filter-empty">대시보드 데이터를 불러오지 못했습니다. 새로고침으로 다시 시도하세요.</div>`;
  if ($('priorityQueue')) $('priorityQueue').innerHTML = '<div class="empty-state compact">확인 항목을 불러오지 못했습니다.</div>';
  if ($('priorityCount')) $('priorityCount').textContent = '0건';
  if ($('weatherComparison')) $('weatherComparison').innerHTML = '<div class="empty-state compact">기상 비교 데이터를 불러오지 못했습니다.</div>';
  if ($('sourceHealthCompact')) $('sourceHealthCompact').innerHTML = '<div class="empty-state compact">데이터 상태를 불러오지 못했습니다.</div>';
  $('opsActions').innerHTML = '<div class="empty-state compact">데이터 연결 후 조치 항목을 표시합니다.</div>';
  $('marketingActions').innerHTML = '<div class="empty-state compact">데이터 연결 후 마케팅 항목을 표시합니다.</div>';
  $('recoveryQueue').innerHTML = '<div class="empty-state">데이터 연결 후 회복 큐를 표시합니다.</div>';
  const recoveryCount = $('recoveryQueueCount');
  if (recoveryCount) recoveryCount.textContent = '0건';
  $('riskMatrix').innerHTML = '<div class="empty-state">데이터 연결 후 기상 리스크를 표시합니다.</div>';
  $('recoveryFunnel').innerHTML = '<div class="empty-state">데이터 연결 후 회복 퍼널을 표시합니다.</div>';
  $('recoveryStageHeatmap').innerHTML = '<div class="empty-state">데이터 연결 후 회복 진행을 표시합니다.</div>';
  const bulletList = $('processedBulletList');
  if (bulletList) bulletList.innerHTML = '';
  $('recoveryComparison').innerHTML = '<div class="empty-state">데이터 연결 후 회복 비교를 표시합니다.</div>';
  $('storeTable').innerHTML = '<tr><td colspan="8">데이터 연결 후 지점별 상태를 표시합니다.</td></tr>';
  $('weatherTimeline').innerHTML = '<div class="timeline-item"><div class="timeline-label">데이터 연결 후 타임라인을 표시합니다.</div></div>';
  $('systemStatus').innerHTML = `
    <div class="system-item danger system-wide">
      <span class="system-dot" aria-hidden="true"></span>
      <div class="system-label">연결 오류</div>
      <div class="system-value">${escapeHtml(text)}</div>
    </div>
  `;
  const trend = $('systemTrend');
  if (trend) trend.innerHTML = '';
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (error) {
    return {
      error: `HTTP ${response.status}`,
      detail: `대시보드 API가 JSON이 아닌 응답을 반환했습니다: ${text.slice(0, 160)}`,
      source: 'non_json_response'
    };
  }
}

function normalize(payload) {
  const raw = objectFrom(payload);
  const data = unwrapPayload(raw);
  const weatherSignal = normalizeWeatherSignal(firstPresent(data, ['weatherSignal', 'latestWeatherSignal', 'weather_signal', 'latest_weather_signal']));
  const signalByStore = weatherSignalStoreMap(weatherSignal);
  const stores = arrayFrom(data.stores || data.storeRows || data.store_rows)
    .map((store) => normalizeStore(store, signalByStore));
  const system = objectFrom(data.system);
  const version = firstPresent(data, ['version', 'sheetVersion', 'sheet_version', 'packVersion', 'pack_version', 'weatherOpsVersion', 'weather_ops_version'])
    || firstPresent(raw, ['version', 'sheetVersion', 'sheet_version', 'packVersion', 'pack_version', 'weatherOpsVersion', 'weather_ops_version'])
    || firstPresent(system, ['sheetVersion', 'sheet_version', 'packVersion', 'pack_version', 'appsScriptVersion', 'apps_script_version'])
    || 'unknown';

  stores.sort((a, b) => (STATUS_ORDER[b.status] || 0) - (STATUS_ORDER[a.status] || 0) || b.riskScore - a.riskScore);

  return {
    version,
    buildId: firstPresent(data, ['buildId', 'build_id'])
      || firstPresent(raw, ['buildId', 'build_id'])
      || firstPresent(system, ['scriptBuildId', 'script_build_id'])
      || '',
    generatedAt: firstPresent(data, ['generatedAt', 'generated_at']) || firstPresent(raw, ['generatedAt', 'generated_at']) || '',
    source: data.source || raw.source || 'unknown',
    dashboardPayloadVersion: firstPresent(data, ['dashboardPayloadVersion', 'dashboard_payload_version']) || '',
    decisionReadiness: firstPresent(data, ['decisionReadiness', 'decision_readiness']) || firstPresent(system, ['decisionReadiness', 'decision_readiness']) || '',
    summary: objectFrom(data.summary),
    stores,
    weatherSignal,
    opsActions: arrayFrom(data.opsActions || data.ops_actions || data.operationsActions || data.operations_actions),
    overdueExceptions: arrayFrom(data.overdueExceptions || data.overdue_exceptions || data.historicalOverdueExceptions || data.historical_overdue_exceptions),
    marketingActions: arrayFrom(data.marketingActions || data.marketing_actions || data.crmActions || data.crm_actions),
    recovery: objectFrom(data.recovery),
    system,
    visuals: normalizeVisuals(objectFrom(data.visuals), objectFrom(data.recovery)),
    weatherTimeline: arrayFrom(data.weatherTimeline || data.weather_timeline || data.timeline)
  };
}

function unwrapPayload(payload) {
  if (!payload || typeof payload !== 'object') return {};
  const candidates = [
    payload.dashboardPayload,
    payload.dashboard_payload,
    payload.payload,
    payload.data,
    payload.dashboard
  ];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      if (candidate.summary || candidate.stores || candidate.recovery || candidate.system || candidate.visuals || candidate.weatherSignal || candidate.latestWeatherSignal) return candidate;
    }
  }
  return payload;
}

function normalizeWeatherSignal(signal) {
  signal = objectFrom(signal);
  const summary = objectFrom(signal.summary);
  const stores = arrayFrom(signal.stores).map((row) => {
    row = objectFrom(row);
    const status = normalizeStatus(firstPresent(row, ['status', 'overallStatus', 'overall_status', 'level', 'riskLevel', 'risk_level']) || 'Gray');
    const weatherValues = normalizeSignalWeatherValues(
      firstPresent(row, ['weatherValues', 'weather_values', 'weather', 'weatherData', 'weather_data']),
      row
    );
    const enhancedSignal = normalizeEnhancedSignal(
      firstPresent(row, ['enhancedSignal', 'enhanced_signal'])
        || firstPresent(weatherValues, ['enhancedSignal', 'enhanced_signal']),
      Object.assign({}, weatherValues, row)
    );
    const siteVulnerability = normalizeSiteVulnerability(
      firstPresent(row, ['siteVulnerability', 'site_vulnerability'])
        || firstPresent(weatherValues, ['siteVulnerability', 'site_vulnerability'])
    );
    return {
      storeId: firstPresent(row, ['storeId', 'store_id', 'id']) || slug(firstPresent(row, ['storeName', 'store_name', 'name', 'store']) || ''),
      storeName: firstPresent(row, ['storeName', 'store_name', 'name', 'store']) || '-',
      status,
      actionLevel: firstPresent(row, ['actionLevel', 'action_level']) || signalActionLevel(status),
      riskType: firstPresent(row, ['riskType', 'risk_type', 'trigger', 'triggerType', 'trigger_type']) || '-',
      reason: firstPresent(row, ['reason', 'message', 'operationStatus', 'operation_status']) || '',
      mode: firstPresent(row, ['mode', 'signalMode', 'signal_mode']) || signal.mode || '',
      observedAt: firstPresent(row, ['observedAt', 'observed_at', 'generatedAt', 'generated_at']) || signal.observedAt || signal.observed_at || signal.generatedAt || signal.generated_at || '',
      weatherValues,
      loggedStatus: normalizeStatus(firstPresent(row, ['loggedStatus', 'logged_status']) || status),
      metricStatus: normalizeStatus(firstPresent(row, ['metricStatus', 'metric_status']) || status),
      sourceStatus: normalizeSignalSourceStatus(firstPresent(row, ['sourceStatus', 'source_status', 'dataStatus', 'data_status'])),
      sourceError: firstPresent(row, ['sourceError', 'source_error']) || '',
      sourceWarnings: firstPresent(row, ['sourceWarnings', 'source_warnings']) || '',
      sourceDetails: objectFrom(firstPresent(row, ['sourceDetails', 'source_details'])),
      consistency: objectFrom(firstPresent(row, ['consistency'])),
      enhancedSignal,
      siteVulnerability,
      operationStatus: firstPresent(row, ['operationStatus', 'operation_status']) || '',
      prodActionEventId: firstPresent(row, ['prodActionEventId', 'prod_action_event_id']) || ''
    };
  });
  const overallStatus = normalizeStatus(firstPresent(signal, ['overallStatus', 'overall_status', 'status', 'level']) || topStatus(stores));
  return {
    mode: firstPresent(signal, ['mode', 'signalMode', 'signal_mode']) || '',
    generatedAt: firstPresent(signal, ['generatedAt', 'generated_at']) || '',
    observedAt: firstPresent(signal, ['observedAt', 'observed_at']) || '',
    overallStatus,
    status: overallStatus,
    summary: {
      totalStores: numberFrom(firstPresent(summary, ['totalStores', 'total_stores']), stores.length),
      normal: numberFrom(firstPresent(summary, ['normal', 'green']), 0),
      watch: numberFrom(firstPresent(summary, ['watch', 'yellow']), 0),
      actionRequired: numberFrom(firstPresent(summary, ['actionRequired', 'action_required', 'immediate', 'orangeRed']), 0),
      dataCheck: numberFrom(firstPresent(summary, ['dataCheck', 'data_check', 'error']), 0),
      riskNormal: numberFrom(firstPresent(summary, ['riskNormal', 'risk_normal']), 0),
      riskWatch: numberFrom(firstPresent(summary, ['riskWatch', 'risk_watch']), 0),
      riskActionRequired: numberFrom(firstPresent(summary, ['riskActionRequired', 'risk_action_required']), 0)
    },
    stores,
    source: firstPresent(signal, ['source']) || '',
    sourceLogNames: arrayFrom(signal.sourceLogNames || signal.source_log_names),
    message: firstPresent(signal, ['message', 'headline']) || ''
  };
}

function weatherSignalStoreMap(weatherSignal) {
  return arrayFrom(weatherSignal && weatherSignal.stores).reduce((map, signal) => {
    const id = slug(signal.storeId || signal.storeName);
    if (id) map[id] = signal;
    return map;
  }, {});
}

function normalizeStore(store, signalByStore = {}) {
  store = objectFrom(store);
  const name = firstPresent(store, ['name', 'storeName', 'store_name', 'store', '지점명', '지점', '매장명']) || '-';
  const id = firstPresent(store, ['id', 'storeId', 'store_id', 'storeCode', 'store_code', '지점ID']) || slug(name);
  const signal = signalByStore[slug(id)] || signalByStore[slug(name)] || {};
  const rawProdStatus = firstPresent(store, ['prodStatus', 'prod_status', 'status', 'risk', 'level', 'riskLevel', 'risk_level', '상태']);
  const rawSignalStatus = firstPresent(store, ['signalStatus', 'signal_status']) || firstPresent(signal, ['status', 'overallStatus', 'overall_status', 'level']);
  const prodStatusProvided = rawProdStatus !== null;
  const signalStatusProvided = rawSignalStatus !== null || Object.keys(signal).length > 0;
  const prodStatus = normalizeStatus(prodStatusProvided ? rawProdStatus : 'Gray');
  const signalStatus = normalizeStatus(signalStatusProvided ? rawSignalStatus : 'Gray');
  const displayStatus = storeDisplayStatus(prodStatus, signalStatus, prodStatusProvided, signalStatusProvided);
  const weatherValues = normalizeSignalWeatherValues(
    firstPresent(store, ['weatherValues', 'weather_values']) || signal.weatherValues || signal.weather || {},
    Object.assign({}, signal, store)
  );
  const enhancedSignal = signal.enhancedSignal && typeof signal.enhancedSignal === 'object'
    ? signal.enhancedSignal
    : normalizeEnhancedSignal(
      firstPresent(store, ['enhancedSignal', 'enhanced_signal'])
        || firstPresent(weatherValues, ['enhancedSignal', 'enhanced_signal']),
      Object.assign({}, weatherValues, store)
    );
  const storeSiteVulnerability = objectFrom(firstPresent(store, ['siteVulnerability', 'site_vulnerability']));
  const signalSiteVulnerability = signal.siteVulnerability && signal.siteVulnerability.provided
    ? signal.siteVulnerability
    : {};
  const siteVulnerability = normalizeSiteVulnerability(Object.assign({}, signalSiteVulnerability, storeSiteVulnerability));
  return {
    id,
    name,
    region: firstPresent(store, ['region', 'area', 'address', '권역', '지역']) || '',
    dri: firstPresent(store, ['dri', 'owner', 'manager', 'storeDri', 'store_dri', '담당', '담당자']) || '-',
    status: displayStatus,
    prodStatus,
    prodStatusProvided,
    signalStatus,
    signalStatusProvided,
    signalActionLevel: firstPresent(store, ['signalActionLevel', 'signal_action_level']) || signal.actionLevel || signalActionLevel(signalStatus),
    signalMode: firstPresent(store, ['signalMode', 'signal_mode']) || signal.mode || '',
    signalReason: firstPresent(store, ['signalReason', 'signal_reason']) || signal.reason || '',
    signalRiskType: firstPresent(store, ['signalRiskType', 'signal_risk_type']) || signal.riskType || '',
    signalObservedAt: firstPresent(store, ['signalObservedAt', 'signal_observed_at']) || signal.observedAt || '',
    signalSourceStatus: normalizeSignalSourceStatus(firstPresent(store, ['signalSourceStatus', 'signal_source_status', 'sourceStatus', 'source_status', 'dataStatus', 'data_status'])
      || firstPresent(signal, ['sourceStatus', 'source_status', 'dataStatus', 'data_status'])),
    signalSourceError: firstPresent(store, ['signalSourceError', 'signal_source_error', 'sourceError', 'source_error'])
      || firstPresent(signal, ['sourceError', 'source_error']) || '',
    signalSourceWarnings: firstPresent(store, ['signalSourceWarnings', 'signal_source_warnings', 'sourceWarnings', 'source_warnings'])
      || firstPresent(signal, ['sourceWarnings', 'source_warnings']) || '',
    signalMetricStatus: normalizeStatus(firstPresent(store, ['signalMetricStatus', 'signal_metric_status', 'metricStatus', 'metric_status'])
      || firstPresent(signal, ['metricStatus', 'metric_status']) || signalStatus),
    signalConsistency: objectFrom(firstPresent(store, ['signalConsistency', 'signal_consistency', 'consistency']) || signal.consistency),
    enhancedSignal,
    siteVulnerability,
    weather: normalizeWeatherLabel(store),
    weatherDetail: normalizeWeatherDetail(store),
    weatherData: normalizeWeatherData(store),
    weatherValues,
    trigger: firstPresent(store, ['trigger', 'triggerType', 'trigger_type', 'triggerLabel', 'trigger_label', '트리거']) || '-',
    riskScore: numberFrom(firstPresent(store, ['riskScore', 'risk_score', 'score', 'risk_point', '점수']), 0),
    openIssueCount: numberFrom(firstPresent(store, ['openIssueCount', 'open_issue_count', 'issueCount', 'issue_count']), 0),
    asStatus: firstPresent(store, ['asStatus', 'as_status', 'normalizationGate', 'normalization_gate', 'AS상태']) || '-',
    normalizationBlocker: firstPresent(store, ['normalizationBlocker', 'normalization_blocker', 'capacityBlocker', 'capacity_blocker', 'AS차단사유']) || '',
    vendorStatus: firstPresent(store, ['vendorStatus', 'vendor_status', 'asVendorStatus', 'as_vendor_status']) || '',
    vendorEta: firstPresent(store, ['vendorEta', 'vendor_eta', 'asEta', 'as_eta', 'repairEta', 'repair_eta']) || '',
    downtimeStartedAt: firstPresent(store, ['downtimeStartedAt', 'downtime_started_at', 'outageStartedAt', 'outage_started_at']) || '',
    downtimeMinutes: numericOrNull(firstPresent(store, ['downtimeMinutes', 'downtime_minutes', 'outageMinutes', 'outage_minutes'])),
    customerNoticeStatus: firstPresent(store, ['customerNoticeStatus', 'customer_notice_status', 'customerActionStatus', 'customer_action_status', 'noticeStatus', 'notice_status']) || '',
    customerImpact: firstPresent(store, ['customerImpact', 'customer_impact', 'customerImpactStatus', 'customer_impact_status', 'customerIssue', 'customer_issue']) || '',
    nextUpdateDue: firstPresent(store, ['nextUpdateDue', 'next_update_due', 'dueAt', 'due_at']) || '',
    recoveryStatus: firstPresent(store, ['recoveryStatus', 'recovery_status', 'recoveryState', 'recovery_state', '회복상태']) || '-',
    crmReady: normalizeBoolean(firstPresent(store, ['crmReady', 'crm_ready', 'crmReadyYn', 'crm_ready_yn', 'crmAllowed', 'crm_allowed', 'crm_allowed_yn'])),
    nextAction: firstPresent(store, ['nextAction', 'next_action', 'recommendedAction', 'recommended_action', 'action', '다음액션']) || '-'
  };
}

function normalizeSiteVulnerability(value) {
  const row = objectFrom(value);
  const provided = row.provided === true || Object.keys(row).some((key) => key !== 'provided');
  const actionList = (keys) => {
    const raw = firstPresent(row, keys);
    if (Array.isArray(raw)) return uniqueTextParts(raw);
    if (typeof raw === 'string') return uniqueTextParts(raw.split(/\r?\n|\s*\|\s*/));
    return [];
  };
  const rainDrainageMinMinutes = numericOrNull(firstPresent(row, ['rainDrainageMinMinutes', 'rain_drainage_min_minutes']));
  const rainDrainageMaxMinutes = numericOrNull(firstPresent(row, ['rainDrainageMaxMinutes', 'rain_drainage_max_minutes']));
  const normalized = {
    provided,
    rainPoolingPoints: String(firstPresent(row, ['rainPoolingPoints', 'rain_pooling_points']) || '').trim(),
    rainDrainageMinMinutes,
    rainDrainageMaxMinutes,
    rainRouteRisk: normalizeBoolean(firstPresent(row, ['rainRouteRisk', 'rain_route_risk'])),
    rainEquipmentRisk: String(firstPresent(row, ['rainEquipmentRisk', 'rain_equipment_risk']) || '').trim(),
    rainOperationalHistory: String(firstPresent(row, ['rainOperationalHistory', 'rain_operational_history']) || '').trim(),
    rainPriorityActions: actionList(['rainPriorityActions', 'rain_priority_actions']),
    windPriorityActions: actionList(['windPriorityActions', 'wind_priority_actions']),
    source: String(firstPresent(row, ['source']) || '').trim(),
    updatedAt: String(firstPresent(row, ['updatedAt', 'updated_at']) || '').trim()
  };
  normalized.available = Boolean(
    normalized.rainPoolingPoints
    || normalized.rainDrainageMinMinutes !== null
    || normalized.rainDrainageMaxMinutes !== null
    || normalized.rainRouteRisk
    || meaningfulEquipmentRisk(normalized.rainEquipmentRisk)
    || normalized.rainOperationalHistory
    || normalized.rainPriorityActions.length
    || normalized.windPriorityActions.length
  );
  return normalized;
}

function normalizeVisuals(visuals, recovery) {
  return Object.assign({}, visuals, {
    recoveryGapByStore: arrayFrom(visuals.recoveryGapByStore || visuals.recovery_gap_by_store || recovery.gapByStore || recovery.gap_by_store),
    processedBulletByStore: arrayFrom(visuals.processedBulletByStore || visuals.processed_bullet_by_store || recovery.bulletByStore || recovery.bullet_by_store),
    systemTrend: arrayFrom(visuals.systemTrend || visuals.system_trend),
    openActionTrend: arrayFrom(visuals.openActionTrend || visuals.open_action_trend)
  });
}

function normalizeWeatherData(store) {
  store = objectFrom(store);
  const objectWeather = typeof store.weather === 'object' && store.weather !== null ? store.weather : {};
  const data = Object.assign({}, objectWeather, objectFrom(store.weatherData || store.weather_data || store.weatherMetrics || store.weather_metrics));
  const aliases = {
    pop: ['weather_pop', 'rainProbability', 'rain_probability', '강수확률'],
    pcp: ['weather_pcp', 'rainfallMm', 'rainfall_mm', 'precipitationMm', 'precipitation_mm', '강수량'],
    windSpeed: ['weather_wsd', 'wsd', 'wind_speed', '풍속'],
    tmpMax: ['weather_tmp_max', 'tmp_max', 'tmx', '최고기온'],
    tmpMin: ['weather_tmp_min', 'tmp_min', 'tmn', '최저기온'],
    snowfallCm: ['weather_sno', 'sno', 'snowfall_cm', '적설'],
    pm10: ['weather_pm10', 'air_pm10', 'PM10', '미세먼지'],
    pm25: ['weather_pm25', 'air_pm25', 'PM25', 'PM2_5', '초미세먼지'],
    peakTime: ['weather_peak_time', 'peak_time', 'weatherPeakTime', 'weather_peak_time', '피크시각'],
    weatherBaseAt: ['weather_base_at', 'weatherBaseAt', 'base_at', '기상기준시각']
  };
  Object.keys(aliases).forEach((key) => {
    const value = firstPresent(store, aliases[key]);
    if (value !== null) data[key] = value;
  });
  return normalizeSignalWeatherValues(data, store);
}

function normalizeSignalWeatherValues(value, fallback = {}) {
  const source = objectFrom(value);
  const row = objectFrom(fallback);
  const observation = objectFrom(firstPresent(source, ['observation', 'currentObservation', 'current_observation', 'currentWeather', 'current_weather'])
    || firstPresent(row, ['observation', 'currentObservation', 'current_observation', 'currentWeather', 'current_weather']));
  const forecast = objectFrom(firstPresent(source, ['forecast', 'weatherForecast', 'weather_forecast'])
    || firstPresent(row, ['forecast', 'weatherForecast', 'weather_forecast']));
  const normalized = Object.assign({}, source);
  const fields = {
    observedRain1h: ['observedRain1h', 'observed_rain_1h', 'currentRain1h', 'current_rain_1h', 'rn1', 'RN1'],
    observedTemperature: ['observedTemperature', 'observed_temperature', 'currentTemperature', 'current_temperature', 't1h', 'T1H'],
    observedWind: ['observedWind', 'observed_wind', 'currentWind', 'current_wind', 'observationWind', 'observation_wind'],
    observedAt: ['observedAt', 'observed_at', 'observationAt', 'observation_at', 'currentObservedAt', 'current_observed_at'],
    forecastMaxPop: ['forecastMaxPop', 'forecast_max_pop', 'maxPop', 'max_pop'],
    forecastMaxPcp1h: ['forecastMaxPcp1h', 'forecast_max_pcp_1h', 'forecastMaxPcp', 'forecast_max_pcp', 'maxPcp', 'max_pcp'],
    forecastMaxWind: ['forecastMaxWind', 'forecast_max_wind', 'maxWind', 'max_wind'],
    forecastMaxTemperature: ['forecastMaxTemperature', 'forecast_max_temperature', 'maxTemperature', 'max_temperature'],
    forecastMinTemperature: ['forecastMinTemperature', 'forecast_min_temperature', 'minTemperature', 'min_temperature'],
    forecastPeakTime: ['forecastPeakTime', 'forecast_peak_time', 'weatherPeakTime', 'weather_peak_time'],
    forecastBaseAt: ['forecastBaseAt', 'forecast_base_at', 'weatherBaseAt', 'weather_base_at'],
    airObservedAt: ['airObservedAt', 'air_observed_at', 'airQualityObservedAt', 'air_quality_observed_at'],
    forecastCacheFallback: ['forecastCacheFallback', 'forecast_cache_fallback', 'weatherCacheFallback', 'weather_cache_fallback'],
    observationCacheFallback: ['observationCacheFallback', 'observation_cache_fallback'],
    airCacheFallback: ['airCacheFallback', 'air_cache_fallback']
  };
  Object.keys(fields).forEach((key) => {
    const aliases = fields[key];
    const candidate = firstPresent(source, aliases)
      ?? firstPresent(row, aliases)
      ?? firstPresent(observation, aliases)
      ?? firstPresent(forecast, aliases);
    if (candidate !== null) normalized[key] = candidate;
  });
  if (firstPresent(normalized, ['observedWind']) === null) {
    const observedWind = firstPresent(observation, ['WSD', 'wsd', 'windSpeed', 'wind_speed']);
    if (observedWind !== null) normalized.observedWind = observedWind;
  }
  const compatibility = {
    pop: normalized.forecastMaxPop,
    pcp: normalized.forecastMaxPcp1h,
    windSpeed: normalized.forecastMaxWind,
    tmpMax: normalized.forecastMaxTemperature,
    tmpMin: normalized.forecastMinTemperature,
    peakTime: normalized.forecastPeakTime,
    weatherBaseAt: normalized.forecastBaseAt
  };
  Object.keys(compatibility).forEach((key) => {
    if (firstPresent(normalized, [key]) === null && compatibility[key] !== undefined && compatibility[key] !== null && compatibility[key] !== '') {
      normalized[key] = compatibility[key];
    }
  });
  return normalized;
}

function normalizeEnhancedSignal(value, fallback = {}) {
  const nested = objectFrom(value);
  const row = objectFrom(fallback);
  const compatibilityKeys = [
    'enhancedValidationMode', 'enhanced_validation_mode', 'enhancedSourceStatus', 'enhanced_source_status',
    'enhancedSourceError', 'enhanced_source_error', 'enhancedSourceWarnings', 'enhanced_source_warnings',
    'enhancedFallbackNotices', 'enhanced_fallback_notices',
    'enhancedFusionStatus', 'enhanced_fusion_status', 'enhancedFusionReason', 'enhanced_fusion_reason',
    'awsStationId', 'aws_station_id', 'awsStationName', 'aws_station_name', 'awsDistanceKm', 'aws_distance_km',
    'awsRain15m', 'aws_rain_15m', 'awsRain1h', 'aws_rain_1h', 'awsRainDay', 'aws_rain_day',
    'awsTemperature', 'aws_temperature', 'awsWind', 'aws_wind', 'awsObservedAt', 'aws_observed_at',
    'awsStationReferenceMonth', 'aws_station_reference_month', 'awsStationCatalogAgeDays', 'aws_station_catalog_age_days',
    'awsStationCatalogFreshness', 'aws_station_catalog_freshness',
    'awsCacheFallback', 'aws_cache_fallback', 'radarRainRate', 'radar_rain_rate', 'radarUnit', 'radar_unit',
    'radarDistanceKm', 'radar_distance_km', 'radarObservedAt', 'radar_observed_at',
    'radarAreaCode', 'radar_area_code', 'radarSpatialScope', 'radar_spatial_scope',
    'radarFallbackUsed', 'radar_fallback_used', 'radarFallbackType', 'radar_fallback_type',
    'radarCacheFallback', 'radar_cache_fallback', 'weatherWarningSummary', 'weather_warning_summary',
    'weatherWarningIssuedAt', 'weather_warning_issued_at', 'weatherWarningActiveSevere', 'weather_warning_active_severe',
    'operationalImpact', 'operational_impact', 'managerInputRequired', 'manager_input_required',
    'validationPolicy', 'validation_policy'
  ];
  const available = Object.keys(nested).length > 0
    || compatibilityKeys.some((key) => Object.prototype.hasOwnProperty.call(row, key));
  const pick = (nestedKeys, rowKeys = nestedKeys) => {
    for (const key of nestedKeys) {
      if (Object.prototype.hasOwnProperty.call(nested, key) && nested[key] !== undefined) return nested[key];
    }
    for (const key of rowKeys) {
      if (Object.prototype.hasOwnProperty.call(row, key) && row[key] !== undefined) return row[key];
    }
    return null;
  };
  const validationPolicy = objectFrom(pick(['validationPolicy', 'validation_policy'], ['validationPolicy', 'validation_policy']));
  const sourceError = String(pick(['sourceError', 'source_error'], ['enhancedSourceError', 'enhanced_source_error']) || '').trim();
  const sourceWarnings = String(pick(['sourceWarnings', 'source_warnings'], ['enhancedSourceWarnings', 'enhanced_source_warnings']) || '').trim();
  const sourceErrors = uniqueTextParts([
    ...arrayFrom(pick(['sourceErrors', 'source_errors'])),
    sourceError
  ]);
  const sourceWarningItems = uniqueTextParts([
    ...arrayFrom(pick(['sourceWarningItems', 'source_warning_items'])),
    sourceWarnings
  ]);
  const fallbackNotices = uniqueTextParts([
    ...arrayFrom(pick(['fallbackNotices', 'fallback_notices'], ['enhancedFallbackNotices', 'enhanced_fallback_notices']))
  ]);
  return {
    available,
    validationMode: String(pick(['validationMode', 'validation_mode'], ['enhancedValidationMode', 'enhanced_validation_mode']) || '').trim(),
    validationStartedAt: String(pick(['validationStartedAt', 'validation_started_at'], ['enhancedValidationStartedAt', 'enhanced_validation_started_at']) || '').trim(),
    sourceStatus: normalizeSignalSourceStatus(pick(['sourceStatus', 'source_status'], ['enhancedSourceStatus', 'enhanced_source_status'])),
    sourceError,
    sourceErrors,
    sourceWarnings,
    sourceWarningItems,
    fallbackNotices,
    hasSourceError: sourceErrors.length > 0,
    hasFallbackNotice: fallbackNotices.length > 0,
    sourceConfidence: String(pick(['sourceConfidence', 'source_confidence'], ['enhancedSourceConfidence', 'enhanced_source_confidence']) || '').trim(),
    awsStationId: String(pick(['awsStationId', 'aws_station_id']) || '').trim(),
    awsStationName: String(pick(['awsStationName', 'aws_station_name']) || '').trim(),
    awsDistanceKm: numericOrNull(pick(['awsDistanceKm', 'aws_distance_km'])),
    awsRain15m: numericOrNull(pick(['awsRain15m', 'aws_rain_15m'])),
    awsRain1h: numericOrNull(pick(['awsRain1h', 'aws_rain_1h'])),
    awsRainDay: numericOrNull(pick(['awsRainDay', 'aws_rain_day'])),
    awsTemperature: numericOrNull(pick(['awsTemperature', 'aws_temperature'])),
    awsWind: numericOrNull(pick(['awsWind', 'aws_wind'])),
    awsObservedAt: String(pick(['awsObservedAt', 'aws_observed_at']) || '').trim(),
    awsCacheFallback: booleanOrNull(pick(['awsCacheFallback', 'aws_cache_fallback'])),
    awsStationReferenceMonth: String(pick(['awsStationReferenceMonth', 'aws_station_reference_month']) || '').trim(),
    awsStationCatalogAgeDays: numericOrNull(pick(['awsStationCatalogAgeDays', 'aws_station_catalog_age_days'])),
    awsStationCatalogFreshness: String(pick(['awsStationCatalogFreshness', 'aws_station_catalog_freshness']) || '').trim(),
    radarRainRate: numericOrNull(pick(['radarRainRate', 'radar_rain_rate'])),
    radarUnit: String(pick(['radarUnit', 'radar_unit']) || '').trim(),
    radarDistanceKm: numericOrNull(pick(['radarDistanceKm', 'radar_distance_km'])),
    radarObservedAt: String(pick(['radarObservedAt', 'radar_observed_at']) || '').trim(),
    radarCacheFallback: booleanOrNull(pick(['radarCacheFallback', 'radar_cache_fallback'])),
    radarAreaCode: String(pick(['radarAreaCode', 'radar_area_code']) || '').trim(),
    radarSpatialScope: String(pick(['radarSpatialScope', 'radar_spatial_scope']) || '').trim(),
    radarFallbackUsed: booleanOrNull(pick(['radarFallbackUsed', 'radar_fallback_used'])),
    radarFallbackType: String(pick(['radarFallbackType', 'radar_fallback_type']) || '').trim(),
    weatherWarningSummary: String(pick(['weatherWarningSummary', 'weather_warning_summary']) || '').trim(),
    weatherWarningIssuedAt: String(pick(['weatherWarningIssuedAt', 'weather_warning_issued_at']) || '').trim(),
    weatherWarningActiveSevere: booleanOrNull(pick(['weatherWarningActiveSevere', 'weather_warning_active_severe'])),
    forecastMaxPop: numericOrNull(pick(['forecastMaxPop', 'forecast_max_pop'])),
    forecastMaxPcp1h: numericOrNull(pick(['forecastMaxPcp1h', 'forecast_max_pcp_1h'])),
    fusionStatus: String(pick(['fusionStatus', 'fusion_status'], ['enhancedFusionStatus', 'enhanced_fusion_status']) || '').trim(),
    fusionReason: String(pick(['fusionReason', 'fusion_reason'], ['enhancedFusionReason', 'enhanced_fusion_reason']) || '').trim(),
    fusionEvidenceCount: numericOrNull(pick(['fusionEvidenceCount', 'fusion_evidence_count'], ['enhancedFusionEvidenceCount', 'enhanced_fusion_evidence_count'])),
    operationalImpact: String(pick(['operationalImpact', 'operational_impact']) || '').trim(),
    managerInputRequired: booleanOrNull(pick(['managerInputRequired', 'manager_input_required'])),
    affectsOperationalLevel: booleanOrNull(
      pick(['affectsOperationalLevel', 'affects_operational_level'], ['affectsOperationalLevel', 'affects_operational_level'])
        ?? firstPresent(validationPolicy, ['affectsOperationalLevel', 'affects_operational_level'])
    ),
    validationPolicy
  };
}

function booleanOrNull(value) {
  if (value === true || value === false) return value;
  if (value === 1 || value === 0) return Boolean(value);
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return null;
  if (['true', 'y', 'yes', '1', '가능', '필요'].includes(text)) return true;
  if (['false', 'n', 'no', '0', '불가', '불필요', '없음'].includes(text)) return false;
  return null;
}

function normalizeStatus(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('no_signal') || text.includes('nosignal') || text.includes('신호 없음')) return 'Gray';
  if (text.includes('error') || text.includes('오류') || text.includes('실패') || text.includes('unauthorized') || text.includes('권한')) return 'Error';
  if (text.includes('red')) return 'Red';
  if (text.includes('제한') || text.includes('중단') || text.includes('위험')) return 'Red';
  if (text.includes('orange')) return 'Orange';
  if (text.includes('경계') || text.includes('즉시')) return 'Orange';
  if (text.includes('yellow')) return 'Yellow';
  if (text.includes('주의') || text.includes('관찰')) return 'Yellow';
  if (text.includes('gray') || text.includes('unknown') || text.includes('대기') || text.includes('미확정')) return 'Gray';
  if (text.includes('green') || text.includes('정상') || text.includes('완료')) return 'Green';
  return 'Gray';
}

function displayStatusFrom(prodStatus, signalStatus) {
  const prod = normalizeStatus(prodStatus);
  const signal = normalizeStatus(signalStatus);
  return (STATUS_ORDER[signal] || 0) > (STATUS_ORDER[prod] || 0) ? signal : prod;
}

function storeDisplayStatus(prodStatus, signalStatus, prodStatusProvided, signalStatusProvided) {
  const prod = normalizeStatus(prodStatus);
  const signal = normalizeStatus(signalStatus);
  if (!prodStatusProvided) return ['Error', 'Red', 'Orange', 'Yellow'].includes(signal) ? signal : 'Gray';
  if (!signalStatusProvided && prod === 'Green') return 'Gray';
  return displayStatusFrom(prod, signal);
}

function signalActionLevel(status) {
  const normalized = normalizeStatus(status);
  if (normalized === 'Red' || normalized === 'Orange') return '즉시확인';
  if (normalized === 'Yellow') return '사전점검';
  if (normalized === 'Error') return '데이터확인';
  if (normalized === 'Gray') return '신호 없음';
  return '정상';
}

function normalizeWeatherLabel(store) {
  store = objectFrom(store);
  if (typeof store.weather === 'object' && store.weather !== null) {
    return store.weather.label || store.weather.triggerLabel || store.weather.trigger_label || store.trigger || '-';
  }
  return firstPresent(store, ['weather', 'weatherLabel', 'weather_label', 'triggerLabel', 'trigger_label', 'trigger', '기상']) || '-';
}

function normalizeWeatherDetail(store) {
  store = objectFrom(store);
  if (typeof store.weather === 'object' && store.weather !== null) {
    const detail = store.weather.summary || store.weather.detail;
    if (detail) return detail;
    const peak = formatPeakTime(store.weather.peakTime || store.weather.peak_time);
    return peak ? `피크 ${peak}` : '';
  }
  return firstPresent(store, ['weatherDetail', 'weather_detail', 'weatherSummary', 'weather_summary', 'operationStatus', 'operation_status', '상세']) || '';
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
  renderDecisionBanner();
  renderWeatherSources();
  renderSiteVulnerabilitySummary();
  renderMap();
  renderPriorityQueue();
  renderWeatherComparison();
  renderActions();
  renderRecoveryChart();
  renderRecoveryQueue();
  renderRiskMatrix();
  renderRecoveryFunnel();
  renderRecoveryStageHeatmap();
  renderProcessedBulletList();
  renderRecoveryComparison();
  renderStoreTable();
  renderTimeline();
  renderSystem();
  renderSystemTrend();
  updateSectionVisibility();
}

function updateSectionVisibility() {
  const queueRows = arrayFrom(state.data.recovery && state.data.recovery.queue).filter(matchesSelectedStore);
  const opsRows = arrayFrom(state.data.opsActions).filter(matchesSelectedStore);
  const marketingRows = arrayFrom(state.data.marketingActions).filter(matchesSelectedStore);
  const overdueCount = historicalOverdueSummary().count;
  const recoveryActive = hasActiveRecoveryData();
  const actionSection = $('actionSection');
  const queuePanel = $('recoveryQueuePanel');
  const visualGrid = $('visualGrid');
  const primaryGrid = $('primaryDashboardGrid');

  if (actionSection) actionSection.hidden = opsRows.length + marketingRows.length + overdueCount === 0;
  if (queuePanel) queuePanel.hidden = queueRows.length === 0;
  if ($('recoveryFunnelPanel')) $('recoveryFunnelPanel').hidden = !recoveryActive;
  if ($('recoveryStagePanel')) $('recoveryStagePanel').hidden = !recoveryActive;
  if ($('recoveryGapPanel')) $('recoveryGapPanel').hidden = !recoveryActive;
  if (visualGrid) visualGrid.classList.toggle('single-panel', !recoveryActive);
  if (primaryGrid) primaryGrid.classList.toggle('queue-hidden', queueRows.length === 0);
}

function hasActiveRecoveryData() {
  const queue = arrayFrom(state.data.recovery && state.data.recovery.queue).filter(matchesSelectedStore);
  if (queue.length) return true;

  const hasStoreRecovery = filteredStores().some((store) => {
    const text = String(store.recoveryStatus || '').trim();
    return text && text !== '-' && !/(대상 없음|대기 없음|해당 없음|정상|완료|none|not applicable)/i.test(text);
  });
  if (hasStoreRecovery) return true;

  const recovery = state.data.recovery || {};
  const series = state.store === 'all' ? recovery : getRecoverySeries(recovery);
  const values = [series.processedRate, series.processed_rate, series.revenueRate, series.revenue_rate]
    .flatMap((value) => arrayFrom(value))
    .map(numericOrNull)
    .filter((value) => value !== null);
  return values.length > 0;
}

function filteredStores() {
  return state.data.stores.filter((store) => {
    const riskMatch = state.risk === 'all' || store.status === state.risk;
    const storeMatch = state.store === 'all' || store.id === state.store;
    const vulnerabilityMatch = state.vulnerability === 'all' || siteVulnerabilityFilterMatch(store, state.vulnerability);
    return riskMatch && storeMatch && vulnerabilityMatch;
  });
}

function prodOverallStatus() {
  const summary = state.data && state.data.summary ? state.data.summary : {};
  return normalizeStatus(summary.overallStatus || summary.overall_status || topStatus(state.data.stores.map((store) => ({ status: store.prodStatus || store.status }))));
}

function signalOverallStatus() {
  const signal = state.data && state.data.weatherSignal ? state.data.weatherSignal : {};
  if (!hasWeatherSignalData()) return 'Gray';
  const explicit = firstPresent(signal, ['overallStatus', 'overall_status', 'overallLevel', 'overall_level', 'status', 'level']);
  if (explicit !== null) return normalizeStatus(explicit);
  const summaryStatus = signalSummaryStatus(signal);
  if (summaryStatus !== 'Gray') return summaryStatus;
  return topStatus(arrayFrom(signal.stores), 'Gray');
}

function decisionStatus() {
  return displayStatusFrom(prodOverallStatus(), signalOverallStatus());
}

function primaryDashboardStatus() {
  if (hasWeatherSignalData()) return signalOverallStatus();
  const prodStatus = prodOverallStatus();
  return ['Error', 'Red', 'Orange', 'Yellow'].includes(prodStatus) ? prodStatus : 'Gray';
}

function primaryDashboardStatusLabel() {
  if (hasWeatherSignalData()) return '기상 신호';
  return ['Error', 'Red', 'Orange', 'Yellow'].includes(prodOverallStatus()) ? '운영' : '기상 판단';
}

function primaryDashboardStatusText() {
  const status = primaryDashboardStatus();
  if (hasWeatherSignalData() && status === 'Error') return '기상 데이터 확인';
  return `${primaryDashboardStatusLabel()} ${levelLabel(status)}`;
}

function weatherSignalMode() {
  return String((state.data && state.data.weatherSignal && state.data.weatherSignal.mode)
    || (state.data && state.data.system && (state.data.system.currentDataMode || state.data.system.current_data_mode))
    || '').trim();
}

function weatherSignalModeLabel() {
  const mode = weatherSignalMode();
  const labels = {
    prod: '공식 운영',
    shadow: 'shadow 검증',
    test: '테스트'
  };
  return labels[mode] || (mode ? mode : '기상');
}

function weatherSignalHasRisk() {
  if (!hasWeatherSignalData()) return false;
  const signalStatus = signalOverallStatus();
  return ['Error', 'Red', 'Orange', 'Yellow'].includes(signalStatus);
}

function decisionReadiness() {
  const raw = decisionReadinessRaw();
  const explicit = typeof raw === 'object'
    ? String(firstPresent(raw, ['level', 'status', 'readiness', 'state', 'code']) || '').trim()
    : String(raw || '').trim();
  if (explicit === 'error' || explicit === 'danger') return explicit;
  if (!hasWeatherSignalData()) return 'no_signal';
  if (weatherSignalIsStale()) return 'stale';
  if (explicit) return explicit;
  return '';
}

function weatherSignalTimestamp() {
  const signal = state.data && state.data.weatherSignal ? state.data.weatherSignal : {};
  const system = state.data && state.data.system ? state.data.system : {};
  return firstPresent(signal, ['generatedAt', 'generated_at', 'observedAt', 'observed_at'])
    || firstPresent(system, ['lastWeatherSignalAt', 'last_weather_signal_at'])
    || '';
}

function weatherSignalAgeHours() {
  return hoursSince(weatherSignalTimestamp());
}

function weatherSignalIsStale() {
  const age = weatherSignalAgeHours();
  return age !== null && age > WEATHER_SIGNAL_STALE_HOURS;
}

function weatherSignalFreshnessWarning() {
  const age = weatherSignalAgeHours();
  if (age === null || age <= WEATHER_SIGNAL_STALE_HOURS) return '';
  return `기상 신호가 ${Math.floor(age)}시간 이상 갱신되지 않았습니다. 2시간 무알림 갱신과 signal_refresh 로그를 확인하세요.`;
}

function decisionReadinessRaw() {
  return firstPresent(state.data || {}, ['decisionReadiness', 'decision_readiness'])
    || firstPresent((state.data && state.data.system) || {}, ['decisionReadiness', 'decision_readiness'])
    || '';
}

function decisionReadinessLabel() {
  const raw = decisionReadinessRaw();
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const title = firstPresent(raw, ['title', 'label', 'message']);
    if (title) return String(title);
  }
  const labels = {
    prod_ready: '운영 판단 가능 · prod',
    shadow_only: '실제 신호 · 운영 반영 전',
    stale: '신호 오래됨',
    error: '확인 필요',
    ok: '운영 판단 가능',
    warning: '확인 권장',
    danger: '확인 필요',
    no_signal: '신호 없음'
  };
  return labels[decisionReadiness()] || '확인 필요';
}

function decisionReadinessClass() {
  const readiness = decisionReadiness();
  if (readiness === 'prod_ready' || readiness === 'ok') return 'ok';
  if (readiness === 'no_signal') return 'danger';
  if (readiness === 'shadow_only' || readiness === 'stale' || readiness === 'warning') return 'warning';
  return 'danger';
}

function decisionReadinessHelpText() {
  const readiness = decisionReadiness();
  const nextDue = nextSummaryDueText();
  const messages = {
    prod_ready: '최신 prod 기상 신호가 공식 운영 반영 기준으로 들어와 화면만으로 운영 판단이 가능합니다. 이는 AWS·레이더 신규 원천 검증 완료를 의미하지 않으며, 신규 검증 상태는 기상 원천 상태에서 별도로 확인합니다.',
    shadow_only: '최신 기상 신호는 실제 API 기반으로 확인되었습니다. 다만 공식 prod 운영 액션 원장에는 아직 반영되기 전이므로, 대시보드는 기상 위험 판단에 쓰고 완료보고·AS·매출회복 실행 상태는 prod 원장 기준으로 확인합니다.',
    stale: `기상 신호 생성 시각이 오래되어 최신 운영 판단에 제한이 있습니다.${nextDue ? ` 다음 종합 신호 예정 또는 기준 시각은 ${nextDue}입니다.` : ''}`,
    error: '시스템 오류 또는 데이터 확인 신호가 있어 원천 데이터와 자동화 상태를 점검해야 합니다.',
    no_signal: '최신 기상 신호가 없어 prod 운영 상태만으로는 현재 기상 리스크를 판단하기 어렵습니다.'
  };
  return messages[readiness] || '운영 반영 여부와 별개로, 가장 최근에 감지된 실제 기상 신호 기준의 판단 가능 상태입니다.';
}

function decisionReadinessMessage() {
  const raw = decisionReadinessRaw();
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const message = String(firstPresent(raw, ['detail', 'description', 'body', 'message']) || '').trim();
    if (message) return message;
  }
  if (decisionReadiness() === 'no_signal') {
    return '최신 기상 API 신호가 dashboard payload에 없어 현재 기상 위험을 판단할 수 없습니다. 운영 원장 상태와 별도로 신호 연동을 확인하세요.';
  }
  return '';
}

function hasWeatherSignalData() {
  const signal = state.data && state.data.weatherSignal ? state.data.weatherSignal : {};
  return weatherSignalHasContent(signal);
}

function weatherSignalHasContent(signal) {
  signal = objectFrom(signal);
  const summary = signal.summary || {};
  const riskCount = Number(summary.actionRequired ?? summary.action_required ?? 0)
    + Number(summary.watch ?? 0)
    + Number(summary.dataCheck ?? summary.data_check ?? 0);
  const hasStoreSignal = arrayFrom(signal.stores).some((row) => {
    const rawStatus = firstPresent(row, ['status', 'overallStatus', 'overall_status', 'level', 'riskLevel', 'risk_level']);
    const status = normalizeStatus(rawStatus);
    return rawStatus !== null
      || ['Error', 'Red', 'Orange', 'Yellow', 'Green'].includes(status)
      || firstPresent(row, ['reason', 'message', 'riskType', 'risk_type', 'observedAt', 'observed_at']);
  });
  return Boolean(signal.generatedAt || signal.observedAt || riskCount || hasStoreSignal);
}

function signalSummaryStatus(signal) {
  const summary = signal && signal.summary ? signal.summary : {};
  const actionRequired = Number(summary.actionRequired ?? summary.action_required ?? 0);
  const watch = Number(summary.watch ?? 0);
  const dataCheck = Number(summary.dataCheck ?? summary.data_check ?? 0);
  const normal = Number(summary.normal ?? 0);
  if (dataCheck > 0) return 'Error';
  if (actionRequired > 0) return 'Orange';
  if (watch > 0) return 'Yellow';
  if (normal > 0) return 'Green';
  return 'Gray';
}

function signalStoreStatusCount(status) {
  const target = normalizeStatus(status);
  const stores = arrayFrom(state.data && state.data.weatherSignal && state.data.weatherSignal.stores);
  return stores.filter((store) => normalizeStatus(firstPresent(store, ['status', 'overallStatus', 'overall_status', 'level', 'riskLevel', 'risk_level'])) === target).length;
}

function nextSummaryDueText() {
  const system = state.data && state.data.system ? state.data.system : {};
  const provided = system.nextSummaryDueAt || system.next_summary_due_at;
  const providedDate = new Date(provided || '');
  if (Number.isFinite(providedDate.getTime()) && summaryDateMatchesPolicy(providedDate)) {
    return formatDateTime(providedDate);
  }
  const nextDue = summaryScheduleCandidates(new Date(), 0, 1)
    .filter((date) => date.getTime() > Date.now())
    .sort((a, b) => a.getTime() - b.getTime())[0];
  return formatDateTime(nextDue) || '';
}

function summaryDateMatchesPolicy(date) {
  const time = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(date);
  return SUMMARY_SCHEDULES.some((schedule) => time === `${String(schedule.hour).padStart(2, '0')}:${String(schedule.minute).padStart(2, '0')}`);
}

function weatherSignalSummaryText() {
  const signal = state.data && state.data.weatherSignal ? state.data.weatherSignal : {};
  if (!hasWeatherSignalData()) return '기상 신호 없음';
  const summary = signal.summary || {};
  const actionRequired = Number(summary.actionRequired ?? summary.action_required ?? 0);
  const watch = Number(summary.watch ?? 0);
  const dataCheck = Number(summary.dataCheck ?? summary.data_check ?? 0);
  const normalValue = Number(summary.normal ?? '');
  const normal = Number.isFinite(normalValue) ? normalValue : signalStoreStatusCount('Green');
  const riskCount = actionRequired + watch + dataCheck;
  if (!riskCount) return `${weatherSignalModeLabel()} 기준 정상 ${normal}`;
  return `${weatherSignalModeLabel()} 기준 즉시 ${actionRequired} · 주의 ${watch} · 확인 ${dataCheck}`;
}

function weatherSignalStatusText() {
  if (!hasWeatherSignalData()) return '기상 신호 없음';
  return signalOverallStatus() === 'Error' ? '기상 데이터 확인' : `기상 신호 ${levelLabel(signalOverallStatus())}`;
}

function weatherSignalHelpText() {
  const signal = state.data && state.data.weatherSignal ? state.data.weatherSignal : {};
  if (!hasWeatherSignalData()) {
    return `Apps Script dashboard payload에 최신 weatherSignal 데이터가 없습니다. 대시보드는 prod 운영 원장 기준 상태를 계속 표시하지만, 현재 기상 API 신호 판단은 대기 상태로 봐야 합니다. ${WEATHER_SIGNAL_HELP}`;
  }
  const generated = formatDateTime(weatherSignalTimestamp());
  const freshness = weatherSignalIsStale()
    ? ` 신호가 ${WEATHER_SIGNAL_STALE_HOURS}시간 기준을 초과해 운영 판단에는 오래된 값으로 처리합니다.`
    : ` ${WEATHER_SIGNAL_REFRESH_HOURS}시간 무알림 갱신 기준 안의 신호입니다.`;
  const base = signal.message || WEATHER_SIGNAL_HELP;
  return `${base} 신호 기준시각: ${generated || '-'}.${freshness} ${WEATHER_THRESHOLD_HELP}`;
}

function dashboardHeadline() {
  const summary = state.data.summary || {};
  const signal = state.data.weatherSignal || {};
  if (!hasWeatherSignalData()) {
    const prodStatus = prodOverallStatus();
    if (['Error', 'Red', 'Orange', 'Yellow'].includes(prodStatus)) {
      return summary.headline || '운영 원장 기준 확인이 필요한 항목이 있습니다. 최신 기상 신호는 아직 수신되지 않았습니다.';
    }
    return '운영 원장 기준 즉시 조치는 없습니다. 최신 기상 신호 수신 전이므로 기상 판단은 대기입니다.';
  }
  if (weatherSignalHasRisk()) {
    return signal.message || '실제 기상 API 기준 위험 신호가 있어 지점별 기상 신호를 먼저 확인해야 합니다.';
  }
  if (hasWeatherSignalData()) {
    return signal.message || '실제 기상 API 기준 특이 위험 신호 없이 운영 상태를 확인 중입니다.';
  }
  return summary.headline || signal.message || '오늘 운영 조치와 회복 액션을 확인하세요.';
}

function keepMetricValueTogether(value) {
  return String(value ?? '')
    .split(/(\s*(?:\/|\u00b7)\s*)/)
    .map((part, index) => {
      if (index % 2 === 1) return part;
      return part.replace(/(\S)\s+(-?\d+(?:[.,]\d+)?\S*)(\s*)$/, '$1\u00a0$2$3');
    })
    .join('');
}

function renderDecisionBanner() {
  const target = $('decisionBanner');
  if (!target) return;
  const readinessClass = decisionReadinessClass();
  const signal = state.data.weatherSignal || {};
  const title = decisionReadinessLabel();
  const message = String(decisionReadinessMessage() || signal.message || '').trim();
  const signalTime = formatDateTime(signal.generatedAt || signal.observedAt);
  const meta = [
    ['운영', levelLabel(prodOverallStatus())],
    ['신호', hasWeatherSignalData() ? levelLabel(signalOverallStatus()) : '없음'],
    ['모드', weatherSignalMode()],
    ['신호 생성', signalTime]
  ].filter(([, value]) => value);
  const hasContent = Boolean(message || weatherSignalHasRisk());
  const shouldShow = readinessClass === 'danger' && hasContent;
  if (!shouldShow) {
    target.hidden = true;
    target.innerHTML = '';
    target.removeAttribute('class');
    target.className = 'decision-banner';
    return;
  }
  target.hidden = false;
  target.className = `decision-banner ${readinessClass}`;
  target.innerHTML = `
    <div>
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(message || weatherSignalSummaryText())}</span>
    </div>
    <div class="decision-meta">
      ${meta.map(([label, value]) => `<span>${escapeHtml(label)}: ${escapeHtml(value)}</span>`).join('')}
    </div>
  `;
}

function renderWeatherSources() {
  const sourceRows = weatherSourceRows();
  const enhancedRows = enhancedSignals();
  const hasEnhanced = enhancedRows.length > 0;
  const target = $('weatherSourceStrip');
  const summaryTarget = $('sourceDecisionSummary');
  const detailTarget = $('weatherSourceDetailBody');
  const modeTarget = $('enhancedModeTag');
  if (!target || !summaryTarget || !detailTarget || !modeTarget) return;

  const enhancedMode = hasEnhanced
    ? (enhancedRows.find((row) => row.validationMode)?.validationMode || 'shadow')
    : '계약 대기';
  modeTarget.textContent = hasEnhanced ? `${enhancedMode} 검증` : 'enhanced 계약 대기';

  const enhancedLimited = !hasEnhanced || enhancedRows.some((row) => (
    row.sourceStatus === 'error'
    || !enhancedAwsAvailable(row)
    || !enhancedRadarAvailable(row)
  ));
  const operationalImpact = enhancedOperationalImpactText(enhancedRows);
  const enhancedDistribution = enhancedSignalDistribution(enhancedRows);
  const summaryRows = [
    {
      label: '운영 판단',
      value: decisionReadiness() === 'prod_ready' ? '가능 · prod' : decisionReadinessLabel(),
      className: decisionReadinessClass()
    },
    {
      label: '신규 검증 신호',
      value: !hasEnhanced
        ? '확인 불가 · enhancedSignal 미제공'
        : (enhancedLimited
          ? `제한됨 · AWS/레이더 확인 불가${enhancedDistribution ? ` · ${enhancedDistribution}` : ''}`
          : `검증 중 · ${enhancedMode}${enhancedDistribution ? ` · ${enhancedDistribution}` : ''}`),
      className: enhancedLimited ? 'warning' : 'info'
    },
    {
      label: '운영 영향',
      value: operationalImpact,
      className: 'info'
    }
  ];
  summaryTarget.innerHTML = summaryRows.map((row) => `
    <div class="source-decision-item ${escapeAttr(row.className)}">
      <span>${escapeHtml(row.label)}</span>
      <strong>${escapeHtml(row.value)}</strong>
    </div>
  `).join('');

  target.innerHTML = sourceRows.map((row) => `
    <div class="source-status-item ${escapeAttr(row.className)}">
      <span class="source-dot" aria-hidden="true"></span>
      <div>
        <span class="source-name">${escapeHtml(row.label)}${renderInfoTip(row.detail, `${row.label} 원천 상태`)}</span>
        <strong>${escapeHtml(row.value)}</strong>
        ${row.meta ? `<small>${escapeHtml(row.meta)}</small>` : ''}
      </div>
    </div>
  `).join('');

  detailTarget.innerHTML = weatherSourceDetailRows(sourceRows, enhancedRows).map((row) => `
    <div class="source-detail-row">
      <b>${escapeHtml(row.label)}</b>
      <span>${escapeHtml(row.value)}</span>
    </div>
  `).join('');
  renderSourceHealthCompact(sourceRows);
}

function renderSourceHealthCompact(sourceRows = weatherSourceRows()) {
  const target = $('sourceHealthCompact');
  if (!target) return;
  const rows = Array.isArray(sourceRows) ? sourceRows : [];
  const attention = rows.filter((row) => ['warning', 'danger'].includes(row.className));
  const readinessClass = decisionReadinessClass();
  target.innerHTML = `
    <div class="source-health-summary ${escapeAttr(readinessClass)}">
      <span>운영 판단</span>
      <strong>${escapeHtml(decisionReadinessLabel())}</strong>
      <small>${escapeHtml(formatDateTime(weatherSignalTimestamp()) || '기상 신호 시각 미제공')}</small>
    </div>
    <div class="source-health-grid" aria-label="기상 원천 가용성">
      ${rows.map((row) => `
        <div class="source-health-segment ${escapeAttr(row.className)}" title="${escapeAttr(row.detail || row.value)}">
          <span class="source-dot" aria-hidden="true"></span>
          <b>${escapeHtml(row.label)}</b>
          <small>${escapeHtml(row.value)}</small>
        </div>
      `).join('')}
    </div>
    <div class="source-health-note ${attention.length ? 'warning' : 'ok'}">
      ${attention.length
        ? `<strong>${attention.length}개 원천 확인</strong><span>${escapeHtml(attention.map((row) => row.label).join(' · '))}</span>`
        : '<strong>주요 원천 정상</strong><span>운영 판단용 데이터가 연결되어 있습니다.</span>'}
    </div>
  `;
}

function renderSiteVulnerabilitySummary() {
  const target = $('siteVulnerabilitySummary');
  const contractTarget = $('siteVulnerabilityContractStatus');
  if (!target) return;
  const stores = state.data.stores || [];
  const providedCount = stores.filter((store) => store.siteVulnerability && store.siteVulnerability.provided).length;
  if (contractTarget) {
    const complete = stores.length > 0 && providedCount === stores.length;
    contractTarget.className = `vulnerability-contract-status ${complete ? 'ok' : 'warning'}`;
    contractTarget.innerHTML = complete
      ? `<strong>현장 취약정보 ${providedCount}/${stores.length}개점 수신</strong><span>관련 강수·강풍 신호가 있는 카드에만 조치를 표시합니다.</span>`
      : `<strong>현장 취약정보 ${providedCount}/${stores.length}개점 수신</strong><span>최신 Apps Script 배포 계약 확인이 필요합니다.</span>`;
  }
  const rows = siteVulnerabilitySummaryRows(stores);
  target.innerHTML = rows.map((row) => {
    const active = state.vulnerability === row.id;
    return `
      <button class="vulnerability-summary-item ${escapeAttr(row.className)}${active ? ' active' : ''}" type="button"
        data-vulnerability-filter="${escapeAttr(row.id)}" aria-pressed="${active ? 'true' : 'false'}"
        ${row.count ? '' : 'disabled'} aria-label="${escapeAttr(`${row.label} ${row.count}개 지점 필터`)}">
        <span>${escapeHtml(row.label)}</span>
        <strong>${row.count}<small>개점</small></strong>
      </button>
    `;
  }).join('');
}

function siteVulnerabilitySummaryRows(stores) {
  const rows = Array.isArray(stores) ? stores : [];
  const definitions = [
    { id: 'rain', label: '강수 취약정보', className: 'rain' },
    { id: 'route', label: '출입·동선 확인', className: 'route' },
    { id: 'equipment', label: '방수·전기·설비', className: 'equipment' },
    { id: 'radarFallback', label: '시·도 레이더 대체', className: 'fallback' },
    { id: 'sourceError', label: '실제 원천 오류', className: 'error' }
  ];
  return definitions.map((item) => Object.assign({}, item, {
    count: rows.filter((store) => siteVulnerabilityFilterMatch(store, item.id)).length
  }));
}

function siteVulnerabilityFilterMatch(store, filter) {
  const site = store && store.siteVulnerability ? store.siteVulnerability : {};
  const enhanced = store && store.enhancedSignal ? store.enhancedSignal : {};
  if (filter === 'rain') return hasRainVulnerability(site);
  if (filter === 'route') return site.rainRouteRisk === true;
  if (filter === 'equipment') {
    return meaningfulEquipmentRisk(site.rainEquipmentRisk)
      || arrayFrom(site.rainPriorityActions).some((action) => /방수|전기|누전|설비|장비|조명|보일러|에어컨/i.test(action));
  }
  if (filter === 'radarFallback') {
    return String(enhanced.radarSpatialScope || '').toLowerCase() === 'province_fallback'
      || String(enhanced.radarFallbackType || '').toLowerCase() === 'province';
  }
  if (filter === 'sourceError') {
    return enhanced.hasSourceError === true
      || (store.signalSourceStatus === 'error' && Boolean(store.signalSourceError));
  }
  return true;
}

function hasRainVulnerability(site) {
  const row = site || {};
  return Boolean(row.available && (
    row.rainPoolingPoints
    || row.rainDrainageMinMinutes !== null
    || row.rainDrainageMaxMinutes !== null
    || row.rainRouteRisk
    || meaningfulEquipmentRisk(row.rainEquipmentRisk)
    || row.rainOperationalHistory
    || arrayFrom(row.rainPriorityActions).length
  ));
}

function meaningfulEquipmentRisk(value) {
  const text = String(value || '').trim();
  return Boolean(text && !/^(?:-|없음|해당\s*없음|미입력|확인\s*전|미확인|n\/?a|null|undefined)$/i.test(text));
}

function weatherSourceRows() {
  const stores = state.data.stores || [];
  const total = stores.length;
  const forecastStores = stores.filter((store) => weatherSourceHasForecast(store));
  const observationStores = stores.filter((store) => weatherSourceHasObservation(store));
  const airStores = stores.filter((store) => weatherSourceHasAir(store));
  const airErrorStores = stores.filter(isAirQualitySourceIssue);
  const forecastCacheStores = stores.filter((store) => booleanOrNull(firstPresent(store.weatherValues || {}, ['forecastCacheFallback', 'forecast_cache_fallback'])) === true);
  const observationCacheStores = stores.filter((store) => booleanOrNull(firstPresent(store.weatherValues || {}, ['observationCacheFallback', 'observation_cache_fallback'])) === true);
  const airCacheStores = stores.filter((store) => booleanOrNull(firstPresent(store.weatherValues || {}, ['airCacheFallback', 'air_cache_fallback'])) === true);
  const enhancedRows = enhancedSignals();
  const awsAvailableCount = enhancedRows.filter(enhancedAwsAvailable).length;
  const radarAvailableCount = enhancedRows.filter(enhancedRadarAvailable).length;
  const awsCacheCount = enhancedRows.filter((row) => row.awsCacheFallback === true).length;
  const radarCacheCount = enhancedRows.filter((row) => row.radarCacheFallback === true).length;
  const warningFlags = enhancedRows.map((row) => row.weatherWarningActiveSevere).filter((value) => value !== null);
  const warningActive = warningFlags.some(Boolean);
  const warningKnown = enhancedRows.length > 0 && warningFlags.length === enhancedRows.length;
  const warningIssuedAt = latestDateValue(enhancedRows.map((row) => row.weatherWarningIssuedAt));
  const warningSummaries = uniqueTextParts(enhancedRows.flatMap((row) => [row.weatherWarningSummary]));
  const warningReleased = warningSummaries.some((text) => text.includes('해제'));
  const warningIssuedDate = new Date(warningIssuedAt || '');
  const warningIssuedClock = Number.isFinite(warningIssuedDate.getTime())
    ? formatKstTimeOnly(warningIssuedDate)
    : formatClockValue(warningIssuedAt);
  const releasedMeta = warningReleased && warningIssuedAt ? `최근 해제 ${warningIssuedClock || formatDateTime(warningIssuedAt)}` : '';

  return [
    {
      id: 'forecast',
      label: '단기예보',
      value: sourceCoverageValue(forecastStores.length, total, forecastCacheStores.length),
      className: sourceCoverageClass(forecastStores.length, total, forecastCacheStores.length),
      meta: forecastCacheStores.length ? `캐시 ${forecastCacheStores.length}개점` : latestSourceTime(stores, ['forecastBaseAt', 'forecast_base_at']),
      detail: sourceCoverageDetail('단기예보', forecastStores.length, total, forecastCacheStores)
    },
    {
      id: 'observation',
      label: '실황',
      value: sourceCoverageValue(observationStores.length, total, observationCacheStores.length),
      className: sourceCoverageClass(observationStores.length, total, observationCacheStores.length),
      meta: observationCacheStores.length ? `캐시 ${observationCacheStores.length}개점` : latestSourceTime(stores, ['observedAt', 'observed_at']),
      detail: sourceCoverageDetail('실황', observationStores.length, total, observationCacheStores)
    },
    {
      id: 'air',
      label: '에어코리아',
      value: airErrorStores.length
        ? `부분 오류 · ${shortStoreNames(airErrorStores)}`
        : sourceCoverageValue(airStores.length, total, airCacheStores.length),
      className: airErrorStores.length ? 'warning' : sourceCoverageClass(airStores.length, total, airCacheStores.length),
      meta: airErrorStores.length ? '강수 데이터 사용 가능' : (airCacheStores.length ? `캐시 ${airCacheStores.length}개점` : latestSourceTime(stores, ['airObservedAt', 'air_observed_at'])),
      detail: airErrorStores.length
        ? `대기질만 확인 불가: ${uniqueTextParts(airErrorStores.flatMap((store) => [store.signalSourceError, store.signalSourceWarnings])).join(' · ')} 강수 실황과 단기예보는 계속 사용할 수 있습니다.`
        : sourceCoverageDetail('대기질', airStores.length, total, airCacheStores)
    },
    {
      id: 'aws',
      label: 'AWS',
      value: !enhancedRows.length ? '계약 미제공' : enhancedCoverageValue(awsAvailableCount, enhancedRows.length),
      className: !enhancedRows.length || awsAvailableCount < enhancedRows.length ? 'warning' : (awsCacheCount ? 'warning' : 'ok'),
      meta: !enhancedRows.length ? '공식 prod 판단과 무관' : (awsCacheCount ? `캐시 ${awsCacheCount}개점` : enhancedLatestTime(enhancedRows, 'awsObservedAt')),
      detail: !enhancedRows.length
        ? '운영 dashboard payload에 weatherSignal.stores[].enhancedSignal 및 AWS 호환 필드가 없어 상태를 확인할 수 없습니다.'
        : enhancedSourceDetail('AWS', enhancedRows, 'aws')
    },
    {
      id: 'radar',
      label: '레이더',
      value: !enhancedRows.length ? '계약 미제공' : enhancedCoverageValue(radarAvailableCount, enhancedRows.length),
      className: !enhancedRows.length || radarAvailableCount < enhancedRows.length ? 'warning' : (radarCacheCount ? 'warning' : 'ok'),
      meta: !enhancedRows.length ? '공식 prod 판단과 무관' : (radarCacheCount ? `캐시 ${radarCacheCount}개점` : enhancedLatestTime(enhancedRows, 'radarObservedAt')),
      detail: !enhancedRows.length
        ? '운영 dashboard payload에 weatherSignal.stores[].enhancedSignal 및 레이더 호환 필드가 없어 상태를 확인할 수 없습니다.'
        : enhancedSourceDetail('레이더', enhancedRows, 'radar')
    },
    {
      id: 'warning',
      label: '기상특보',
      value: !enhancedRows.length
        ? '계약 미제공'
        : (warningActive ? '활성 중대특보 있음' : (warningKnown ? '조회 정상 · 활성 특보 없음' : '활성 여부 확인 불가')),
      className: warningActive ? 'warning' : (warningKnown ? 'ok' : 'warning'),
      meta: !enhancedRows.length ? '활성 여부 확정 불가' : releasedMeta,
      detail: !enhancedRows.length
        ? 'weatherWarningActiveSevere 구조화 필드가 없어 활성 특보 여부를 확정하지 않습니다.'
        : (warningSummaries.join(' · ') || (warningKnown ? '특보 조회 결과에 활성 중대특보가 없습니다.' : '특보 요약 또는 활성 여부 필드가 일부 누락되었습니다.'))
    }
  ];
}

function weatherSourceDetailRows(sourceRows, enhancedRows) {
  const airRow = sourceRows.find((row) => row.id === 'air');
  const enhancedErrors = uniqueTextParts(enhancedRows.flatMap((row) => [
    ...arrayFrom(row.sourceErrors),
    row.sourceError
  ]));
  const enhancedWarnings = uniqueTextParts(enhancedRows.flatMap((row) => [
    ...arrayFrom(row.sourceWarningItems),
    row.sourceWarnings
  ]));
  const fallbackNotices = uniqueTextParts(enhancedRows.flatMap((row) => [
    ...arrayFrom(row.fallbackNotices),
    ...uniqueTextParts([row.sourceWarnings]).filter(isEnhancedFallbackNotice)
  ]));
  const nonFallbackWarnings = enhancedWarnings.filter((text) => !isEnhancedFallbackNotice(text));
  const enhancedReason = uniqueTextParts(enhancedRows.flatMap((row) => [row.fusionReason]));
  const cacheRows = sourceRows
    .filter((row) => String(row.meta || '').includes('캐시'))
    .map((row) => `${row.label} ${row.meta}`);
  const rows = [
    { label: '공식 운영 신호', value: `${weatherSignalModeLabel()} · ${weatherSignalSummaryText()} · ${formatDateTime(weatherSignalTimestamp())}` },
    { label: '계약 버전', value: weatherSourceContractText(enhancedRows) },
    { label: '현장 취약정보 계약', value: siteVulnerabilityContractText() },
    { label: '에어코리아', value: airRow ? `${airRow.value} · ${airRow.detail}` : '상태 확인 불가' }
  ];
  if (!enhancedRows.length) {
    rows.push({
      label: '신규 원천 계약',
      value: 'weatherSignal.stores[].enhancedSignal 또는 enhanced 호환 필드가 운영 endpoint에 없습니다. 공식 prod 운영 판단은 계속 가능하지만 AWS·레이더·특보 검증 상태는 확인할 수 없습니다.'
    });
  } else {
    rows.push({ label: '신규 검증 오류', value: enhancedErrors.length ? enhancedErrors.join(' · ') : '없음' });
    rows.push({
      label: '대체 사용 안내',
      value: fallbackNotices.length ? summarizeEnhancedFallbackNotices(enhancedRows, fallbackNotices) : '없음'
    });
    if (nonFallbackWarnings.length) rows.push({ label: '신규 검증 경고', value: nonFallbackWarnings.join(' · ') });
    rows.push({ label: '융합 판단 근거', value: enhancedReason.length ? enhancedReason.join(' · ') : '근거 필드 미제공' });
  }
  if (cacheRows.length) rows.push({ label: '캐시 대체', value: cacheRows.join(' · ') });
  rows.push({ label: '운영 영향', value: enhancedOperationalImpactText(enhancedRows) });
  return rows;
}

function weatherSourceContractText(enhancedRows) {
  const system = state.data.system || {};
  const payloadVersion = state.data.dashboardPayloadVersion
    || firstPresent(system, ['dashboardPayloadVersion', 'dashboard_payload_version'])
    || '';
  const buildId = state.data.buildId
    || firstPresent(system, ['scriptBuildId', 'script_build_id'])
    || '';
  const parts = [
    payloadVersion ? `payload ${payloadVersion}` : 'payload 버전 미제공',
    buildId ? `build ${buildId}` : 'build ID 미제공',
    enhancedRows.length ? `enhanced ${enhancedRows.length}개점` : 'enhanced 미제공'
  ];
  return parts.join(' · ');
}

function siteVulnerabilityContractText() {
  const stores = state.data && Array.isArray(state.data.stores) ? state.data.stores : [];
  const provided = stores.filter((store) => store.siteVulnerability && store.siteVulnerability.provided).length;
  if (!stores.length) return '지점 데이터 없음';
  if (provided === stores.length) return `${provided}/${stores.length}개점 수신 · 운영등급 자동 변경 없음`;
  return `${provided}/${stores.length}개점 수신 · 최신 Apps Script 배포 또는 payload 필드 확인 필요`;
}

function enhancedSignals() {
  return (state.data.stores || [])
    .map((store) => store.enhancedSignal)
    .filter((row) => row && row.available);
}

function enhancedSignalDistribution(rows) {
  const counts = (Array.isArray(rows) ? rows : []).reduce((result, row) => {
    const status = normalizeStatus(row && row.fusionStatus);
    if (!['Error', 'Red', 'Orange', 'Yellow', 'Green'].includes(status)) return result;
    result[status] = (result[status] || 0) + 1;
    return result;
  }, {});
  return ['Error', 'Red', 'Orange', 'Yellow', 'Green']
    .filter((status) => counts[status])
    .map((status) => `${status} ${counts[status]}`)
    .join(' / ');
}

function enhancedAwsAvailable(row) {
  return Boolean(row && (row.awsStationId || row.awsStationName || row.awsObservedAt
    || row.awsRain15m !== null || row.awsRain1h !== null || row.awsRainDay !== null
    || row.awsTemperature !== null || row.awsWind !== null));
}

function enhancedRadarAvailable(row) {
  return Boolean(row && (row.radarObservedAt || row.radarRainRate !== null));
}

function enhancedCoverageValue(available, total) {
  if (!total || !available) return '확인 불가';
  if (available < total) return `부분 확인 · ${available}/${total}개점`;
  return '정상';
}

function enhancedSourceDetail(label, rows, type) {
  const available = rows.filter(type === 'aws' ? enhancedAwsAvailable : enhancedRadarAvailable).length;
  const errors = uniqueTextParts(rows.flatMap((row) => [...arrayFrom(row.sourceErrors), row.sourceError]))
    .filter((text) => enhancedMessageMatchesSource(text, type));
  const warnings = uniqueTextParts(rows.flatMap((row) => [...arrayFrom(row.sourceWarningItems), row.sourceWarnings]))
    .filter((text) => enhancedMessageMatchesSource(text, type));
  const fallbackNotices = uniqueTextParts([
    ...rows.flatMap((row) => arrayFrom(row.fallbackNotices)),
    ...warnings.filter(isEnhancedFallbackNotice)
  ]).filter((text) => enhancedMessageMatchesSource(text, type));
  const fallbackCount = rows.filter((row) => type === 'aws' ? row.awsCacheFallback === true : row.radarCacheFallback === true).length;
  const parts = [`${label} 확인 ${available}/${rows.length}개점`];
  if (fallbackCount) parts.push(`캐시 대체 ${fallbackCount}개점`);
  if (errors.length) parts.push(`오류 ${errors.join(' · ')}`);
  if (fallbackNotices.length) parts.push(`대체 안내 ${summarizeEnhancedFallbackNotices(rows, fallbackNotices)}`);
  return parts.join(' · ');
}

function enhancedMessageMatchesSource(value, type) {
  const text = String(value || '');
  if (type === 'aws') return /aws|지점 목록|매분자료|관측소 월보/i.test(text);
  return /레이더|radar|no_data|시군구 코드|광역 행정코드|district|province/i.test(text);
}

function isEnhancedFallbackNotice(value) {
  return /(대체|fallback|예비 관측소|월보|시군구 코드|광역 행정코드|district_fallback|province_fallback)/i.test(String(value || ''));
}

function summarizeEnhancedFallbackNotices(rows, notices) {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const normalizedNotices = uniqueTextParts(notices);
  const parts = [];
  const awsFallbackNotices = normalizedNotices.filter((text) => /aws.*월보|월보.*aws/i.test(text));
  const awsMonths = uniqueTextParts(normalizedRows.map((row) => row.awsStationReferenceMonth));
  if (awsFallbackNotices.length) {
    parts.push(`AWS 월보${awsMonths.length ? ` ${awsMonths.join(', ')}` : ''}`);
  }
  const radarFallbackNotices = normalizedNotices.filter((text) => /레이더.*(?:광역|시군구)|(?:광역|시군구).*레이더|province_fallback|district_fallback/i.test(text));
  const districtFallbackCount = normalizedRows.filter((row) => (
    row.radarSpatialScope === 'district_fallback' || row.radarFallbackType === 'district'
  )).length;
  const provinceFallbackCount = normalizedRows.filter((row) => (
    row.radarSpatialScope === 'province_fallback' || row.radarFallbackType === 'province'
  )).length;
  if (radarFallbackNotices.length) {
    if (districtFallbackCount) parts.push(`레이더 시·군·구 대표 사용 ${districtFallbackCount}개점`);
    if (provinceFallbackCount) parts.push(`레이더 시·도 광역 대표 사용 ${provinceFallbackCount}개점`);
    if (!districtFallbackCount && !provinceFallbackCount) parts.push('레이더 대표 자료 사용');
  }
  const residualNotices = normalizedNotices.filter((text) => (
    !awsFallbackNotices.includes(text) && !radarFallbackNotices.includes(text)
  ));
  return [...parts, ...residualNotices].join(' · ') || '없음';
}

function enhancedLatestTime(rows, key) {
  const value = latestDateValue(rows.map((row) => row[key]));
  return value ? `기준 ${formatDateTime(value)}` : '';
}

function enhancedOperationalImpactText(rows) {
  if (!rows.length) return '미반영 · prod 기준 유지';
  const impacts = uniqueTextParts(rows.map((row) => row.operationalImpact));
  const managerInput = rows.some((row) => row.managerInputRequired === true);
  const affectsProd = rows.some((row) => row.affectsOperationalLevel === true);
  if (!managerInput && !affectsProd && (!impacts.length || impacts.every((value) => value === 'none_validation_only'))) {
    return '없음 · shadow 검증 중';
  }
  return '계약 확인 필요 · prod 자동 반영 안 함';
}

function weatherSourceHasForecast(store) {
  const data = store.weatherValues || {};
  return firstPresent(data, ['forecastBaseAt', 'forecast_base_at', 'forecastMaxPop', 'forecast_max_pop', 'forecastMaxPcp1h', 'forecast_max_pcp_1h']) !== null;
}

function weatherSourceHasObservation(store) {
  const data = store.weatherValues || {};
  return firstPresent(data, ['observedAt', 'observed_at', 'observedRain1h', 'observed_rain_1h', 'observedTemperature', 'observed_temperature', 'observedWind', 'observed_wind']) !== null;
}

function weatherSourceHasAir(store) {
  const data = store.weatherValues || {};
  return firstPresent(data, ['airObservedAt', 'air_observed_at', 'pm10', 'PM10', 'pm25', 'PM25']) !== null;
}

function isAirQualitySourceIssue(store) {
  const text = `${store && store.signalSourceError || ''} ${store && store.signalSourceWarnings || ''}`;
  return /에어코리아|대기질|pm10|pm2\.5/i.test(text);
}

function sourceCoverageValue(available, total, cacheCount) {
  if (!total || !available) return '확인 불가';
  if (available < total) return `부분 확인 · ${available}/${total}개점`;
  return cacheCount ? `캐시 사용 · ${cacheCount}개점` : '정상';
}

function sourceCoverageClass(available, total, cacheCount) {
  if (!total || !available) return 'warning';
  return available < total || cacheCount ? 'warning' : 'ok';
}

function sourceCoverageDetail(label, available, total, cacheStores) {
  const cacheNames = shortStoreNames(cacheStores || []);
  if (!total || !available) return `${label} 유효값을 dashboard payload에서 확인할 수 없습니다.`;
  if (available < total) return `${label} 유효값 ${available}/${total}개점입니다. 결측값은 0이나 정상으로 대체하지 않습니다.`;
  if (cacheNames) return `${label}은 전 지점에 있으나 ${cacheNames}에서 캐시 대체값을 사용합니다. 카드와 상세의 기준 시각을 함께 확인합니다.`;
  return `${label} 유효값이 ${total}개 지점에 제공되고 캐시 대체 표시는 없습니다.`;
}

function latestSourceTime(stores, keys) {
  const value = latestDateValue((stores || []).map((store) => firstPresent(store.weatherValues || {}, keys)));
  return value ? `기준 ${formatDateTime(value)}` : '';
}

function latestDateValue(values) {
  return (values || [])
    .filter(Boolean)
    .map((value) => ({ value, time: new Date(value).getTime() }))
    .filter((item) => Number.isFinite(item.time))
    .sort((a, b) => b.time - a.time)[0]?.value || '';
}

function uniqueTextParts(values) {
  const parts = (values || []).flatMap((value) => String(value || '').split(/\s*\|\s*/)).map((value) => value.trim()).filter(Boolean);
  return [...new Set(parts)];
}

function shortStoreNames(stores) {
  const names = [...new Set((stores || []).map((store) => store.name || store.storeName).filter(Boolean))];
  if (!names.length) return '';
  if (names.length <= 2) return names.join(' · ');
  return `${names.slice(0, 2).join(' · ')} 외 ${names.length - 2}개점`;
}

function renderHero() {
  const { summary } = state.data;
  const status = primaryDashboardStatus();
  const prodStatus = prodOverallStatus();
  const hasSignal = hasWeatherSignalData();
  const warnings = topBannerWarnings();
  const readinessClass = decisionReadinessClass();
  const hasRiskSignal = weatherSignalHasRisk();
  $('overallStatus').innerHTML = `${escapeHtml(primaryDashboardStatusText())}${renderInfoTip(overallStatusHelpText(status), '전체 상태 기준')}`;
  $('overallStatus').className = `status-word text-${status}`;
  $('headline').textContent = keepMetricValueTogether(dashboardHeadline());
  const sourceText = state.data.source && state.data.source.startsWith('sample') ? '샘플 데이터' : '실데이터 연결';
  const metaItems = [
    { text: `업데이트 ${formatDateTime(state.data.generatedAt)}`, help: 'Apps Script dashboard payload가 생성된 시각입니다. 화면은 5분마다 자동 갱신되며, 오래 비활성화한 탭으로 돌아오면 최신 데이터를 즉시 다시 조회합니다.' },
    { text: `버전 ${state.data.version}`, help: 'Apps Script dashboard payload가 보고한 현재 Weather Ops Pack 또는 시트 버전입니다. 대시보드는 이 값을 자동 표시하며, 별도 기대 버전이 설정된 경우에만 불일치를 경고합니다.' },
    { text: sourceText, help: sourceText === '샘플 데이터' ? '샘플 fallback 데이터입니다. 운영 배포에서는 실데이터 연결이어야 합니다.' : `Vercel이 Apps Script dashboard payload를 정상 수신했다는 뜻입니다. ${WEATHER_API_HELP}` },
    { text: `운영 원장 ${levelLabel(prodStatus)}`, help: '공식 완료보고, AS 정상화, 매출회복, CRM 실행 상태는 prod 운영 원장 기준으로 봅니다.' },
    { text: weatherSignalStatusText(), help: weatherSignalHelpText(), warning: !hasSignal || hasRiskSignal },
    { text: `판단 ${decisionReadinessLabel()}`, help: decisionReadinessHelpText(), warning: readinessClass === 'danger' },
    ...(hasSignal ? [{ text: weatherSignalSummaryText(), help: weatherSignalHelpText(), warning: hasRiskSignal, wide: true }] : [])
  ].concat(warnings.map((warning) => ({ text: `주의: ${warning}`, help: '데이터 신선도 또는 시스템 점검이 필요한 신호입니다.', warning: true, wide: true })));
  $('heroMeta').innerHTML = metaItems
    .map((item) => `<span class="meta-pill${item.warning ? ' warning' : ''}${item.wide ? ' wide' : ''}">${escapeHtml(item.text)}${renderInfoTip(item.help, item.text)}</span>`)
    .join('');
}

function renderKpis() {
  $('kpiStrip').innerHTML = missionCards().map(({ label, value, note, level }) => {
    return `
    <div class="kpi mission-card mission-${escapeAttr(level)}">
      <div class="kpi-label">${escapeHtml(label)}${renderInfoTip(kpiHelpText(label), `${label} 기준`)}</div>
      <div class="kpi-value">${escapeHtml(value)}</div>
      <div class="kpi-note">${escapeHtml(note)}</div>
    </div>
  `;
  }).join('');
}

function missionCards() {
  const summary = state.data.summary || {};
  const stores = state.data.stores || [];
  const safetyStores = stores.filter((store) => ['Error', 'Red', 'Orange'].includes(store.status));
  const prodImmediate = metricFromKeysNumber(summary, ['immediateCount', 'immediate_count']);
  const signalImmediate = metricFromKeysNumber((state.data.weatherSignal && state.data.weatherSignal.summary) || {}, ['actionRequired', 'action_required']);
  const safetyCount = safetyStores.length || Math.max(prodImmediate || 0, signalImmediate || 0);
  const safetyWaiting = !hasWeatherSignalData() && safetyCount === 0;

  const asBlocked = metricFromKeysNumber(summary, ['asBlockedCount', 'as_blocked_count']);
  const derivedAsBlocked = stores.filter((store) => isBlockingAsStatus(store)).length;
  const downtimeCount = asBlocked === null ? derivedAsBlocked : asBlocked;
  const longestDowntime = missionLongestDowntime(stores);

  const csMetric = firstMetricNumber(summary, [
    'csActionCount', 'cs_action_count', 'csRiskCount', 'cs_risk_count',
    'csPendingCount', 'cs_pending_count',
    'customerNoticePendingCount', 'customer_notice_pending_count',
    'customerNoticeRequiredCount', 'customer_notice_required_count',
    'customerNoticeOpenCount', 'customer_notice_open_count',
    'customerCommunicationPendingCount', 'customer_communication_pending_count',
    'customerImpactCount', 'customer_impact_count', 'customerActionCount', 'customer_action_count'
  ]);
  const customerRows = stores.filter(hasCustomerStatusData);
  const derivedCsCount = customerRows.filter(isCustomerActionPending).length;
  const hasCsCoverage = csMetric !== null || customerRows.length > 0;
  const csCount = csMetric === null ? derivedCsCount : csMetric;
  const unknownCsCount = Math.max(0, stores.length - customerRows.length);

  const recoveryAction = metricFromKeysNumber(summary, ['recoveryActionCount', 'recovery_action_count']);
  const dataWait = metricFromKeysNumber(summary, ['dataWaitCount', 'data_wait_count']);
  const crmReady = metricFromKeysNumber(summary, ['crmReadyCount', 'crm_ready_count']);
  const recoveryCandidateCount = recoveryAction || 0;

  return [
    {
      label: '안전 확보',
      value: safetyWaiting ? '판단 대기' : `${safetyCount}개점`,
      note: safetyWaiting ? '운영 위험 0 · 최신 API 신호 없음' : `운영 ${prodImmediate ?? 0} · 기상 신호 ${signalImmediate ?? 0}`,
      level: safetyWaiting ? 'wait' : (safetyCount > 0 ? 'action' : 'ok')
    },
    {
      label: '다운타임 축소',
      value: `${downtimeCount}개점`,
      note: longestDowntime ? `최장 ${longestDowntime}` : (downtimeCount > 0 ? 'AS 정상화·ETA 확인' : '현재 AS 차단 없음'),
      level: downtimeCount > 0 ? 'action' : 'ok'
    },
    {
      label: 'CS 안정화',
      value: hasCsCoverage ? `${csCount}건` : '확인 전',
      note: !hasCsCoverage
        ? `${unknownCsCount || stores.length}개점 고객 상태 미확인`
        : (unknownCsCount > 0
          ? `지점별 ${unknownCsCount}개점 미확인 · 대기 ${csCount}건`
          : (csCount > 0 ? '고객 영향·안내 승인 확인' : '고객 안내 대기 없음')),
      level: !hasCsCoverage ? 'wait' : (csCount > 0 || unknownCsCount > 0 ? 'watch' : 'ok')
    },
    {
      label: '수요·매출 회복',
      value: `${recoveryCandidateCount}건 후보`,
      note: `회복 조치·관찰 후보 ${recoveryAction ?? 0} · 성과 해석 대기 ${dataWait ?? 0} · CRM 후보 ${crmReady ?? 0}`,
      level: recoveryCandidateCount > 0 || (dataWait || 0) > 0 ? 'watch' : 'ok'
    }
  ];
}

function metricFromKeysNumber(source, keys) {
  const value = firstPresent(source || {}, keys);
  return numericOrNull(value);
}

function firstMetricNumber(source, keys) {
  return metricFromKeysNumber(source, keys);
}

function isBlockingAsStatus(store) {
  const text = [store.asStatus, store.normalizationBlocker, store.vendorStatus].filter(Boolean).join(' ');
  if (/(대상 없음|해당 없음|not required|not applicable)/i.test(text)) return false;
  const blocking = /(차단|불가|중단|대기|필요|진행|미해결|blocked|pending|required|outage)/i.test(text);
  if (!blocking) return false;
  return !/(완료|해결|closed|resolved)/i.test(text) || /(대기|차단|불가|중단|미해결|blocked|pending|outage)/i.test(text);
}

function missionLongestDowntime(stores) {
  const minutes = stores.map((store) => numericOrNull(store.downtimeMinutes)).filter((value) => value !== null);
  if (!minutes.length) return '';
  const longest = Math.max(...minutes);
  if (longest < 60) return `${Math.round(longest)}분`;
  return `${(longest / 60).toFixed(longest % 60 ? 1 : 0)}시간`;
}

function hasCustomerStatusData(store) {
  const values = customerStatusValues(store);
  return values.noticeKnown || values.impactKnown;
}

function isCustomerActionPending(store) {
  const values = customerStatusValues(store);
  const text = [
    values.noticeKnown ? values.notice : '',
    values.impactKnown ? values.impact : ''
  ].filter(Boolean).join(' ');
  if (!text) return false;
  return /(필요|대기|미완료|초안|승인|영향|불편|민원|pending|required|draft|impact)/i.test(text)
    && !/(불필요|해당 없음|완료|발송 완료|영향 없음|not required|none)/i.test(text);
}

function customerStatusValues(store) {
  const notice = normalizeCustomerStatusValue(store && store.customerNoticeStatus);
  const impact = normalizeCustomerStatusValue(store && store.customerImpact);
  return {
    notice,
    impact,
    noticeKnown: !isUnknownCustomerStatusValue(notice),
    impactKnown: !isUnknownCustomerStatusValue(impact)
  };
}

function normalizeSignalSourceStatus(value) {
  const text = String(value || '').trim().toLowerCase();
  if (['error', 'failed', 'failure'].includes(text)) return 'error';
  if (['warning', 'warn', 'partial'].includes(text)) return 'warning';
  if (['ok', 'normal', 'success', 'healthy'].includes(text)) return 'ok';
  return '';
}

function normalizeCustomerStatusValue(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function isUnknownCustomerStatusValue(value) {
  const text = normalizeCustomerStatusValue(value);
  if (!text || text === '-') return true;
  const compact = text.toLowerCase().replace(/[\s·/|,.:_-]+/g, '');
  return /^(?:확인전|미확인|미입력|미연동|지표없음|데이터없음|데이터미제공)+$/i.test(compact)
    || /^(?:고객)?(?:안내|영향)(?:확인전|미확인)$/i.test(compact)
    || /^(?:unknown|na|notavailable)+$/i.test(compact);
}

function customerValueKey(value) {
  return normalizeCustomerStatusValue(value).toLowerCase().replace(/[\s·/|,.:_-]+/g, '');
}

function customerStatusView(store) {
  const values = customerStatusValues(store);
  if (!values.noticeKnown && !values.impactKnown) {
    return { primary: '확인 필요', detail: '', state: 'unknown' };
  }
  const primary = values.noticeKnown ? values.notice : values.impact;
  const sameValue = values.noticeKnown && values.impactKnown
    && customerValueKey(values.notice) === customerValueKey(values.impact);
  return {
    primary,
    detail: values.noticeKnown && values.impactKnown && !sameValue ? values.impact : '',
    state: isCustomerActionPending(store) ? 'pending' : 'clear'
  };
}

function renderMap() {
  const stores = filteredStores();
  $('mapCount').textContent = `${stores.length}개 지점`;
  if (!stores.length) {
    const label = state.risk === 'all' ? '현재 표시할 지점이 없습니다.' : `현재 ${levelLabel(state.risk)} 지점이 없습니다.`;
    $('metroMap').innerHTML = `
      <div class="empty-state filter-empty">
        <span>${escapeHtml(label)}</span>
        ${state.risk !== 'all' ? '<button class="inline-reset" type="button" data-reset-risk>전체 보기</button>' : ''}
      </div>
    `;
    const reset = $('metroMap').querySelector('[data-reset-risk]');
    if (reset) reset.addEventListener('click', () => {
      state.risk = 'all';
      updateRiskFilterState();
      render();
    });
    return;
  }
  $('metroMap').innerHTML = `
    <div class="command-matrix-head" aria-hidden="true">
      <span>지점</span><span>공식 기상</span><span>검증 신호</span><span>운영</span><span>AS</span><span>CS</span><span>회복</span><span>다음 행동</span>
    </div>
    ${stores.map((store) => renderCommandMatrixRow(store)).join('')}
  `;
  $('metroMap').querySelectorAll('.store-pin').forEach((button) => {
    button.addEventListener('click', () => openStoreDialog(button.dataset.store, button));
  });
}

function renderCommandMatrixRow(store) {
  const officialStatus = normalizeStatus(store.signalStatus);
  const shadowStatus = normalizeStatus(store.enhancedSignal && store.enhancedSignal.fusionStatus);
  const customer = customerStatusView(store);
  const asView = compactAsStatus(store);
  const recoveryView = compactRecoveryStatus(store);
  const nextAction = storeNextActionText(store);
  const officialDetail = [levelLabel(officialStatus), compactRiskType(store.signalRiskType || store.weather)].filter(Boolean).join(' · ');
  const shadowDetail = store.enhancedSignal && store.enhancedSignal.available
    ? [levelLabel(shadowStatus), store.enhancedSignal.validationMode || 'shadow'].filter(Boolean).join(' · ')
    : '확인 전';
  const aria = [
    store.name,
    `공식 기상 ${officialDetail}`,
    `검증 신호 ${shadowDetail}`,
    `운영 ${levelLabel(store.prodStatus)}`,
    `AS ${asView.label}`,
    `CS ${customer.primary}`,
    `회복 ${recoveryView.label}`,
    `다음 행동 ${nextAction}`
  ].join('. ');
  return `
    <button class="store-pin command-matrix-row status-${escapeAttr(store.status)}" type="button" data-store="${escapeAttr(store.id)}"
      aria-haspopup="dialog" aria-controls="storeDialog" aria-expanded="false" aria-label="${escapeAttr(`${aria}. 상세 보기`)}">
      <span class="command-store" data-label="지점">
        <strong>${escapeHtml(store.name)}</strong>
        <small>${escapeHtml(store.dri)}</small>
      </span>
      <span class="command-state official" data-label="공식 기상">
        <span class="matrix-status status-${escapeAttr(officialStatus)}">${escapeHtml(officialDetail || '신호 없음')}</span>
      </span>
      <span class="command-state shadow-signal" data-label="검증 신호">
        <span class="matrix-status shadow status-${escapeAttr(shadowStatus)}">${escapeHtml(shadowDetail)}</span>
      </span>
      <span class="command-state operation" data-label="운영">
        <span class="matrix-status status-${escapeAttr(store.prodStatus)}">${escapeHtml(levelLabel(store.prodStatus))}</span>
      </span>
      <span class="command-state as" data-label="AS"><span class="gate-state ${escapeAttr(asView.className)}">${escapeHtml(asView.label)}</span></span>
      <span class="command-state cs" data-label="CS"><span class="gate-state ${escapeAttr(customer.state)}">${escapeHtml(customer.primary)}</span></span>
      <span class="command-state recovery" data-label="회복"><span class="gate-state ${escapeAttr(recoveryView.className)}">${escapeHtml(recoveryView.label)}</span></span>
      <span class="command-mobile-gates" data-label="실행 게이트">${escapeHtml(mobileGateSummary(store, asView, customer, recoveryView))}</span>
      <span class="command-next" data-label="다음 행동">${escapeHtml(nextAction)}</span>
    </button>
  `;
}

function compactRiskType(value) {
  const text = String(value || '').trim();
  if (!text || text === '-') return '';
  return text.split(/[·,/]/).map((part) => part.trim()).filter(Boolean).slice(0, 2).join('·');
}

function compactAsStatus(store) {
  if (isBlockingAsStatus(store)) return { label: '차단·대기', className: 'blocked' };
  const text = String(store.asStatus || '').trim();
  if (!text || text === '-' || /확인\s*전|미확인/i.test(text)) return { label: '확인 전', className: 'unknown' };
  if (/정상|완료|해결|해당\s*없음|대상\s*없음/i.test(text)) return { label: '정상', className: 'clear' };
  return { label: text, className: 'watch' };
}

function compactRecoveryStatus(store) {
  const text = String(store.recoveryStatus || '').trim();
  if (!text || text === '-' || /확인\s*전|미확인/i.test(text)) return { label: '확인 전', className: 'unknown' };
  if (/대상\s*없음|해당\s*없음|완료|정상/i.test(text)) return { label: '대상 없음', className: 'clear' };
  if (/차단/i.test(text)) return { label: '차단', className: 'blocked' };
  if (/필요|대기|관찰|진행/i.test(text)) return { label: '관찰', className: 'watch' };
  return { label: text, className: 'watch' };
}

function mobileGateSummary(store, asView = compactAsStatus(store), customer = customerStatusView(store), recoveryView = compactRecoveryStatus(store)) {
  const attention = [];
  if (normalizeStatus(store.prodStatus) !== 'Green') attention.push(`운영 ${levelLabel(store.prodStatus)}`);
  if (asView.className !== 'clear') attention.push(`AS ${asView.label}`);
  if (customer.state !== 'clear') attention.push(`CS ${customer.primary}`);
  if (recoveryView.className !== 'clear') attention.push(`회복 ${recoveryView.label}`);
  return attention.length ? attention.join(' · ') : '실행 게이트 이상 없음';
}

function renderPriorityQueue() {
  const target = $('priorityQueue');
  const countTarget = $('priorityCount');
  if (!target || !countTarget) return;
  const rows = priorityQueueRows();
  countTarget.textContent = `${rows.length}건`;
  if (!rows.length) {
    target.innerHTML = '<div class="empty-state compact">현재 즉시 확인할 항목이 없습니다.</div>';
    return;
  }
  target.innerHTML = rows.slice(0, 3).map((row) => `
    <button class="priority-item" type="button" data-store="${escapeAttr(row.storeId || '')}"
      ${row.storeId ? 'aria-haspopup="dialog" aria-controls="storeDialog" aria-expanded="false"' : ''}>
      <span class="priority-topline">
        <span class="badge ${escapeAttr(row.status)}">${escapeHtml(row.scope)}</span>
        <strong>${escapeHtml(row.storeName)}</strong>
        <span class="priority-level">${escapeHtml(levelLabel(row.status))}</span>
      </span>
      <span class="priority-reason">${escapeHtml(row.reason)}</span>
      <span class="priority-meta">${escapeHtml(row.meta)}</span>
      <span class="priority-action">${escapeHtml(row.action)}</span>
    </button>
  `).join('') + (rows.length > 3 ? `<div class="priority-more">추가 ${rows.length - 3}건은 지점 상세에서 확인</div>` : '');
  target.querySelectorAll('.priority-item[data-store]').forEach((button) => {
    if (!button.dataset.store) return;
    button.addEventListener('click', () => openStoreDialog(button.dataset.store, button));
  });
}

function priorityQueueRows() {
  const stores = filteredStores();
  const storeMap = new Map(stores.map((store) => [slug(store.id || store.name), store]));
  const officialRows = arrayFrom(state.data.opsActions).filter(matchesSelectedStore).map((item) => {
    const storeName = firstPresent(item, ['store', 'storeName', 'store_name', 'name']) || '사업운영팀';
    const store = storeMap.get(slug(storeName));
    return {
      type: 'official',
      storeId: store ? store.id : '',
      storeName,
      status: normalizeStatus(firstPresent(item, ['level', 'actionLevel', 'action_level', 'status']) || 'Orange'),
      scope: '공식 액션',
      reason: firstPresent(item, ['reason', 'trigger', 'priority']) || '오늘 미완료 운영 액션',
      meta: `담당 ${firstPresent(item, ['owner', 'dri', 'team']) || '사업운영팀'} · 기한 ${formatActionDue(firstPresent(item, ['due', 'dueAt', 'due_at']) || '-')}`,
      action: firstPresent(item, ['action', 'nextAction', 'next_action', 'recommendedAction', 'recommended_action']) || '-'
    };
  });
  const officialStoreIds = new Set(officialRows.map((row) => row.storeId).filter(Boolean));
  const weatherRows = stores
    .filter((store) => ['Error', 'Red', 'Orange', 'Yellow'].includes(normalizeStatus(store.status)) && !officialStoreIds.has(store.id))
    .map((store) => ({
      type: 'weather',
      storeId: store.id,
      storeName: store.name,
      status: normalizeStatus(store.status),
      scope: '기상 확인',
      reason: [store.signalRiskType, store.signalReason].filter((value) => value && value !== '-').join(' · ') || store.weather || '기상 신호 확인',
      meta: weatherComparisonSummary(store),
      action: storeNextActionText(store)
    }));
  return [...officialRows, ...weatherRows].sort((a, b) => (
    (a.type === 'official' ? -1 : 0) - (b.type === 'official' ? -1 : 0)
    || (STATUS_ORDER[b.status] || 0) - (STATUS_ORDER[a.status] || 0)
    || a.storeName.localeCompare(b.storeName, 'ko')
  ));
}

function renderWeatherComparison() {
  const target = $('weatherComparison');
  if (!target) return;
  const rows = filteredStores().map(weatherComparisonRow).filter((row) => row.current !== null || row.forecast !== null);
  if (!rows.length) {
    target.innerHTML = '<div class="empty-state compact">현재 필터 기준 강수 실황·예보 데이터가 없습니다.</div>';
    return;
  }
  rows.sort((a, b) => Math.max(b.current || 0, b.forecast || 0) - Math.max(a.current || 0, a.forecast || 0));
  const scaleMax = Math.max(15, ...rows.flatMap((row) => [row.current || 0, row.forecast || 0]));
  target.innerHTML = `
    <div class="weather-comparison-legend" aria-hidden="true">
      <span><i class="current"></i>현재</span><span><i class="forecast"></i>예보 최대</span><span class="scale">0–${escapeHtml(compactNumber(scaleMax))}mm/h</span>
    </div>
    <div class="weather-comparison-rows">
      ${rows.map((row) => {
        const currentPosition = ((row.current || 0) / scaleMax) * 100;
        const forecastPosition = ((row.forecast || 0) / scaleMax) * 100;
        const start = Math.min(currentPosition, forecastPosition);
        const width = Math.max(1, Math.abs(forecastPosition - currentPosition));
        return `
          <div class="weather-compare-row" aria-label="${escapeAttr(`${row.name}, 현재 ${formatRainValue(row.current)}, 예보 최대 ${formatRainValue(row.forecast)}, 피크 ${row.peak || '미정'}`)}">
            <strong>${escapeHtml(row.name)}</strong>
            <div class="weather-compare-track" aria-hidden="true">
              <span class="weather-compare-range" style="left:${start}%;width:${width}%"></span>
              ${row.current !== null ? `<span class="weather-point current" style="left:${currentPosition}%"></span>` : ''}
              ${row.forecast !== null ? `<span class="weather-point forecast" style="left:${forecastPosition}%"></span>` : ''}
            </div>
            <span class="weather-values"><b>${escapeHtml(formatRainValue(row.current))}</b><b>${escapeHtml(formatRainValue(row.forecast))}</b><small>${escapeHtml(row.peak ? `피크 ${row.peak}` : '피크 미정')}</small></span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function weatherComparisonRow(store) {
  const data = Object.assign({}, store.weatherData || {}, store.weatherValues || {});
  return {
    id: store.id,
    name: store.name,
    current: numericOrNull(firstPresent(data, ['observedRain1h', 'observed_rain_1h', 'currentRain1h', 'current_rain_1h', 'rn1', 'RN1'])),
    forecast: numericOrNull(firstPresent(data, ['forecastMaxPcp1h', 'forecast_max_pcp_1h', 'forecastMaxPcp', 'forecast_max_pcp', 'pcp', 'PCP'])),
    peak: formatPeakTime(firstPresent(data, ['forecastPeakTime', 'forecast_peak_time', 'peakTime', 'peak_time', 'weatherPeakTime', 'weather_peak_time']))
  };
}

function weatherComparisonSummary(store) {
  const row = weatherComparisonRow(store);
  const parts = [];
  if (row.current !== null) parts.push(`현재 ${formatRainValue(row.current)}`);
  if (row.forecast !== null) parts.push(`예보 최대 ${formatRainValue(row.forecast)}`);
  if (row.peak) parts.push(`피크 ${row.peak}`);
  return parts.join(' · ') || '강수 수치 확인 전';
}

function formatRainValue(value) {
  return value === null ? '-' : `${compactNumber(value)}mm/h`;
}

function compactNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return number.toLocaleString('ko-KR', { maximumFractionDigits: 1 });
}

function storeSignalLine(store) {
  if (!hasStoreSignalData(store)) return '기상 신호 없음';
  const mode = store.signalMode ? `${store.signalMode} · ` : '';
  const risk = store.signalRiskType && store.signalRiskType !== '-' ? ` · ${store.signalRiskType}` : '';
  const source = signalSourceNotice(store);
  return `기상 신호 ${mode}${levelLabel(store.signalStatus)}${risk}${source ? ` · ${source}` : ''}`;
}

function enhancedStoreLine(store) {
  const row = store && store.enhancedSignal ? store.enhancedSignal : {};
  if (!row.available) return '신규 검증 확인 불가';
  const mode = row.validationMode || 'shadow';
  const awsAvailable = enhancedAwsAvailable(row);
  const radarAvailable = enhancedRadarAvailable(row);
  if (!awsAvailable && !radarAvailable) return `신규 검증 ${mode} · AWS·레이더 확인 불가`;
  const parts = [`신규 검증 ${mode}`];
  parts.push(awsAvailable ? `AWS 1시간 ${formatEnhancedMetric(row.awsRain1h, 'mm', '확인')}` : 'AWS 확인 불가');
  parts.push(radarAvailable ? `레이더 ${formatEnhancedMetric(row.radarRainRate, row.radarUnit || 'mm/h', '확인')}` : '레이더 확인 불가');
  const radarScope = humanizeRadarSpatialScope(row.radarSpatialScope) || humanizeRadarFallbackType(row.radarFallbackType);
  if (radarScope) parts.push(radarScope);
  return parts.join(' · ');
}

function enhancedStoreDetail(store) {
  const row = store && store.enhancedSignal ? store.enhancedSignal : {};
  if (!row.available) {
    return '운영 dashboard payload에 enhancedSignal이 없어 신규 AWS·레이더·특보 검증 상태를 확인할 수 없습니다. 공식 운영 상태와 액션은 prod 신호 기준으로 계속 판단합니다.';
  }
  return enhancedStoreDetailRows(store).map((item) => `${item.label}: ${item.value}`).join(' · ');
}

function enhancedStoreDetailRows(store) {
  const row = store && store.enhancedSignal ? store.enhancedSignal : {};
  if (!row.available) return [{ label: '신규 검증', value: 'enhancedSignal 미제공 · 공식 운영은 prod 기준 유지' }];
  const sourceErrors = uniqueTextParts([...arrayFrom(row.sourceErrors), row.sourceError]);
  const fallbackNotices = uniqueTextParts([
    ...arrayFrom(row.fallbackNotices),
    ...uniqueTextParts([row.sourceWarnings]).filter(isEnhancedFallbackNotice)
  ]);
  const warnings = uniqueTextParts([...arrayFrom(row.sourceWarningItems), row.sourceWarnings])
    .filter((text) => !isEnhancedFallbackNotice(text));
  const rows = [
    { label: 'AWS', value: enhancedAwsDetail(row) },
    { label: '레이더', value: enhancedRadarDetail(row) },
    { label: '기상특보', value: enhancedWarningDetail(row) },
    { label: '융합 검증', value: [row.fusionStatus || '상태 미제공', row.fusionReason].filter(Boolean).join(' · ') },
    { label: '검증 정책', value: `${row.validationMode || 'shadow'} · 운영 영향 ${enhancedOperationalImpactText([row])} · 관리자 입력 ${row.managerInputRequired === true ? '필요' : '불필요'}` },
    { label: '신규 검증 오류', value: sourceErrors.length ? sourceErrors.join(' · ') : '없음' },
    { label: '대체자료 안내', value: fallbackNotices.length ? summarizeEnhancedFallbackNotices([row], fallbackNotices) : '없음' }
  ];
  if (warnings.length) rows.push({ label: '신규 검증 경고', value: warnings.join(' · ') });
  return rows;
}

function enhancedAwsDetail(row) {
  if (!enhancedAwsAvailable(row)) return '확인 불가';
  const station = row.awsStationName || row.awsStationId || '인근 관측소';
  const metrics = [
    `1시간 강수 ${formatEnhancedMetric(row.awsRain1h, 'mm', '미제공')}`,
    row.awsWind !== null ? `풍속 ${formatEnhancedMetric(row.awsWind, 'm/s', '미제공')}` : '',
    row.awsObservedAt ? `기준 ${formatDateTime(row.awsObservedAt)}` : ''
  ].filter(Boolean);
  return `${station} · ${metrics.join(' · ')}`;
}

function enhancedRadarDetail(row) {
  if (!enhancedRadarAvailable(row)) return '확인 불가';
  const scope = humanizeRadarSpatialScope(row.radarSpatialScope) || humanizeRadarFallbackType(row.radarFallbackType);
  return [
    `강우강도 ${formatEnhancedMetric(row.radarRainRate, row.radarUnit || 'mm/h', '미제공')}`,
    scope,
    row.radarObservedAt ? `기준 ${formatDateTime(row.radarObservedAt)}` : ''
  ].filter(Boolean).join(' · ');
}

function enhancedWarningDetail(row) {
  if (row.weatherWarningSummary) {
    return `${row.weatherWarningSummary}${row.weatherWarningIssuedAt ? ` · ${formatDateTime(row.weatherWarningIssuedAt)}` : ''}`;
  }
  if (row.weatherWarningActiveSevere === false) return '활성 중대특보 없음';
  if (row.weatherWarningActiveSevere === true) return '활성 중대특보 있음';
  return '확인 불가';
}

function humanizeRadarSpatialScope(value) {
  const scope = String(value || '').trim().toLowerCase();
  if (!scope) return '';
  if (['store', 'store_exact', 'exact_store', 'dong', 'dong_exact', 'exact_dong'].includes(scope)) return '지점 인근 자료';
  if (scope === 'district_fallback') return '시·군·구 대표 자료';
  if (scope === 'province_fallback') return '시·도 광역 대표 자료';
  return '대표 관측자료';
}

function humanizeRadarFallbackType(value) {
  const type = String(value || '').trim().toLowerCase();
  if (!type) return '';
  if (type === 'district') return '시·군·구 대표 자료';
  if (type === 'province') return '시·도 광역 대표 자료';
  return '대체 관측자료';
}

function formatEnhancedMetric(value, unit, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return `${number.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}${unit}`;
}

function siteVulnerabilityContext(store) {
  const site = store && store.siteVulnerability ? store.siteVulnerability : {};
  if (!site.available) return { visible: false, summary: '', actions: [], signalTypes: [] };
  const rainRelevant = hasRelevantRainSignal(store);
  const windRelevant = hasRelevantWindSignal(store);
  if (!rainRelevant && !windRelevant) return { visible: false, summary: '', actions: [], signalTypes: [] };

  const summaryParts = [];
  const actions = [];
  const signalTypes = [];
  if (rainRelevant) {
    signalTypes.push('강수');
    if (site.rainPoolingPoints) summaryParts.push(`침수 취약 ${site.rainPoolingPoints}`);
    const drainage = formatRainDrainage(site.rainDrainageMinMinutes, site.rainDrainageMaxMinutes);
    if (drainage) summaryParts.push(`배수 ${drainage}`);
    if (site.rainRouteRisk) summaryParts.push('출입·진입 동선 확인');
    if (meaningfulEquipmentRisk(site.rainEquipmentRisk)) summaryParts.push(`설비 ${site.rainEquipmentRisk}`);
    actions.push(...arrayFrom(site.rainPriorityActions));
    if (site.rainRouteRisk) actions.push('출입·진입 동선 사전 확인');
  }
  if (windRelevant) {
    signalTypes.push('강풍');
    summaryParts.push('강풍 취약 구조물 확인');
    actions.push(...arrayFrom(site.windPriorityActions));
  }
  return {
    visible: true,
    summary: uniqueTextParts(summaryParts).slice(0, 2).join(' · ') || `${signalTypes.join('·')} 현장 취약정보 확인`,
    actions: uniqueTextParts(actions).slice(0, 2),
    signalTypes
  };
}

function renderSiteVulnerabilityCard(context) {
  return `
    <span class="site-vulnerability">
      <span class="site-vulnerability-label">현장 취약 · ${escapeHtml(context.signalTypes.join('·'))}</span>
      <span class="site-vulnerability-summary">${escapeHtml(context.summary)}</span>
      ${context.actions.length ? `<span class="site-vulnerability-actions">${context.actions.map((action) => `<span>${escapeHtml(action)}</span>`).join('')}</span>` : ''}
    </span>
  `;
}

function hasRelevantRainSignal(store) {
  const text = `${store.signalRiskType || ''} ${store.signalReason || ''} ${store.trigger || ''} ${store.weather || ''}`;
  const weather = store.weatherValues || {};
  const enhanced = store.enhancedSignal || {};
  const liveRain = [weather.observedRain1h, weather.forecastMaxPcp1h, enhanced.awsRain1h, enhanced.radarRainRate]
    .map(numericOrNull).some((value) => value !== null && value > 0);
  return liveRain || (/(강수|호우|폭우|침수|비|rain|precip)/i.test(text)
    && ['Yellow', 'Orange', 'Red'].includes(normalizeStatus(store.signalStatus)));
}

function hasRelevantWindSignal(store) {
  const text = `${store.signalRiskType || ''} ${store.signalReason || ''} ${store.trigger || ''} ${store.weather || ''}`;
  const weather = store.weatherValues || {};
  const enhanced = store.enhancedSignal || {};
  const wind = [weather.observedWind, weather.forecastMaxWind, enhanced.awsWind]
    .map(numericOrNull).filter((value) => value !== null);
  const strongWind = wind.some((value) => value >= 7);
  return strongWind || (/(강풍|풍속|돌풍|wind)/i.test(text)
    && ['Yellow', 'Orange', 'Red'].includes(normalizeStatus(store.signalStatus)));
}

function formatRainDrainage(minValue, maxValue) {
  const min = numericOrNull(minValue);
  const max = numericOrNull(maxValue);
  if (max !== null && (min === null || min <= 0)) return `최대 ${max}분`;
  if (min !== null && max !== null && min !== max) return `${min}~${max}분`;
  if (max !== null) return `${max}분`;
  if (min !== null) return `${min}분 이상`;
  return '';
}

function siteVulnerabilityDetailRows(store) {
  const site = store && store.siteVulnerability ? store.siteVulnerability : {};
  if (!site.available) return [];
  const rows = [];
  if (site.rainPoolingPoints) rows.push({ label: '침수 취약 지점', value: site.rainPoolingPoints });
  const drainage = formatRainDrainage(site.rainDrainageMinMinutes, site.rainDrainageMaxMinutes);
  if (drainage) rows.push({ label: '배수 예상', value: drainage });
  if (site.rainRouteRisk) rows.push({ label: '출입·진입 동선', value: '우천 시 사전 확인 필요' });
  if (meaningfulEquipmentRisk(site.rainEquipmentRisk)) rows.push({ label: '방수·전기·설비', value: site.rainEquipmentRisk });
  if (site.rainOperationalHistory) rows.push({ label: '과거 운영 이력', value: site.rainOperationalHistory });
  if (arrayFrom(site.rainPriorityActions).length) rows.push({ label: '강수 우선 조치', value: site.rainPriorityActions.join(' · ') });
  if (arrayFrom(site.windPriorityActions).length) rows.push({ label: '강풍 우선 조치', value: site.windPriorityActions.join(' · ') });
  if (site.updatedAt) rows.push({ label: '취약정보 갱신', value: formatDateTime(site.updatedAt) });
  return rows;
}

function hasStoreSignalData(store) {
  return Boolean(store.signalStatusProvided || store.signalMode || store.signalRiskType || store.signalReason || store.signalObservedAt
    || ['Error', 'Red', 'Orange', 'Yellow'].includes(store.signalStatus));
}

function storeNextActionText(store) {
  const current = String(store.nextAction || '-').trim() || '-';
  if (!hasStoreSignalData(store) && normalizeStatus(store.prodStatus) === 'Green') {
    return '기상 신호 연동 확인';
  }
  return current;
}

function renderActions() {
  $('opsActions').innerHTML = renderActionList(state.data.opsActions, '사업운영팀', 'operations');
  renderOverdueExceptions();
  $('marketingActions').innerHTML = renderActionList(state.data.marketingActions, '마케팅팀', 'marketing');
}

function renderOverdueExceptions() {
  const target = $('overdueExceptions');
  if (!target) return;
  const summary = historicalOverdueSummary();
  target.hidden = summary.count <= 0;
  target.innerHTML = summary.count > 0 ? `
    <div class="overdue-exception-head">
      <strong>과거 미종결 예외 ${summary.count}건</strong>
      <span>${escapeHtml(summary.scope)}</span>
    </div>
    <p>오늘 공식 미완료 조치와 분리된 사업운영팀 이력 점검 대상입니다.</p>
  ` : '';
}

function historicalOverdueSummary() {
  const system = state.data.system || {};
  const efficiency = objectFrom(firstPresent(system, ['operatingEfficiency', 'operating_efficiency']));
  const records = arrayFrom(state.data.overdueExceptions);
  const filtered = records.filter(matchesSelectedStore);
  const reported = metricFromKeysNumber(efficiency, ['historicalOverdueCount', 'historical_overdue_count']) || 0;
  if (state.store !== 'all' && !records.length) {
    return { count: 0, scope: '지점별 예외 상세 미제공' };
  }
  if (state.store !== 'all' && records.length) {
    return { count: filtered.length, scope: '선택 지점 기준' };
  }
  return {
    count: records.length ? Math.max(records.length, reported) : reported,
    scope: records.length ? '전체 예외 상세 기준' : '전체 지점 집계 기준'
  };
}

function renderActionList(items, fallbackTeam, kind) {
  const filtered = (items || []).filter(matchesSelectedStore);
  if (!filtered.length) {
    return `<div class="empty-state compact">현재 필터 기준 ${kind === 'marketing' ? '승인 검토 후보가' : '오늘 공식 미완료 조치가'} 없습니다.</div>`;
  }
  return filtered.map((item) => {
    const priority = firstPresent(item, ['priority', 'level', 'actionLevel', 'action_level']) || 'P1';
    const store = firstPresent(item, ['store', 'storeName', 'store_name', 'name']) || fallbackTeam;
    const action = firstPresent(item, ['action', 'nextAction', 'next_action', 'recommendedAction', 'recommended_action', 'customerAction', 'customer_action', 'revenueAction', 'revenue_action']) || '-';
    const owner = firstPresent(item, ['owner', 'dri', 'team', 'opsLead', 'ops_lead']) || fallbackTeam;
    const due = firstPresent(item, ['due', 'dueAt', 'due_at', 'nextUpdateDue', 'next_update_due', 'vendorEta', 'vendor_eta']) || '-';
    const audience = firstPresent(item, ['estimatedAudience', 'estimated_audience', 'audienceCount', 'audience_count']);
    const itemStatus = firstPresent(item, ['status', 'approvalStatus', 'approval_status', 'sendStatus', 'send_status']) || '';
    const scopeText = kind === 'marketing' ? '제안 · 자동 발송 아님' : '오늘 실행';
    return `
      <div class="action-item">
        <div class="action-top">
          <span class="priority">${escapeHtml(priority)}</span>
          <span class="action-store">${escapeHtml(store)}</span>
        </div>
        <div class="action-scope scope-${escapeAttr(kind || 'operations')}">${escapeHtml(scopeText)}</div>
        <div class="action-body">${escapeHtml(action)}</div>
        <div class="action-foot">
          <span>담당 ${escapeHtml(owner)}</span>
          <span>기한 ${escapeHtml(formatActionDue(due))}</span>
          ${kind === 'marketing' && itemStatus ? `<span>상태 ${escapeHtml(itemStatus)}</span>` : ''}
          ${audience !== null && Number.isFinite(Number(audience)) ? `<span>대상 ${Number(audience).toLocaleString('ko-KR')}명</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function formatActionDue(value) {
  const formatted = formatDateTime(value);
  return formatted || String(value || '-');
}

function renderRecoveryChart() {
  const panel = $('recoveryChartPanel');
  const grid = $('primaryDashboardGrid');
  const recovery = state.data.recovery || {};
  const selectedSeries = getRecoverySeries(recovery);
  const hasSeries = [selectedSeries.processedRate, selectedSeries.processed_rate, selectedSeries.revenueRate, selectedSeries.revenue_rate]
    .some((values) => arrayFrom(values).some((value) => numericOrNull(value) !== null));
  if (state.store === 'all' || !hasSeries) {
    if (state.chart) {
      state.chart.destroy();
      state.chart = null;
    }
    panel.hidden = true;
    if (grid) grid.classList.add('chart-hidden');
    return;
  }
  if (grid) grid.classList.remove('chart-hidden');
  panel.hidden = false;
  if (typeof Chart === 'undefined') {
    $('recoveryChartWrap').innerHTML = '<div class="empty-state">회복률 차트 라이브러리 로딩 대기 중입니다.</div>';
    return;
  }
  if (!$('recoveryChart')) {
    $('recoveryChartWrap').innerHTML = '<canvas id="recoveryChart"></canvas>';
  }
  const labels = selectedSeries.labels || recovery.labels || ['D-day', 'D+1', 'D+2'];
  const processedRate = selectedSeries.processedRate || selectedSeries.processed_rate || recovery.processedRate || recovery.processed_rate || [];
  const revenueRate = selectedSeries.revenueRate || selectedSeries.revenue_rate || recovery.revenueRate || recovery.revenue_rate || [];
  const ctx = $('recoveryChart');
  const chartData = {
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
  };
  if (state.chart) {
    state.chart.data = chartData;
    state.chart.update();
    return;
  }
  state.chart = new Chart(ctx, {
    type: 'line',
    data: chartData,
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

function renderRiskMatrix() {
  const rows = riskMatrixRows().filter((row) => state.store === 'all' || row.storeId === state.store);
  const matrix = $('riskMatrix');
  if (!rows.length) {
    matrix.classList.remove('is-dense');
    const label = state.risk === 'all' ? '현재 필터 기준 리스크 데이터가 없습니다.' : `현재 ${levelLabel(state.risk)} 기상 리스크가 없습니다.`;
    matrix.innerHTML = `<div class="empty-state">${escapeHtml(label)}</div>`;
    return;
  }
  const columns = activeRiskColumns(rows);
  if (isNoActiveRiskMatrix(rows, columns)) {
    matrix.classList.remove('is-dense');
    matrix.innerHTML = `<div class="empty-state">기상 신호 없음${nextSummaryDueText() ? ` · 다음 기준 ${escapeHtml(nextSummaryDueText())}` : ''}</div>`;
    return;
  }
  const dense = columns.length > 5;
  const storeColumnWidth = dense ? 96 : 112;
  const cellMinWidth = dense ? 46 : 64;
  const matrixMinWidth = dense ? storeColumnWidth + (columns.length * (cellMinWidth + 6)) : 0;
  const gridStyle = `grid-template-columns:minmax(${storeColumnWidth}px,1.25fr) repeat(${columns.length}, minmax(${cellMinWidth}px,1fr));${dense ? `min-width:${matrixMinWidth}px` : ''}`;
  matrix.classList.toggle('is-dense', dense);
  matrix.innerHTML = `
    <div class="matrix-row matrix-head" style="${gridStyle}">
      <div class="matrix-store">지점</div>
      ${columns.map((column) => `<div class="${isOperationalRiskColumn(column) ? 'matrix-op-head' : ''}">${escapeHtml(column.label)}</div>`).join('')}
    </div>
    ${rows.map((row) => `
      <div class="matrix-row${isNormalRiskRow(row, columns) ? ' is-muted' : ''}" style="${gridStyle}">
        <div class="matrix-store">${escapeHtml(row.store)}</div>
        ${columns.map((column) => {
          const cell = matrixCellForColumn(row, column);
          const level = normalizeStatus(cell.level);
          const opClass = isOperationalRiskColumn(column) ? ' is-op' : '';
          return `<div class="matrix-cell ${level}${opClass}" title="${escapeAttr(`${row.store} ${cell.label} ${levelLabel(level)} · ${WEATHER_SIGNAL_HELP} ${WEATHER_THRESHOLD_HELP}`)}">${escapeHtml(levelLabel(level))}</div>`;
        }).join('')}
      </div>
    `).join('')}
  `;
}

function isNoActiveRiskMatrix(rows, columns) {
  if (columns.length === 1 && columns[0].key === 'normal') return true;
  return rows.every((row) => columns.every((column) => {
    const level = normalizeStatus(matrixCellForColumn(row, column).level);
    return level === 'Green' || level === 'Gray';
  }));
}

function renderRecoveryFunnel() {
  const allRows = recoveryFunnelRows();
  const rows = allRows.filter((row) => !isAsBlockedFunnelRow(row));
  const sideRows = allRows.filter(isAsBlockedFunnelRow);
  if (!allRows.some((row) => Number(row.count || 0) > 0)) {
    $('recoveryFunnel').innerHTML = '<div class="empty-state">진행 중인 회복 퍼널이 없습니다.</div>';
    return;
  }
  const max = Math.max(...rows.map((row) => Number(row.count || 0)), 1);
  const flowHtml = rows.map((row, index) => {
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
  const sideHtml = sideRows.length ? `
    <div class="funnel-side-note">
      <span>전환 계산 제외</span>
      <strong>AS 차단</strong>
      <b>${sideRows.reduce((sum, row) => sum + Number(row.count || 0), 0).toLocaleString('ko-KR')}건</b>
      <small>정상화 전 CRM·재방문 퍼널로 보지 않습니다.</small>
    </div>
  ` : '';
  $('recoveryFunnel').innerHTML = flowHtml + sideHtml;
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
  const hasSeries = stores.some((store) => {
    const series = rateSeriesForStore(store.id, recovery, false);
    return arrayFrom(series.processedRate).concat(arrayFrom(series.revenueRate))
      .some((value) => {
        const numeric = numericOrNull(value);
        return numeric !== null && numeric > 0;
      });
  });
  if (!hasSeries) {
    $('recoveryStageHeatmap').innerHTML = '<div class="empty-state">진행 중인 회복 이벤트가 없습니다.</div>';
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
  const hasValues = rows.some((row) => {
    const processed = numericOrNull(row.processedRate ?? row.processed_rate);
    const revenue = numericOrNull(row.revenueRate ?? row.revenue_rate);
    return (processed !== null && processed > 0) || (revenue !== null && revenue > 0);
  });
  if (!rows.length || !hasValues) {
    $('recoveryComparison').innerHTML = '<div class="empty-state">현재 필터 기준 처리대수/매출 회복 비교 데이터가 없습니다.</div>';
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
        <div class="dumbbell" aria-label="${escapeAttr(row.store)} 처리대수 회복 ${formatPercent(processed)}, 매출 회복 ${formatPercent(revenue)}">
          <span class="dumbbell-range" style="left:${left}%;width:${width}%"></span>
          <span class="dumbbell-dot processed" style="left:${processedPos}%"></span>
          <span class="dumbbell-dot revenue" style="left:${revenuePos}%"></span>
        </div>
        <div class="comparison-foot">
          <span><i class="legend-dot processed"></i>처리대수 ${formatPercent(processed)}</span>
          <span><i class="legend-dot revenue"></i>매출 ${formatPercent(revenue)}</span>
        </div>
      </div>
    `;
  }).join('') + `
    <div class="comparison-legend">
      <span><i class="legend-dot processed"></i>처리대수 회복률</span>
      <span><i class="legend-dot revenue"></i>매출 회복률</span>
      <span>갭이 클수록 결제/단가/구독 믹스 확인 필요</span>
    </div>
  `;
}

function renderRecoveryQueue() {
  const queue = (state.data.recovery && state.data.recovery.queue) || [];
  const filtered = queue.filter(matchesSelectedStore);
  const countTarget = $('recoveryQueueCount');
  if (countTarget) countTarget.textContent = `${filtered.length}건 · 최근 기록`;
  if (!filtered.length) {
    $('recoveryQueue').innerHTML = '<div class="empty-state">현재 필터 기준 미완료 회복 기록이 없습니다.</div>';
    return;
  }
  $('recoveryQueue').innerHTML = filtered.map((item) => {
    const status = firstPresent(item, ['status', 'recoveryStatus', 'recovery_status']) || '-';
    const processed = firstPresent(item, ['processedRecoveryRate', 'processed_recovery_rate', 'washRecoveryRate', 'wash_recovery_rate']);
    const revenue = firstPresent(item, ['revenueRecoveryRate', 'revenue_recovery_rate', 'recoveryRate', 'recovery_rate']);
    const revenueText = revenue !== null ? ` · 매출 회복률 ${formatPercent(revenue)}` : '';
    const crm = formatCrmAllowed(firstPresent(item, ['crmAllowed', 'crm_allowed', 'crm_allowed_yn']));
    return `
      <div class="queue-item">
        <div class="queue-main">
          <div class="queue-top">
            <span class="queue-store">${escapeHtml(firstPresent(item, ['store', 'storeName', 'store_name']) || '-')}</span>
            <span class="badge ${queueStatusClass(status)}" title="${escapeAttr('회복 큐 상태입니다. AS 차단 또는 조치 필요는 CRM·재방문 실행 전에 정상화 확인이 필요합니다.')}">${escapeHtml(status)}</span>
          </div>
          <div class="queue-body">${escapeHtml(firstPresent(item, ['stage', 'recoveryStage', 'recovery_stage']) || '-')} · 처리대수 회복률 ${formatPercent(processed)}${revenueText}</div>
        </div>
        <div class="queue-side">
          <span class="queue-chip ${escapeAttr(crm.className)}" title="${escapeAttr('CRM 가능은 AS 정상화와 회복 판단을 통과해 승인 검토 후보가 될 수 있다는 뜻이며 자동 발송을 의미하지 않습니다.')}">CRM ${escapeHtml(crm.label)}</span>
          <span class="queue-next">${escapeHtml(firstPresent(item, ['next', 'nextAction', 'next_action', 'recommendedAction', 'recommended_action']) || '-')}</span>
        </div>
      </div>
    `;
  }).join('');
}

function renderProcessedBulletList() {
  const container = $('processedBulletList');
  if (!container) return;
  const rows = processedBulletRows();
  const hasValues = rows.some((row) => {
    const actual = numericOrNull(firstPresent(row, ['actual', 'washCount', 'wash_count']));
    const baseline = numericOrNull(firstPresent(row, ['baseline', 'baselineWashCount', 'baseline_wash_count']));
    const rate = numericOrNull(firstPresent(row, ['rate', 'processedRate', 'processed_rate']));
    return (actual !== null && actual > 0) || (baseline !== null && baseline > 0) || (rate !== null && rate > 0);
  });
  if (!rows.length || !hasValues) {
    container.innerHTML = '<div class="empty-state compact">처리대수 기준/실적 비교 데이터가 없습니다.</div>';
    return;
  }
  container.innerHTML = rows.map((row) => {
    const actual = numericOrNull(firstPresent(row, ['actual', 'washCount', 'wash_count']));
    const baseline = numericOrNull(firstPresent(row, ['baseline', 'baselineWashCount', 'baseline_wash_count']));
    const rate = numericOrNull(firstPresent(row, ['rate', 'processedRate', 'processed_rate']));
    const baseWidth = rate === null ? 0 : Math.max(2, ratePosition(Math.min(rate, 100)));
    const overWidth = rate !== null && rate > 100 ? Math.max(2, ratePosition(rate) - ratePosition(100)) : 0;
    const overLabel = rate !== null && rate > 100 ? `초과 +${Math.round(rate - 100)}%p` : '120% 스케일';
    const statusText = firstPresent(row, ['status', 'recoveryStatus', 'recovery_status']);
    const footNote = statusText ? `${statusText} · ${overLabel}` : overLabel;
    const storeName = firstPresent(row, ['store', 'storeName', 'store_name']) || storeNameById(row.storeId);
    return `
      <div class="bullet-row">
        <div class="bullet-top">
          <strong>${escapeHtml(storeName)}</strong>
          <span>${escapeHtml(formatPercent(rate))}</span>
        </div>
        <div class="bullet-track" aria-label="${escapeAttr(storeName)} 처리대수 회복률 ${formatPercent(rate)}">
          <span class="${recoveryRateLevel(rate)}" style="width:${baseWidth}%"></span>
          ${overWidth ? `<span class="bullet-over" style="left:${ratePosition(100)}%;width:${overWidth}%"></span>` : ''}
          <i style="left:${ratePosition(100)}%"></i>
        </div>
        <div class="bullet-foot">
          <span>실적 ${formatCount(actual)}</span>
          <span>기준 ${formatCount(baseline)}</span>
          <span>${escapeHtml(footNote)}</span>
        </div>
      </div>
    `;
  }).join('');
}

function renderStoreTable() {
  const rows = filteredStores();
  $('storeTable').innerHTML = rows.map((store) => {
    const weatherChips = renderCombinedWeatherMetricChips(store, 5);
    const customer = customerStatusView(store);
    const nextAction = storeNextActionText(store);
    const nextActionHelp = nextAction !== store.nextAction
      ? renderInfoTip('운영 원장은 정상이지만 최신 기상 신호가 없어 현재 기상 정상 판정을 확정할 수 없습니다. weatherSignal 연동을 확인한 뒤 정상 운영 유지 여부를 판단합니다.', '다음 액션 기준')
      : '';
    return `
      <tr>
        <td data-label="지점"><strong>${escapeHtml(store.name)}</strong><br><span class="muted">${escapeHtml(store.region)}</span></td>
        <td data-label="운영/신호">
          <span class="status-pair"><span class="badge ${store.prodStatus}" title="${escapeAttr(statusHelpText(store.prodStatus))}">운영 ${escapeHtml(levelLabel(store.prodStatus))}</span><span class="badge ${store.signalStatus}" title="${escapeAttr(signalStatusHelpText(store))}">신호 ${escapeHtml(levelLabel(store.signalStatus))}</span></span>
          <br><span class="muted score-line">운영 점수 ${escapeHtml(store.riskScore)}${renderInfoTip(riskScoreHelpText(store), '위험 점수 기준')}</span>
        </td>
        <td data-label="기상/트리거">
          <span class="table-main-line">운영 ${escapeHtml(store.weather)}${renderInfoTip(weatherCellHelpText(store), '기상/트리거 기준')}</span><br>
          <span class="muted">${escapeHtml(weatherDetailText(store))}</span>
          ${renderTableSignalLine(store)}
          ${weatherChips ? `<div class="weather-chip-row table-weather">${weatherChips}</div>` : ''}
          <span class="enhanced-table-line">${escapeHtml(enhancedStoreLine(store))}${renderInfoTip(enhancedStoreDetail(store), '신규 원천 검증')}</span>
        </td>
        <td data-label="AS"><span class="table-main-line">${escapeHtml(store.asStatus)}${renderInfoTip(asStatusHelpText(store), 'AS 기준')}</span>${renderDowntimeDetail(store)}</td>
        <td data-label="CS/고객">
          <span class="table-main-line customer-status is-${escapeAttr(customer.state)}">${escapeHtml(customer.primary)}${renderInfoTip(customerStatusHelpText(store), 'CS/고객 기준')}</span>
          ${customer.detail ? `<span class="customer-detail"><span class="customer-detail-label">영향</span>${escapeHtml(customer.detail)}</span>` : ''}
        </td>
        <td data-label="회복"><span class="table-main-line">${escapeHtml(store.recoveryStatus)}${renderInfoTip(recoveryStatusHelpText(store), '회복 기준')}</span><br><span class="muted score-line">CRM ${store.crmReady ? '가능' : '대기'}${renderInfoTip(crmHelpText(store), 'CRM 기준')}</span></td>
        <td data-label="담당">${escapeHtml(store.dri)}</td>
        <td data-label="다음 액션"><span class="table-main-line">${escapeHtml(nextAction)}${nextActionHelp}</span></td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="8">현재 필터 기준 지점이 없습니다.</td></tr>';
}

function renderDowntimeDetail(store) {
  const details = [];
  if (store.downtimeMinutes !== null) details.push(`다운타임 ${missionLongestDowntime([store])}`);
  if (store.vendorStatus) details.push(store.vendorStatus);
  if (store.vendorEta) details.push(`ETA ${formatActionDue(store.vendorEta)}`);
  if (store.normalizationBlocker) details.push(store.normalizationBlocker);
  return details.length ? `<br><span class="muted">${escapeHtml(details.join(' · '))}</span>` : '';
}

function customerStatusText(store) {
  return customerStatusView(store).primary;
}

function customerImpactText(store) {
  return customerStatusView(store).detail;
}

function customerStatusHelpText(store) {
  const customer = customerStatusView(store);
  if (customer.state === 'unknown') {
    return '고객 안내·영향 값이 확인 전 또는 미입력 상태입니다. 정상 0건으로 해석하지 말고 customer_notice_status와 customer_impact 연동 값을 확인해야 합니다.';
  }
  if (customer.state === 'pending') return '고객 영향 또는 안내가 대기 중입니다. 현장 안전·운영 상태와 승인 여부를 확인한 뒤 안내를 완료해야 합니다.';
  return '고객 안내 상태가 명시되어 있고 현재 추가 조치 대기로 분류되지 않은 상태입니다.';
}

function renderInfoTip(message, label) {
  const text = String(message || '').trim();
  if (!text) return '';
  return `<span class="info-tip" tabindex="0" role="note" aria-label="${escapeAttr(`${label}: ${text}`)}">ⓘ<span class="info-tip-bubble" role="tooltip" aria-hidden="true">${escapeHtml(text)}</span></span>`;
}

function renderTableSignalLine(store) {
  if (!hasStoreSignalData(store)) {
    return '<span class="signal-line"><span class="badge Gray">기상 신호 없음</span></span>';
  }
  const sourceNotice = signalSourceNotice(store);
  const sourceStatus = normalizeSignalSourceStatus(store.signalSourceStatus);
  const sourceMarkup = sourceNotice
    ? ` <span class="source-status is-${escapeAttr(sourceStatus)}">${escapeHtml(sourceNotice)}${renderInfoTip(signalSourceDetail(store), '기상 원천 상태')}</span>`
    : '';
  return `<span class="signal-line"><span class="badge ${store.signalStatus}">신호 ${escapeHtml(store.signalActionLevel)}</span> ${escapeHtml(signalWeatherText(store))}${sourceMarkup}</span>`;
}

function signalSourceNotice(store) {
  const status = normalizeSignalSourceStatus(store && store.signalSourceStatus);
  if (isAirQualitySourceIssue(store)) return '대기질만 확인 불가';
  if (status === 'error') return '원천 확인';
  if (status === 'warning') return '원천 경고';
  return '';
}

function signalSourceDetail(store) {
  if (!store) return '';
  const detail = String(store.signalSourceError || store.signalSourceWarnings || '').trim();
  if (isAirQualitySourceIssue(store)) {
    return `강수 실황·단기예보는 계속 사용할 수 있으며 대기질만 확인할 수 없습니다. ${detail}`.trim();
  }
  return detail
    || (signalSourceNotice(store) ? '기상 또는 대기질 원천 일부를 확인해야 합니다.' : '원천 데이터 정상');
}

function riskScoreHelpText(store) {
  const scoreStatus = store.prodStatus || store.status;
  const base = { Error: 95, Red: 90, Orange: 74, Yellow: 54, Green: 20, Gray: 10 }[scoreStatus] || 20;
  const current = Number(store.riskScore);
  const signalNotice = !hasStoreSignalData(store)
    ? ' 최신 기상 신호가 없어 지점 표시 상태는 판단 대기입니다. 점수는 prod 운영 원장 우선순위일 뿐 현재 기상 정상 판정이 아닙니다.'
    : ((STATUS_ORDER[store.signalStatus] || 0) > (STATUS_ORDER[store.prodStatus] || 0)
      ? ` 현재 화면 상태는 기상 신호 ${levelLabel(store.signalStatus)}가 운영 상태보다 높아 우선 표시된 것입니다. 점수는 prod 운영 액션 기준 값입니다.`
      : '');
  const currentMeaning = scoreStatus === 'Green' && current === 20
    ? '현재 20점은 정상 기본점수만 적용된 상태입니다.'
    : `현재 운영 ${levelLabel(scoreStatus)} 기본점수 ${base}점에 이슈 보정이 반영된 값입니다.`;
  return `위험 점수(0-100)는 prod 운영 액션 기준 지점 우선 확인 순서입니다. 기본점수는 정상 20, 주의 54, 조치 74, 제한확인 90, 오류 95입니다. 미해결 액션은 건당 +4(최대 +12), AS 정상화 대기는 +12, 회복 필요·대기·차단은 +6입니다. ${currentMeaning}${signalNotice}`;
}

function overallStatusHelpText(status) {
  return `상단 대표 상태는 실제 API 기반 최신 기상 신호를 우선 표시합니다. 완료보고, AS, 매출회복, CRM 실행 여부는 별도 prod 운영 원장 기준으로 확인합니다. ${statusHelpText(status)} ${WEATHER_SIGNAL_HELP}`;
}

function statusHelpText(status) {
  const messages = {
    Error: '오류는 payload, 인증, 원천 데이터 또는 자동화 처리에 점검이 필요한 상태입니다.',
    Red: '제한확인은 안전·운영 영향 확인이 최우선인 상태입니다. 실제 제한·중단은 현장 확인 후 판단합니다.',
    Orange: '조치는 DRI 확인, 현장 점검, 고객 안내 준비 등 당일 실행이 필요한 상태입니다.',
    Yellow: '주의는 사전점검, 피크 전 확인, 회복 관찰이 필요한 상태입니다.',
    Green: '정상은 현재 대시보드의 prod 운영 액션 기준 활성 위험이 없다는 뜻입니다. 원시 기상 API 수치가 모두 정상이라는 의미는 아닙니다.',
    Gray: '대기는 데이터가 아직 확정되지 않았거나 판단 보류 상태입니다.'
  };
  return messages[normalizeStatus(status)] || messages.Green;
}

function signalStatusHelpText(store) {
  const source = signalSourceNotice(store)
    ? ` 원천 상태는 ${signalSourceNotice(store)}이며, 상세는 ${signalSourceDetail(store)}입니다.`
    : '';
  return `${WEATHER_SIGNAL_HELP} 현재 ${store.signalMode || '미지정'} 기준 ${levelLabel(store.signalStatus)}이며, 판단 근거는 ${store.signalReason || store.signalRiskType || '제공된 신호 없음'}입니다.${source}`;
}

function signalWeatherText(store) {
  const currentObservedAt = firstPresent(store.weatherValues || {}, ['observedAt', 'observed_at', 'observationAt', 'observation_at']);
  const pieces = [
    store.signalMode || '',
    store.signalRiskType || '',
    store.signalReason || '',
    currentObservedAt
      ? `실황 ${formatDateTime(currentObservedAt)}`
      : (store.signalObservedAt ? `신호 기준 ${formatDateTime(store.signalObservedAt)}` : '')
  ].filter(Boolean);
  return pieces.length ? pieces.join(' · ') : '최신 기상 신호 없음';
}

function kpiHelpText(label) {
  const messages = {
    '안전 확보': `운영 원장의 Orange/Red/Error와 최신 기상 API 신호의 즉시 확인 지점을 함께 봅니다. 기상 신호가 없으면 0이 아니라 판단 대기로 표시합니다. ${WEATHER_SIGNAL_HELP}`,
    '다운타임 축소': 'AS 차단, 정상화 대기, 운영 중단 상태와 제공된 다운타임 시간을 집계합니다. 1건 이상이면 정상화 차단 사유와 ETA를 우선 확인합니다.',
    'CS 안정화': 'customer_notice_status, customer_action_status, 고객 영향 필드를 기준으로 고객 안내 또는 불편 대응 대기 건을 봅니다. 필드가 없으면 정상으로 간주하지 않고 확인 전으로 표시합니다.',
    '수요·매출 회복': '회복 조치·관찰 후보, 처리대수·매출 성과 해석 대기, CRM 승인 검토 후보를 구분해 봅니다. 집계값은 즉시 업무 수와 같지 않으며 AS·안전 게이트 통과 후 실제 실행 여부를 판단합니다.',
    '운영 즉시': `prod 기준 Orange/Red 미완료 운영 액션 수입니다. ${PROD_MODE_HELP}`,
    '신호 즉시': `최신 기상 신호 기준 즉시확인 대상 지점 수입니다. ${WEATHER_SIGNAL_HELP}`,
    '주의 관찰': 'Yellow 상태 또는 회복 관찰이 필요한 지점 수입니다. 피크 전 사전점검 대상입니다.',
    'AS 차단': 'AS 정상화 전이라 고객 유도, CRM, 회복 액션을 보류해야 하는 대상입니다.',
    '회복 조치': '기상 영향 이후 D+1/D+2 회복 또는 재방문 유도가 필요한 실행 항목입니다.',
    'CRM 가능': 'AS 정상화와 회복 판단을 통과해 고객 안내, 재방문, 쿠폰 등 마케팅 실행 후보가 된 대상입니다.',
    '성과 대기': '매출 또는 처리대수 데이터 확정 전이라 회복률과 액션 성과를 아직 판단하지 않는 대상입니다.',
    '시스템 오류': '최근 24시간 미해결 ERROR/CRITICAL/FATAL급 시스템 오류입니다. 해결 처리된 dashboard 인증 오류와 lock 경고는 Apps Script payload에서 제외됩니다.',
    '시스템 경고': '최근 24시간 미해결 WARN/WARNING급 비차단 경고입니다. 운영 판단을 막지는 않지만 반복되면 자동화 또는 원천 상태를 점검해야 합니다.'
  };
  return messages[label] || '운영 판단용 핵심 지표입니다.';
}

function weatherDetailText(store) {
  if (store.weatherDetail) return store.weatherDetail;
  if (store.trigger && store.trigger !== '-') return store.trigger;
  return 'prod 기준 활성 기상 수치 없음';
}

function weatherCellHelpText(store) {
  const metricCount = weatherMetricRows(store).length;
  const signalMetricCount = signalWeatherMetricRows(store).length;
  const sourceNotice = weatherSourceQualityNotice(store);
  if (metricCount && weatherMetricRowsEquivalent(store)) {
    return `운영과 최신 기상 신호 수치 ${metricCount}개가 동일해 중복 없이 한 번만 표시합니다. ${sourceNotice} ${WEATHER_THRESHOLD_HELP}`.trim();
  }
  if (metricCount) {
    return `운영 수치 ${metricCount}개는 prod 운영 액션 기준입니다. 최신 기상 신호 수치는 별도 신호 줄에 ${signalMetricCount}개 표시됩니다. ${sourceNotice} ${WEATHER_THRESHOLD_HELP}`.trim();
  }
  if (signalMetricCount) {
    return `prod 운영 액션 수치는 없지만 최신 기상 신호 수치 ${signalMetricCount}개가 있습니다. ${sourceNotice} ${WEATHER_SIGNAL_HELP} ${WEATHER_THRESHOLD_HELP}`.trim();
  }
  return `${WEATHER_API_HELP} ${PROD_MODE_HELP}`;
}

function weatherSourceQualityNotice(store) {
  const data = Object.assign({}, store.weatherData || {}, store.weatherValues || {});
  const sources = [];
  if (normalizeBoolean(firstPresent(data, ['forecastCacheFallback', 'forecast_cache_fallback', 'weatherCacheFallback', 'weather_cache_fallback']))) sources.push('예보');
  if (normalizeBoolean(firstPresent(data, ['observationCacheFallback', 'observation_cache_fallback']))) sources.push('실황');
  if (normalizeBoolean(firstPresent(data, ['airCacheFallback', 'air_cache_fallback']))) sources.push('대기질');
  return sources.length ? `${sources.join('·')} 데이터는 마지막 성공 캐시 대체값입니다.` : '';
}

function asStatusHelpText(store) {
  const status = String(store.asStatus || '');
  if (status.includes('차단') || status.includes('대기') || status.includes('필요')) {
    return 'AS 정상화 전에는 고객 유도, CRM 발송, 회복 완료 판단을 보류해야 합니다.';
  }
  return 'AS 정상은 현재 prod 기준으로 회복/CRM 실행을 막는 AS 게이트가 없다는 뜻입니다.';
}

function recoveryStatusHelpText(store) {
  const status = String(store.recoveryStatus || '');
  if (status.includes('차단')) return '회복 차단은 AS 또는 운영 정상화 전이라 회복 액션을 진행하지 않는 상태입니다.';
  if (status.includes('대기') || status.includes('관찰') || status.includes('필요')) return '회복 대기/관찰은 처리대수·매출 회복률 또는 현장 정상화 결과를 추가 확인하는 상태입니다.';
  return '회복 대상 없음은 현재 prod 기준 회복 큐에 들어간 미완료 대상이 없다는 뜻입니다.';
}

function crmHelpText(store) {
  return store.crmReady
    ? 'CRM 가능은 AS/운영 게이트를 통과해 고객 안내 또는 재방문 유도 후보가 될 수 있다는 뜻입니다.'
    : 'CRM 대기는 AS 정상화, 안전 확인, 회복률 판단 또는 성과 데이터 확정 전이라 고객 유도를 보류하는 상태입니다.';
}

function systemItemHelpText(label) {
  const system = state.data && state.data.system ? state.data.system : {};
  const expectedPackVersion = system.expectedPackVersion || system.expected_pack_version || EXPECTED_PACK_VERSION;
  const messages = {
    '마지막 요약': 'sendWeatherOpsSummary 또는 종합 요약 실행 기록의 최신 시각입니다. 이 기록이 없어도 dashboard payload와 기상 원장 데이터가 있으면 화면은 계속 작동합니다.',
    '매출 동기화': '회복률, 성과 대기, 매출 회복 비교에 쓰는 원천 매출 데이터의 최신 동기화 시각입니다. 오래된 경우에도 기상 신호와 지점 운영 상태 표시는 계속됩니다.',
    '시트/Pack': expectedPackVersion
      ? `Apps Script/시트가 보고한 Weather Ops Pack 버전입니다. 배포 환경의 기대 버전은 ${expectedPackVersion}입니다.`
      : 'Apps Script/시트가 보고한 현재 Weather Ops Pack 버전입니다. 대시보드는 payload 값을 자동 반영합니다.',
    '데이터 상태': `dashboard payload 연결과 운영 데이터 상태입니다. ${WEATHER_API_HELP}`,
    '판단 상태': decisionReadinessHelpText(),
    '기상 신호': weatherSignalHelpText(),
    '기상 신호 갱신': 'Slack 발송 없이 대시보드용 기상 신호를 새로 계산한 시각입니다. 정기 종합 요약 발송 시각과는 별도입니다.',
    '시스템 오류': '최근 24시간 미해결 ERROR/CRITICAL/FATAL급 시스템 오류입니다. 해결 처리된 dashboard 인증 오류와 lock 경고는 Apps Script payload에서 제외됩니다.',
    '시스템 오류 상세': 'Apps Script dashboard payload가 제공한 미해결 시스템 오류의 최근 메시지입니다. 상세 payload가 없으면 오류 건수만 표시합니다.',
    '시스템 경고': '최근 24시간 미해결 WARN/WARNING급 비차단 경고입니다. 운영 판단을 막지는 않지만 반복되면 자동화 또는 원천 상태를 점검해야 합니다.',
    '원천 경고': '최근 24시간 WARN/WARNING 중 기상·대기질 원천에 한정된 비차단 경고입니다. 공식 prod 운영 판단을 막지 않으며 원천 상태 스트립에서 영향 범위를 확인합니다.',
    '시스템 경고 상세': 'Apps Script dashboard payload가 제공한 최근 비차단 경고입니다. 발생 시각, 실행 단계와 원천 메시지를 함께 확인합니다.'
  };
  return messages[label] || '시스템 운영 상태입니다.';
}

function systemIssueSummary(type, count = 0) {
  const system = state.data && state.data.system ? state.data.system : {};
  const summary = state.data && state.data.summary ? state.data.summary : {};
  const keys = type === 'error'
    ? ['unresolvedErrors', 'unresolved_errors', 'systemErrors', 'system_errors', 'recentErrors', 'recent_errors', 'errorDetails', 'error_details', 'latestError', 'latest_error', 'lastError', 'last_error', 'errorMessage', 'error_message']
    : ['unresolvedWarnings', 'unresolved_warnings', 'systemWarnings', 'system_warnings', 'recentWarnings', 'recent_warnings', 'warningDetails', 'warning_details', 'latestWarning', 'latest_warning', 'lastWarning', 'last_warning', 'warningMessage', 'warning_message'];
  const values = keys.flatMap((key) => [system[key], summary[key]]);
  const details = values.flatMap(formatSystemIssueValue).filter(Boolean);
  if (details.length) return [...new Set(details)].slice(0, 3).join(' · ');
  if (count > 0) return `${count}건 확인 필요 · 상세 메시지는 payload 미제공`;
  return '';
}

function formatSystemIssueValue(value) {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return value.flatMap(formatSystemIssueValue);
  if (typeof value === 'object') {
    const message = firstPresent(value, ['message', 'detail', 'error', 'summary', 'step', 'source', 'severity']);
    const source = firstPresent(value, ['source', 'function', 'fn', 'runId', 'run_id']);
    const severity = firstPresent(value, ['severity', 'level']);
    const parts = [severity, source, message].filter(Boolean).map((part) => String(part).trim());
    return parts.length ? [parts.join(' / ')] : Object.values(value).flatMap(formatSystemIssueValue);
  }
  return [String(value).trim()].filter(Boolean);
}

function renderTimeline() {
  const items = state.data.weatherTimeline || [];
  $('weatherTimeline').innerHTML = items.map((item) => {
    const level = normalizeStatus(item.risk || item.level || item.status || 'Gray');
    return `
      <div class="timeline-item">
        <div class="timeline-time">${escapeHtml(item.time || '-')}</div>
        <div class="timeline-label">${escapeHtml(item.label || '-')}</div>
        <span class="badge ${level}" title="${escapeAttr(statusHelpText(level))}">${escapeHtml(levelLabel(level))}</span>
      </div>
    `;
  }).join('') || '<div class="timeline-item"><div class="timeline-label">타임라인 데이터가 없습니다.</div></div>';
}

function renderSystem() {
  const system = state.data.system || {};
  const warnings = topBannerWarnings();
  const summaryAdvisory = summaryAdvisoryMessage(system);
  const lastSummaryAt = system.lastSummaryAt || system.last_summary_at || '-';
  const lastSummaryStatus = String(system.lastSummaryStatus || system.last_summary_status || '').trim().toLowerCase();
  const latestRecordIsSignalRefresh = lastSummaryStatus === 'signal_refresh';
  const summaryFreshnessLevel = system.summaryFreshnessLevel || system.summary_freshness_level;
  const summary = state.data.summary || {};
  const systemErrorCountValue = firstMetricValue(summary.systemError24h, summary.system_error_24h, system.systemError24h, system.system_error_24h);
  const systemWarnCountValue = firstMetricValue(summary.systemWarn24h, summary.system_warn_24h, system.systemWarn24h, system.system_warn_24h);
  const systemErrorCount = metricNumber(systemErrorCountValue);
  const systemWarnCount = metricNumber(systemWarnCountValue);
  const systemErrorDetail = systemIssueSummary('error', systemErrorCount);
  const systemWarningDetail = systemIssueSummary('warning', systemWarnCount);
  const sourceWarningOnly = Boolean(systemWarningDetail && /에어코리아|대기질|기상\/대기질|weather_lookup/i.test(systemWarningDetail));
  const items = [
    {
      label: latestRecordIsSignalRefresh ? '기상 신호 갱신' : '마지막 요약',
      value: lastSummaryAt,
      className: latestRecordIsSignalRefresh
        ? (weatherSignalIsStale() ? 'warning' : 'ok')
        : (summaryFreshnessLevel || summaryFreshnessStatusClass(system))
    },
    { label: '매출 동기화', value: system.lastRevenueSyncAt || system.last_revenue_sync_at || '-', className: systemFreshnessClass(system.lastRevenueSyncAt || system.last_revenue_sync_at, 30) },
    { label: '시트/Pack', value: formatPackVersionStatus(system), className: versionStatusClass(system) },
    { label: '데이터 상태', value: operationalDataStatus(system), className: operationalDataStatusClass() },
    { label: '판단 상태', value: decisionReadinessLabel(), className: decisionReadinessClass() },
    { label: '기상 신호', value: weatherSignalSummaryText(), className: !hasWeatherSignalData() ? 'info' : (weatherSignalIsStale() || weatherSignalHasRisk() ? 'warning' : 'ok') },
    { label: '시스템 오류', value: systemErrorCountValue === '-' ? '-' : `${systemErrorCount}건`, className: systemErrorCount > 0 ? 'danger' : (systemErrorCountValue === '-' ? 'info' : 'ok') },
    { label: sourceWarningOnly ? '원천 경고' : '시스템 경고', value: systemWarnCountValue === '-' ? '-' : `${systemWarnCount}건`, className: systemWarnCount > 0 ? 'warning' : (systemWarnCountValue === '-' ? 'info' : 'ok') }
  ];
  $('systemStatus').innerHTML = items.map((item) => `
    <div class="system-item ${escapeAttr(item.className)}">
      <span class="system-dot" aria-hidden="true"></span>
      <div class="system-label">${escapeHtml(item.label)}${renderInfoTip(systemItemHelpText(item.label), `${item.label} 기준`)}</div>
      <div class="system-value">${escapeHtml(formatMaybeDate(item.value))}</div>
    </div>
  `).join('') + (systemErrorDetail ? `
    <div class="system-item danger system-wide">
      <span class="system-dot" aria-hidden="true"></span>
      <div class="system-label">시스템 오류 상세${renderInfoTip(systemItemHelpText('시스템 오류 상세'), '시스템 오류 상세 기준')}</div>
      <div class="system-value">${escapeHtml(systemErrorDetail)}</div>
    </div>
  ` : '') + (warnings.length ? `
    <div class="system-item warning system-wide">
      <span class="system-dot" aria-hidden="true"></span>
      <div class="system-label">주의 신호${renderInfoTip('요약 실행, 시트 버전, 시스템 오류 중 사용자가 확인해야 할 신선도 경고입니다. 매출 동기화 지연은 매출 동기화 카드에서만 별도 확인합니다.', '주의 신호 기준')}</div>
      <div class="system-value">${warnings.map(escapeHtml).join(' · ')}</div>
    </div>
  ` : '') + (systemWarningDetail ? `
    <div class="system-item warning system-wide">
      <span class="system-dot" aria-hidden="true"></span>
      <div class="system-label">${sourceWarningOnly ? '원천 경고 상세' : '시스템 경고 상세'}${renderInfoTip(systemItemHelpText(sourceWarningOnly ? '원천 경고' : '시스템 경고 상세'), sourceWarningOnly ? '원천 경고 상세 기준' : '시스템 경고 상세 기준')}</div>
      <div class="system-value">${escapeHtml(systemWarningDetail)}</div>
    </div>
  ` : '') + (summaryAdvisory ? `
    <div class="system-item info system-wide">
      <span class="system-dot" aria-hidden="true"></span>
      <div class="system-label">요약 발송 이력${renderInfoTip('sendWeatherOpsSummary 실행 기록이 없거나 오래되었을 때의 참고 알림입니다. 기상 데이터와 dashboard payload가 있으면 대시보드 자체는 계속 작동합니다.', '요약 발송 이력 기준')}</div>
      <div class="system-value">${escapeHtml(summaryAdvisory)}</div>
    </div>
  ` : '');
}

function renderSystemTrend() {
  const container = $('systemTrend');
  if (!container) return;
  const rows = trendRows();
  if (!rows.length) {
    container.innerHTML = '<div class="empty-state compact">최근 추이 데이터가 없습니다.</div>';
    return;
  }
  const max = Math.max(...rows.flatMap((row) => [row.actions, row.errors, row.unresolved]), 1);
  container.innerHTML = `
    <div class="trend-title">최근 7일 운영 신호 전체 기록</div>
    ${rows.map((row) => `
      <div class="trend-row">
        <div class="trend-date">${escapeHtml(shortDate(row.date))}</div>
        <div class="trend-bars">
          <span class="trend-bar actions" style="width:${trendWidth(row.actions, max)}%" title="오픈 액션 ${row.actions}건"></span>
          <span class="trend-bar errors" style="width:${trendWidth(row.errors, max)}%" title="오류·경고 포함 전체 기록 ${row.errors}건"></span>
          <span class="trend-bar unresolved" style="width:${trendWidth(row.unresolved, max)}%" title="미해결 ${row.unresolved}건"></span>
        </div>
        <div class="trend-count">${row.actions}/${row.errors}/${row.unresolved}</div>
      </div>
    `).join('')}
    <div class="trend-legend">
      <span><i class="actions"></i>오픈 액션</span>
      <span><i class="errors"></i>오류·경고 전체</span>
      <span><i class="unresolved"></i>미해결</span>
    </div>
  `;
}

function formatPackVersionStatus(system) {
  const current = system.sheetVersion || system.sheet_version || system.packVersion || system.pack_version || state.data.version || system.appsScriptVersion || system.apps_script_version || '-';
  const expected = system.expectedPackVersion || system.expected_pack_version || EXPECTED_PACK_VERSION;
  if (expected && current && current !== '-' && current !== expected) return `${current} / 기대 ${expected}`;
  return current;
}

function versionStatusClass(system) {
  const current = system.sheetVersion || system.sheet_version || system.packVersion || system.pack_version || state.data.version || system.appsScriptVersion || system.apps_script_version || '';
  const expected = system.expectedPackVersion || system.expected_pack_version || EXPECTED_PACK_VERSION;
  return expected && current && current !== expected ? 'warning' : 'ok';
}

function renderWeatherMetricChips(store, limit = 3) {
  const chips = weatherMetricRows(store).slice(0, limit);
  return chips.map((chip) => {
    const level = normalizeStatus(chip.level || 'Gray');
    const text = `${chip.label} ${chip.value}`;
    return `<span class="weather-chip level-${escapeAttr(level)}" title="${escapeAttr(`${text} · ${levelLabel(level)} · ${WEATHER_THRESHOLD_HELP}`)}">${escapeHtml(text)}</span>`;
  }).join('');
}

function weatherMetricRowsEquivalent(store) {
  const operational = weatherMetricRows(store);
  const signal = signalWeatherMetricRows(store);
  if (!operational.length || !signal.length) return false;
  return weatherMetricRowsSignature(operational) === weatherMetricRowsSignature(signal);
}

function weatherMetricRowsSignature(rows) {
  return rows
    .map((row) => `${row.key}:${row.value}:${normalizeStatus(row.level || 'Gray')}`)
    .sort()
    .join('|');
}

function renderSignalWeatherMetricChips(store, limit = 3) {
  const chips = signalWeatherMetricRows(store).slice(0, limit);
  return chips.map((chip) => {
    const level = normalizeStatus(chip.level || store.signalStatus || 'Gray');
    const text = `${chip.label} ${chip.value}`;
    return `<span class="weather-chip signal level-${escapeAttr(level)}" title="${escapeAttr(`${text} · 기상 신호 ${levelLabel(level)} · ${WEATHER_THRESHOLD_HELP}`)}">${escapeHtml(text)}</span>`;
  }).join('');
}

function weatherMetricRows(store) {
  const data = store.weatherData || {};
  const peakTime = formatPeakTime(firstPresent(data, ['forecastPeakTime', 'forecast_peak_time', 'peakTime', 'peak_time', 'weatherPeakTime', 'weather_peak_time']));
  const fallbackSources = [
    normalizeBoolean(firstPresent(data, ['forecastCacheFallback', 'forecast_cache_fallback', 'weatherCacheFallback', 'weather_cache_fallback'])) ? '예보' : '',
    normalizeBoolean(firstPresent(data, ['observationCacheFallback', 'observation_cache_fallback'])) ? '실황' : '',
    normalizeBoolean(firstPresent(data, ['airCacheFallback', 'air_cache_fallback'])) ? '대기질' : ''
  ].filter(Boolean);
  const rows = [
    { key: 'sourceFallback', label: '원천', value: fallbackSources.length ? `${fallbackSources.join('·')} 캐시 대체` : '', unit: '', level: 'Yellow' },
    { key: 'observedRain1h', label: '현재 강수', value: firstPresent(data, ['observedRain1h', 'observed_rain_1h', 'currentRain1h', 'current_rain_1h', 'rn1', 'RN1']), unit: 'mm/h' },
    { key: 'observedTemperature', label: '현재기온', value: firstPresent(data, ['observedTemperature', 'observed_temperature', 'currentTemperature', 'current_temperature', 't1h', 'T1H']), unit: '℃' },
    { key: 'observedWind', label: '현재풍속', value: firstPresent(data, ['observedWind', 'observed_wind', 'currentWind', 'current_wind']), unit: 'm/s' },
    { key: 'pop', label: '예보 강수확률', value: firstPresent(data, ['forecastMaxPop', 'forecast_max_pop', 'pop', 'POP', 'weather_pop', 'rainProbability', 'rain_probability', 'precipitationProbability', 'precipitation_probability']), unit: '%' },
    { key: 'pcp', label: '예보 최대강수', value: firstPresent(data, ['forecastMaxPcp1h', 'forecast_max_pcp_1h', 'forecastMaxPcp', 'forecast_max_pcp', 'pcp', 'PCP', 'weather_pcp', 'rainfall', 'rainfallMm', 'rainfall_mm', 'precipitation', 'precipitationMm', 'precipitation_mm']), unit: 'mm/h' },
    { key: 'peakTime', label: '예보 피크', value: peakTime, unit: '' },
    { key: 'windSpeed', label: '예보 최대풍속', value: firstPresent(data, ['forecastMaxWind', 'forecast_max_wind', 'wsd', 'WSD', 'weather_wsd', 'windSpeed', 'wind_speed']), unit: 'm/s' },
    { key: 'tmpMax', label: '예보 최고기온', value: firstPresent(data, ['forecastMaxTemperature', 'forecast_max_temperature', 'tmpMax', 'tmp_max', 'weather_tmp_max', 'tmx', 'TMX', 'TMP_MAX']), unit: '℃' },
    { key: 'tmpMin', label: '예보 최저기온', value: firstPresent(data, ['forecastMinTemperature', 'forecast_min_temperature', 'tmpMin', 'tmp_min', 'weather_tmp_min', 'tmn', 'TMN', 'TMP_MIN']), unit: '℃' },
    { key: 'snowfallCm', label: '예보 적설', value: firstPresent(data, ['sno', 'SNO', 'weather_sno', 'snow', 'snowfall', 'snowfallCm', 'snowfall_cm']), unit: 'cm' },
    { key: 'pm10', label: 'PM10', value: firstPresent(data, ['pm10', 'PM10', 'weather_pm10', 'air_pm10']), unit: ' ㎍/㎥' },
    { key: 'pm25', label: 'PM2.5', value: firstPresent(data, ['pm25', 'pm2_5', 'PM25', 'PM2_5', 'weather_pm25', 'air_pm25']), unit: ' ㎍/㎥' },
    { key: 'observedAt', label: '실황 기준', value: formatMaybeDate(firstPresent(data, ['observedAt', 'observed_at', 'observationAt', 'observation_at'])), unit: '' },
    { key: 'weatherBaseAt', label: '예보 기준', value: formatMaybeDate(firstPresent(data, ['forecastBaseAt', 'forecast_base_at', 'weatherBaseAt', 'weather_base_at', 'baseAt', 'base_at'])), unit: '' },
    { key: 'airObservedAt', label: '대기질 기준', value: formatMaybeDate(firstPresent(data, ['airObservedAt', 'air_observed_at', 'airQualityObservedAt', 'air_quality_observed_at'])), unit: '' }
  ];
  return rows
    .map((row, index) => ({
      key: row.key,
      label: row.label,
      value: formatMetricValue(row.value, row.unit),
      level: row.level || weatherMetricLevel(data, row.key),
      order: index
    }))
    .filter((row) => row.value !== null && row.value !== undefined && row.value !== '' && row.value !== '-')
    .sort((a, b) => weatherMetricPriority(store, a.key) - weatherMetricPriority(store, b.key)
      || (STATUS_ORDER[normalizeStatus(b.level)] || 0) - (STATUS_ORDER[normalizeStatus(a.level)] || 0)
      || a.order - b.order);
}

function signalWeatherMetricRows(store) {
  const data = store.weatherValues || {};
  if (!Object.keys(data).length) return [];
  return weatherMetricRows(Object.assign({}, store, {
    weatherData: data,
    weather: store.signalRiskType || store.weather,
    weatherDetail: store.signalReason || store.weatherDetail,
    trigger: store.signalRiskType || store.trigger
  }));
}

function weatherMetricLevel(data, key) {
  const levels = data.levels || data.metricLevels || data.metric_levels || {};
  if (key === 'sourceFallback') return 'Yellow';
  if (key === 'peakTime') return highestWeatherMetricLevel(levels) || 'Gray';
  const camelLevelKey = `${key}Level`;
  const snakeLevelKey = `${key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}_level`;
  return firstPresent(levels, [key, camelLevelKey, snakeLevelKey])
    || firstPresent(data, [camelLevelKey, snakeLevelKey])
    || 'Gray';
}

function combinedWeatherMetricRows(store) {
  const operational = store.weatherData || {};
  const signal = store.weatherValues || {};
  const levels = Object.assign({}, operational.levels || {}, signal.levels || {});
  const merged = Object.assign({}, operational, signal, { levels });
  return weatherMetricRows(Object.assign({}, store, {
    weatherData: merged,
    weather: store.signalRiskType || store.weather,
    weatherDetail: store.signalReason || store.weatherDetail,
    trigger: store.signalRiskType || store.trigger
  }));
}

function renderCombinedWeatherMetricChips(store, limit = 4) {
  return combinedWeatherMetricRows(store).slice(0, limit).map((chip) => {
    const level = normalizeStatus(chip.level || store.signalStatus || 'Gray');
    const text = `${chip.label} ${chip.value}`;
    return `<span class="weather-chip level-${escapeAttr(level)}" title="${escapeAttr(`${text} · ${levelLabel(level)} · ${WEATHER_THRESHOLD_HELP}`)}">${escapeHtml(text)}</span>`;
  }).join('');
}

function highestWeatherMetricLevel(levels) {
  return Object.values(levels || {}).reduce((top, value) => {
    const level = normalizeStatus(value);
    return (STATUS_ORDER[level] || 0) > (STATUS_ORDER[top] || 0) ? level : top;
  }, 'Gray');
}

function weatherMetricPriority(store, key) {
  const text = `${store.trigger || ''} ${store.weather || ''} ${store.weatherDetail || ''}`.toLowerCase();
  const priority = [];
  priority.push('sourceFallback');
  if (text.includes('강수') || text.includes('비') || text.includes('rain')) priority.push('observedRain1h', 'pop', 'pcp', 'peakTime');
  if (text.includes('강풍') || text.includes('풍속') || text.includes('wind')) priority.push('observedWind', 'windSpeed', 'peakTime');
  if (text.includes('폭염') || text.includes('더위') || text.includes('heat')) priority.push('observedTemperature', 'tmpMax', 'peakTime');
  if (text.includes('한파') || text.includes('동파') || text.includes('cold')) priority.push('tmpMin', 'peakTime');
  if (text.includes('대설') || text.includes('적설') || text.includes('눈') || text.includes('snow')) priority.push('snowfallCm', 'peakTime');
  if (text.includes('먼지') || text.includes('황사') || text.includes('dust')) priority.push('pm10', 'pm25', 'peakTime');
  const index = priority.indexOf(key);
  return index >= 0 ? index : 100;
}

function weatherMetricText(store) {
  const rows = weatherMetricRows(store);
  return rows.length ? rows.map((row) => `${row.label} ${row.value}`).join(' · ') : '-';
}

function signalWeatherMetricText(store) {
  const rows = signalWeatherMetricRows(store);
  return rows.length ? rows.map((row) => `${row.label} ${row.value}`).join(' · ') : '-';
}

function firstPresent(source, keys) {
  for (const key of keys) {
    if (source && source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key];
  }
  return null;
}

function firstMetricValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return '-';
}

function metricFrom(source, keys) {
  const value = firstPresent(source, keys);
  return value === null ? '-' : value;
}

function metricNumber(value, fallback = 0) {
  const number = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(number) ? number : fallback;
}

function objectFrom(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function arrayFrom(value) {
  return Array.isArray(value) ? value : [];
}

function numberFrom(value, fallback) {
  const number = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(number) ? number : fallback;
}

function systemFreshnessClass(value, thresholdHours) {
  const age = hoursSince(value);
  if (age === null) return 'warning';
  if (age > thresholdHours) return 'danger';
  if (age > thresholdHours * 0.7) return 'warning';
  return 'ok';
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

function levelLabel(status) {
  return STATUS_LABELS[normalizeStatus(status)] || STATUS_LABELS.Green;
}

function riskMatrixRows() {
  const provided = state.data.visuals && state.data.visuals.riskMatrix;
  const rows = applySignalToRiskRows(Array.isArray(provided) && provided.length ? provided : deriveRiskMatrixRows());
  const visibleStoreIds = new Set(filteredStores().map((store) => store.id));
  return rows.filter((row) => visibleStoreIds.has(row.storeId || findStoreId(row.store)));
}

function applySignalToRiskRows(rows) {
  return arrayFrom(rows).map((row) => {
    const storeId = row.storeId || row.store_id || findStoreId(row.store);
    const store = state.data.stores.find((item) => item.id === storeId || findStoreId(item.name) === storeId);
    if (!store) return row;
    const cells = arrayFrom(row.cells).map((cell) => {
      const signalLevel = signalLevelForRiskColumn(store, cell);
      const mergedLevel = displayStatusFrom(cell.level || 'Green', signalLevel);
      return Object.assign({}, cell, { level: mergedLevel });
    });
    if (!cells.some((cell) => String(cell.key || '').toLowerCase() === 'signal')) {
      cells.unshift({
        key: 'signal',
        label: '기상신호',
        level: store.signalStatus || 'Gray'
      });
    }
    return Object.assign({}, row, { storeId, cells });
  });
}

function signalLevelForRiskColumn(store, cell) {
  const signalStatus = normalizeStatus(store.signalStatus);
  if (!['Error', 'Red', 'Orange', 'Yellow'].includes(signalStatus)) return 'Green';
  const key = String(cell.key || '').toLowerCase();
  const label = String(cell.label || '').toLowerCase();
  const text = `${store.signalRiskType || ''} ${store.signalReason || ''}`.toLowerCase();
  const matchers = {
    rain: ['강수', '비', '우천', 'rain', 'pcp', 'pop'],
    wind: ['강풍', '풍속', '바람', 'wind', 'wsd'],
    cold: ['한파', '동파', '저온', 'cold', 'tmpmin'],
    snow: ['대설', '적설', '눈', 'snow', 'sno'],
    dust: ['미세먼지', '황사', '대기질', 'pm10', 'pm2'],
    heat: ['폭염', '고온', '더위', 'heat', 'tmpmax'],
    signal: ['']
  };
  const words = matchers[key] || matchers[label] || [label];
  return words.some((word) => !word || text.includes(String(word).toLowerCase())) ? signalStatus : 'Green';
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

function isOperationalRiskColumn(column) {
  const key = String(column.key || column.label || '').toLowerCase();
  return key === 'as' || key === 'recovery' || key === '회복';
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
        level: displayStatusFrom(words.some((word) => text.includes(String(word).toLowerCase())) ? store.prodStatus : 'Green', signalLevelForRiskColumn(store, { key, label }))
      })).concat([
        { key: 'signal', label: '기상신호', level: store.signalStatus || 'Gray' },
        { key: 'as', label: 'AS', level: queueStatusClass(store.asStatus) === 'Red' ? 'Red' : 'Green' },
        { key: 'recovery', label: '회복', level: recoveryCellLevel(store.recoveryStatus) }
      ])
    };
  });
}

function recoveryFunnelRows() {
  const provided = state.data.visuals && state.data.visuals.recoveryFunnel;
  if (Array.isArray(provided) && provided.length) return ensureAsBlockedFunnelRow(provided);
  const queue = (state.data.recovery && state.data.recovery.queue) || [];
  const crmReadyCount = state.data.stores.filter((store) => store.crmReady).length;
  return ensureAsBlockedFunnelRow([
    { key: 'detected', label: '하락 감지', count: queue.length },
    { key: 'action', label: '조치 필요', count: queue.filter((item) => !String(item.status || '').includes('완료')).length },
    { key: 'normalized', label: '정상화 통과', count: queue.filter((item) => !String(item.status || '').includes('차단')).length },
    { key: 'crmQueued', label: 'CRM 후보', count: crmReadyCount },
    { key: 'crmSent', label: '발송/실행', count: queue.filter((item) => String(item.next || '').includes('발송')).length },
    { key: 'revisited', label: '재방문 회수', count: 0 }
  ]);
}

function ensureAsBlockedFunnelRow(rows) {
  const summary = state.data.summary || {};
  const asBlockedCount = Number(summary.asBlockedCount ?? summary.as_blocked_count ?? 0);
  if (!asBlockedCount || rows.some(isAsBlockedFunnelRow)) return rows;
  const nextRows = rows.slice();
  const normalizedIndex = nextRows.findIndex((row) => {
    const key = String(row.key || row.id || row.code || '').toLowerCase().replace(/[_\s-]/g, '');
    return key === 'normalized' || String(row.label || '').includes('정상화');
  });
  nextRows.splice(normalizedIndex >= 0 ? normalizedIndex : Math.min(2, nextRows.length), 0, {
    key: 'asBlocked',
    label: 'AS 차단',
    count: asBlockedCount
  });
  return nextRows;
}

function isAsBlockedFunnelRow(row) {
  const key = String(row.key || row.id || row.code || '').toLowerCase().replace(/[_\s-]/g, '');
  const label = String(row.label || row.name || '').toLowerCase();
  return key === 'asblocked' || key === 'as' || label.includes('as 차단') || label.includes('as차단');
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

function processedBulletRows() {
  const visuals = state.data.visuals || {};
  const recovery = state.data.recovery || {};
  const provided = visuals.processedBulletByStore || visuals.processed_bullet_by_store || recovery.bulletByStore || recovery.bullet_by_store;
  const visibleStoreIds = new Set(filteredStores().map((store) => store.id));
  return arrayFrom(provided)
    .map((row) => ({ ...row, storeId: row.storeId || row.store_id || findStoreId(row.store || row.storeName || row.store_name) }))
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
  const selectedKey = Object.keys(series).find((key) => key === storeId || findStoreId(key) === storeId || slug(key) === storeId);
  const selected = series[storeId] || series[selectedKey] || {};
  return {
    processedRate: selected.processedRate || selected.processed_rate || (allowGlobalFallback ? recovery.processedRate || recovery.processed_rate : []) || [],
    revenueRate: selected.revenueRate || selected.revenue_rate || (allowGlobalFallback ? recovery.revenueRate || recovery.revenue_rate : []) || []
  };
}

function numericOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
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
  if (Math.abs(number) < 3) return '처리대수·매출 균형';
  if (number > 0) return '처리대수 회복, 매출 지연';
  return '매출 우위, 단가·결제 믹스 확인';
}

function recoveryCellLevel(value) {
  const text = String(value || '');
  if (text.includes('차단') || text.includes('필요')) return 'Orange';
  if (text.includes('대기') || text.includes('관찰') || text.includes('준비')) return 'Yellow';
  return 'Green';
}

function openStoreDialog(storeId, trigger = null) {
  const store = state.data.stores.find((item) => item.id === storeId);
  if (!store) return;
  $('dialogTitle').textContent = store.name;
  const operatingRows = [
    ['화면 상태', levelLabel(store.status)],
    ['운영 상태', levelLabel(store.prodStatus)],
    ['기상 신호', `${levelLabel(store.signalStatus)} · ${store.signalActionLevel} · ${store.signalMode || '-'}`],
    ['신호 근거', signalWeatherText(store)],
    ['기상 원천 상태', signalSourceNotice(store) ? `${signalSourceNotice(store)} · ${signalSourceDetail(store)}` : '정상'],
    ['운영 기상/트리거', `${store.weather} · ${store.weatherDetail || store.trigger}`],
    ['운영 기상 수치', weatherMetricText(store)],
    ['신호 기상 수치', signalWeatherMetricText(store)]
  ];
  const responseRows = [
    ['DRI', store.dri],
    ['AS 상태', store.asStatus],
    ['AS 차단/ETA', [store.normalizationBlocker, store.vendorStatus, store.vendorEta].filter(Boolean).join(' · ') || '-'],
    ['CS/고객 안내', customerStatusText(store)],
    ['고객 영향', customerImpactText(store) || '-'],
    ['회복 상태', store.recoveryStatus],
    ['CRM 가능 여부', store.crmReady ? '가능' : '대기'],
    ['다음 액션', storeNextActionText(store)]
  ];
  const enhancedRows = enhancedStoreDetailRows(store).map((row) => [row.label, row.value]);
  const vulnerabilityRows = siteVulnerabilityDetailRows(store).map((row) => [row.label, row.value]);
  $('dialogBody').innerHTML = [
    renderStoreDetailSection('운영·기상 판단', operatingRows),
    renderStoreDetailSection('신규 원천 검증', enhancedRows, 'shadow 검증 정보이며 공식 운영등급과 액션을 자동 변경하지 않습니다.'),
    vulnerabilityRows.length
      ? renderStoreDetailSection('현장 취약정보', vulnerabilityRows, '기상 신호가 관련될 때 현장 조치 맥락으로 사용하며 운영등급을 높이지 않습니다.')
      : '',
    renderStoreDetailSection('대응·회복', responseRows)
  ].filter(Boolean).join('');
  state.dialogTrigger = trigger;
  if (state.dialogTrigger) state.dialogTrigger.setAttribute('aria-expanded', 'true');
  $('storeDialog').showModal();
  $('dialogClose').focus();
}

function renderStoreDetailSection(title, rows, note = '') {
  return `
    <section class="detail-section" aria-labelledby="detail-${escapeAttr(slug(title))}">
      <div class="detail-section-head">
        <h3 id="detail-${escapeAttr(slug(title))}">${escapeHtml(title)}</h3>
        ${note ? `<p>${escapeHtml(note)}</p>` : ''}
      </div>
      <dl class="detail-list">
        ${rows.map(([label, value]) => `
          <div class="detail-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>
        `).join('')}
      </dl>
    </section>
  `;
}

async function copyBrief() {
  if (!state.data) return;
  const summary = state.data.summary || {};
  const topStores = state.data.stores
    .filter((store) => ['Error', 'Red', 'Orange'].includes(store.status))
    .slice(0, 5)
    .map((store) => `- ${store.name}: 운영 ${levelLabel(store.prodStatus)}, 신호 ${levelLabel(store.signalStatus)}(${store.signalMode || '-'}) / ${store.signalReason || storeNextActionText(store)}`)
    .join('\n') || '- 즉시 조치 지점 없음';
  const text = [
    `[OPS] Weather Ops Dashboard | ${formatDateTime(state.data.generatedAt)}`,
    `공식 상태: 운영 ${levelLabel(prodOverallStatus())} / 기상 신호 ${levelLabel(signalOverallStatus())}(${weatherSignalMode() || '-'}) / ${decisionReadinessLabel()}`,
    `신규 원천 검증: ${enhancedSignals().length ? enhancedStoreLine(state.data.stores[0]) : '확인 불가 · enhancedSignal 미제공'} / 운영 영향: ${enhancedOperationalImpactText(enhancedSignals())}`,
    `운영 즉시: ${summary.immediateCount ?? summary.immediate_count ?? 0} / 회복 조치·관찰 후보: ${summary.recoveryActionCount ?? summary.recovery_action_count ?? 0} / CRM 후보: ${summary.crmReadyCount ?? summary.crm_ready_count ?? 0} / 성과 해석 대기: ${summary.dataWaitCount ?? summary.data_wait_count ?? 0}`,
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

function topStatus(stores, fallback = 'Green') {
  const list = Array.isArray(stores) ? stores : [];
  return list.reduce((top, store) => {
    const status = normalizeStatus(store && store.status);
    return STATUS_ORDER[status] > STATUS_ORDER[top] ? status : top;
  }, normalizeStatus(fallback));
}

function findStoreId(storeName) {
  const target = normalizeStoreName(storeName);
  const raw = String(storeName || '').trim();
  const found = state.data.stores.find((store) => store.id === raw || slug(store.id) === slug(raw))
    || state.data.stores.find((store) => normalizeStoreName(store.name) === target);
  return found ? found.id : slug(storeName);
}

function matchesSelectedStore(item) {
  if (state.store === 'all') return true;
  const candidates = [
    item && item.storeId,
    item && item.store_id,
    item && item.id,
    item && item.store,
    item && item.storeName,
    item && item.store_name,
    item && item['지점명'],
    item && item['지점'],
  ].filter((value) => value !== null && value !== undefined && value !== '');
  return candidates.some((value) => findStoreId(value) === state.store || slug(value) === state.store);
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
  const selectedKey = Object.keys(series).find((key) => key === state.store || findStoreId(key) === state.store || slug(key) === state.store);
  return series[state.store] || series[selectedKey] || {};
}

function trendRows() {
  const visuals = state.data.visuals || {};
  const systemTrend = arrayFrom(visuals.systemTrend || visuals.system_trend);
  const actionTrend = arrayFrom(visuals.openActionTrend || visuals.open_action_trend);
  const byDate = new Map();
  systemTrend.forEach((row) => {
    const date = String(row.date || row.day || '').trim();
    if (!date) return;
    byDate.set(date, Object.assign(byDate.get(date) || { date, actions: 0, errors: 0, unresolved: 0 }, {
      errors: numberFrom(row.errors, 0),
      unresolved: numberFrom(row.unresolved, 0)
    }));
  });
  actionTrend.forEach((row) => {
    const date = String(row.date || row.day || '').trim();
    if (!date) return;
    byDate.set(date, Object.assign(byDate.get(date) || { date, actions: 0, errors: 0, unresolved: 0 }, {
      actions: numberFrom(firstPresent(row, ['actions', 'openActions', 'open_actions']), 0)
    }));
  });
  return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(-7);
}

function trendWidth(value, max) {
  if (!value) return 0;
  return Math.max(8, Math.round(Number(value) / max * 100));
}

function shortDate(value) {
  const date = new Date(value);
  if (Number.isFinite(date.getTime())) {
    return new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit' }).format(date);
  }
  return String(value || '-');
}

function queueStatusClass(status) {
  const text = String(status || '').toLowerCase();
  if (text.includes('차단') || text.includes('red') || text.includes('중단') || text.includes('불가')) return 'Red';
  if (text.includes('완료') || text.includes('정상') || text.includes('green')) return 'Green';
  if (text.includes('대기') || text.includes('미확정') || text.includes('데이터')) return 'Gray';
  if (text.includes('주의') || text.includes('관찰') || text.includes('yellow')) return 'Yellow';
  return 'Orange';
}

function formatCrmAllowed(value) {
  if (value === null || value === undefined || value === '') return { label: '-', className: 'is-wait' };
  const text = String(value).trim();
  const normalized = text.toLowerCase();
  if (['y', 'yes', 'true', '1', 'ok'].includes(normalized)
    || ['가능', '허용', 'ready'].some((word) => normalized.includes(word))) {
    return { label: '가능', className: 'is-ok' };
  }
  if (['n', 'no', 'false', '0'].includes(normalized)
    || ['불가', '차단', 'blocked'].some((word) => normalized.includes(word))) {
    return { label: '불가', className: 'is-blocked' };
  }
  if (['대기', '미정', '보류', 'wait', 'pending'].some((word) => normalized.includes(word))) {
    return { label: '대기', className: 'is-wait' };
  }
  return { label: text, className: 'is-wait' };
}

function formatMetricValue(value, unit = '') {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || text === '-') return text;
  if (!unit) return text;
  return text.endsWith(unit.trim()) ? text : `${text}${unit}`;
}

function formatPeakTime(value) {
  return formatClockValue(value, { unknownLabel: '미정', allowHourOnly: true });
}

function formatClockValue(value, options = {}) {
  const unknownLabel = options.unknownLabel || null;
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value >= 0 && value < 1) {
      const totalMinutes = Math.round(value * 24 * 60);
      return clockFromParts(Math.floor(totalMinutes / 60) % 24, totalMinutes % 60, unknownLabel);
    }
    return formatClockValue(String(value), options);
  }

  if (value instanceof Date && Number.isFinite(value.getTime())) {
    if (isSentinelDate(value)) return unknownLabel;
    return formatKstTimeOnly(value);
  }

  const text = String(value).trim();
  if (!text || text === '-') return null;

  const colonTime = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\b/);
  if (colonTime) return clockFromParts(colonTime[1], colonTime[2], unknownLabel);

  const koreanHour = text.match(/\b([01]?\d|2[0-3])\s*시(?:\s*([0-5]?\d)\s*분?)?/);
  if (koreanHour) return clockFromParts(koreanHour[1], koreanHour[2] || 0, unknownLabel);

  const compactTime = text.match(/^([01]?\d|2[0-3])([0-5]\d)$/);
  if (compactTime) return clockFromParts(compactTime[1], compactTime[2], unknownLabel);

  if (options.allowHourOnly) {
    const hourOnly = text.match(/^([01]?\d|2[0-3])$/);
    if (hourOnly) return clockFromParts(hourOnly[1], 0, unknownLabel);
  }

  const date = new Date(text);
  if (Number.isFinite(date.getTime()) && isDateLikeText(text) && hasTimeSignal(text) && !isSentinelDate(date)) {
    return formatKstTimeOnly(date);
  }

  return text;
}

function clockFromParts(hour, minute, unknownLabel = null) {
  const h = Number(hour);
  const m = Number(minute);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  if (h === 0 && m === 0) return unknownLabel;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatPercent(value) {
  if (value === null || value === undefined || value === '') return '-';
  const text = String(value).trim();
  return text.endsWith('%') ? escapeHtml(text) : `${escapeHtml(text)}%`;
}

function formatCount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('ko-KR') : '-';
}

function lastNumber(values) {
  const list = Array.isArray(values) ? values : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const value = Number(list[i]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function freshnessWarnings(options = {}) {
  const includeSummaryAdvisory = Boolean(options.includeSummaryAdvisory);
  const includeOperationalAdvisory = options.includeOperationalAdvisory !== false;
  const system = state.data && state.data.system ? state.data.system : {};
  const summary = state.data && state.data.summary ? state.data.summary : {};
  const provided = system.freshnessWarnings || system.freshness_warnings || [];
  const warnings = Array.isArray(provided)
    ? provided.filter((warning) => {
      const text = String(warning || '');
      if (text.includes('마지막 요약 알림이 4시간 이상')) return false;
      if (!includeSummaryAdvisory && isSummaryAdvisoryWarning(text)) return false;
      if (!includeOperationalAdvisory && isOperationalAdvisoryWarning(text)) return false;
      return true;
    })
    : [];
  const summaryWarning = summaryFreshnessWarning(system);
  const generatedAge = hoursSince(state.data && state.data.generatedAt);
  const systemErrorCount = Number(summary.systemError24h ?? summary.system_error_24h ?? system.systemError24h ?? system.system_error_24h ?? 0);
  const dataWaitCount = Number(summary.dataWaitCount ?? summary.data_wait_count ?? 0);
  if (summaryWarning && (includeSummaryAdvisory || !isSummaryAdvisoryWarning(summaryWarning))) warnings.push(summaryWarning);
  if ((!state.data || !state.data.generatedAt) && !warnings.some((warning) => String(warning || '').includes('생성 시각'))) {
    warnings.push('대시보드 데이터 생성 시각 없음');
  }
  const expectedVersion = system.expectedPackVersion || system.expected_pack_version || EXPECTED_PACK_VERSION;
  const currentVersion = system.sheetVersion || system.sheet_version || system.packVersion || system.pack_version || state.data.version || system.appsScriptVersion || system.apps_script_version || '';
  if (expectedVersion && currentVersion && currentVersion !== expectedVersion
    && !warnings.some((warning) => String(warning || '').includes('Web App 배포본'))) {
    warnings.push(versionMismatchWarning(currentVersion, expectedVersion));
  }
  if (generatedAge !== null && generatedAge > 4) warnings.push('대시보드 데이터 생성 4시간 초과');
  const signalWarning = weatherSignalFreshnessWarning();
  if (signalWarning) warnings.push(signalWarning);
  const siteContractWarning = siteVulnerabilityContractWarning();
  if (siteContractWarning) warnings.push(siteContractWarning);
  if (includeOperationalAdvisory && systemErrorCount > 0 && !warnings.some((warning) => String(warning || '').includes('시스템 오류'))) {
    warnings.push(`시스템 오류 ${systemErrorCount}건`);
  }
  if (includeOperationalAdvisory && dataWaitCount > 0) warnings.push(`성과 확정 대기 ${dataWaitCount}건`);
  return [...new Set(warnings)];
}

function topBannerWarnings() {
  return freshnessWarnings({ includeOperationalAdvisory: false });
}

function siteVulnerabilityContractWarning() {
  const stores = state.data && Array.isArray(state.data.stores) ? state.data.stores : [];
  if (!stores.length) return '';
  const provided = stores.filter((store) => store.siteVulnerability && store.siteVulnerability.provided).length;
  return provided === stores.length ? '' : `현장 취약정보 계약 ${provided}/${stores.length}개점 수신`;
}

function isOperationalAdvisoryWarning(warning) {
  const text = String(warning || '');
  return text.includes('시스템 오류')
    || text.includes('시스템 경고')
    || text.includes('성과 확정 대기')
    || text.includes('회복 성과 확정 대기')
    || text.includes('매출 원천 동기화')
    || text.includes('매출 동기화');
}

function isSummaryAdvisoryWarning(warning) {
  const text = String(warning || '');
  return text.includes('종합 요약 실행 기록')
    || (text.includes('예정된 종합 요약') && text.includes('기록되지 않았습니다'));
}

function summaryAdvisoryMessage(system) {
  const warning = summaryFreshnessWarning(system);
  if (!warning) return '';
  if (String(warning).includes('종합 요약 실행 기록')) {
    return '종합 요약 발송 이력 없음. 기상·지점 데이터 수신과는 별도입니다.';
  }
  return `${warning} 데이터 수신과는 별도입니다.`;
}

function summaryFreshnessStatusClass(system) {
  const warning = summaryFreshnessWarning(system || {});
  if (!warning) return 'ok';
  return warning.includes('예정된 종합 요약') ? 'danger' : 'warning';
}

function operationalDataStatus(system) {
  if (state.data && state.data.source && state.data.source.startsWith('sample')) return '샘플 데이터';
  if (hasLiveOperationalData()) {
    const dataViewMode = system.dataViewMode || system.data_view_mode || 'prod';
    const currentMode = system.currentDataMode || system.current_data_mode || weatherSignalMode() || '없음';
    return `실데이터 연결 · 운영 ${dataViewMode} · 신호 ${currentMode}`;
  }
  return system.dataFreshness || system.data_freshness || (state.data && state.data.source) || '-';
}

function operationalDataStatusClass() {
  if (!state.data || (state.data.source && state.data.source.startsWith('sample'))) return 'warning';
  return hasLiveOperationalData() && hasWeatherSignalData() ? 'ok' : 'warning';
}

function hasLiveOperationalData() {
  if (!state.data || state.data.source !== 'apps_script') return false;
  return Boolean(state.data.generatedAt) && Array.isArray(state.data.stores) && state.data.stores.length > 0;
}

function versionMismatchWarning(currentVersion, expectedVersion) {
  return `연결된 Apps Script Web App 배포본이 오래되었습니다. 현재 ${currentVersion}, 기대 ${expectedVersion}. 시트 탭 수정 대상이 아니며 Apps Script Web App 재배포 또는 Vercel WEATHER_OPS_API_URL 확인이 필요합니다.`;
}

function summaryFreshnessWarning(system) {
  if (system.summaryFreshnessLevel || system.summary_freshness_level) return '';
  const lastSummaryAt = system.lastSummaryAt || system.last_summary_at;
  const lastSummaryMs = Date.parse(lastSummaryAt || '');
  if (!Number.isFinite(lastSummaryMs)) return '종합 요약 실행 기록이 없습니다. sendWeatherOpsSummary 실행 여부를 확인하세요.';
  const latestDue = latestDueSummaryDate(new Date());
  if (latestDue && lastSummaryMs + 60000 < latestDue.getTime()) {
    return `예정된 종합 요약(${formatKstTimeOnly(latestDue)})이 ${SUMMARY_GRACE_MINUTES}분 유예시간 내 기록되지 않았습니다.`;
  }
  return '';
}

function latestDueSummaryDate(now) {
  return summaryScheduleCandidates(now, -1, 0)
    .filter((date) => date.getTime() + SUMMARY_GRACE_MINUTES * 60000 <= now.getTime())
    .sort((a, b) => b.getTime() - a.getTime())[0] || null;
}

function summaryScheduleCandidates(now, startOffset, endOffset) {
  const candidates = [];
  for (let offset = startOffset; offset <= endOffset; offset += 1) {
    const dateKey = kstDateKey(new Date(now.getTime() + offset * 86400000));
    SUMMARY_SCHEDULES.forEach((schedule) => {
      candidates.push(new Date(`${dateKey}T${String(schedule.hour).padStart(2, '0')}:${String(schedule.minute).padStart(2, '0')}:00+09:00`));
    });
  }
  return candidates;
}

function kstDateKey(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function formatKstTimeOnly(value) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(value)
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, part.value]));
  return `${parts.hour}:${parts.minute}`;
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
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date)
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, part.value]));
  return `${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function formatMaybeDate(value) {
  if (value === null || value === undefined || value === '') return value;
  const text = String(value).trim();
  if (!text || text === '-') return value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  if (isSentinelDate(date) || /^1899[-/]12[-/]30\b/.test(text)) return null;
  if (isDateLikeText(text)) return formatDateTime(value);
  return value;
}

function isDateLikeText(text) {
  return /\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(text)
    || /\b(?:mon|tue|wed|thu|fri|sat|sun)\b/i.test(text)
    || /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(text);
}

function hasTimeSignal(text) {
  return /\b([01]?\d|2[0-3]):[0-5]\d\b/.test(text)
    || /\b([01]?\d|2[0-3])\s*시\b/.test(text)
    || /T[0-2]\d/.test(text)
    || /\b(?:AM|PM|GMT|UTC)\b/i.test(text);
}

function isSentinelDate(date) {
  return date.getFullYear() <= 1900;
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
  hideError();
  console.warn('Weather Ops dashboard warning', message);
}

function showBanner(message, type) {
  const banner = $('errorBanner');
  banner.className = `global-banner ${type || 'error'}`;
  if (type === 'warning' && Array.isArray(message)) {
    banner.innerHTML = `
      <span class="global-banner-title">주의</span>
      <span class="global-banner-list">${message.map((item) => `<span class="global-banner-chip">${escapeHtml(item)}</span>`).join('')}</span>
    `;
  } else {
    banner.textContent = Array.isArray(message) ? message.join(' · ') : message;
  }
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
