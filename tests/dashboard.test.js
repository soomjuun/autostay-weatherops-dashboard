const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function loadDashboardLogic() {
  const source = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  let scheduled = null;
  const context = {
    AbortController,
    Date,
    Intl,
    URL,
    console,
    fetch: async () => ({ status: 200 }),
    sessionStorage: { getItem: () => null, setItem: () => {} },
    document: {
      addEventListener: () => {},
      getElementById: () => null,
      querySelector: () => null,
      visibilityState: 'visible'
    },
    window: {
      addEventListener: () => {},
      clearInterval: () => {},
      location: { href: '' },
      setInterval: (callback, delay) => {
        scheduled = { callback, delay };
        return 1;
      }
    }
  };
  vm.runInNewContext(`${source}\n;globalThis.__dashboardTest = { state, dashboardHeadline, keepMetricValueTogether, formatPeakTime, startAutoRefresh, missionCards, normalize, normalizeStore, normalizeSignalWeatherValues, normalizeEnhancedSignal, normalizeSiteVulnerability, normalizeSignalSourceStatus, signalSourceNotice, signalSourceDetail, systemIssueSummary, weatherMetricRows, combinedWeatherMetricRows, weatherSourceRows, weatherSourceDetailRows, weatherSourceContractText, siteVulnerabilityContractText, siteVulnerabilityContractWarning, enhancedSignals, enhancedSignalDistribution, enhancedStoreLine, enhancedStoreDetailRows, enhancedSourceDetail, enhancedOperationalImpactText, humanizeRadarSpatialScope, humanizeRadarFallbackType, isEnhancedFallbackNotice, renderActionList, historicalOverdueSummary, hasActiveRecoveryData, primaryDashboardStatus, primaryDashboardStatusLabel, primaryDashboardStatusText, decisionReadiness, decisionReadinessLabel, decisionReadinessHelpText, decisionReadinessClass, weatherSignalIsStale, weatherSignalFreshnessWarning, summaryScheduleCandidates, summaryDateMatchesPolicy, operationalDataStatusClass, storeNextActionText, hasCustomerStatusData, customerStatusText, customerImpactText, customerStatusView, weatherMetricRowsEquivalent, siteVulnerabilityContext, siteVulnerabilityDetailRows, siteVulnerabilitySummaryRows, siteVulnerabilityFilterMatch, formatRainDrainage, compactAsStatus, compactRecoveryStatus, weatherComparisonRow, weatherComparisonSummary };`, context);
  return { api: context.__dashboardTest, scheduled: () => scheduled };
}

function mockResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; }
  };
}

test('기상 신호가 없으면 운영 정상과 기상 판단 대기를 분리한다', () => {
  const { api } = loadDashboardLogic();
  api.state.data = {
    summary: { overallStatus: 'Green', headline: '현재 즉시 조치 지점은 없습니다.' },
    stores: [{ status: 'Green', prodStatus: 'Green' }],
    weatherSignal: {},
    system: {}
  };
  assert.equal(api.dashboardHeadline(), '운영 원장 기준 즉시 조치는 없습니다. 최신 기상 신호 수신 전이므로 기상 판단은 대기입니다.');
  assert.equal(api.primaryDashboardStatus(), 'Gray');
  assert.equal(api.primaryDashboardStatusLabel(), '기상 판단');
  assert.equal(api.decisionReadiness(), 'no_signal');
  assert.equal(api.decisionReadinessClass(), 'danger');
});

test('운영 원장에 위험이 있으면 원장 헤드라인을 유지한다', () => {
  const { api } = loadDashboardLogic();
  api.state.data = {
    summary: { overallStatus: 'Orange', headline: '운영 원장 확인 항목 1건' },
    stores: [{ status: 'Orange', prodStatus: 'Orange' }],
    weatherSignal: {},
    system: {}
  };
  assert.equal(api.dashboardHeadline(), '운영 원장 확인 항목 1건');
});

test('장시간 열린 화면은 5분 자동 갱신을 예약한다', () => {
  const { api, scheduled } = loadDashboardLogic();
  api.startAutoRefresh();
  assert.equal(scheduled().delay, 5 * 60 * 1000);
  assert.equal(typeof scheduled().callback, 'function');
});

test('1899년 스프레드시트 기준일은 피크 시간으로 노출하지 않는다', () => {
  const { api } = loadDashboardLogic();
  assert.equal(api.formatPeakTime('Sat Dec 30 1899 00:00:00 GMT+0827 (Korean Standard Time)'), '미정');
});

test('운영 환경에서 API 미설정은 샘플 데이터로 대체하지 않는다', async () => {
  const handlerPath = path.join(ROOT, 'api', 'weather-ops-data.js');
  delete require.cache[require.resolve(handlerPath)];
  delete process.env.WEATHER_OPS_API_URL;
  process.env.WEATHER_OPS_ALLOW_SAMPLE = 'false';
  const handler = require(handlerPath);
  const res = mockResponse();
  await handler({ method: 'GET', url: '/api/weather-ops-data' }, res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.source, 'missing_config');
});

