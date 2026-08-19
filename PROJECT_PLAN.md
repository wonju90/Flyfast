# ✈️ 실시간 항공권 예매 시스템 - 프로젝트 계획서

> 오픈런(선착순 몰림) 상황을 가정한 실시간 항공권 예매 서비스
> AWS 인프라(ASG + Bastion) 기반, 관리형 서비스(RDS/ElastiCache) 미사용, 직접 구축

> **문서 역할 안내**: 이 문서는 우리 계정(`379937169195`)에서 진행 중인 인프라의 **실제 작업 로그/체크리스트**다. 팀 공식 프로젝트 명세는 `Flyfast_프로젝트_명세서.md`를 참고하되, 그 문서의 6.3절 "배포 스냅샷"은 별도 팀원 계정(`738815760058`) 기준이므로 이 문서의 최신 값(VPC ID, Bastion IP 등)과 다를 수 있다.

---

## 1. 프로젝트 개요

| 항목 | 내용 |
|---|---|
| 프로젝트명 | Flyfast (인프라 리소스 prefix로 확정 사용 중 — 후보: FlightLock, SeatRush, 하늘길) |
| 목표 | 동시 접속자가 몰리는 상황에서도 좌석 중복 예매 없이 안정적으로 처리하는 항공권 예매 서비스 구축 |
| 핵심 시나리오 | 인기 노선 오픈 순간 트래픽 폭증 → ASG 자동 증설 → Valkey로 좌석 동시성 제어 |
| 배포 형태 | AWS EC2 기반, 관리형 DB/캐시 서비스(RDS, ElastiCache) 미사용 — 인스턴스에 직접 설치 |

---

## 2. 기술 스택

| 영역 | 기술 |
|---|---|
| 프론트엔드 | React |
| 웹 서버 / 리버스 프록시 | Nginx |
| 백엔드 API | FastAPI (Uvicorn) |
| 데이터베이스 | MySQL (MariaDB, EC2 직접 설치) |
| 캐시 / 동시성 제어 | Valkey (Redis 호환, EC2 직접 설치) |
| 인프라 | AWS EC2, ALB, Auto Scaling Group, VPC |
| IaC | Terraform |
| 인프라 접근 | Bastion Host + SSH (Agent Forwarding) |

---

## 3. 인프라 아키텍처

### 3-0. 구축 현황 (2026-08-14 기준)

- Terraform 코드 작성 및 `terraform validate` 통과 완료 — `provider.tf`, `values.tf`, `network.tf`, `key.tf`, `ec2.tf`, `output.tf` (상세 스펙: `Flyfast-plan.md`)
- **`terraform apply` 완료, AWS에 실제 리소스 프로비저닝됨** (`vpc_id: vpc-01016078a648a82a5`, 2026-08-18 재적용 기준). Bastion-a/c SSH 접속 확인 완료
  - bastion-a 퍼블릭 IP: `3.35.175.77`, bastion-c 퍼블릭 IP: `43.200.8.210`
  - 이전 destroy → 재apply로 VPC ID/Bastion IP가 바뀌었으므로, 앞으로 이 값들이 다시 바뀌면 이 문서도 함께 갱신할 것
  - **2026-08-18: redis-c, mysql-c 인스턴스 종료** — Redis/MySQL이 AZ마다 독립적으로 떠 있으면 좌석 락/예약 데이터가 AZ별로 갈라지는 split-brain 위험이 있어, redis-a·mysql-a 단일 인스턴스 체제로 단순화하기로 결정 (근거: 아래 3-2절, 4절 참고). 현재 총 8대(bastion-a/c, web-a/c, api-a/c, redis-a, mysql-a) 운영 중
