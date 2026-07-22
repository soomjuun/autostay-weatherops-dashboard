import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = process.env.WEATHER_OPS_QA_OUTPUT
  || path.join(process.env.TEMP || process.env.TMP || ROOT, 'weather-ops-dashboard-qa');
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const now = '2026-07-22T10:00:00+09:00';
const storeSpecs = [
  {
    id: 'hanam-misa', name: '하남 미사', status: 'Yellow', riskType: '강수', rain: 8,
    site: {
      rainPoolingPoints: '입구·롤스크린·세차 출구', rainDrainageMinMinutes: 0, rainDrainageMaxMinutes: 60,
      rainRouteRisk: true, rainEquipmentRisk: '전기·방수 설비',
      rainPriorityActions: ['입구 배수구와 세차 출구 동선 확인', '전기함·롤스크린 방수 상태 확인'],
      windPriorityActions: ['롤스크린 고정 상태 확인']
    }
  },
  {
    id: 'gwangmyeong', name: '광명점', status: 'Yellow', riskType: '강풍', wind: 8.4,
    site: {
      rainPoolingPoints: '세차 출구', rainDrainageMinMinutes: 20, rainDrainageMaxMinutes: 45,
      rainRouteRisk: true, rainEquipmentRisk: '', rainPriorityActions: ['출구·진입 동선 확인'],
      windPriorityActions: ['스피드도어 고정과 수동 전환 상태 확인']
    },
    radarSpatialScope: 'province_fallback', radarFallbackUsed: true,
    fallbackNotices: ['레이더 광역 행정코드 대체 사용: 4100000000']
  },
  {
    id: 'goyang-samsong', name: '고양 삼송', status: 'Green', riskType: '-',
    site: {
      rainPoolingPoints: '건조기실 천장·조명', rainDrainageMinMinutes: 30, rainDrainageMaxMinutes: 60,
      rainRouteRisk: false, rainEquipmentRisk: '천장·조명 수분 유입',
      rainPriorityActions: ['건조기실 천장 누수 확인', '조명 전기 안전 확인'], windPriorityActions: []
    }, sourceErrors: ['AWS 응답 지연']
  },
  {
    id: 'seongsu', name: '서울 성수', status: 'Green', riskType: '-',
    site: {
      rainPoolingPoints: '출구 방향', rainDrainageMinMinutes: 15, rainDrainageMaxMinutes: 40,
      rainRouteRisk: true, rainEquipmentRisk: '고정 구조물', rainPriorityActions: ['출구 방향 동선 확인'],
      windPriorityActions: ['스피드도어와 고정 구조물 확인']
    }
  },
  {
    id: 'anseong-seokjeong', name: '안성 석정', status: 'Green', riskType: '-',
    site: {
      rainPoolingPoints: '보일러실·출구·입구', rainDrainageMinMinutes: 25, rainDrainageMaxMinutes: 50,
      rainRouteRisk: true, rainEquipmentRisk: '에어컨·고정물', rainPriorityActions: ['보일러실과 출입구 확인'],
      windPriorityActions: ['에어컨 실외기와 고정물 확인']
    }
  },
  {
    id: 'ilsan-pungdong', name: '일산 풍동', status: 'Green', riskType: '-',
    site: { rainPoolingPoints: '', rainDrainageMinMinutes: null, rainDrainageMaxMinutes: null, rainRouteRisk: false, rainEquipmentRisk: '미입력', rainPriorityActions: [], windPriorityActions: [] }
  },
  {
    id: 'yongin-suji', name: '용인 수지', status: 'Green', riskType: '-',
    site: { rainPoolingPoints: '', rainDrainageMinMinutes: null, rainDrainageMaxMinutes: null, rainRouteRisk: false, rainEquipmentRisk: '', rainPriorityActions: [], windPriorityActions: [] }
  }
];

const stores = storeSpecs.map((spec, index) => ({
  id: spec.id,
  name: spec.name,
  region: '수도권',
  dri: `담당 ${index + 1}`,
  prodStatus: 'Green',
  weather: spec.riskType === '-' ? '운영 정상' : spec.riskType,
  weatherDetail: spec.riskType === '-' ? '활성 기상 신호 없음' : `${spec.riskType} 현장 점검`,
  weatherValues: { forecastMaxPcp1h: spec.rain || 0, forecastMaxWind: spec.wind || 3, forecastBaseAt: now },
  trigger: spec.riskType,
  riskScore: spec.status === 'Yellow' ? 20 : 0,
  asStatus: '정상',
  customerNoticeStatus: '안내 불필요',
  customerImpact: '영향 없음',
  recoveryStatus: '대상 없음',
  crmReady: false,
  nextAction: spec.status === 'Yellow' ? '현장 사전점검' : '정상 운영 유지',
  siteVulnerability: { ...spec.site, source: 'https://example.invalid/internal', updatedAt: now }
}));

