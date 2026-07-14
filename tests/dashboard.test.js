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
  vm.runInNewContext(`${source}\n;globalThis.__dashboardTest = { state, dashboardHeadline, formatPeakTime, startAutoRefresh, missionCards, normalizeStore, hasActiveRecoveryData, primaryDashboardStatus, primaryDashboardStatusLabel, decisionReadiness, decisionReadinessClass, operationalDataStatusClass };`, context);
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
  assert.match(html, /data-risk="Error">오류<\/button>/);
  assert.match(html, /data-risk="Red">제한확인<\/button>/);
  assert.match(html, /data-risk="Orange">조치<\/button>/);
  assert.match(html, /data-risk="Yellow">주의<\/button>/);
  assert.match(html, /data-risk="Green">정상<\/button>/);
  assert.match(html, /data-risk="Gray">신호대기<\/button>/);
  assert.match(html, /CS\/고객/);
  assert.match(html, /app\.js\?v=2026-07-14-1/);
  assert.match(html, /style\.css\?v=2026-07-14-1/);
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

  const covered = api.normalizeStore(
    { store_id: 'ilsan', store_name: '일산 풍동', status: 'Green' },
    { ilsan: { status: 'Green', mode: 'shadow', observedAt: '2026-07-14T09:15:00+09:00' } }
  );
  assert.equal(covered.status, 'Green');
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
  assert.match(cards[2].note, /고객 안내 지표 없음/);
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

test('기대 버전은 환경변수 설정 시에만 고정 비교한다', () => {
  const proxySource = fs.readFileSync(path.join(ROOT, 'api', 'weather-ops-data.js'), 'utf8');
  assert.match(proxySource, /WEATHER_OPS_EXPECTED_VERSION \|\| ''/);
  assert.doesNotMatch(proxySource, /WEATHER_OPS_EXPECTED_VERSION \|\| 'v2\.16\.4'/);
});