- **역할 분담 확정**: VPC/서브넷/SG/Bastion + web·api·redis·mysql 고정 인스턴스는 **Terraform**이 계속 관리. **Auto Scaling Group(web 티어, api 티어)은 Terraform에 추가하지 않고 AWS 콘솔에서 직접 생성**하기로 결정 (아래 3-1 다이어그램 반영)
  - Terraform이 만든 `web-a/web-c`, `api-a/api-c` 고정 인스턴스는 **삭제하지 않고 참고·테스트용으로 유지**. 콘솔에서 만드는 ASG는 별도의 Launch Template으로 새 인스턴스를 띄우므로 이름/태그가 겹치지 않도록 주의 (예: ASG 인스턴스는 `Flyfast-web-asg-*` 형태로 구분)
  - `redis-a`(단일)는 캐시 서버 특성상 오토스케일링 대상이 아니므로 **Terraform 고정 인스턴스로만 유지**, ASG에 포함하지 않음
  - 콘솔에서 만드는 ASG 인스턴스는 Terraform이 만든 기존 `Flyfast-web-sg` / `Flyfast-api-sg`를 그대로 재사용 가능 (현재 인바운드가 `0.0.0.0/0`로 열려 있어 추가 SG 없이도 동작)

### 3-1. 네트워크 구성도 (VPC: 172.16.0.0/16, prefix: `Flyfast`)

```
        ap-northeast-2a                           ap-northeast-2c
        |                                          |
 [public01  172.16.0.0/24]                [public02  172.16.1.0/24]
 - bastion-a   172.16.0.10 (Public IP)    - bastion-c   172.16.1.10 (Public IP)
 - NAT GW-a                                - NAT GW-c
        |                                          |
 [front01   172.16.10.0/24]                [front02   172.16.11.0/24]
 - web-a     172.16.10.10 (Nginx)          - web-c     172.16.11.10 (Nginx)
        |                                          |
 [backend01 172.16.20.0/24]                [backend02 172.16.21.0/24]
 - api-a     172.16.20.10  (FastAPI)       - api-c     172.16.21.10  (FastAPI)
 - redis-a   172.16.20.100 (Valkey)        (redis 없음 — api-c도 redis-a를 원격 참조)
        |                                          |
 [db01      172.16.30.0/24]                [db02      172.16.31.0/24]
 - mysql-a   172.16.30.10                  (mysql 없음 — db02는 서브넷만 존재)
```

> **2026-08-18 변경**: redis-c, mysql-c 인스턴스를 종료했다. Redis/MySQL은 AZ마다 독립 인스턴스를 두면 좌석 락·예약 데이터가 갈라지는 위험이 있어(자세한 내용은 4절), 각각 단일 인스턴스로 단순화했다. backend02/db02 서브넷 자체는 향후 복제(Replica)나 재이중화를 대비해 그대로 남겨둔다.

> ALB가 없는 현재 단계에서는 web-sg가 인터넷에서 직접 80/443을 수신합니다. ALB 도입 시 web-sg 인바운드를 ALB 전용 SG로 제한할 예정입니다.

### 3-2. 서버 역할 요약 (Terraform 기준)

| 서브넷 | 인스턴스 | Private IP | Type | 설치 예정 소프트웨어 | 비고 |
|---|---|---|---|---|---|
| public01 | bastion-a | 172.16.0.10 | t3.micro | 없음 (SSH 전용) | Public IP 자동 할당 |
| public02 | bastion-c | 172.16.1.10 | t3.micro | 없음 (SSH 전용) | Public IP 자동 할당 |
| front01 | web-a | 172.16.10.10 | t3.small | Nginx | React 빌드 결과물 서빙 + `/api` 프록시 |
| front02 | web-c | 172.16.11.10 | t3.small | Nginx | React 빌드 결과물 서빙 + `/api` 프록시 |
| backend01 | api-a | 172.16.20.10 | t3.small | Python3, FastAPI, Uvicorn | |
| backend01 | redis-a | 172.16.20.100 | t3.small | Valkey | **단일 인스턴스**, api-a/api-c 공통 사용 |
| backend02 | api-c | 172.16.21.10 | t3.small | Python3, FastAPI, Uvicorn | redis-a를 원격으로 참조 |
| db01 | mysql-a | 172.16.30.10 | t3.small | MariaDB Server | **단일 인스턴스**, Primary/Replica 없음 |