test('상태 필터와 정적 자산 버전이 배포용 표기를 사용한다', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.match(html, /data-risk="Error">오류<\/button>/);
  assert.match(html, /data-risk="Red">제한확인<\/button>/);
  assert.match(html, /data-risk="Orange">조치<\/button>/);
  assert.match(html, /data-risk="Yellow">주의<\/button>/);
  assert.match(html, /data-risk="Green">정상<\/button>/);
  assert.match(html, /data-risk="Gray">신호대기<\/button>/);
  assert.match(html, /CS\/고객/);
  assert.match(html, /app\.js\?v=2026-07-23-2/);
  assert.match(html, /style\.css\?v=2026-07-23-2/);
  assert.match(html, /overview-command-layout/);
  assert.doesNotMatch(html, /overview-command-stack/);
  assert.match(css, /--density-row:\s*56px/);
  assert.match(css, /\.queue-table-head/);
  assert.match(css, /\.overview-command-layout\s*\{[^}]*grid-template-columns:/s);
  assert.match(css, /\.recovery-primary-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
  assert.match(app, /queue-table/);
  assert.match(html, /data-tab-target="overview">오늘 판단<\/button>/);
  assert.match(html, /data-tab-target="stores"[^>]*>지점 상세<\/button>/);
  assert.match(html, /data-tab-target="recovery"[^>]*>회복<\/button>/);
  assert.match(html, /data-tab-target="data"[^>]*>데이터 상태<\/button>/);
  assert.match(html, /id="priorityQueue"/);
  assert.match(html, /id="weatherComparison"/);
  assert.match(html, /id="sourceHealthCompact"/);
  assert.match(html, /id="weatherSourceStrip"/);
  assert.match(html, /id="siteVulnerabilitySummary"/);
  assert.match(html, /id="siteVulnerabilityContractStatus"/);
  assert.match(html, /승인 검토 후보/);
  assert.match(html, /<caption class="sr-only">/);
  assert.match(html, /<th scope="col">CS\/고객<\/th>/);
  assert.match(css, /\.pin-meta\s*\{[^}]*word-break:\s*keep-all;/s);
  assert.match(css, /\.command-matrix-row\s*\.store-pin|\.command-matrix-row\.store-pin/);
  assert.match(css, /\.weather-compare-row/);
  assert.match(css, /\.meta-pill\.wide\s*\{\s*grid-column:\s*1\s*\/\s*-1;/);
  assert.match(app, /wide:\s*true/);
  assert.match(app, /<td colspan="8">데이터 연결 후 지점별 상태를 표시합니다\.<\/td>/);
  assert.match(packageJson.scripts.check, /node --check middleware\.js/);
});

test('summary metric labels stay attached to their values', () => {
  const { api } = loadDashboardLogic();
  assert.equal(
    api.keepMetricValueTogether('Immediate 0 / Watch 7 / Check 0'),
    'Immediate\u00a00 / Watch\u00a07 / Check\u00a00'
  );
  assert.equal(api.keepMetricValueTogether('No metric summary'), 'No metric summary');
});

test('최신 시트의 종합 요약은 09:10 한 번만 예정한다', () => {
  const { api } = loadDashboardLogic();
  const candidates = api.summaryScheduleCandidates(new Date('2026-07-16T12:00:00+09:00'), 0, 0);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].toISOString(), '2026-07-16T00:10:00.000Z');
  assert.equal(api.summaryDateMatchesPolicy(new Date('2026-07-16T09:10:00+09:00')), true);
  assert.equal(api.summaryDateMatchesPolicy(new Date('2026-07-16T16:30:00+09:00')), false);
});

test('기상 Error는 시스템 장애가 아닌 데이터 확인 상태로 표시한다', () => {
  const { api } = loadDashboardLogic();
  api.state.data = {
    summary: {},
    stores: [{ status: 'Error', prodStatus: 'Red' }],
    weatherSignal: {
      generatedAt: new Date().toISOString(),
      overallStatus: 'Error',
      summary: { dataCheck: 1 },
      stores: [{ storeId: 'gwangmyeong', status: 'Error' }]
    },
    system: { decisionReadiness: 'prod_ready' }
  };
  assert.equal(api.primaryDashboardStatusText(), '기상 데이터 확인');
});

