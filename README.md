# AUTOSTAY [OPS] Weather Ops Dashboard

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
| `DASHBOARD_TOKEN` | 대시보드 접근 토큰. 32자 이상 랜덤 문자열 권장 |

실데이터 연결 시 필수:

| 변수 | 설명 |
| --- | --- |
| `WEATHER_OPS_API_URL` | Apps Script Web App URL |

선택:

| 변수 | 설명 |
| --- | --- |
| `COOKIE_KEY` | 인증 쿠키 키. 기본값은 `weather_ops_auth` |
| `SESSION_SECRET` | 운영 권장. 인증 세션 쿠키 HMAC 서명 키. `DASHBOARD_TOKEN`과 다른 32자 이상 랜덤 문자열 권장 |
| `AUTH_RATE_LIMIT_MAX_ATTEMPTS` | 로그인 실패 제한 횟수. 기본값은 10분당 8회 |
| `AUTH_RATE_LIMIT_WINDOW_MS` | 로그인 실패 제한 윈도우. 기본값은 600000ms |
| `WEATHER_OPS_API_TOKEN` | Apps Script API에 `token` 쿼리로 전달할 공유 토큰 |
| `WEATHER_OPS_EXPECTED_VERSION` | 대시보드가 기대하는 Weather Ops Pack 버전. 기본값은 `v2.16.4` |
| `WEATHER_OPS_ALLOW_SAMPLE` | 샘플 데이터 표시 여부. 운영 기본값은 `false`, 데모/개발 검토 때만 `true` |

Apps Script 속성:

| 속성 | 설명 |
| --- | --- |
| `WEATHER_OPS_DASHBOARD_TOKEN` | `WEATHER_OPS_API_TOKEN`과 같은 값으로 입력. Apps Script 대시보드 API 호출을 보호 |

## 데이터 연결 방식

현재 프론트는 `/api/weather-ops-data`만 호출합니다.

`api/weather-ops-data.js`는 아래 순서로 동작합니다.

1. `WEATHER_OPS_API_URL`이 있으면 Apps Script Web App을 호출합니다.
2. 호출 URL에는 자동으로 `mode=dashboard`가 붙습니다.
3. `WEATHER_OPS_API_TOKEN`이 있으면 `token=...`도 함께 붙습니다.
4. Apps Script가 `error` JSON을 반환하면 대시보드 API 오류로 처리합니다.
5. Apps Script 응답을 대시보드 표준 payload로 정규화합니다.
6. API가 없거나 실패하면 기본적으로 오류를 표시합니다. `WEATHER_OPS_ALLOW_SAMPLE=true`를 명시한 경우에만 샘플 데이터로 화면을 표시합니다.

운영에서는 `WEATHER_OPS_ALLOW_SAMPLE=false`를 유지해야 데이터 연결 실패가 숨겨지지 않습니다.

## 기대 Apps Script 응답 형태

Apps Script Web App은 대략 아래 JSON을 반환하면 됩니다.