> **결정 (2026-08-18)**: Valkey/MySQL을 AZ마다 독립 배치하면 ALB가 요청을 web-a/web-c 아무 쪽으로나 분산시킬 때 좌석 락과 예약 데이터가 AZ별로 갈라지는 split-brain 위험이 있다 (좌석 중복 판매 가능). 이를 막기 위해 원래 계획대로 **Valkey/MySQL을 각각 단일 인스턴스로 운영**하고, api-a/api-c 양쪽 모두 이 단일 인스턴스를 원격 참조한다. AZ 장애 격리는 이 두 컴포넌트에 대해서는 포기하는 대신, 나중에 MySQL Primary-Replica(자가관리 binlog 복제) 등으로 재이중화할 수 있다 (11절 참고).

### 3-3. 보안그룹 (Terraform 기준 — 현재는 개발/구축 단계용 완화 규칙)

| 보안그룹 | Description | 인바운드 허용 규칙 (현재) | 향후 강화 방향 |
|---|---|---|---|
| Flyfast-bastion-sg | for bastion | `0.0.0.0/0` → TCP 22, ICMP All | 관리자 IP 대역으로 축소 |
| Flyfast-web-sg | for web | `0.0.0.0/0` → TCP 80, 443 | ALB 도입 후 ALB 전용 SG로 제한 |
| Flyfast-api-sg | for api | `0.0.0.0/0` → TCP 8000 | web-sg로 제한 |
| Flyfast-db-sg | for db | `0.0.0.0/0` → TCP 3306 | api-sg로 제한 |
| redis-sg | for redis | `0.0.0.0/0` → TCP 6379 | api-sg로 제한 |

> 모든 SG의 Outbound는 All Traffic 허용. 현재는 초기 구축·검증 단계라 인바운드를 넓게(`0.0.0.0/0`) 열어두었으며, 원래 설계했던 Zero-Trust 체이닝(sg-alb→sg-web→sg-api→sg-valkey/sg-mysql)은 1단계 로드맵 후반부에서 SG 규칙을 좁히는 작업으로 적용합니다.

---

## 4. 데이터베이스 설계 (ERD 초안)

```sql
-- 사용자
users (
  id, email, password_hash, name, phone, created_at
)

-- 공항
airports (
  id, code, name, city, country
)

-- 항공사
airlines (
  id, name, code
)

-- 항공편
flights (
  id, airline_id, flight_number,
  departure_airport_id, arrival_airport_id,
  departure_time, arrival_time, aircraft_type
)

-- 좌석
flight_seats (
  id, flight_id, seat_class, seat_number, price, status
  -- status: AVAILABLE / HOLDING / CONFIRMED
)

-- 예매 (왕복 시 편도 2개를 각각 참조)
reservations (
  id, user_id, status, total_price, reserved_at, confirmed_at
  -- status: PENDING / CONFIRMED / CANCELLED
)

-- 예매-좌석 연결 (다구간/왕복 대응)
reservation_seats (
  id, reservation_id, flight_seat_id, passenger_name, passenger_type
)

-- 결제 (실제 PG 연동 없이 흉내)
payments (
  id, reservation_id, amount, status, paid_at
)
```

### 설계 원칙
- 1단계는 **직항(편도/왕복)만** 지원, 경유(다구간)는 추후 확장
- `flight_seats.status`는 MySQL에서 최종 정합성 보장용으로만 사용, **실시간 동시성 제어는 Valkey가 담당**

---

## 5. Valkey(캐시) 활용 설계

| 용도 | 키 패턴 | 명령어 | 설명 |
|---|---|---|---|
| 좌석 임시 선점 | `seat:hold:{flight_seat_id}` | `SET key value NX EX 300` | 5분 내 미결제 시 자동 해제, 동시 선점 원천 차단 |
| 실시간 잔여석 카운트 | `flight:remain:{flight_id}:{class}` | `INCR` / `DECR` | 매 조회마다 DB 카운트 안 해도 빠르게 응답 |
| 로그인 세션 | `session:{session_id}` | `SET` + TTL | ASG로 서버가 늘거나 죽어도 로그인 유지 (무상태 설계 필수 요소) |
| 인기 노선 랭킹 | `route:popularity` | Sorted Set (`ZINCRBY`) | 검색 빈도 실시간 집계 |
| 검색 결과 캐싱 | `search:{출발지}:{도착지}:{날짜}` | `SET` + TTL(1~2분) | 동일 조건 반복 검색 시 DB 부하 감소 |