test('2시간 갱신 기상 신호가 3시간을 넘으면 오래된 신호로 처리한다', () => {
  const { api } = loadDashboardLogic();
  api.state.data = {
    summary: {},
    stores: [{ status: 'Green', prodStatus: 'Green' }],
    weatherSignal: {
      mode: 'prod',
      generatedAt: '2026-07-15T00:00:00+09:00',
      overallStatus: 'Green',
      summary: { totalStores: 1, normal: 1 },
      stores: [{ storeId: 'ilsan', status: 'Green' }]
    },
    system: { decisionReadiness: 'prod_ready' }
  };
  assert.equal(api.weatherSignalIsStale(), true);
  assert.equal(api.decisionReadiness(), 'stale');
  assert.match(api.weatherSignalFreshnessWarning(), /2시간 무알림 갱신/);
});

test('현재 실황과 오늘 예보 최대값을 별도 기상 지표로 정규화한다', () => {
  const { api } = loadDashboardLogic();
  const store = api.normalizeStore({ store_id: 'ilsan', store_name: '일산 풍동', status: 'Green' }, {
    ilsan: {
      status: 'Yellow',
      riskType: '강수, 폭염',
      weatherValues: {
        observed_rain_1h: 1.2,
        observed_temperature: 31.4,
        observed_wind: 3.8,
        observed_at: '2026-07-16T10:00:00+09:00',
        forecast_max_pop: 80,
        forecast_max_pcp_1h: 5,
        forecast_max_wind: 8,
        forecast_max_temperature: 34,
        forecast_peak_time: '16:00',
        forecast_base_at: '2026-07-16T08:00:00+09:00'
      }
    }
  });
  const rows = api.weatherMetricRows({
    weatherData: store.weatherValues,
    trigger: store.signalRiskType,
    weather: store.signalRiskType,
    weatherDetail: store.signalReason
  });
  assert.equal(store.weatherValues.pop, 80);
  assert.equal(store.weatherValues.pcp, 5);
  assert.equal(store.weatherValues.windSpeed, 8);
  assert.equal(store.weatherValues.tmpMax, 34);
  assert.ok(rows.some((row) => row.label === '현재 강수' && row.value === '1.2mm/h'));
  assert.ok(rows.some((row) => row.label === '현재기온' && row.value === '31.4℃'));
  assert.ok(rows.some((row) => row.label === '예보 최대강수' && row.value === '5mm/h'));
  assert.ok(rows.some((row) => row.label === '예보 최고기온' && row.value === '34℃'));
});

test('운영 상태나 기상 신호가 누락되면 지점을 정상으로 기본 처리하지 않는다', () => {
  const { api } = loadDashboardLogic();
  const missingAll = api.normalizeStore({ store_id: 'ilsan', store_name: '일산 풍동' });
  assert.equal(missingAll.prodStatus, 'Gray');
  assert.equal(missingAll.status, 'Gray');

  const prodOnly = api.normalizeStore({ store_id: 'ilsan', store_name: '일산 풍동', status: 'Green' });
  assert.equal(prodOnly.prodStatus, 'Green');
  assert.equal(prodOnly.signalStatus, 'Gray');
  assert.equal(prodOnly.status, 'Gray');
  assert.equal(api.storeNextActionText(prodOnly), '기상 신호 연동 확인');

  const covered = api.normalizeStore(
    { store_id: 'ilsan', store_name: '일산 풍동', status: 'Green' },
    { ilsan: { status: 'Green', mode: 'shadow', observedAt: '2026-07-14T09:15:00+09:00' } }
  );
  assert.equal(covered.status, 'Green');
  assert.equal(api.storeNextActionText(covered), '-');
});

test('운영 원장만 연결되고 기상 신호가 없으면 데이터 상태를 정상으로 표시하지 않는다', () => {
  const { api } = loadDashboardLogic();
  api.state.data = {
    source: 'apps_script',
    generatedAt: '2026-07-14T13:16:00+09:00',
    stores: [{ status: 'Gray', prodStatus: 'Green' }],
    weatherSignal: {},
    summary: {},
    system: { decisionReadiness: 'prod_ready' }
  };
  assert.equal(api.decisionReadiness(), 'no_signal');
  assert.equal(api.operationalDataStatusClass(), 'warning');
});

test('운영 목적 카드는 기상 신호와 CS 지표 부재를 정상 0건으로 오인하지 않는다', () => {
  const { api } = loadDashboardLogic();
  api.state.data = {
    summary: {
      immediateCount: 0,
      asBlockedCount: 0,
      recoveryActionCount: 0,
      dataWaitCount: 0,
      crmReadyCount: 0
    },
    stores: [{ status: 'Green', prodStatus: 'Green', asStatus: '정상', recoveryStatus: '대상 없음' }],
    weatherSignal: {},
    recovery: {},
    system: {}
  };
  const cards = api.missionCards();
  assert.equal(cards[0].value, '판단 대기');
  assert.equal(cards[2].value, '확인 전');
  assert.match(cards[2].note, /1개점 고객 상태 미확인/);
});

