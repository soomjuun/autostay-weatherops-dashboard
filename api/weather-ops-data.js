const EXPECTED_PACK_VERSION = String(process.env.WEATHER_OPS_EXPECTED_VERSION || '').trim();
const VERSION_REMEDIATION = '시트 탭 수정 대상이 아닙니다. Apps Script Web App을 새 버전으로 재배포하거나 Vercel WEATHER_OPS_API_URL이 최신 Web App URL인지 확인하세요.';
const APPS_SCRIPT_TOKEN_MISSING = 'WEATHER_OPS_DASHBOARD_TOKEN is not configured';
const APPS_SCRIPT_TOKEN_UNAUTHORIZED = 'Unauthorized dashboard token';
const UPSTREAM_TIMEOUT_MS = Math.max(1000, Number(process.env.WEATHER_OPS_UPSTREAM_TIMEOUT_MS || 15000) || 15000);
const UPSTREAM_RETRY_COUNT = Math.max(0, Number(process.env.WEATHER_OPS_UPSTREAM_RETRY_COUNT || 1) || 0);

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const apiUrl = process.env.WEATHER_OPS_API_URL;
  const apiToken = process.env.WEATHER_OPS_API_TOKEN || '';
  const allowSample = String(process.env.WEATHER_OPS_ALLOW_SAMPLE || 'false').toLowerCase() === 'true';

  if (!apiUrl) {
    if (!allowSample) {
      res.setHeader('X-Weather-Ops-Source', 'missing_config');
      return res.status(500).json({
        error: 'WEATHER_OPS_API_URL is not configured.',
        source: 'missing_config',
        detail: 'Set WEATHER_OPS_API_URL to the deployed Apps Script Web App URL. Sample data is disabled by default for production safety.',
        requiredEnv: ['WEATHER_OPS_API_URL']
      });
    }
    res.setHeader('X-Weather-Ops-Source', 'sample_no_api_url');
    return res.status(200).json(samplePayload('sample_no_api_url'));
  }

  try {
    const upstreamUrl = buildUpstreamUrl(apiUrl, apiToken, req);
    const parsed = await fetchUpstreamPayload(upstreamUrl);
    res.setHeader('X-Weather-Ops-Source', 'apps_script');
    return res.status(200).json(normalizePayload(parsed, 'apps_script'));
  } catch (error) {
    if (!allowSample) {
      const upstreamError = classifyUpstreamError(error);
      res.setHeader('X-Weather-Ops-Source', upstreamError.source);
      return res.status(upstreamError.status).json(upstreamError.body);
    }
    const payload = samplePayload('sample_upstream_error');
    payload.system.apiWarning = errorMessage(error);
    res.setHeader('X-Weather-Ops-Source', 'sample_upstream_error');
    return res.status(200).json(payload);
  }
};

async function fetchUpstreamPayload(upstreamUrl) {
  let lastError = null;
  for (let attempt = 0; attempt <= UPSTREAM_RETRY_COUNT; attempt++) {
    try {
      const text = await fetchUpstreamText(upstreamUrl);
      const parsed = parseUpstreamJson(text);
      if (parsed && parsed.error) throw new Error(parsed.error);
      return parsed;
    } catch (error) {
      lastError = error;
      if (attempt >= UPSTREAM_RETRY_COUNT || !shouldRetryUpstream(error)) break;
      await delay(350);
    }
  }
  throw lastError;
}

async function fetchUpstreamText(upstreamUrl) {
  const controller = new AbortController();
  const upstreamTimeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetch(upstreamUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      redirect: 'follow',
      signal: controller.signal
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      throw new Error(`Apps Script HTTP ${upstream.status}: ${text.slice(0, 160)}`);
    }
    return text;
  } finally {
    clearTimeout(upstreamTimeout);
  }
}