const signalStores = storeSpecs.map((spec, index) => ({
  storeId: spec.id,
  storeName: spec.name,
  status: spec.status,
  actionLevel: spec.status === 'Yellow' ? '사전점검' : '정상',
  riskType: spec.riskType,
  reason: spec.riskType === '-' ? '활성 기상 신호 없음' : `${spec.riskType} 신호 확인`,
  mode: 'shadow',
  observedAt: now,
  weatherValues: { forecastMaxPcp1h: spec.rain || 0, forecastMaxWind: spec.wind || 3, forecastBaseAt: now },
  siteVulnerability: { ...spec.site, source: 'https://example.invalid/internal', updatedAt: now },
  enhancedSignal: {
    validationMode: 'shadow',
    sourceStatus: spec.sourceErrors ? 'error' : (spec.radarFallbackUsed ? 'warning' : 'ok'),
    sourceErrors: spec.sourceErrors || [],
    fallbackNotices: spec.fallbackNotices || [],
    awsStationName: `${spec.name} 인근 AWS`, awsRain1h: spec.rain || 0, awsWind: spec.wind || 3, awsObservedAt: now,
    radarRainRate: spec.rain || 0, radarUnit: 'mm/h', radarObservedAt: now,
    radarSpatialScope: spec.radarSpatialScope || 'store', radarFallbackUsed: Boolean(spec.radarFallbackUsed),
    radarFallbackType: spec.radarSpatialScope === 'province_fallback' ? 'province' : '',
    weatherWarningSummary: '활성 중대특보 없음', weatherWarningActiveSevere: false,
    fusionStatus: index === 0 ? 'Orange' : 'Yellow', fusionReason: 'AWS·레이더 교차검증',
    operationalImpact: 'none_validation_only', managerInputRequired: false,
    validationPolicy: { affectsOperationalLevel: false }
  }
}));

const recoveryQueue = storeSpecs.slice(0, 6).map((spec, index) => ({
  storeId: spec.id,
  store: spec.name,
  status: '회복 조치 필요',
  stage: index % 2 === 0 ? 'D+1 회복 점검' : 'D+2 재조치 판단',
  processedRecoveryRate: -43 - index,
  revenueRecoveryRate: -17 - index,
  crmAllowed: true,
  nextAction: index % 2 === 0
    ? '사업운영팀 확인 후 고객 안내·피크 대응·장비 병목 중 원인별 추가 조치'
    : 'D+2까지 회복 미달 시 수요·처리량·장비·고객 안내 원인 분류'
}));

const marketingActions = storeSpecs.slice(0, 5).map((spec, index) => ({
  store: spec.name,
  priority: 'P1',
  action: '비 종료 후 차량 오염 제거·재방문 안내 검토',
  owner: '마케팅팀',
  due: index % 2 === 0 ? '16:30' : '10:30',
  approvalStatus: '승인 검토 후보'
}));

const payload = {
  version: 'v2.16.4',
  dashboardPayloadVersion: 'v2.16.4-weather-signal.2',
  buildId: '2026-07-22-sheet-handoff-date-ux.11',
  generatedAt: now,
  source: 'apps_script',
  summary: { overallStatus: 'Green', headline: '운영 원장은 정상이며 기상 사전점검 2개 지점입니다.', immediateCount: 0, asBlockedCount: 0, recoveryActionCount: 0, dataWaitCount: 0, crmReadyCount: 0 },
  stores,
  weatherSignal: { mode: 'shadow', generatedAt: now, observedAt: now, overallStatus: 'Yellow', summary: { totalStores: 7, normal: 5, watch: 2, actionRequired: 0, dataCheck: 0 }, stores: signalStores },
  recovery: { queue: recoveryQueue }, visuals: {}, opsActions: [], marketingActions, weatherTimeline: [],
  system: {
    scriptBuildId: '2026-07-22-sheet-handoff-date-ux.11',
    dashboardPayloadVersion: 'v2.16.4-weather-signal.2',
    decisionReadiness: 'prod_ready',
    summaryStatus: 'ok',
    salesSyncStatus: 'ok',
    operatingEfficiency: { todayOpenCount: 0, historicalOverdueCount: 7 }
  }
};

function contentType(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  return 'application/octet-stream';
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/api/check') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end('{"ok":true}');
    return;
  }
  if (url.pathname === '/api/weather-ops-data') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(payload));
    return;
  }
  if (url.pathname === '/favicon.ico') {
    res.writeHead(204).end();
    return;
  }
  const requested = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const file = path.resolve(ROOT, requested);
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': contentType(file) });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});