test('최신 시트의 AS ETA와 고객 안내 필드를 지점 상태로 정규화한다', () => {
  const { api } = loadDashboardLogic();
  const store = api.normalizeStore({
    store_id: 'goyang',
    store_name: '고양 삼송',
    normalization_gate: '정상화 대기',
    normalization_blocker: '부품 수급 대기',
    vendor_eta: '2026-07-13T18:00:00+09:00',
    downtime_minutes: 95,
    customer_notice_status: '승인 대기',
    customer_impact: '부분 운영 안내 필요'
  });
  assert.equal(store.normalizationBlocker, '부품 수급 대기');
  assert.equal(store.vendorEta, '2026-07-13T18:00:00+09:00');
  assert.equal(store.downtimeMinutes, 95);
  assert.equal(store.customerNoticeStatus, '승인 대기');
  assert.equal(store.customerImpact, '부분 운영 안내 필요');
  api.state.data = { summary: {}, stores: [store], weatherSignal: {}, recovery: {}, system: {} };
  assert.equal(api.missionCards()[1].value, '1개점');
});

test('고객 안내와 영향이 모두 확인 전이면 중복 표시와 정상 0건 오인을 막는다', () => {
  const { api } = loadDashboardLogic();
  const store = api.normalizeStore({
    store_id: 'ilsan',
    store_name: '일산 풍동',
    customer_notice_status: '확인 전',
    customer_impact: '확인 전'
  });
  assert.equal(api.hasCustomerStatusData(store), false);
  assert.equal(api.customerStatusText(store), '확인 필요');
  assert.equal(api.customerImpactText(store), '');
  assert.equal(api.customerStatusView(store).state, 'unknown');

  api.state.data = { summary: {}, stores: [store], weatherSignal: {}, recovery: {}, system: {} };
  const csCard = api.missionCards()[2];
  assert.equal(csCard.value, '확인 전');
  assert.match(csCard.note, /1개점 고객 상태 미확인/);
});

test('고객 안내와 영향은 같은 값이면 한 번만, 다른 값이면 영향 상세로 분리한다', () => {
  const { api } = loadDashboardLogic();
  const duplicate = api.normalizeStore({
    customer_notice_status: '안내 완료',
    customer_impact: '안내 완료'
  });
  assert.equal(api.customerStatusText(duplicate), '안내 완료');
  assert.equal(api.customerImpactText(duplicate), '');
  assert.equal(api.customerStatusView(duplicate).state, 'clear');

  const distinct = api.normalizeStore({
    customer_notice_status: '승인 대기',
    customer_impact: '부분 운영 안내 필요'
  });
  assert.equal(api.customerStatusText(distinct), '승인 대기');
  assert.equal(api.customerImpactText(distinct), '부분 운영 안내 필요');
  assert.equal(api.customerStatusView(distinct).state, 'pending');
});

test('운영과 기상 신호 수치가 같으면 중복 기상 칩을 축약한다', () => {
  const { api } = loadDashboardLogic();
  const source = {
    store_id: 'ilsan',
    store_name: '일산 풍동',
    weatherData: { pop: 60, pcp: 3, peakTime: '10:00', levels: { pop: 'Yellow', pcp: 'Yellow' } }
  };
  const same = api.normalizeStore(source, {
    ilsan: { status: 'Yellow', weatherValues: { pop: 60, pcp: 3, peakTime: '10:00', levels: { pop: 'Yellow', pcp: 'Yellow' } } }
  });
  const different = api.normalizeStore(source, {
    ilsan: { status: 'Yellow', weatherValues: { pop: 80, pcp: 5, peakTime: '10:00', levels: { pop: 'Orange', pcp: 'Orange' } } }
  });
  assert.equal(api.weatherMetricRowsEquivalent(same), true);
  assert.equal(api.weatherMetricRowsEquivalent(different), false);
});

test('운영과 최신 신호의 기상 수치는 키별 최신 값으로 한 번만 합친다', () => {
  const { api } = loadDashboardLogic();
  const store = api.normalizeStore({
    store_id: 'gwangmyeong',
    store_name: '광명점',
    weatherData: {
      pop: 100,
      pcp: 25,
      peakTime: '19:00',
      levels: { pop: 'Red', pcp: 'Red', tmpMax: 'Green' }
    }
  }, {
    gwangmyeong: {
      status: 'Error',
      riskType: '폭염, 미세먼지/황사',
      weatherValues: {
        pop: 100,
        pcp: 25,
        tmpMax: 31,
        peakTime: '19:00',
        levels: { pop: 'Red', pcp: 'Red', tmpMax: 'Yellow' }
      }
    }
  });
  const rows = api.combinedWeatherMetricRows(store);
  assert.equal(rows.filter((row) => row.key === 'pop').length, 1);
  assert.equal(rows.filter((row) => row.key === 'pcp').length, 1);
  assert.equal(rows.filter((row) => row.key === 'peakTime').length, 1);
  assert.equal(rows.find((row) => row.key === 'tmpMax').value, '31℃');
});

