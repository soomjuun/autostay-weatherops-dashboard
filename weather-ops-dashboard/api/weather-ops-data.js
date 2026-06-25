module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const apiUrl = process.env.WEATHER_OPS_API_URL;
  const apiToken = process.env.WEATHER_OPS_API_TOKEN || '';
  const allowSample = String(process.env.WEATHER_OPS_ALLOW_SAMPLE || 'true').toLowerCase() !== 'false';

  if (!apiUrl) {
    if (!allowSample) {
      return res.status(500).json({
        error: 'WEATHER_OPS_API_URL is not configured.',
        source: 'missing_config'
      });
    }
    return res.status(200).json(samplePayload('sample_no_api_url'));
  }

  try {
    const upstreamUrl = buildUpstreamUrl(apiUrl, apiToken);
    const upstream = await fetch(upstreamUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      redirect: 'follow'
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      throw new Error(`Apps Script HTTP ${upstream.status}: ${text.slice(0, 160)}`);
    }
    const parsed = JSON.parse(text);
    return res.status(200).json(normalizePayload(parsed, 'apps_script'));
  } catch (error) {
    if (!allowSample) {
      return res.status(502).json({
        error: 'Weather Ops upstream request failed.',
        detail: error && error.message ? error.message : String(error),
        source: 'upstream_error'
      });
    }
    const payload = samplePayload('sample_upstream_error');
    payload.system.apiWarning = error && error.message ? error.message : String(error);
    return res.status(200).json(payload);
  }
};

function buildUpstreamUrl(rawUrl, token) {
  const url = new URL(rawUrl);
  if (!url.searchParams.get('mode')) url.searchParams.set('mode', 'dashboard');
  if (token && !url.searchParams.get('token')) url.searchParams.set('token', token);
  return url.toString();
}

function normalizePayload(payload, source) {
  const now = new Date().toISOString();
  return {
    version: payload.version || 'unknown',
    generatedAt: payload.generatedAt || payload.generated_at || now,
    source,
    summary: payload.summary || {},
    stores: Array.isArray(payload.stores) ? payload.stores : [],
    opsActions: Array.isArray(payload.opsActions) ? payload.opsActions : payload.ops_actions || [],
    marketingActions: Array.isArray(payload.marketingActions) ? payload.marketingActions : payload.marketing_actions || [],
    recovery: payload.recovery || {},
    system: payload.system || {},
    weatherTimeline: Array.isArray(payload.weatherTimeline) ? payload.weatherTimeline : payload.weather_timeline || []
  };
}

function samplePayload(source) {
  const now = new Date();
  const iso = now.toISOString();
  const stores = [
    {
      id: 'ilsan',
      name: '일산 풍동',
      region: '고양/일산',
      dri: '장한샘 매니저',
      status: 'Yellow',
      weather: '비 예보',
      weatherDetail: '오후 강수 가능성 높음',
      trigger: '강수',
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
      id: 'hanam',
      name: '하남 미사',
      region: '하남',
      dri: '박준영 매니저',
      status: 'Orange',
      weather: '강한 비',
      weatherDetail: '피크 전 강수 집중 가능',
      trigger: '강수',
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
      id: 'goyang',
      name: '고양 삼송',
      region: '고양',
      dri: '추상민 매니저',
      status: 'Green',
      weather: '주의 낮음',
      weatherDetail: '운영 제한 요인 없음',
      trigger: '정상',
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
      id: 'jayuro',
      name: '자유로 88',
      region: '파주/고양',
      dri: '정진호 매니저',
      status: 'Yellow',
      weather: '비 예보',
      weatherDetail: '저녁 강수 가능',
      trigger: '강수',
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
      id: 'gwangmyeong',
      name: '광명점',
      region: '광명',
      dri: '안건후 매니저',
      status: 'Orange',
      weather: '비/대기질 주의',
      weatherDetail: '강수 후 미세먼지 완화 가능',
      trigger: '강수',
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
      id: 'seongsu',
      name: '서울 성수',
      region: '서울',
      dri: '한석태 매니저',
      status: 'Red',
      weather: '강수 집중',
      weatherDetail: '고객 동선 안전 확인 필요',
      trigger: '강수',
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
      id: 'anseong',
      name: '안성 석정',
      region: '안성',
      dri: '정찬희 매니저',
      status: 'Yellow',
      weather: '비 예보',
      weatherDetail: '신규점 기준 축적 중',
      trigger: '강수',
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
    version: 'sample-v0.1',
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
      headline: '강수 리스크로 3개 지점 즉시 확인, 2개 지점은 회복 수요 흡수 가능'
    },
    stores,
    opsActions: [
      { priority: 'P0', team: '사업운영팀', store: '서울 성수', action: 'AS 정상화 게이트 확인 전 고객 방문 유도 중지', owner: '사업운영팀', due: '즉시', status: '대기' },
      { priority: 'P0', team: '사업운영팀', store: '하남 미사', action: '피크 전 배수/건조존/대기열 준비 완료 여부 확인', owner: '박준영 매니저', due: '17:00', status: '진행중' },
      { priority: 'P1', team: '사업운영팀', store: '광명점', action: '회복 가능 시간대 처리량 확보 상태 점검', owner: '안건후 매니저', due: '17:00', status: '대기' }
    ],
    marketingActions: [
      { priority: 'P1', team: '마케팅팀', store: '하남 미사', action: 'D+1 오후 재방문 유도 캠페인 승인 검토', trigger: '비 이후 회복 수요', estimatedAudience: 420, status: '승인 대기' },
      { priority: 'P1', team: '마케팅팀', store: '광명점', action: '강수 종료 후 세차 수요 회복 메시지 준비', trigger: '강수 후 회복', estimatedAudience: 360, status: '초안 필요' }
    ],
    recovery: {
      labels: ['D-day', 'D+1', 'D+2'],
      processedRate: [72, 86, 93],
      revenueRate: [65, 81, 89],
      queue: [
        { store: '하남 미사', stage: 'D+1', status: '회복 조치 필요', processedRecoveryRate: 82, crmAllowed: 'Y', next: 'CRM 승인' },
        { store: '광명점', stage: 'D+1', status: '회복 조치 필요', processedRecoveryRate: 79, crmAllowed: 'Y', next: '쿠폰 금액 확정' },
        { store: '서울 성수', stage: 'D+1', status: 'AS 차단', processedRecoveryRate: 44, crmAllowed: 'N', next: '기술요청 링크/정상화 확인' }
      ]
    },
    system: {
      lastSummaryAt: iso,
      lastRevenueSyncAt: iso,
      appsScriptVersion: 'v2.13.4',
      dataFreshness: '샘플 데이터',
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