```json
{
  "version": "v2.16.4",
  "generatedAt": "2026-06-25T09:10:00+09:00",
  "summary": {
    "overallStatus": "Orange",
    "immediateCount": 3,
    "watchCount": 4,
    "asBlockedCount": 1,
    "recoveryActionCount": 2,
    "crmReadyCount": 2,
    "dataWaitCount": 1,
    "systemError24h": 0,
    "headline": "강수 리스크로 3개 지점 즉시 확인"
  },
  "stores": [
    {
      "id": "sample-east",
      "name": "샘플 동부점",
      "region": "샘플 동부권",
      "dri": "운영 담당 B",
      "status": "Orange",
      "weather": "강한 비",
      "weatherDetail": "피크 전 강수 집중 가능",
      "trigger": "강수",
      "weatherData": {
        "pop": 80,
        "pcp": 4,
        "peakTime": "16:00",
        "weatherBaseAt": "2026-06-25T08:00:00+09:00",
        "levels": {
          "pop": "Orange",
          "pcp": "Orange"
        }
      },
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
    "storeSeries": {
      "sample-east": {
        "processedRate": [68, 82, 91],
        "revenueRate": [61, 78, 87]
      }
    },
    "queue": []
  },
  "visuals": {
    "statusDistribution": [{ "status": "Orange", "count": 3 }],
    "riskMatrix": [],
    "recoveryFunnel": [
      { "key": "detected", "label": "하락 감지", "count": 3 },
      { "key": "asBlocked", "label": "AS 차단", "count": 1 }
    ],
    "recoveryGapByStore": [{ "storeId": "sample-east", "store": "샘플 동부점", "gap": 4 }],
    "processedBulletByStore": [],
    "systemTrend": [],
    "openActionTrend": []
  },
  "system": {
    "lastSummaryAt": "2026-06-25T09:10:00+09:00",
    "lastSummaryStatus": "sent",
    "summaryFreshnessLevel": "ok",
    "latestDueSummaryAt": "2026-06-25T09:10:00+09:00",
    "nextSummaryDueAt": "2026-06-25T16:30:00+09:00",
    "lastRevenueSyncAt": "2026-06-25T05:40:00+09:00",
    "appsScriptVersion": "v2.16.4",
    "dataFreshness": "실데이터",
    "freshnessWarnings": []
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
4. Environment Variables에 `DASHBOARD_TOKEN`, `SESSION_SECRET`을 등록합니다.
5. Apps Script Web App URL을 `WEATHER_OPS_API_URL`에 등록합니다.
6. Apps Script 속성에 `WEATHER_OPS_DASHBOARD_TOKEN`을 입력하고, Vercel의 `WEATHER_OPS_API_TOKEN`에도 같은 값을 등록합니다.
7. `WEATHER_OPS_ALLOW_SAMPLE=false`를 등록합니다.
8. 재배포 후 화면 상단 데이터 상태가 `실데이터 연결`인지 확인합니다.
9. 데모/개발 확인이 필요할 때만 별도 환경에서 `WEATHER_OPS_ALLOW_SAMPLE=true`를 임시 사용합니다.

로컬 Vercel CLI를 사용할 경우 `.vercel/project.json`이 다른 프로젝트를 가리키지 않도록 먼저 `autostay-weatherops-dashboard` 프로젝트로 다시 link한 뒤 배포합니다. 프로젝트 ID를 확인하지 못한 오래된 `.vercel/project.json`은 사용하지 않습니다.

## Payload 호환 메모

- Apps Script 응답은 직접 dashboard payload이거나 `dashboardPayload`, `dashboard_payload`, `payload`, `data`, `dashboard` wrapper 안에 있어도 수용합니다.
- `recovery.gapByStore` 또는 `recovery.gap_by_store`는 `visuals.recoveryGapByStore`와 동일한 회복 비교 데이터로 정규화됩니다.
- `recovery.bulletByStore` 또는 `recovery.bullet_by_store`는 `visuals.processedBulletByStore`와 동일한 처리대수 bullet 데이터로 정규화됩니다.
- `visuals.systemTrend`와 `visuals.openActionTrend`는 운영 추이 패널에서 함께 사용됩니다.
- `visuals.recoveryFunnel`의 AS 차단 항목은 `key: "asBlocked"` 또는 라벨 `AS 차단`으로 전달합니다. 대시보드는 이 항목을 CRM·재방문 전환율 계산에서 제외하고 별도 참고 지표로 표시합니다.
- `stores[].weatherData.peakTime`은 `HH:mm`, `HHmm`, `H시`, `시만`, ISO 날짜시간, 시트 시간값을 `HH:mm`으로 정규화합니다. `1899-12-30 00:00` 계열의 시트 잔여값은 `피크 미정`으로 표시합니다.
- `stores[].weatherData.weatherBaseAt`은 유효한 날짜시간만 `MM-DD HH:mm`으로 표시하고, 1899년 계열 sentinel 날짜는 화면에서 제외합니다.
- `generatedAt`이 없으면 현재 시각으로 대체하지 않고 `-`와 경고 배너로 표시합니다.
- 시간 포맷은 브라우저 로컬시간이 아니라 KST 기준으로 표시합니다.
- 연결된 Apps Script Web App 버전이 기대 버전과 다르면 시스템 상태와 상단 경고에 재배포 또는 `WEATHER_OPS_API_URL` 확인 필요 메시지를 표시합니다.

## 버전 불일치 경고 조치

대시보드에 `연결된 Apps Script Web App 배포본이 오래되었습니다` 경고가 뜨면 시트 탭 값을 수정하는 문제가 아닙니다.

우선순위는 아래 순서입니다.

1. Apps Script 편집기에서 `Code.gs`의 `SCRIPT_VERSION`이 기대 버전인지 확인합니다.
2. Apps Script `Deploy > Manage deployments`에서 현재 Web App 배포를 선택합니다.
3. 편집 화면에서 Version을 `New version`으로 바꾼 뒤 Deploy합니다.
4. 같은 Web App URL을 유지했다면 대시보드에서 새로고침합니다.
5. 새 Web App URL이 만들어졌다면 Vercel 환경변수 `WEATHER_OPS_API_URL`을 새 `/exec` URL로 교체하고 Production redeploy를 실행합니다.
6. 대시보드 `/api/weather-ops-data?fresh=1` 기준 응답의 `version`, `system.appsScriptVersion`, `system.expectedPackVersion`이 모두 같은지 확인합니다.

판단 기준:

- 대시보드 기대 버전만 낮음: `WEATHER_OPS_EXPECTED_VERSION` 또는 대시보드 코드 수정 대상
- 연결된 현재 버전만 낮음: Apps Script Web App 재배포 또는 `WEATHER_OPS_API_URL` 수정 대상
- 둘 다 최신인데 경고 유지: Vercel redeploy/cache 또는 다른 프로젝트 alias 연결 확인 대상

## 운영 화면 구성

- 상단: 전체 상태, 즉시 조치, 주의 관찰, AS 차단, 회복 조치, CRM 가능, 성과 대기, 시스템 오류
- 지점 현황: 7개 직영점 상태, DRI, 기상 수치, 다음 액션을 카드 스트립으로 표시
- 사업운영팀 액션: 안전, AS, 현장 준비, 정상화 게이트 중심
- 마케팅팀 액션: CRM, 쿠폰, 재방문 유도, 회복 수요 흡수 중심
- 선택 지점 회복률: 전체 보기에서는 중복 축소를 위해 숨기고, 지점 필터 선택 시 해당 지점의 처리대수/매출 회복 추이를 표시
- 회복 큐: 전체 보기에서는 선택 지점 회복률 자리까지 넓게 사용하고, CRM 가능 여부를 `가능`/`불가`/`대기` 칩으로 정규화해 다음 액션과 함께 표시
- 오늘 기상 리스크: 오늘 활성화된 기상/AS/회복 리스크만 라벨이 있는 격자로 표시
- 회복 실행 단계: 하락 감지 -> 조치 필요 -> 정상화 통과 -> CRM 후보 -> 발송/재방문 단계별 유지율과 이탈 건수. AS 차단은 전환 흐름이 아닌 별도 참고 지표로 표시
- 지점별 회복 진행: 7개 지점의 D-day/D+1/D+2 처리대수·매출 회복률을 히트맵으로 표시
- 처리대수 기준/실적 bullet: 100% 기준선을 고정하고 100% 초과분은 120% 스케일의 별도 구간으로 표시
- 처리대수 회복 vs 매출 회복: 처리대수 회복 대비 매출 회복 지연 지점을 덤벨형 비교로 표시
- 운영 시각화 레이아웃: `오늘 기상 리스크`, `회복 실행 단계`, `지점별 회복 진행`, `처리대수 회복 vs 매출 회복`을 2×2 명시 영역으로 배치
- 지점별 상태: 데스크톱은 표, 모바일은 카드형 목록으로 표시
- 시스템 상태: 마지막 요약, 매출 동기화, 시트/Pack 버전, 데이터 상태를 신선도 색상과 주의 신호로 표시
- 반응형 기준: 1100px 이하에서는 주요 영역을 단일 흐름으로 재배치하고, 720px 이하에서는 모바일 카드형 표와 단일 열 시각화로 전환합니다.
- 접근성 기준: 필터, 지점 카드, 새로고침, 요약 복사, 상세 dialog는 키보드 포커스가 보이도록 유지하고 상태 알림은 `aria-live`로 전달합니다.

## Apps Script 운영 메모

- `doGet(mode=dashboard)`는 정상 payload를 60초 동안 `CacheService`에 보관합니다.
- 대시보드 새로고침은 `/api/weather-ops-data?fresh=1`을 통해 Apps Script의 60초 캐시를 우회할 수 있습니다.
- 캐시는 인증 토큰 검증 후에만 사용하며, 인증 실패/오류 응답은 캐시하지 않습니다.
- `마지막 요약` 신선도는 단순 4시간 기준이 아니라 Apps Script의 09:10/16:30 종합 요약 스케줄과 45분 유예시간 기준으로 표시합니다.
- 운영 개시 전이거나 지점별 Webhook 미등록으로 운영 로그가 비어 있어도 Apps Script가 `Alert_Log`에 종합 요약 heartbeat를 남기면 `lastSummaryAt`이 갱신됩니다.
- `stores[].weatherData`는 최신 Action_Log의 구조화 컬럼(`weather_pop`, `weather_pcp`, `weather_wsd`, `weather_tmp_min`, `weather_tmp_max`, `weather_sno`, `weather_pm10`, `weather_pm25`, `weather_peak_time`, `weather_base_at`)을 우선 사용합니다.
- `stores[].weatherData.levels`는 Apps Script의 `RULES` 기준으로 계산된 칩별 위험등급입니다. 프론트는 이 값을 사용해 Green/Yellow/Orange/Red 색상을 표시합니다.
- 구조화 컬럼이 없는 과거 행은 호환용으로만 `weather_summary` 텍스트 fallback을 사용합니다.
- 대시보드 시각화용 `visuals` 필드는 Apps Script가 제공하면 그대로 사용하고, 없으면 프론트가 현재 `stores`/`recovery` 데이터로 보수 계산합니다.
- 실지도/레이더 고도화는 Store_Master의 `latitude`/`longitude` 및 기상 스냅샷 탭이 준비된 뒤 진행합니다.

## 보안 원칙

- 토큰은 코드에 저장하지 않습니다.
- `DASHBOARD_TOKEN`은 Vercel 환경변수로만 관리합니다.
- `SESSION_SECRET`은 별도 환경변수로 등록하는 것이 운영 기준입니다. 미설정 시 가용성 보호를 위해 `DASHBOARD_TOKEN` 기반 파생키를 사용하지만, 원 토큰을 그대로 세션 키로 쓰지 않습니다.
- 로그인 쿠키에는 원 토큰을 저장하지 않고 HMAC 서명 세션값만 저장합니다.
- 로그아웃은 `/api/auth?logout=1`에서 인증 쿠키를 즉시 삭제합니다. 전체 세션 무효화가 필요하면 `SESSION_SECRET` 또는 `DASHBOARD_TOKEN`을 교체하고 재배포합니다.
- `GET /api/auth?token=` 방식은 사용하지 않습니다.
- `/api/auth`는 기본적으로 IP 기준 10분당 8회 실패 후 일시 제한합니다.
- Chart.js CDN 스크립트는 고정 버전과 SRI 무결성 해시로 로드합니다.
- 운영 환경에서는 샘플 데이터 fallback을 켜지 않습니다.
- 샘플 payload는 실제 지점명이나 담당자명을 포함하지 않습니다.
- Apps Script API에 별도 토큰을 둘 경우 `WEATHER_OPS_API_TOKEN`을 사용합니다.
- 현재 CSP는 원격 이미지를 사용하지 않는 전제로 `img-src 'self' data:`만 허용합니다. 실지도/레이더 이미지 도입 시 필요한 타일/이미지 도메인만 명시적으로 추가합니다.