test('지점 원천 오류를 위험등급과 분리해 확인 대상으로 표시한다', () => {
  const { api } = loadDashboardLogic();
  const store = api.normalizeStore({ store_id: 'gwangmyeong', store_name: '광명점', status: 'Green' }, {
    gwangmyeong: {
      status: 'Yellow',
      riskType: '폭염',
      sourceStatus: 'error',
      sourceError: '에어코리아 측정값 없음',
      metricStatus: 'Yellow',
      consistency: { consistent: true }
    }
  });
  assert.equal(store.signalStatus, 'Yellow');
  assert.equal(store.signalSourceStatus, 'error');
  assert.equal(api.signalSourceNotice(store), '대기질만 확인 불가');
  assert.match(api.signalSourceDetail(store), /강수 실황·단기예보는 계속 사용할 수 있으며/);
  assert.match(api.signalSourceDetail(store), /에어코리아 측정값 없음/);
});

test('신규 shadow 계약은 null 강수와 실제 0mm를 구분해 정규화한다', () => {
  const { api } = loadDashboardLogic();
  const enhanced = api.normalizeEnhancedSignal({
    validationMode: 'shadow',
    sourceStatus: 'error',
    sourceError: '사용 가능한 인근 AWS 매분자료 없음',
    awsRain1h: null,
    radarRainRate: 0,
    weatherWarningActiveSevere: false,
    operationalImpact: 'none_validation_only',
    managerInputRequired: false,
    validationPolicy: { affectsOperationalLevel: false }
  });
  assert.equal(enhanced.available, true);
  assert.equal(enhanced.validationMode, 'shadow');
  assert.equal(enhanced.awsRain1h, null);
  assert.equal(enhanced.radarRainRate, 0);
  assert.equal(enhanced.weatherWarningActiveSevere, false);
  assert.equal(enhanced.managerInputRequired, false);
  assert.equal(enhanced.affectsOperationalLevel, false);
  assert.equal(api.enhancedOperationalImpactText([enhanced]), '없음 · shadow 검증 중');
});

test('최신 payload와 build 식별자를 프런트 계약에 보존한다', () => {
  const { api } = loadDashboardLogic();
  const normalized = api.normalize({
    version: 'v2.16.4',
    dashboardPayloadVersion: 'v2.16.4-weather-signal.2',
    buildId: '2026-07-22-sheet-handoff-date-ux.11',
    summary: {},
    stores: [],
    weatherSignal: {},
    overdueExceptions: [{ store: '하남 미사', status: '미종결' }],
    system: {}
  });
  assert.equal(normalized.dashboardPayloadVersion, 'v2.16.4-weather-signal.2');
  assert.equal(normalized.buildId, '2026-07-22-sheet-handoff-date-ux.11');
  assert.equal(normalized.overdueExceptions.length, 1);
});

test('shadow 검증 신호는 공식 상태와 별도로 색상 분포를 집계한다', () => {
  const { api } = loadDashboardLogic();
  const rows = [
    api.normalizeEnhancedSignal({ fusionStatus: 'Orange' }),
    ...Array.from({ length: 6 }, () => api.normalizeEnhancedSignal({ fusionStatus: 'Yellow' }))
  ];
  assert.equal(api.enhancedSignalDistribution(rows), 'Orange 1 / Yellow 6');
});

test('신규 검증 오류와 정상 fallback 안내를 분리한다', () => {
  const { api } = loadDashboardLogic();
  api.state.data = { system: {}, weatherSignal: { mode: 'shadow', generatedAt: new Date().toISOString(), summary: {} }, stores: [] };
  const rows = [api.normalizeEnhancedSignal({
    sourceStatus: 'warning',
    sourceError: '',
    sourceWarnings: 'AWS 지점목록 월보 대체 사용: 2026-06 | 레이더 광역 행정코드 대체 사용: 4100000000',
    fallbackNotices: ['AWS 지점목록 월보 대체 사용: 2026-06', '레이더 광역 행정코드 대체 사용: 4100000000'],
    awsStationReferenceMonth: '2026-06',
    awsObservedAt: '2026-07-21T17:43:00+09:00',
    radarObservedAt: '2026-07-21T17:40:00+09:00',
    radarRainRate: 0,
    radarSpatialScope: 'province_fallback',
    radarFallbackUsed: true
  })];
  const details = api.weatherSourceDetailRows([], rows);
  assert.equal(details.find((row) => row.label === '신규 검증 오류').value, '없음');
  assert.equal(details.find((row) => row.label === '대체 사용 안내').value, 'AWS 월보 2026-06 · 레이더 시·도 광역 대표 사용 1개점');
  const awsDetail = api.enhancedSourceDetail('AWS', rows, 'aws');
  const radarDetail = api.enhancedSourceDetail('레이더', rows, 'radar');
  assert.match(awsDetail, /대체 안내 AWS 월보 2026-06/);
  assert.doesNotMatch(awsDetail, /레이더|4100000000/);
  assert.match(radarDetail, /대체 안내 레이더 시·도 광역 대표 사용 1개점/);
  assert.doesNotMatch(radarDetail, /AWS 월보|2026-06/);
});

