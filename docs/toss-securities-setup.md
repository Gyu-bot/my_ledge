# 토스증권 API 실행 설정

기존 1Password `Personal` 볼트의 `토스증권 API` 항목을 그대로 사용한다. 별도 Developer Environment나 `.env` 마운트는 필요하지 않다. 실행 스크립트가 1Password CLI의 `op run`으로 값을 조회해 백엔드 프로세스의 환경변수에만 주입한다. 저장소의 `.env`에 비밀 값을 복사하지 않는다.

| 백엔드 환경변수 | 기본 1Password 필드 | 용도 |
|---|---|---|
| `TOSS_CLIENT_ID` | `자격 증명` | 토스증권에서 발급한 Client ID |
| `TOSS_CLIENT_SECRET` | `Secret Key` | 토스증권에서 발급한 Client Secret |

필드 이름만으로 의미를 보장할 수는 없다. 기존 항목의 `자격 증명`이 Client ID이고 `Secret Key`가 Client Secret인지 소유자가 확인해야 한다. 두 값이 모두 있어야 연동할 수 있으며, 빈 문자열은 미설정으로 처리한다. Settings 표현과 JSON 직렬화에서는 값을 숨긴다.

## 로컬 실행

1. 1Password CLI `op`와 Python 3를 준비하고 데스크톱 앱의 CLI 연동을 활성화한다. 실행 시 볼트 접근 승인이 표시될 수 있다.
2. 토스증권 WTS의 Open API 설정에서 **백엔드가 인터넷에 접속하는 공인 IP**를 허용 IP로 등록한다. 등록되지 않은 IP의 호출은 실패한다.
3. 저장소 루트의 기존 `.env`에 필요한 `DATABASE_URL`, `API_KEY` 등 앱 설정을 준비하고 DB 마이그레이션을 적용한다. Toss 비밀 값은 넣지 않는다.
4. 사용 중인 서비스와 포트를 먼저 확인한 후 저장소 루트에서 실행한다.

```sh
./scripts/toss-with-1password.sh uv --directory backend run uvicorn app.main:app --host 127.0.0.1 --port 8675
```

이 스크립트는 전달받은 명령과 인수를 그대로 실행한다. 명령이 없으면 실패하며 문자열을 `eval`하지 않는다. `op run`은 한글이 포함된 참조를 처리하지 못하므로, 먼저 기존 항목을 이름으로 찾아 볼트·항목·필드의 ASCII ID로 참조를 구성한다. 이 과정의 항목 응답은 메모리에서만 처리하며 출력하거나 파일로 저장하지 않는다. 필요한 필드가 없거나 중복되면 실행을 중단한다.

기본 항목 대신 다른 필드를 사용하려면 `TOSS_CLIENT_ID_REF`, `TOSS_CLIENT_SECRET_REF`에 ASCII 이름 또는 ID로 구성한 `op://볼트/항목/필드` 참조를 지정한다. 둘 다 지정하면 기본 항목을 조회하지 않는다. 하나만 지정하면 나머지만 기본 항목에서 찾는다. 참조에는 비밀 값 대신 경로만 넣는다.

셸 추적(`set -x`), 환경변수 덤프, 자격 증명이나 토큰이 들어가는 요청 로그를 사용하지 않는다. 키를 명령 인수나 프론트엔드의 `VITE_*` 변수에 넣지 않는다. 단위 테스트와 모의 API 테스트에는 실제 키가 필요하지 않다.

## 실행 범위와 서버 배포

동일한 Client ID로 새 토큰을 발급하면 기존 토큰이 무효화될 수 있으므로, **키 하나당 백엔드 프로세스 하나만 실행**한다. 로컬과 casa에서 동시에 사용하거나 여러 Uvicorn worker로 실행하지 않는다. 백엔드는 메모리에서 토큰을 재사용하지만 서로 다른 프로세스 사이에는 공유하지 않는다.

Docker Compose는 `TOSS_CLIENT_ID`와 `TOSS_CLIENT_SECRET`을 backend 서비스에만 전달한다. 프론트엔드 빌드와 서비스에는 전달하지 않는다. 컨테이너 실행 환경에 주입된 값은 컨테이너 관리자에게 보일 수 있으므로 Compose 설정이나 컨테이너 환경을 로그로 출력하지 않는다.

casa의 1Password 인증 설정, 서비스 환경 연결, 배포 및 재시작은 별도 운영 작업이다. 로컬 CLI 접근이 확인됐다고 서버에도 자동으로 연결되지는 않는다. 이 문서나 실행 스크립트는 서버 설정을 변경하지 않는다.

## 데이터 의미

현재 연동 범위는 계좌와 보유 주식 조회다. 주문·이체는 실행하지 않는다. 외화 보유 주식의 원화 추정 평가는 조회한 환율의 `midRate`를 사용하며 예수금이나 손익을 완전한 계좌 총액으로 간주하지 않는다. 원천이 명확한 평가 시각을 제공하지 않는 경우 조회 시각을 대용으로 표시하므로 BankSalad 업로드의 평가 기준일과 같다고 해석하면 안 된다. 현금 범위가 확인되지 않으면 전체 순자산에서 BankSalad 계좌를 자동으로 완전히 대체할 수 없다.

참고: [1Password CLI 환경변수 주입](https://www.1password.dev/cli/secrets-environment-variables), [토스증권 Open API](https://developers.tossinvest.com/).