---

## 6. API 엔드포인트 설계 (FastAPI)

```
[인증]
POST   /api/auth/signup
POST   /api/auth/login
POST   /api/auth/logout

[항공편 검색]
GET    /api/flights/search?from=ICN&to=NRT&date=2026-09-01&trip=oneway

[좌석 / 예매]
GET    /api/flights/{flight_id}/seats
POST   /api/reservations/hold           # 좌석 임시 선점 (Valkey)
POST   /api/reservations/{id}/confirm   # 결제 확정 (MySQL 기록)
DELETE /api/reservations/{id}           # 예매 취소

[내 예매]
GET    /api/me/reservations

[관리자]
POST   /api/admin/flights
GET    /api/admin/dashboard/stats

[헬스체크]
GET    /api/health   # ALB 헬스체크 대상
```

> FastAPI는 `/docs`에서 Swagger UI 자동 생성 → 팀원 간 API 명세 공유용으로 적극 활용

---

## 7. 리포지토리 구조

```
project-root/
├── frontend/                   # React
│   ├── src/
│   ├── package.json
│   └── build/                  # 빌드 결과물 → Nginx가 서빙
│
├── backend/                    # FastAPI
│   ├── app/
│   │   ├── main.py
│   │   ├── routers/
│   │   │   ├── auth.py
│   │   │   ├── flights.py
│   │   │   ├── reservations.py
│   │   │   └── admin.py
│   │   ├── models.py           # SQLAlchemy ORM
│   │   ├── schemas.py          # Pydantic 스키마
│   │   ├── db.py                # MySQL 연결
│   │   ├── cache.py              # Valkey 연결
│   │   └── core/config.py
│   ├── requirements.txt
│   └── .env
│
├── infra/                      # Terraform (Flyfast_project/ 에 위치, 현재 코드 작성 완료)
│   ├── provider.tf              # Terraform/AWS 프로바이더 버전
│   ├── values.tf                # region, prefix, CIDR 등 변수
│   ├── network.tf                # VPC, 서브넷, IGW, NAT GW, 라우트 테이블, 보안그룹
│   ├── key.tf                    # SSH 키페어 생성 및 로컬 저장
│   ├── ec2.tf                    # Bastion/Web/API/Redis/MySQL 10대
│   └── output.tf                 # vpc_id, IP, key_path 등 출력값
│
└── docs/
    ├── PROJECT_PLAN.md          # 이 문서
    ├── ERD.png
    └── API_SPEC.md
```

---

## 8. 개발 로드맵

### 1단계 — 기반 구축
- [x] Terraform으로 VPC/서브넷/보안그룹/Bastion 코드 작성 (`terraform validate` 통과)
- [x] `terraform apply`로 실제 AWS 리소스 프로비저닝 + Bastion-a/c SSH 접속 확인 완료
- [x] Bastion → ProxyJump으로 내부 8대(web-a/c, api-a/c, redis-a/c, mysql-a/c) SSH 접속 확인 완료
- [ ] SG 인바운드 규칙을 Zero-Trust 체이닝 구조로 강화 (3-3절)
- [ ] MySQL, Valkey EC2 설치 및 연결 확인 — 설치 명령어는 `INSTALL_GUIDE.md`에 정리됨 (직접 실행 필요, 자동화 스크립트 아님)
- [ ] FastAPI 프로젝트 초기 골격 + `/health` 엔드포인트
- [ ] React 초기 프로젝트 세팅 + Nginx 정적 서빙 확인
- [ ] 회원가입/로그인 API (세션은 Valkey에 저장)