test('최신 현장 취약정보 계약을 운영 지점과 기상 신호 양쪽에서 보존한다', () => {
  const { api } = loadDashboardLogic();
  const normalized = api.normalize({
    version: 'v2.16.4',
    dashboardPayloadVersion: 'v2.16.4-weather-signal.2',
    system: { scriptBuildId: '2026-07-22-sheet-handoff-date-ux.11' },
    stores: [{
      storeId: 'hanam',
      storeName: '하남 미사',
      prodStatus: 'Green',
      siteVulnerability: {
        rainPoolingPoints: '입구·롤스크린·세차 출구',
        rainDrainageMinMinutes: 0,
        rainDrainageMaxMinutes: 60,
        rainRouteRisk: true,
        rainEquipmentRisk: '전기·방수 점검',
        rainPriorityActions: ['입구 배수 확인', '전기함 방수 확인'],
        source: 'https://example.invalid/internal',
        updatedAt: '2026-07-22T09:10:00+09:00'
      }
    }],
    weatherSignal: {
      mode: 'shadow',
      stores: [{
        storeId: 'hanam',
        storeName: '하남 미사',
        status: 'Yellow',
        riskType: '강수',
        siteVulnerability: { windPriorityActions: ['롤스크린 고정'] }
      }]
    }
  });
  const store = normalized.stores[0];
  assert.equal(normalized.buildId, '2026-07-22-sheet-handoff-date-ux.11');
  assert.equal(store.siteVulnerability.provided, true);
  assert.equal(store.siteVulnerability.rainPoolingPoints, '입구·롤스크린·세차 출구');
  assert.deepEqual([...store.siteVulnerability.windPriorityActions], ['롤스크린 고정']);
  assert.equal(api.formatRainDrainage(0, 60), '최대 60분');
  assert.equal(api.siteVulnerabilityDetailRows(store).some((row) => String(row.value).includes('example.invalid')), false);
});

test('현장 취약정보 계약 누락은 정상 0건이 아니라 배포 확인 경고로 분리한다', () => {
  const { api } = loadDashboardLogic();
  const store = api.normalizeStore({ storeId: 'hanam', storeName: '하남 미사', prodStatus: 'Green' }, {
    hanam: { storeId: 'hanam', status: 'Yellow', riskType: '강수' }
  });
  api.state.data = { stores: [store], system: {}, summary: {}, weatherSignal: {} };
  assert.equal(store.siteVulnerability.provided, false);
  assert.match(api.siteVulnerabilityContractText(), /0\/1개점 수신/);
  assert.equal(api.siteVulnerabilityContractWarning(), '현장 취약정보 계약 0/1개점 수신');
});

test('현장 취약정보는 관련 기상 신호에서만 요약과 최대 두 개 조치로 노출한다', () => {
  const { api } = loadDashboardLogic();
  const siteVulnerability = api.normalizeSiteVulnerability({
    rainPoolingPoints: '출구 동선',
    rainDrainageMinMinutes: 0,
    rainDrainageMaxMinutes: 60,
    rainRouteRisk: true,
    rainPriorityActions: ['출구 배수 확인', '진입 동선 통제', '전기 설비 방수 확인'],
    windPriorityActions: ['스피드도어 고정']
  });
  const green = { signalStatus: 'Green', signalRiskType: '-', weatherValues: {}, enhancedSignal: {}, siteVulnerability };
  const rain = { signalStatus: 'Yellow', signalRiskType: '강수', weatherValues: {}, enhancedSignal: {}, siteVulnerability };
  const wind = { signalStatus: 'Yellow', signalRiskType: '강풍', weatherValues: {}, enhancedSignal: {}, siteVulnerability };
  assert.equal(api.siteVulnerabilityContext(green).visible, false);
  assert.equal(api.siteVulnerabilityContext(rain).visible, true);
  assert.equal(api.siteVulnerabilityContext(rain).actions.length, 2);
  assert.match(api.siteVulnerabilityContext(rain).summary, /출구 동선/);
  assert.deepEqual([...api.siteVulnerabilityContext(wind).actions], ['스피드도어 고정']);
});

