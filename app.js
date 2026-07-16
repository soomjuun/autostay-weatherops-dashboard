const state = {
  data: null,
  risk: 'all',
  store: 'all',
  chart: null,
  loading: false,
  lastLoadedAt: 0,
  refreshTimer: null
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
  ['.map-panel h2', `지점 현황은 prod 운영 상태와 최신 기상 신호 중 확인 우선순위가 높은 상태로 정렬합니다. ${WEATHER_SIGNAL_HELP}`, '지점 현황 기준'],
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
  $('refreshBtn').addEventListener('click', () => loadDashboard({ fresh: true }));
  $('copyBriefBtn').addEventListener('click', copyBrief);
  $('storeFilter').addEventListener('change', (event) => {
    state.store = event.target.value;
    render();
  });
  $('riskFilter').querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => {
      state.risk = button.dataset.risk;
      updateRiskFilterState();
      render();
    });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!state.lastLoadedAt || Date.now() - state.lastLoadedAt >= AUTO_REFRESH_INTERVAL_MS) {
      loadDashboard({ fresh: true, silent: true });
    }
  });
  window.addEventListener('online', () => loadDashboard({ fresh: true, silent: true }));
  $('dialogClose').addEventListener('click', () => $('storeDialog').close());
  updateRiskFilterState();
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
  $('mapCount').textContent = '0개 지점';
  $('metroMap').innerHTML = `<div class="empty-state filter-empty">대시보드 데이터를 불러오지 못했습니다. 새로고침으로 다시 시도하세요.</div>`;
  $('opsActions').innerHTML = '<div class="empty-state compact">데이터 연결 후 조치 항목을 표시합니다.</div>';
  $('marketingActions').innerHTML = '<div class="empty-state compact">데이터 연결 후 마케팅 항목을 표시합니다.</div>';
  $('recoveryQueue').innerHTML = '<div class="empty-state">데이터 연결 후 회복 큐를 표시합니다.</div>';
  $('riskMatrix').innerHTML = '<div class="empty-state">데이터 연결 후 기상 리스크를 표시합니다.</div>';
  $('recoveryFunnel').innerHTML = '<div class="empty-state">데이터 연결 후 회복 퍼널을 표시합니다.</div>';
  $('recoveryStageHeatmap').innerHTML = '<div class="empty-state">데이터 연결 후 회복 진행을 표시합니다.</div>';
  const bulletList = $('processedBulletList');
  if (bulletList) bulletList.innerHTML = '';
  $('recoveryComparison').innerHTML = '<div class="empty-state">데이터 연결 후 회복 비교를 표시합니다.</div>';
  $('storeTable').innerHTML = '<tr><td colspan="7">데이터 연결 후 지점별 상태를 표시합니다.</td></tr>';
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
    generatedAt: firstPresent(data, ['generatedAt', 'generated_at']) || firstPresent(raw, ['generatedAt', 'generated_at']) || '',
    source: data.source || raw.source || 'unknown',
    dashboardPayloadVersion: firstPresent(data, ['dashboardPayloadVersion', 'dashboard_payload_version']) || '',
    decisionReadiness: firstPresent(data, ['decisionReadiness', 'decision_readiness']) || firstPresent(system, ['decisionReadiness', 'decision_readiness']) || '',
    summary: objectFrom(data.summary),
    stores,
    weatherSignal,
    opsActions: arrayFrom(data.opsActions || data.ops_actions || data.operationsActions || data.operations_actions),
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
      dataCheck: numberFrom(firstPresent(summary, ['dataCheck', 'data_check', 'error']), 0)
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
  renderMap();
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
  const recoveryActive = hasActiveRecoveryData();
  const actionSection = $('actionSection');
  const queuePanel = $('recoveryQueuePanel');
  const visualGrid = $('visualGrid');
  const primaryGrid = $('primaryDashboardGrid');

  if (actionSection) actionSection.hidden = opsRows.length + marketingRows.length === 0;
  if (queuePanel) queuePanel.hidden = queueRows.length === 0;
  if ($('recoveryFunnelPanel')) $('recoveryFunnelPanel').hidden = !recoveryActive;
  if ($('recoveryStagePanel')) $('recoveryStagePanel').hidden = !recoveryActive;
  if ($('recoveryGapPanel')) $('recoveryGapPanel').hidden = !recoveryActive;
  if (visualGrid) visualGrid.classList.toggle('single-panel', !recoveryActive);
  if (primaryGrid) primaryGrid.classList.toggle('queue-hidden', queueRows.length === 0);
}