### 2단계 — 핵심 기능
- [ ] 항공편/공항/좌석 초기 데이터 시딩
- [ ] 항공편 검색 API (필터: 출발지/도착지/날짜/편도·왕복)
- [ ] 좌석 조회 API
- [ ] 좌석 임시 선점 API (Valkey `SET NX EX`)

### 3단계 — 예매 완성
- [ ] 결제 확정 API → MySQL 트랜잭션 처리
- [ ] 예매 취소 API + 좌석 자동 복구 검증
- [ ] 내 예매 내역 조회 API
- [ ] React 예매 플로우 UI 연동

### 4단계 — 관리자 & 검증
- [ ] 관리자 항공편 등록/수정 API
- [ ] 관리자 대시보드 (예매 현황, 인기 노선 통계)
- [ ] AWS 콘솔에서 web/api Auto Scaling Group + Launch Template 직접 생성 (Terraform 미관리, 3-0절 참고), 헬스체크·타겟 그룹 연동 확인
- [ ] 부하 테스트 (k6 또는 locust)로 동시 예매 시나리오 검증
- [ ] (선택) MySQL Replica(db02) 구성

### 5단계 — 마무리
- [ ] 프론트엔드 UI/UX 다듬기
- [ ] 예외 처리 및 에러 메시지 정리
- [ ] 발표 시나리오 준비 (오픈런 트래픽 → ASG 증설 데모)
- [ ] README / 발표 자료 작성

---

## 9. 핵심 검증 시나리오 (발표/데모용)

1. **동시성 테스트**: 여러 클라이언트가 동시에 같은 좌석을 `hold` 요청 → 단 1명만 성공하는지 확인
2. **TTL 자동 해제 테스트**: 좌석 선점 후 결제 없이 5분 경과 → 좌석이 다시 `AVAILABLE`로 풀리는지 확인
3. **ASG 증설 테스트**: 부하 테스트 도구로 트래픽 발생 → CloudWatch에서 ASG가 인스턴스를 늘리는 것 확인
4. **세션 유지 테스트**: 로그인 상태에서 api 인스턴스 하나를 강제 종료 → 로그인이 유지되는지 확인 (Valkey 세션 저장 검증)

---

## 10. 참고 — 역할 분담 체크리스트 (팀원 수에 맞게 조정)

| 역할 | 담당 업무 |
|---|---|
| 프론트엔드 | React 화면 구현, API 연동, 상태관리 |
| 백엔드 | FastAPI 라우터/모델/스키마, Valkey 로직, MySQL 트랜잭션 |
| 인프라 | Terraform 코드, 보안그룹, ASG/ALB 설정, Bastion 접근 관리 |
| 공통 | ERD/API 명세 문서화, 부하 테스트, 발표 자료 |

---

## 11. 미정 / 논의 필요 사항

- [x] 프로젝트 최종 네이밍 → `Flyfast`로 확정 (인프라 prefix 기준, 변경 시 재논의)
- [ ] 결제 PG 연동 여부 (흉내만 낼지, 테스트용 PG 붙일지)
- [ ] 경유(다구간) 항공편 지원 여부
- [x] MySQL Replica(db02) 실제 구성 여부 → **당장은 미구성**. mysql-a 단일 인스턴스로 운영, db02는 서브넷만 남겨두고 추후 Primary-Replica 필요해지면 그때 구성 (3-2절 참고)
- [x] Valkey(redis-a/redis-c) AZ별 분리 운영 vs 단일 인스턴스 공유 → **단일 공유로 확정**. redis-c 종료, api-a/api-c 모두 redis-a 원격 참조 (3-2절 참고)
- [x] ALB/ASG 도입 방식 → **Terraform에 추가하지 않고 AWS 콘솔에서 직접 생성**하기로 확정. web/api ASG용 Launch Template·Target Tracking 정책 설계는 별도 진행 필요 (3-0절 참고)
- [ ] 프론트엔드 상태관리 라이브러리 (Redux / Zustand / Context API 등)