test('현장 취약정보 집계와 레이더 대체자료 범위를 사람이 이해하는 표현으로 분리한다', () => {
  const { api } = loadDashboardLogic();
  const stores = [
    {
      siteVulnerability: api.normalizeSiteVulnerability({
        rainPoolingPoints: '입구',
        rainRouteRisk: true,
        rainEquipmentRisk: '전기 설비 점검',
        rainPriorityActions: ['분전반 방수 확인']
      }),
      enhancedSignal: api.normalizeEnhancedSignal({
        radarRainRate: 0,
        radarSpatialScope: 'province_fallback',
        radarFallbackUsed: true,
        sourceErrors: ['AWS 응답 실패']
      }),
      signalSourceStatus: 'ok',
      signalSourceError: ''
    },
    {
      siteVulnerability: api.normalizeSiteVulnerability({}),
      enhancedSignal: api.normalizeEnhancedSignal({ radarRainRate: 0, radarSpatialScope: 'store' }),
      signalSourceStatus: 'ok',
      signalSourceError: ''
    }
  ];
  const counts = Object.fromEntries(api.siteVulnerabilitySummaryRows(stores).map((row) => [row.id, row.count]));
  assert.deepEqual(counts, { rain: 1, route: 1, equipment: 1, radarFallback: 1, sourceError: 1 });
  assert.equal(api.humanizeRadarSpatialScope('province_fallback'), '시·도 광역 대표 자료');
  assert.equal(api.humanizeRadarSpatialScope('district_fallback'), '시·군·구 대표 자료');
  assert.equal(api.humanizeRadarSpatialScope('store'), '지점 인근 자료');
  assert.equal(api.humanizeRadarFallbackType('province'), '시·도 광역 대표 자료');
});

test('마케팅 상태는 기한으로 중복 표기하지 않는다', () => {
  const { api } = loadDashboardLogic();
  api.state.store = 'all';
  const html = api.renderActionList([
    { store: '광명점', action: '회복 메시지 승인 검토', status: '승인 대기' }
  ], '마케팅팀', 'marketing');
  assert.match(html, /기한 -/);
  assert.match(html, /상태 승인 대기/);
  assert.doesNotMatch(html, /기한 승인 대기/);
});

test('enhancedSignal 미제공은 AWS와 레이더를 정상으로 추정하지 않는다', () => {
  const { api } = loadDashboardLogic();
  api.state.data = {
    summary: {},
    stores: [{
      name: '서울 성수',
      signalSourceError: '대기질 조회 실패: 에어코리아 PM10/PM2.5 측정값 없음: 성동구',
      signalSourceWarnings: '',
      enhancedSignal: { available: false },
      weatherValues: {
        observedRain1h: 0.5,
        observedAt: '2026-07-21T14:00:00+09:00',
        forecastMaxPop: 70,
        forecastBaseAt: '2026-07-21T14:00:00+09:00'
      }
    }],
    weatherSignal: {
      mode: 'prod',
      generatedAt: new Date().toISOString(),
      overallStatus: 'Yellow',
      summary: { watch: 1 },
      stores: [{ storeId: 'seongsu', status: 'Yellow' }]
    },
    system: { decisionReadiness: 'prod_ready' }
  };
  const rows = api.weatherSourceRows();
  assert.equal(rows.find((row) => row.id === 'aws').value, '계약 미제공');
  assert.equal(rows.find((row) => row.id === 'radar').value, '계약 미제공');
  assert.equal(rows.find((row) => row.id === 'warning').value, '계약 미제공');
  assert.match(rows.find((row) => row.id === 'air').value, /부분 오류/);
  assert.equal(api.decisionReadinessLabel(), '운영 판단 가능 · prod');
  assert.match(api.decisionReadinessHelpText(), /AWS·레이더 신규 원천 검증 완료를 의미하지 않/);
});

test('해제 특보는 활성 경보로 표시하지 않고 최근 해제로만 보조 표기한다', () => {
  const { api } = loadDashboardLogic();
  api.state.data = {
    summary: {},
    stores: [{
      name: '고양 삼송',
      signalSourceError: '',
      signalSourceWarnings: '',
      weatherValues: { observedRain1h: 0, observedAt: '2026-07-21T14:00:00+09:00', forecastMaxPop: 60, forecastBaseAt: '2026-07-21T14:00:00+09:00', pm10: 20 },
      enhancedSignal: api.normalizeEnhancedSignal({
        validationMode: 'shadow',
        sourceStatus: 'error',
        weatherWarningSummary: '호우주의보 해제',
        weatherWarningIssuedAt: '2026-07-21T13:10:00+09:00',
        weatherWarningActiveSevere: false,
        operationalImpact: 'none_validation_only'
      })
    }],
    weatherSignal: { mode: 'prod', generatedAt: '2026-07-21T15:00:00+09:00', overallStatus: 'Yellow', summary: { watch: 1 }, stores: [{ storeId: 'goyang', status: 'Yellow' }] },
    system: { decisionReadiness: 'prod_ready' }
  };
  const warning = api.weatherSourceRows().find((row) => row.id === 'warning');
  assert.equal(warning.value, '조회 정상 · 활성 특보 없음');
  assert.match(warning.meta, /최근 해제 13:10/);
});