await fs.mkdir(OUTPUT, { recursive: true });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true, executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 1 });
const consoleErrors = [];
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
page.on('pageerror', (error) => consoleErrors.push(error.message));

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.getElementById('loadingOverlay')?.style.display === 'none');
  const desktop = await page.evaluate(() => ({
    viewport: [document.documentElement.clientWidth, window.innerHeight],
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    cards: document.querySelectorAll('.command-matrix-row').length,
    matrixColumns: document.querySelectorAll('.command-matrix-head > span').length,
    priorityItems: document.querySelectorAll('.priority-item').length,
    tabs: document.querySelectorAll('[role="tab"]').length,
    activePanel: document.querySelector('[data-tab-panel]:not([hidden])')?.dataset.tabPanel || '',
    summaryButtons: document.querySelectorAll('[data-vulnerability-filter]').length,
    vulnerabilityContract: document.getElementById('siteVulnerabilityContractStatus')?.textContent || '',
    sourceErrors: [...document.querySelectorAll('[data-vulnerability-filter]')].find((node) => node.dataset.vulnerabilityFilter === 'sourceError')?.textContent || '',
    sourceDecision: document.getElementById('sourceDecisionSummary')?.textContent || '',
    sourceHealth: document.getElementById('sourceHealthCompact')?.innerText || '',
    weatherComparisonRows: document.querySelectorAll('.weather-compare-row').length,
    opsActions: document.getElementById('opsActions')?.textContent || '',
    overdueExceptions: document.getElementById('overdueExceptions')?.textContent || ''
  }));
  await page.screenshot({ path: path.join(OUTPUT, '01-desktop-1440.png'), fullPage: true });

  await page.locator('.command-matrix-row[data-store="hanam-misa"]').click();
  const dialogText = await page.locator('#storeDialog').innerText();
  const dialogOpen = await page.locator('#storeDialog').evaluate((element) => element.open);
  const expandedWhileOpen = await page.locator('.command-matrix-row[data-store="hanam-misa"]').getAttribute('aria-expanded');
  await page.screenshot({ path: path.join(OUTPUT, '02-desktop-dialog.png'), fullPage: false });
  await page.locator('#dialogClose').click();
  const dialogReturn = await page.evaluate(() => ({
    expanded: document.querySelector('.command-matrix-row[data-store="hanam-misa"]')?.getAttribute('aria-expanded'),
    focusReturned: document.activeElement?.matches('.command-matrix-row[data-store="hanam-misa"]') === true
  }));

  await page.locator('#tab-data').click();
  const dataTabVisible = await page.locator('#panel-data').isVisible();
  await page.locator('[data-vulnerability-filter="route"]').click();
  const routeFilter = await page.evaluate(() => ({
    cards: document.querySelectorAll('.command-matrix-row').length,
    pressed: document.querySelector('[data-vulnerability-filter="route"]')?.getAttribute('aria-pressed'),
    activePanel: document.querySelector('[data-tab-panel]:not([hidden])')?.dataset.tabPanel || ''
  }));

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.getElementById('loadingOverlay')?.style.display === 'none');
  await page.locator('#tab-stores').click();
  const storeDensity = await page.evaluate(() => {
    const heights = (selector) => [...document.querySelectorAll(selector)].map((node) => Math.round(node.getBoundingClientRect().height));
    return {
      activePanel: document.querySelector('[data-tab-panel]:not([hidden])')?.dataset.tabPanel || '',
      actionCards: heights('.action-item'),
      tableRows: heights('#storeTable tr'),
      marketingColumns: getComputedStyle(document.getElementById('marketingActions')).gridTemplateColumns.split(' ').length
    };
  });
  await page.screenshot({ path: path.join(OUTPUT, '05-stores-density.png'), fullPage: true });

  await page.locator('#tab-recovery').click();
  const recoveryDensity = await page.evaluate(() => {
    const heights = (selector) => [...document.querySelectorAll(selector)].map((node) => Math.round(node.getBoundingClientRect().height));
    return {
      activePanel: document.querySelector('[data-tab-panel]:not([hidden])')?.dataset.tabPanel || '',
      queueHeader: heights('.queue-table-head'),
      queueRows: heights('.queue-item')
    };
  });
  await page.screenshot({ path: path.join(OUTPUT, '06-recovery-density.png'), fullPage: true });

  const responsive = [];
  let mobileTabs = {};
  for (const [name, width, height] of [['tablet', 768, 1100], ['mobile', 390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.getElementById('loadingOverlay')?.style.display === 'none');
    const metrics = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      cardCount: document.querySelectorAll('.command-matrix-row').length,
      activePanel: document.querySelector('[data-tab-panel]:not([hidden])')?.dataset.tabPanel || '',
      clippedText: [...document.querySelectorAll('.command-matrix-row, .source-health-panel, .toolbar')].some((node) => node.scrollWidth > node.clientWidth + 1)
    }));
    responsive.push({ name, ...metrics });
    await page.screenshot({ path: path.join(OUTPUT, name === 'tablet' ? '03-tablet-768.png' : '04-mobile-390.png'), fullPage: true });
    if (name === 'mobile') {
      await page.locator('#tab-stores').click();
      const storesMobile = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        actionColumns: getComputedStyle(document.getElementById('marketingActions')).gridTemplateColumns.split(' ').length,
        tableCards: document.querySelectorAll('#storeTable tr').length
      }));
      await page.screenshot({ path: path.join(OUTPUT, '07-mobile-stores.png'), fullPage: true });
      await page.locator('#tab-recovery').click();
      const recoveryMobile = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        queueRows: document.querySelectorAll('.queue-item').length,
        queueHeaderVisible: getComputedStyle(document.querySelector('.queue-table-head')).display !== 'none'
      }));
      await page.screenshot({ path: path.join(OUTPUT, '08-mobile-recovery.png'), fullPage: true });
      mobileTabs = { stores: storesMobile, recovery: recoveryMobile };
    }
  }

  const result = {
    baseUrl,
    desktop,
    dialog: {
      open: dialogOpen,
      expandedWhileOpen,
      ...dialogReturn,
      hasVulnerabilitySection: dialogText.includes('현장 취약정보'),
      drainageZeroHandled: dialogText.includes('최대 60분'),
      hasEnhancedDetails: dialogText.includes('AWS') && dialogText.includes('레이더') && dialogText.includes('검증 정책'),
      hidesSourceUrl: !dialogText.includes('example.invalid')
    },
    routeFilter: { dataTabVisible, ...routeFilter },
    density: { stores: storeDensity, recovery: recoveryDensity },
    mobileTabs,
    responsive,
    consoleErrors
  };
  console.log(JSON.stringify(result, null, 2));
  if (desktop.cards !== 7 || desktop.matrixColumns !== 8 || desktop.tabs !== 4 || desktop.activePanel !== 'overview') process.exitCode = 1;
  if (desktop.priorityItems < 1 || desktop.priorityItems > 3 || desktop.weatherComparisonRows !== 7) process.exitCode = 1;
  if (desktop.scrollHeight > desktop.viewport[1] * 2) process.exitCode = 1;
  if (desktop.summaryButtons !== 5) process.exitCode = 1;
  if (!desktop.vulnerabilityContract.includes('7/7개점 수신')) process.exitCode = 1;
  if (!desktop.sourceDecision.includes('Orange 1 / Yellow 6')) process.exitCode = 1;
  if (!desktop.sourceHealth.includes('운영 판단')) process.exitCode = 1;
  if (!desktop.opsActions.includes('오늘 공식 미완료 조치가 없습니다')) process.exitCode = 1;
  if (!desktop.overdueExceptions.includes('과거 미종결 예외 7건')) process.exitCode = 1;
  if (!dialogOpen || result.dialog.expandedWhileOpen !== 'true' || result.dialog.expanded !== 'false' || !result.dialog.focusReturned) process.exitCode = 1;
  if (!result.dialog.hasVulnerabilitySection || !result.dialog.drainageZeroHandled || !result.dialog.hidesSourceUrl) process.exitCode = 1;
  if (!result.routeFilter.dataTabVisible || result.routeFilter.activePanel !== 'overview') process.exitCode = 1;
  if (storeDensity.activePanel !== 'stores' || storeDensity.marketingColumns !== 3) process.exitCode = 1;
  if (!storeDensity.tableRows.length || Math.max(...storeDensity.tableRows) - Math.min(...storeDensity.tableRows) > 1) process.exitCode = 1;
  if (!storeDensity.actionCards.length || Math.max(...storeDensity.actionCards) - Math.min(...storeDensity.actionCards) > 1) process.exitCode = 1;
  if (recoveryDensity.activePanel !== 'recovery' || recoveryDensity.queueHeader[0] !== 44) process.exitCode = 1;
  if (!recoveryDensity.queueRows.length || Math.max(...recoveryDensity.queueRows) - Math.min(...recoveryDensity.queueRows) > 1) process.exitCode = 1;
  if (mobileTabs.stores?.scrollWidth > mobileTabs.stores?.clientWidth || mobileTabs.stores?.actionColumns !== 1 || mobileTabs.stores?.tableCards !== 7) process.exitCode = 1;
  if (mobileTabs.recovery?.scrollWidth > mobileTabs.recovery?.clientWidth || mobileTabs.recovery?.queueRows !== 6 || mobileTabs.recovery?.queueHeaderVisible) process.exitCode = 1;
  if (responsive.some((item) => item.scrollWidth > item.clientWidth || item.clippedText)) process.exitCode = 1;
  if (consoleErrors.length) process.exitCode = 1;
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