function hasActiveRecoveryData() {
  const summary = state.data.summary || {};
  const recoveryAction = metricFromKeysNumber(summary, ['recoveryActionCount', 'recovery_action_count']) || 0;
  const dataWait = metricFromKeysNumber(summary, ['dataWaitCount', 'data_wait_count']) || 0;
  if (recoveryAction + dataWait > 0) return true;

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
    return riskMatch && storeMatch;
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

function weatherSignalMode() {
  return String((state.data && state.data.weatherSignal && state.data.weatherSignal.mode)
    || (state.data && state.data.system && (state.data.system.currentDataMode || state.data.system.current_data_mode))
    || '').trim();
}

function weatherSignalModeLabel() {
  const mode = weatherSignalMode();
  const labels = {
    prod: '공식 운영',
    shadow: '실제 기상',
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
    prod_ready: '운영 판단 가능',
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
    prod_ready: '최신 기상 신호가 prod 운영 반영 기준으로 들어와 화면만으로 공식 운영 판단이 가능합니다.',
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
  return formatDateTime(system.nextSummaryDueAt || system.next_summary_due_at) || '';
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
  return hasWeatherSignalData() ? `기상 신호 ${levelLabel(signalOverallStatus())}` : '기상 신호 없음';
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
    ['관측', signalTime]
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

function renderHero() {
  const { summary } = state.data;
  const status = primaryDashboardStatus();
  const prodStatus = prodOverallStatus();
  const hasSignal = hasWeatherSignalData();
  const warnings = topBannerWarnings();
  const readinessClass = decisionReadinessClass();
  const hasRiskSignal = weatherSignalHasRisk();
  $('overallStatus').innerHTML = `${escapeHtml(primaryDashboardStatusLabel())} ${escapeHtml(levelLabel(status))}${renderInfoTip(overallStatusHelpText(status), '전체 상태 기준')}`;
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
    ...(hasSignal ? [{ text: weatherSignalSummaryText(), help: weatherSignalHelpText(), warning: hasRiskSignal }] : [])
  ].concat(warnings.map((warning) => ({ text: `주의: ${warning}`, help: '데이터 신선도 또는 시스템 점검이 필요한 신호입니다.', warning: true })));
  $('heroMeta').innerHTML = metaItems
    .map((item) => `<span class="meta-pill${item.warning ? ' warning' : ''}">${escapeHtml(item.text)}${renderInfoTip(item.help, item.text)}</span>`)
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
  const recoveryCount = (recoveryAction || 0) + (dataWait || 0);

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
      value: `${recoveryCount}건`,
      note: `회복 조치 ${recoveryAction ?? 0} · 성과 대기 ${dataWait ?? 0} · CRM 가능 ${crmReady ?? 0}`,
      level: recoveryCount > 0 ? 'watch' : 'ok'
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
  $('metroMap').innerHTML = stores.map((store, index) => {
    const weatherChips = renderWeatherMetricChips(store, 3);
    const signalChips = weatherMetricRowsEquivalent(store) ? '' : renderSignalWeatherMetricChips(store, 3);
    const signalLine = storeSignalLine(store);
    const nextAction = storeNextActionText(store);
    return `
      <button class="store-pin status-${store.status}" type="button" data-store="${escapeAttr(store.id)}" aria-label="${escapeAttr(`${store.name} ${levelLabel(store.status)}. ${store.weather}. 다음 액션: ${nextAction}`)}">
        <span class="pin-top">
          <strong>${escapeHtml(store.name)}</strong>
          <span class="badge ${store.status}">${escapeHtml(levelLabel(store.status))}</span>
        </span>
        <span class="pin-meta">운영 ${escapeHtml(levelLabel(store.prodStatus))} · ${escapeHtml(store.dri)}</span>
        <span class="pin-meta signal-${escapeAttr(store.signalStatus)}">${escapeHtml(signalLine)}</span>
        ${weatherChips ? `<span class="weather-chip-row">${weatherChips}</span>` : ''}
        ${signalChips ? `<span class="weather-chip-row signal-weather">${signalChips}</span>` : ''}
        <span class="pin-action">${escapeHtml(nextAction)}</span>
      </button>
    `;
  }).join('');
  $('metroMap').querySelectorAll('.store-pin').forEach((button) => {
    button.addEventListener('click', () => openStoreDialog(button.dataset.store));
  });
}

function storeSignalLine(store) {
  if (!hasStoreSignalData(store)) return '기상 신호 없음';
  const mode = store.signalMode ? `${store.signalMode} · ` : '';
  const risk = store.signalRiskType && store.signalRiskType !== '-' ? ` · ${store.signalRiskType}` : '';
  return `기상 신호 ${mode}${levelLabel(store.signalStatus)}${risk}`;
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
  $('opsActions').innerHTML = renderActionList(state.data.opsActions, '사업운영팀');
  $('marketingActions').innerHTML = renderActionList(state.data.marketingActions, '마케팅팀');
}

function renderActionList(items, fallbackTeam) {
  const filtered = (items || []).filter(matchesSelectedStore);
  if (!filtered.length) return '<div class="empty-state compact">현재 필터 기준 조치 항목이 없습니다.</div>';
  return filtered.map((item) => {
    const priority = firstPresent(item, ['priority', 'level', 'actionLevel', 'action_level']) || 'P1';
    const store = firstPresent(item, ['store', 'storeName', 'store_name', 'name']) || fallbackTeam;
    const action = firstPresent(item, ['action', 'nextAction', 'next_action', 'recommendedAction', 'recommended_action', 'customerAction', 'customer_action', 'revenueAction', 'revenue_action']) || '-';
    const owner = firstPresent(item, ['owner', 'dri', 'team', 'opsLead', 'ops_lead']) || fallbackTeam;
    const due = firstPresent(item, ['due', 'dueAt', 'due_at', 'nextUpdateDue', 'next_update_due', 'vendorEta', 'vendor_eta', 'status']) || '-';
    const audience = firstPresent(item, ['estimatedAudience', 'estimated_audience', 'audienceCount', 'audience_count']);
    return `
      <div class="action-item">
        <div class="action-top">
          <span class="priority">${escapeHtml(priority)}</span>
          <span class="action-store">${escapeHtml(store)}</span>
        </div>
        <div class="action-body">${escapeHtml(action)}</div>
        <div class="action-foot">
          <span>담당 ${escapeHtml(owner)}</span>
          <span>기한 ${escapeHtml(formatActionDue(due))}</span>
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
  if (!filtered.length) {
    $('recoveryQueue').innerHTML = '<div class="empty-state">현재 필터 기준 회복 큐가 없습니다.</div>';
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
          <span class="queue-chip ${escapeAttr(crm.className)}" title="${escapeAttr('CRM 가능은 AS 정상화와 회복 판단을 통과해 고객 유도/재방문 안내 후보가 될 수 있다는 뜻입니다.')}">CRM ${escapeHtml(crm.label)}</span>
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
    const weatherChips = renderWeatherMetricChips(store, 4);
    const signalChips = weatherMetricRowsEquivalent(store) ? '' : renderSignalWeatherMetricChips(store, 4);
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
          ${signalChips ? `<div class="weather-chip-row table-weather signal-weather">${signalChips}</div>` : ''}
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
  return `<span class="signal-line"><span class="badge ${store.signalStatus}">신호 ${escapeHtml(store.signalActionLevel)}</span> ${escapeHtml(signalWeatherText(store))}</span>`;
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
  return `${WEATHER_SIGNAL_HELP} 현재 ${store.signalMode || '미지정'} 기준 ${levelLabel(store.signalStatus)}이며, 판단 근거는 ${store.signalReason || store.signalRiskType || '제공된 신호 없음'}입니다.`;
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
    '수요·매출 회복': '회복 조치, 처리대수·매출 성과 대기, CRM 가능 건을 함께 봅니다. AS·안전 게이트 통과 후 CRM 실행 여부를 판단합니다.',
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
    '시스템 오류': '최근 24시간 미해결 ERROR/CRITICAL/FATAL급 시스템 오류입니다. 해결 처리된 dashboard 인증 오류와 lock 경고는 Apps Script payload에서 제외됩니다.',
    '시스템 오류 상세': 'Apps Script dashboard payload가 제공한 미해결 시스템 오류의 최근 메시지입니다. 상세 payload가 없으면 오류 건수만 표시합니다.',
    '시스템 경고': '최근 24시간 미해결 WARN/WARNING급 비차단 경고입니다. 운영 판단을 막지는 않지만 반복되면 자동화 또는 원천 상태를 점검해야 합니다.'
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
  const summaryFreshnessLevel = system.summaryFreshnessLevel || system.summary_freshness_level;
  const summary = state.data.summary || {};
  const systemErrorCountValue = firstMetricValue(summary.systemError24h, summary.system_error_24h, system.systemError24h, system.system_error_24h);
  const systemWarnCountValue = firstMetricValue(summary.systemWarn24h, summary.system_warn_24h, system.systemWarn24h, system.system_warn_24h);
  const systemErrorCount = metricNumber(systemErrorCountValue);
  const systemWarnCount = metricNumber(systemWarnCountValue);
  const systemErrorDetail = systemIssueSummary('error', systemErrorCount);
  const items = [
    { label: '마지막 요약', value: lastSummaryAt, className: summaryFreshnessLevel || summaryFreshnessStatusClass(system) },
    { label: '매출 동기화', value: system.lastRevenueSyncAt || system.last_revenue_sync_at || '-', className: systemFreshnessClass(system.lastRevenueSyncAt || system.last_revenue_sync_at, 30) },
    { label: '시트/Pack', value: formatPackVersionStatus(system), className: versionStatusClass(system) },
    { label: '데이터 상태', value: operationalDataStatus(system), className: operationalDataStatusClass() },
    { label: '판단 상태', value: decisionReadinessLabel(), className: decisionReadinessClass() },
    { label: '기상 신호', value: weatherSignalSummaryText(), className: !hasWeatherSignalData() ? 'info' : (weatherSignalIsStale() || weatherSignalHasRisk() ? 'warning' : 'ok') },
    { label: '시스템 오류', value: systemErrorCountValue === '-' ? '-' : `${systemErrorCount}건`, className: systemErrorCount > 0 ? 'danger' : (systemErrorCountValue === '-' ? 'info' : 'ok') },
    { label: '시스템 경고', value: systemWarnCountValue === '-' ? '-' : `${systemWarnCount}건`, className: systemWarnCount > 0 ? 'warning' : (systemWarnCountValue === '-' ? 'info' : 'ok') }
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

function openStoreDialog(storeId) {
  const store = state.data.stores.find((item) => item.id === storeId);
  if (!store) return;
  $('dialogTitle').textContent = store.name;
  $('dialogBody').innerHTML = [
    ['화면 상태', levelLabel(store.status)],
    ['운영 상태', levelLabel(store.prodStatus)],
    ['기상 신호', `${levelLabel(store.signalStatus)} · ${store.signalActionLevel} · ${store.signalMode || '-'}`],
    ['신호 근거', signalWeatherText(store)],
    ['운영 기상/트리거', `${store.weather} · ${store.weatherDetail || store.trigger}`],
    ['운영 기상 수치', weatherMetricText(store)],
    ['신호 기상 수치', signalWeatherMetricText(store)],
    ['DRI', store.dri],
    ['AS 상태', store.asStatus],
    ['AS 차단/ETA', [store.normalizationBlocker, store.vendorStatus, store.vendorEta].filter(Boolean).join(' · ') || '-'],
    ['CS/고객 안내', customerStatusText(store)],
    ['고객 영향', customerImpactText(store) || '-'],
    ['회복 상태', store.recoveryStatus],
    ['CRM 가능 여부', store.crmReady ? '가능' : '대기'],
    ['다음 액션', storeNextActionText(store)]
  ].map(([label, value]) => `
    <div class="detail-row"><b>${escapeHtml(label)}</b><span>${escapeHtml(value)}</span></div>
  `).join('');
  $('storeDialog').showModal();
  $('dialogClose').focus();
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
    `전체 상태: ${levelLabel(decisionStatus())} / 판단: ${decisionReadinessLabel()} / ${weatherSignalSummaryText()}`,
    `운영 즉시: ${summary.immediateCount ?? summary.immediate_count ?? 0} / 회복 조치: ${summary.recoveryActionCount ?? summary.recovery_action_count ?? 0} / CRM 가능: ${summary.crmReadyCount ?? summary.crm_ready_count ?? 0} / 성과 대기: ${summary.dataWaitCount ?? summary.data_wait_count ?? 0}`,
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
  if (includeOperationalAdvisory && systemErrorCount > 0 && !warnings.some((warning) => String(warning || '').includes('시스템 오류'))) {
    warnings.push(`시스템 오류 ${systemErrorCount}건`);
  }
  if (includeOperationalAdvisory && dataWaitCount > 0) warnings.push(`성과 확정 대기 ${dataWaitCount}건`);
  return [...new Set(warnings)];
}

function topBannerWarnings() {
  return freshnessWarnings({ includeOperationalAdvisory: false });
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