test('회복 집계는 성과 대기를 현재 조치 건수에 합산하지 않는다', () => {
  const { api } = loadDashboardLogic();
  api.state.data = {
    summary: { immediateCount: 0, asBlockedCount: 0, recoveryActionCount: 49, dataWaitCount: 7, crmReadyCount: 27 },
    stores: [{ status: 'Green', prodStatus: 'Green', asStatus: '정상', recoveryStatus: '회복 조치 필요', customerNoticeStatus: '안내 완료' }],
    weatherSignal: { mode: 'prod', generatedAt: new Date().toISOString(), overallStatus: 'Green', summary: { normal: 1 }, stores: [{ storeId: 'store', status: 'Green' }] },
    recovery: {},
    system: { decisionReadiness: 'prod_ready' }
  };
  const recoveryCard = api.missionCards()[3];
  assert.equal(recoveryCard.value, '49건 후보');
  assert.match(recoveryCard.note, /성과 해석 대기 7/);
  assert.match(recoveryCard.note, /CRM 후보 27/);
});

test('오늘 공식 조치와 과거 미종결 예외를 분리한다', () => {
  const { api } = loadDashboardLogic();
  api.state.store = 'all';
  api.state.data = {
    overdueExceptions: [],
    system: { operatingEfficiency: { todayOpenCount: 0, historicalOverdueCount: 7 } }
  };
  assert.match(api.renderActionList([], '사업운영팀', 'operations'), /오늘 공식 미완료 조치가 없습니다/);
  const overdue = api.historicalOverdueSummary();
  assert.equal(overdue.count, 7);
  assert.equal(overdue.scope, '전체 지점 집계 기준');
});

test('시스템 비차단 경고 상세를 payload 메시지로 노출한다', () => {
  const { api } = loadDashboardLogic();
  api.state.data = {
    summary: {},
    system: {
      systemWarnings: [{ severity: 'WARN', source: 'sendWeatherOpsSummary', message: '광명점 대기질 조회 확인 필요' }]
    }
  };
  assert.match(api.systemIssueSummary('warning', 1), /WARN \/ sendWeatherOpsSummary \/ 광명점 대기질 조회 확인 필요/);
});

test('기대 버전은 환경변수 설정 시에만 고정 비교한다', () => {
  const proxySource = fs.readFileSync(path.join(ROOT, 'api', 'weather-ops-data.js'), 'utf8');
  assert.match(proxySource, /WEATHER_OPS_EXPECTED_VERSION \|\| ''/);
  assert.doesNotMatch(proxySource, /WEATHER_OPS_EXPECTED_VERSION \|\| 'v2\.16\.4'/);
  assert.match(proxySource, /buildId: data\.buildId \|\| data\.build_id/);
  assert.match(proxySource, /overdueExceptions: arrayOrEmpty/);
  assert.match(proxySource, /v2\.16\.4-weather-signal\.2/);
  assert.match(proxySource, /2026-07-22-sheet-handoff-date-ux\.11/);
});

test('Command Center 게이트 상태는 긴 원문을 운영 판단용 표현으로 축약한다', () => {
  const { api } = loadDashboardLogic();
  assert.deepEqual(
    { ...api.compactAsStatus({ asStatus: '정상화 대기', normalizationBlocker: '부품 입고 대기' }) },
    { label: '차단·대기', className: 'blocked' }
  );
  assert.deepEqual(
    { ...api.compactAsStatus({ asStatus: '정상' }) },
    { label: '정상', className: 'clear' }
  );
  assert.deepEqual(
    { ...api.compactRecoveryStatus({ recoveryStatus: '회복 조치 필요' }) },
    { label: '관찰', className: 'watch' }
  );
  assert.deepEqual(
    { ...api.compactRecoveryStatus({ recoveryStatus: '대상 없음' }) },
    { label: '대상 없음', className: 'clear' }
  );
});

test('강수 비교는 현재 실황과 예보 최대값 및 피크를 분리한다', () => {
  const { api } = loadDashboardLogic();
  const row = api.weatherComparisonRow({
    id: 'hanam',
    name: '하남 미사',
    weatherData: { observedRain1h: 1.5, forecastMaxPcp1h: 12, forecastPeakTime: '17:00' },
    weatherValues: {}
  });
  assert.equal(row.current, 1.5);
  assert.equal(row.forecast, 12);
  assert.equal(row.peak, '17:00');
  assert.equal(api.weatherComparisonSummary({
    id: 'hanam',
    name: '하남 미사',
    weatherData: { observedRain1h: 1.5, forecastMaxPcp1h: 12, forecastPeakTime: '17:00' },
    weatherValues: {}
  }), '현재 1.5mm/h · 예보 최대 12mm/h · 피크 17:00');
});