function shouldRetryUpstream(error) {
  if (!error) return false;
  if (error.name === 'AbortError') return true;
  const detail = errorMessage(error).toLowerCase();
  return detail.includes('timeout') || detail.includes('timed out') || detail.includes('network') || detail.includes('fetch failed');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function classifyUpstreamError(error) {
  const detail = errorMessage(error);
  if (error && error.name === 'AbortError') {
    return {
      status: 504,
      source: 'upstream_timeout',
      body: {
        error: 'Weather Ops upstream request timed out.',
        detail: `Apps Script 응답이 ${Math.round(UPSTREAM_TIMEOUT_MS / 1000)}초 안에 완료되지 않았습니다.`,
        source: 'upstream_timeout'
      }
    };
  }
  if (detail.includes(APPS_SCRIPT_TOKEN_MISSING)) {
    return {
      status: 502,
      source: 'upstream_config_error',
      body: {
        error: 'Weather Ops upstream configuration error.',
        detail,
        source: 'upstream_config_error',
        requiredConfig: [
          'Apps Script Script Property WEATHER_OPS_DASHBOARD_TOKEN',
          'Vercel WEATHER_OPS_API_TOKEN 동일값 등록'
        ],
        nextAction: 'Apps Script 프로젝트 속성에 WEATHER_OPS_DASHBOARD_TOKEN을 등록한 뒤 Web App을 재배포하세요.'
      }
    };
  }
  if (detail.includes(APPS_SCRIPT_TOKEN_UNAUTHORIZED)) {
    return {
      status: 502,
      source: 'upstream_auth_error',
      body: {
        error: 'Weather Ops upstream authorization failed.',
        detail,
        source: 'upstream_auth_error',
        requiredConfig: [
          'Apps Script Script Property WEATHER_OPS_DASHBOARD_TOKEN',
          'Vercel WEATHER_OPS_API_TOKEN 동일값 등록'
        ],
        nextAction: 'Vercel WEATHER_OPS_API_TOKEN과 Apps Script WEATHER_OPS_DASHBOARD_TOKEN 값을 동일하게 맞춘 뒤 Production redeploy를 실행하세요.'
      }
    };
  }
  return {
    status: 502,
    source: 'upstream_error',
    body: {
      error: 'Weather Ops upstream request failed.',
      detail,
      source: 'upstream_error',
      requiredEnv: ['WEATHER_OPS_API_URL', 'WEATHER_OPS_API_TOKEN']
    }
  };
}

function parseUpstreamJson(text) {
  try {
    return JSON.parse(String(text || '').replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new Error(`Apps Script non-JSON response: ${String(text || '').slice(0, 160)}`);
  }
}

function errorMessage(error) {
  return error && error.message ? error.message : String(error);
}

function buildUpstreamUrl(rawUrl, token, req) {
  const url = new URL(rawUrl);
  const requestUrl = new URL(req && req.url ? req.url : '/', 'http://weather-ops.local');
  const fresh = requestUrl.searchParams.get('fresh');
  if (!url.searchParams.get('mode')) url.searchParams.set('mode', 'dashboard');
  if (token && !url.searchParams.get('token')) url.searchParams.set('token', token);
  if (fresh && !url.searchParams.get('fresh')) url.searchParams.set('fresh', fresh);
  return url.toString();
}

function normalizePayload(payload, source) {
  const data = unwrapDashboardPayload(payload);
  const recovery = objectOrEmpty(data.recovery);
  const visuals = normalizeVisuals(objectOrEmpty(data.visuals), recovery);
  const weatherSignal = objectOrEmpty(data.weatherSignal || data.latestWeatherSignal || data.weather_signal || data.latest_weather_signal);
  const generatedAt = data.generatedAt || data.generated_at || payload.generatedAt || payload.generated_at || '';
  const system = objectOrEmpty(data.system);
  const version = normalizeVersion(data, payload, system);
  if (EXPECTED_PACK_VERSION) system.expectedPackVersion = EXPECTED_PACK_VERSION;
  if (version && version !== 'unknown') {
    system.packVersion = version;
    system.sheetVersion = version;
  }
  if (!generatedAt) {
    const warnings = Array.isArray(system.freshnessWarnings || system.freshness_warnings)
      ? (system.freshnessWarnings || system.freshness_warnings).slice()
      : [];
    warnings.push('대시보드 데이터 생성 시각이 없습니다.');
    system.freshnessWarnings = [...new Set(warnings)];
  }
  addVersionWarning(system, version);
  return {
    version,
    buildId: data.buildId || data.build_id || system.scriptBuildId || system.script_build_id || '',
    generatedAt,
    source,
    summary: objectOrEmpty(data.summary),
    stores: arrayOrEmpty(data.stores || data.storeRows || data.store_rows),
    weatherSignal,
    decisionReadiness: data.decisionReadiness || data.decision_readiness || system.decisionReadiness || system.decision_readiness || '',
    dashboardPayloadVersion: data.dashboardPayloadVersion || data.dashboard_payload_version || '',
    opsActions: arrayOrEmpty(data.opsActions || data.ops_actions || data.operationsActions || data.operations_actions),
    marketingActions: arrayOrEmpty(data.marketingActions || data.marketing_actions || data.crmActions || data.crm_actions),
    recovery,
    system,
    visuals,
    weatherTimeline: arrayOrEmpty(data.weatherTimeline || data.weather_timeline || data.timeline)
  };
}

function unwrapDashboardPayload(payload) {
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

function normalizeVisuals(visuals, recovery) {
  return Object.assign({}, visuals, {
    recoveryGapByStore: arrayOrEmpty(visuals.recoveryGapByStore || visuals.recovery_gap_by_store || recovery.gapByStore || recovery.gap_by_store),
    processedBulletByStore: arrayOrEmpty(visuals.processedBulletByStore || visuals.processed_bullet_by_store || recovery.bulletByStore || recovery.bullet_by_store),
    systemTrend: arrayOrEmpty(visuals.systemTrend || visuals.system_trend),
    openActionTrend: arrayOrEmpty(visuals.openActionTrend || visuals.open_action_trend)
  });
}

function objectOrEmpty(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeVersion(data, payload, system) {
  return firstNonEmpty(
    data.version,
    data.sheetVersion,
    data.sheet_version,
    data.packVersion,
    data.pack_version,
    data.weatherOpsVersion,
    data.weather_ops_version,
    payload.version,
    payload.sheetVersion,
    payload.sheet_version,
    payload.packVersion,
    payload.pack_version,
    payload.weatherOpsVersion,
    payload.weather_ops_version,
    system.sheetVersion,
    system.sheet_version,
    system.packVersion,
    system.pack_version,
    data.appsScriptVersion,
    data.apps_script_version,
    payload.appsScriptVersion,
    payload.apps_script_version,
    system.appsScriptVersion,
    system.apps_script_version
  ) || 'unknown';
}

function addVersionWarning(system, version) {
  if (!EXPECTED_PACK_VERSION || !version || version === 'unknown' || version === EXPECTED_PACK_VERSION) return;
  const warnings = Array.isArray(system.freshnessWarnings || system.freshness_warnings)
    ? (system.freshnessWarnings || system.freshness_warnings).slice()
    : [];
  system.versionStatus = 'mismatch';
  system.versionCurrent = version;
  system.versionExpected = EXPECTED_PACK_VERSION;
  system.versionRemediation = VERSION_REMEDIATION;
  warnings.push(versionMismatchMessage(version, EXPECTED_PACK_VERSION));
  system.freshnessWarnings = [...new Set(warnings)];
}

function versionMismatchMessage(currentVersion, expectedVersion) {
  return `연결된 Apps Script Web App 배포본이 오래되었습니다. 현재 ${currentVersion}, 기대 ${expectedVersion}. ${VERSION_REMEDIATION}`;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

function sampleWeatherData(data, levels) {
  return Object.assign({}, data, { levels: levels || {} });
}

function samplePayload(source) {
  const now = new Date();
  const iso = now.toISOString();
  const stores = [
    {
      id: 'sample-north',
      name: '샘플 북부점',
      region: '샘플 북부권',
      dri: '운영 담당 A',
      status: 'Yellow',
      weather: '비 예보',
      weatherDetail: '오후 강수 가능성 높음',
      trigger: '강수',
      weatherData: sampleWeatherData({ pop: 60, pcp: 3, peakTime: '15시', windSpeed: 3.1, tmpMax: 30, pm10: 32 }, { pop: 'Yellow', pcp: 'Yellow', tmpMax: 'Yellow', windSpeed: 'Green', pm10: 'Green' }),
      riskScore: 58,
      openIssueCount: 1,
      asStatus: '정상',
      recoveryStatus: '회복 관찰',
      crmReady: false,
      nextAction: '오픈 전 배수/미끄럼 점검, 피크 전 대기열 확인',
      latitude: 37.673,
      longitude: 126.766
    },
    {
      id: 'sample-east',
      name: '샘플 동부점',
      region: '샘플 동부권',
      dri: '운영 담당 B',
      status: 'Orange',
      weather: '강한 비',
      weatherDetail: '피크 전 강수 집중 가능',
      trigger: '강수',
      weatherData: sampleWeatherData({ pop: 80, pcp: 4, peakTime: '16시', windSpeed: 4.2, tmpMax: 29, pm10: 28 }, { pop: 'Orange', pcp: 'Orange', tmpMax: 'Green', windSpeed: 'Green', pm10: 'Green' }),
      riskScore: 82,
      openIssueCount: 2,
      asStatus: '정상',
      recoveryStatus: '회복 조치 필요',
      crmReady: true,
      nextAction: '17시 전 현장 준비 완료 후 D+1 재방문 유도 검토',
      latitude: 37.563,
      longitude: 127.192
    },
    {
      id: 'sample-northwest',
      name: '샘플 서북점',
      region: '샘플 서북권',
      dri: '운영 담당 C',
      status: 'Green',
      weather: '주의 낮음',
      weatherDetail: '운영 제한 요인 없음',
      trigger: '정상',
      weatherData: sampleWeatherData({ pop: 20, pcp: 0, peakTime: '-', windSpeed: 2.4, tmpMax: 28, pm10: 24 }, { pop: 'Green', pcp: 'Green', tmpMax: 'Green', windSpeed: 'Green', pm10: 'Green' }),
      riskScore: 22,
      openIssueCount: 0,
      asStatus: '정상',
      recoveryStatus: '회복 완료',
      crmReady: false,
      nextAction: '정상 운영 유지',
      latitude: 37.653,
      longitude: 126.895
    },
    {
      id: 'sample-route',
      name: '샘플 간선점',
      region: '샘플 간선권',
      dri: '운영 담당 D',
      status: 'Yellow',
      weather: '비 예보',
      weatherDetail: '저녁 강수 가능',
      trigger: '강수',
      weatherData: sampleWeatherData({ pop: 70, pcp: 4, peakTime: '19시', windSpeed: 3.8, tmpMax: 30, pm10: 35 }, { pop: 'Yellow', pcp: 'Yellow', tmpMax: 'Yellow', windSpeed: 'Green', pm10: 'Green' }),
      riskScore: 61,
      openIssueCount: 1,
      asStatus: '정상',
      recoveryStatus: '회복 준비',
      crmReady: false,
      nextAction: '마감 1시간 전 배수/건조존 확인',
      latitude: 37.689,
      longitude: 126.742
    },
    {
      id: 'sample-west',
      name: '샘플 서부점',
      region: '샘플 서부권',
      dri: '운영 담당 E',
      status: 'Orange',
      weather: '비/대기질 주의',
      weatherDetail: '강수 후 미세먼지 완화 가능',
      trigger: '강수',
      weatherData: sampleWeatherData({ pop: 80, pcp: 2, peakTime: '17시', windSpeed: 3.5, tmpMax: 30, pm10: 58 }, { pop: 'Orange', pcp: 'Orange', tmpMax: 'Yellow', windSpeed: 'Green', pm10: 'Green' }),
      riskScore: 76,
      openIssueCount: 2,
      asStatus: '정상',
      recoveryStatus: '회복 조치 필요',
      crmReady: true,
      nextAction: '회복 수요 시간대 확보 후 CRM 승인 요청',
      latitude: 37.478,
      longitude: 126.864
    },
    {
      id: 'sample-city',
      name: '샘플 도심점',
      region: '샘플 도심권',
      dri: '운영 담당 F',
      status: 'Red',
      weather: '강수 집중',
      weatherDetail: '고객 동선 안전 확인 필요',
      trigger: '강수',
      weatherData: sampleWeatherData({ pop: 90, pcp: 5, peakTime: '15시', windSpeed: 4.8, tmpMax: 30, pm10: 41 }, { pop: 'Orange', pcp: 'Orange', tmpMax: 'Yellow', windSpeed: 'Green', pm10: 'Green' }),
      riskScore: 91,
      openIssueCount: 3,
      asStatus: '정상화 대기',
      recoveryStatus: 'AS 차단',
      crmReady: false,
      nextAction: '안전/AS 정상화 확인 전 방문 유도 금지',
      latitude: 37.544,
      longitude: 127.055
    },
    {
      id: 'sample-south',
      name: '샘플 남부점',
      region: '샘플 남부권',
      dri: '운영 담당 G',
      status: 'Yellow',
      weather: '비 예보',
      weatherDetail: '신규점 기준 축적 중',
      trigger: '강수',
      weatherData: sampleWeatherData({ pop: 60, pcp: 3, peakTime: '16시', windSpeed: 2.9, tmpMax: 29, pm10: 31 }, { pop: 'Yellow', pcp: 'Yellow', tmpMax: 'Green', windSpeed: 'Green', pm10: 'Green' }),
      riskScore: 54,
      openIssueCount: 1,
      asStatus: '정상',
      recoveryStatus: '신규점 기준 축적 중',
      crmReady: false,
      nextAction: '운영 로그 축적 및 피크 대응 기록',
      latitude: 37.008,
      longitude: 127.279
    }
  ];

  return {
    version: 'v2.16.4',
    dashboardPayloadVersion: 'v2.16.4-weather-signal.2',
    buildId: '2026-07-22-site-vulnerability-radar-diagnostics.6',
    generatedAt: iso,
    source,
    summary: {
      overallStatus: 'Orange',
      immediateCount: 3,
      watchCount: 4,
      asBlockedCount: 1,
      recoveryActionCount: 2,
      crmReadyCount: 2,
      dataWaitCount: 1,
      systemError24h: 0,
      systemWarn24h: 0,
      headline: '강수 리스크로 3개 지점 즉시 확인, 2개 지점은 회복 수요 흡수 가능'
    },
    stores,
    weatherSignal: {
      mode: 'shadow',
      generatedAt: iso,
      overallStatus: 'Orange',
      summary: {
        totalStores: stores.length,
        normal: 1,
        watch: 4,
        actionRequired: 3,
        dataCheck: 0
      },
      stores: stores.map((store) => ({
        storeId: store.id,
        storeName: store.name,
        status: store.status,
        actionLevel: store.status === 'Orange' || store.status === 'Red' ? '즉시확인' : (store.status === 'Yellow' ? '사전점검' : '정상'),
        riskType: store.trigger,
        reason: store.weatherDetail,
        weather: store.weatherData,
        mode: 'shadow',
        observedAt: iso
      }))
    },
    decisionReadiness: 'shadow_only',
    opsActions: [
      { priority: 'P0', team: '사업운영팀', store: '샘플 도심점', action: 'AS 정상화 게이트 확인 전 고객 방문 유도 중지', owner: '사업운영팀', due: '즉시', status: '대기' },
      { priority: 'P0', team: '사업운영팀', store: '샘플 동부점', action: '피크 전 배수/건조존/대기열 준비 완료 여부 확인', owner: '운영 담당 B', due: '17:00', status: '진행중' },
      { priority: 'P1', team: '사업운영팀', store: '샘플 서부점', action: '회복 가능 시간대 처리량 확보 상태 점검', owner: '운영 담당 E', due: '17:00', status: '대기' }
    ],
    marketingActions: [
      { priority: 'P1', team: '마케팅팀', store: '샘플 동부점', action: 'D+1 오후 재방문 유도 캠페인 승인 검토', trigger: '비 이후 회복 수요', estimatedAudience: 420, status: '승인 대기' },
      { priority: 'P1', team: '마케팅팀', store: '샘플 서부점', action: '강수 종료 후 세차 수요 회복 메시지 준비', trigger: '강수 후 회복', estimatedAudience: 360, status: '초안 필요' }
    ],
    recovery: {
      labels: ['D-day', 'D+1', 'D+2'],
      processedRate: [72, 86, 93],
      revenueRate: [65, 81, 89],
      storeSeries: {
        'sample-north': { processedRate: [74, 91, 102], revenueRate: [69, 88, 98] },
        'sample-east': { processedRate: [68, 82, 91], revenueRate: [61, 78, 87] },
        'sample-northwest': { processedRate: [93, 105, 111], revenueRate: [90, 101, 108] },
        'sample-route': { processedRate: [78, 92, 101], revenueRate: [73, 89, 97] },
        'sample-west': { processedRate: [70, 79, 88], revenueRate: [64, 76, 86] },
        'sample-city': { processedRate: [42, 44, 55], revenueRate: [39, 41, 52] },
        'sample-south': { processedRate: [66, 84, 95], revenueRate: [58, 79, 92] }
      },
      queue: [
        { store: '샘플 동부점', stage: 'D+1', status: '회복 조치 필요', processedRecoveryRate: 82, crmAllowed: 'Y', next: 'CRM 승인' },
        { store: '샘플 서부점', stage: 'D+1', status: '회복 조치 필요', processedRecoveryRate: 79, crmAllowed: 'Y', next: '쿠폰 금액 확정' },
        { store: '샘플 도심점', stage: 'D+1', status: 'AS 차단', processedRecoveryRate: 44, crmAllowed: 'N', next: '기술요청 링크/정상화 확인' }
      ]
    },
    visuals: {
      recoveryFunnel: [
        { key: 'detected', label: '하락 감지', count: 3 },
        { key: 'action', label: '조치 필요', count: 3 },
        { key: 'normalized', label: '정상화 통과', count: 2 },
        { key: 'crmQueued', label: 'CRM 후보', count: 2 },
        { key: 'crmSent', label: '발송/실행', count: 0 },
        { key: 'revisited', label: '재방문 회수', count: 0 }
      ],
      recoveryGapByStore: [
        { storeId: 'sample-east', store: '샘플 동부점', processedRate: 91, revenueRate: 87, gap: 4 },
        { storeId: 'sample-west', store: '샘플 서부점', processedRate: 88, revenueRate: 86, gap: 2 },
        { storeId: 'sample-city', store: '샘플 도심점', processedRate: 55, revenueRate: 52, gap: 3 }
      ]
    },
    system: {
      lastSummaryAt: iso,
      lastRevenueSyncAt: iso,
      appsScriptVersion: 'v2.16.4',
      packVersion: 'v2.16.4',
      sheetVersion: 'v2.16.4',
      dashboardPayloadVersion: 'v2.16.4-weather-signal.2',
      scriptBuildId: '2026-07-22-site-vulnerability-radar-diagnostics.6',
      decisionReadiness: 'shadow_only',
      nextSummaryDueAt: iso,
      systemError24h: 0,
      systemWarn24h: 0,
      dataFreshness: '샘플 데이터',
      freshnessWarnings: source === 'sample_no_api_url' ? ['실데이터 API 미연결'] : [],
      apiWarning: source === 'sample_no_api_url' ? 'WEATHER_OPS_API_URL 미설정: 샘플 데이터 표시 중' : ''
    },
    weatherTimeline: [
      { time: '07:30', label: '오픈 전 점검', risk: 'Yellow' },
      { time: '09:10', label: '종합 요약', risk: 'Orange' },
      { time: '17:00', label: '피크 전 준비', risk: 'Orange' },
      { time: '마감-1h', label: '마감 전 점검', risk: 'Yellow' }
    ]
  };
}
