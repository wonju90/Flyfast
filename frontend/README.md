# Flyfast Frontend

React + Vite 기반 항공권 예매 데모 프론트엔드. ORM 없이 Native SQL을 쓰는 FastAPI 백엔드(`../backend`)를 호출합니다.

## 로컬 실행

백엔드 DB/Redis가 프라이빗 IP에만 있어서, 로컬 개발 시 SSH 터널이 먼저 떠 있어야 합니다 (`../INSTALL_GUIDE.md` 참고).

```bash
# 1) SSH 터널 (별도 터미널, 계속 띄워둠)
ssh -i ~/keys/Flyfast-key.pem -N -L 3306:172.16.30.10:3306 -L 6379:172.16.20.100:6379 ec2-user@<bastion-a-public-ip>

# 2) 백엔드 (별도 터미널)
cd ../backend
./venv/bin/uvicorn app.main:app --reload --port 8000

# 3) 프론트엔드
npm install
npm run dev   # http://localhost:5173
```

`.env`(`.env.example` 복사)의 `VITE_API_BASE_URL`이 백엔드 주소를 가리킵니다.

## 구조

```
src/
  api/client.js        fetch 래퍼 — 인증 헤더, 401 시 refresh token 자동 재시도
  context/AuthContext   로그인 상태, access/refresh 토큰 관리
  pages/                SearchPage, ResultsPage, FlightDetailPage(좌석선점→예약→결제),
                        Login/SignupPage, MyBookingsPage
  components/           Navbar
```

## 알려진 제한

- 운임/가격 데이터가 DB에 없어 결제 금액은 화면에서 직접 입력하는 임시 방식
- 왕복은 백엔드 구조상 예약 2건(가는편/오는편 각각)으로 처리됨
