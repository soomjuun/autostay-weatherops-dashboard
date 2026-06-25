# AUTOSTAY Weather Ops Dashboard

Weather Ops Pack의 기상 리스크, 현장 조치, AS 정상화, 회복 수요, 사업운영팀/마케팅팀 액션을 한 화면에서 보는 내부 운영 대시보드입니다.

## 목적

- Slack 알림의 휘발성을 보완합니다.
- Google Sheet 원장을 운영 지휘용 화면으로 재구성합니다.
- 사업운영팀은 안전/가동률/AS/DRI 조치를 확인합니다.
- 마케팅팀은 CRM/쿠폰/재방문 유도 가능 지점을 확인합니다.
- D+1/D+2 회복률은 처리대수를 1차 지표, 매출을 보조 지표로 표시합니다.

## 구성

```text
weather-ops-dashboard/
├─ index.html
├─ style.css
├─ app.js
├─ middleware.js
├─ vercel.json
├─ package.json
├─ .env.example
├─ .gitignore
└─ api/
   ├─ auth.js
   ├─ check.js
   └─ weather-ops-data.js
```

## Vercel 환경변수

필수:

| 변수 | 설명 |
| --- | --- |
| `DASHBOARD_TOKEN` | 대시보드 접근 토큰 |

실데이터 연결 시 필수:

| 변수 | 설명 |
| --- | --- |
| `WEATHER_OPS_API_URL` | Apps Script Web App URL |

선택:

| 변수 | 설명 |
| --- | --- |
| `COOKIE_KEY` | 인증 쿠키 키. 기본값은 `weather_ops_auth` |
| `WEATHER_OPS_API_TOKEN` | Apps Script API에 `token` 쿼리로 전달할 공유 토큰 |
| `WEATHER_OPS_ALLOW_SAMPLE` | API 미연결 시 샘플 데이터 표시 여부. 운영 연결 후 `false` 권장 |

## 데이터 연결 방식

현재 프론트는 `/api/weather-ops-data`만 호출합니다.

`api/weather-ops-data.js`는 아래 순서로 동작합니다.

1. `WEATHER_OPS_API_URL`이 있으면 Apps Script Web App을 호출합니다.
2. 호출 URL에는 자동으로 `mode=dashboard`가 붙습니다.
3. `WEATHER_OPS_API_TOKEN`이 있으면 `token=...`도 함께 붙습니다.
4. Apps Script 응답을 대시보드 표준 payload로 정규화합니다.
5. API가 없거나 실패했는데 `WEATHER_OPS_ALLOW_SAMPLE=true`이면 샘플 데이터로 화면을 표시합니다.

운영 연결 후에는 `WEATHER_OPS_ALLOW_SAMPLE=false`로 바꿔야 데이터 연결 실패가 숨겨지지 않습니다.

## 기대 Apps Script 응답 형태

Apps Script Web App은 대략 아래 JSON을 반환하면 됩니다.

```json
{
  "version": "v2.13.4",
  "generatedAt": "2026-06-25T09:10:00+09:00",
  "summary": {
    "overallStatus": "Orange",
    "immediateCount": 3,
    "watchCount": 4,
    "asBlockedCount": 1,
    "recoveryActionCount": 2,
    "crmReadyCount": 2,
    "systemError24h": 0,
    "headline": "강수 리스크로 3개 지점 즉시 확인"
  },
  "stores": [
    {
      "id": "hanam",
      "name": "하남 미사",
      "region": "하남",
      "dri": "박준영 매니저",
      "status": "Orange",
      "weather": "강한 비",
      "weatherDetail": "피크 전 강수 집중 가능",
      "trigger": "강수",
      "riskScore": 82,
      "openIssueCount": 2,
      "asStatus": "정상",
      "recoveryStatus": "회복 조치 필요",
      "crmReady": true,
      "nextAction": "17시 전 현장 준비 완료 후 D+1 재방문 유도 검토"
    }
  ],
  "opsActions": [],
  "marketingActions": [],
  "recovery": {
    "labels": ["D-day", "D+1", "D+2"],
    "processedRate": [72, 86, 93],
    "revenueRate": [65, 81, 89],
    "queue": []
  },
  "system": {
    "lastSummaryAt": "2026-06-25T09:10:00+09:00",
    "lastRevenueSyncAt": "2026-06-25T05:40:00+09:00",
    "appsScriptVersion": "v2.13.4",
    "dataFreshness": "실데이터"
  },
  "weatherTimeline": []
}
```

## GitHub 업로드

이 폴더 전체를 신규 GitHub 저장소 루트로 올리면 됩니다.

권장 저장소명:

```text
autostay-weather-ops-dashboard
```

## Vercel 연결 순서

1. GitHub에 `weather-ops-dashboard` 폴더 내용을 업로드합니다.
2. Vercel에서 신규 프로젝트를 생성하고 GitHub 저장소를 연결합니다.
3. Framework Preset은 `Other` 또는 자동 감지 상태로 둡니다.
4. Environment Variables에 `DASHBOARD_TOKEN`을 등록합니다.
5. 처음에는 `WEATHER_OPS_ALLOW_SAMPLE=true`로 배포해 화면을 확인합니다.
6. Apps Script Web App URL이 준비되면 `WEATHER_OPS_API_URL`을 등록합니다.
7. 실데이터 연결 확인 후 `WEATHER_OPS_ALLOW_SAMPLE=false`로 변경합니다.
8. 재배포합니다.

## 운영 화면 구성

- 상단: 전체 상태, 즉시 조치, 주의 관찰, AS 차단, 회복 조치, CRM 가능, 시스템 오류
- 지역 리스크 맵: 7개 직영점 상태를 Green/Yellow/Orange/Red로 표시
- 사업운영팀 액션: 안전, AS, 현장 준비, 정상화 게이트 중심
- 마케팅팀 액션: CRM, 쿠폰, 재방문 유도, 회복 수요 흡수 중심
- 회복률 차트: 처리대수 회복률과 매출 회복률 비교
- 회복 큐: CRM 가능 여부와 AS 차단 상태
- 시스템 상태: 마지막 요약, 매출 동기화, Apps Script 버전, 데이터 상태

## 보안 원칙

- 토큰은 코드에 저장하지 않습니다.
- `DASHBOARD_TOKEN`은 Vercel 환경변수로만 관리합니다.
- 운영 연결 후 샘플 데이터 fallback을 끕니다.
- Apps Script API에 별도 토큰을 둘 경우 `WEATHER_OPS_API_TOKEN`을 사용합니다.
