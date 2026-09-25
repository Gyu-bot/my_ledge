# 토스 연동 UI QA 결과

- 대상: `http://127.0.0.1:5275/data/settings`
- 환경: backend 8675 isolated synthetic data
- 화면: 데스크톱 1280x900, 모바일 390x844
- 결과: 핵심 플로우 통과

## 검증 결과

- 초기 상태: API 키 `설정됨`, 계좌 연결 `미확인`, 단일계좌 확인 체크박스 기본 미선택 확인.
- 최신 체크 문구에서 `국내·미국 주식(ETF 포함)만 있습니다` 확인.
- 체크 없이 새로고침: 보유 2건 조회, 연결 미확인, 합산 제외 안내, 60초 쿨다운 확인.
- 쿨다운 종료 후 확인 체크 및 재조회: 계좌 연결 `확인됨`, 보유 2건 확인.
- 투자 기본 소스를 토스증권 API로 선택하고 `변경 미리보기` 후 `확인 후 소스 적용`. 재로드 후 설정 유지 확인.
- 선택 투자 평가액 `₩360,000` 확인. API 항목은 국내주식 `₩100,000`, 미국주식 환산액 `₩260,000`으로 합계가 일치함.
- 확정 순자산 `₩1,300,000` 유지 확인.
- 추정 순자산은 `산출 불가`로 표시되며, 예수금 또는 자산 교체 범위 미확인 시 총액을 표시하지 않는 안전 문구 확인.
- `조회 시각 (평가시각 미제공)` 표시 확인.
- UTC 수정 재검증: 상태 패널 최근 조회/수집 시각과 SourceSelectionDetails가 모두 `2026. 09. 24. 23:11 KST`로 일치함.
- 모바일 390: 문서 폭 390, `scrollWidth` 390. 루트 가로 오버플로 및 콘텐츠 잘림 없음. 데이터 하위 메뉴만 의도된 가로 스크롤임.
- 데스크톱 1280: 루트 및 main 가로 오버플로 없음.

## 제한

- 키 미설정, 401, partial UI route mock은 브라우저 하네스에서 `page.route`가 제공되지 않아 미실행. 실제 서버 환경은 변경하지 않음.
- child iframe locator 단독 캡처가 `Invalid parameters`로 실패해 전체 뷰 정확 폭 clip 캡처와 DOM/API 증거로 대체함.
- 코드 수정, 1Password, 실 외부 API 접근 없음.

## 주요 증적

- `01-desktop-1280-initial-configured.png`
- `02-desktop-unconfirmed-refresh-cooldown.png`
- `03-desktop-preview-holdings-networth.png`
- `07-desktop-1280-assets-safety.png`
- `08-final-desktop-settings-utc-fixed.png`
- `09-final-mobile-settings-utc-fixed.png`
- `10-final-mobile-source-details-utc-fixed.png`
- `11-dom-api-evidence.json`
