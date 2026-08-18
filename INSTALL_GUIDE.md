# Flyfast 서버별 소프트웨어 설치 가이드 (INSTALL_GUIDE.md)

> 본 문서는 **명령어 정리용 문서**입니다. 실제 설치는 아래 명령어를 서버에 직접 SSH로 접속해 실행해야 합니다 (자동 실행 스크립트가 아님).
> 대상 OS: Amazon Linux 2023 (`dnf` 기반), 패키지명은 실제 `dnf list available`로 확인한 값입니다.

---

## 0. 공통 사전 준비 — Bastion 경유 SSH

로컬 변수 (터미널에서 미리 export 해두면 편함):

```bash
export KEY=~/keys/Flyfast-key.pem
export BASTION_A=3.39.248.101   # ap-northeast-2a
export BASTION_C=54.180.119.77  # ap-northeast-2c
```

내부 서버 접속 템플릿 (ProxyJump 사용, AZ-a 계열은 BASTION_A, AZ-c 계열은 BASTION_C 경유):

```bash
ssh -i $KEY -J ec2-user@$BASTION_A ec2-user@<내부 프라이빗 IP>
```

### 서버 목록 (Private IP)

| 역할 | AZ-a | AZ-c | 경유 Bastion |
|---|---|---|---|
| web (Nginx) | 172.16.10.10 | 172.16.11.10 | web-a→BASTION_A / web-c→BASTION_C |
| api (FastAPI) | 172.16.20.10 | 172.16.21.10 | api-a→BASTION_A / api-c→BASTION_C |
| redis (Valkey) | 172.16.20.100 | 172.16.21.100 | redis-a→BASTION_A / redis-c→BASTION_C |
| mysql (MariaDB) | 172.16.30.10 | 172.16.31.10 | mysql-a→BASTION_A / mysql-c→BASTION_C |

파일 업로드(React 빌드물 등)는 `scp`에도 동일하게 `-o ProxyJump=...` 옵션을 붙여 사용:

```bash
scp -i $KEY -o ProxyJump=ec2-user@$BASTION_A -r ./frontend/build/* ec2-user@172.16.10.10:/tmp/web-build/
```

---

## 1. MariaDB 설치 — mysql-a (172.16.30.10) / mysql-c (172.16.31.10)

AL2023 저장소에는 MariaDB 10.5 / 10.11 / 11.4 / 11.8 / 12.3 버전이 모두 있음. 안정적인 **10.11 (LTS)** 기준으로 정리.

```bash
# 1) 패키지 설치
sudo dnf update -y
sudo dnf install -y mariadb1011-server

# 2) 서비스 활성화
sudo systemctl enable --now mariadb
sudo systemctl status mariadb

# 3) 초기 보안 설정 (root 비밀번호 설정, 익명 계정/테스트 DB 제거)
sudo mysql_secure_installation
```

외부(다른 서브넷)에서 접속을 허용하려면 bind-address 확인/수정:

```bash
sudo grep -n "bind-address" /etc/my.cnf.d/mariadb-server.cnf
# bind-address = 127.0.0.1 로 되어 있으면 해당 인스턴스의 프라이빗 IP 또는 0.0.0.0 으로 변경
sudo sed -i 's/^bind-address.*/bind-address = 0.0.0.0/' /etc/my.cnf.d/mariadb-server.cnf
sudo systemctl restart mariadb
```

DB / 애플리케이션 계정 생성 (PROJECT_PLAN.md 4절 ERD 기준 `flyfast` 스키마):

```sql
-- mysql -u root -p 로 접속 후 실행
CREATE DATABASE flyfast CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'flyfast_app'@'%' IDENTIFIED BY '<STRONG_PASSWORD>';
GRANT ALL PRIVILEGES ON flyfast.* TO 'flyfast_app'@'%';
FLUSH PRIVILEGES;
```

api 서버에서 접속 테스트 (설치 후, api-a/api-c에서 실행):

```bash
mysql -h 172.16.30.10 -u flyfast_app -p flyfast -e "SELECT 1;"
```

> mysql-c(172.16.31.10)도 동일한 절차 반복. Primary/Replica 복제 구성 여부는 PROJECT_PLAN.md 11절 미정 사항 — 결정 시 별도 복제 설정(`GRANT REPLICATION SLAVE`, `CHANGE MASTER TO` 등) 추가 필요.

---

## 2. Valkey 설치 — redis-a (172.16.20.100) / redis-c (172.16.21.100)

```bash
# 1) 패키지 설치
sudo dnf install -y valkey

# 2) 설정 파일 수정 — 외부(같은 서브넷/VPC) 접속 허용
sudo vi /etc/valkey/valkey.conf
```

`/etc/valkey/valkey.conf`에서 수정할 항목:

```
bind 0.0.0.0
protected-mode no
port 6379
```

```bash
# 3) 서비스 활성화
sudo systemctl enable --now valkey
sudo systemctl status valkey
```

연결 테스트 (설치한 서버 자신 및 api 서버에서):

```bash
valkey-cli -h 172.16.20.100 ping   # PONG 응답 확인
```

> redis-c(172.16.21.100)도 동일 절차 반복. PROJECT_PLAN.md 5절의 키 패턴(`seat:hold:*`, `flight:remain:*`, `session:*` 등)은 애플리케이션(FastAPI) 코드에서 사용하므로 서버 설정과는 무관.
> AZ별 분리 운영 vs 단일 공유 여부는 PROJECT_PLAN.md 11절 미정 사항 — 단일 공유로 바꾸는 경우 api-a/api-c 양쪽 모두 동일한 Valkey 인스턴스 IP를 바라보도록 설정.

---

## 3. FastAPI / Uvicorn 설치 — api-a (172.16.20.10) / api-c (172.16.21.10)

```bash
# 1) 빌드 도구 및 pip 설치
sudo dnf install -y python3-pip python3-devel gcc

# 2) 가상환경 생성
python3 -m venv ~/venv
source ~/venv/bin/activate

# 3) 패키지 설치
pip install --upgrade pip
pip install fastapi "uvicorn[standard]" sqlalchemy pymysql redis python-dotenv
```

애플리케이션 배포 (로컬에서 scp로 `backend/` 업로드 후):

```bash
scp -i $KEY -o ProxyJump=ec2-user@$BASTION_A -r ./backend ec2-user@172.16.20.10:/home/ec2-user/app
```

systemd 서비스 등록 (`/etc/systemd/system/flyfast-api.service`):

```ini
[Unit]
Description=Flyfast FastAPI
After=network.target

[Service]
User=ec2-user
WorkingDirectory=/home/ec2-user/app
Environment="PATH=/home/ec2-user/venv/bin"
ExecStart=/home/ec2-user/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now flyfast-api
sudo systemctl status flyfast-api
```

헬스체크 테스트:

```bash
curl -s http://localhost:8000/api/health
```

> api-c(172.16.21.10)도 동일 절차 반복. `.env`에 DB(`172.16.30.10`)·Valkey(`172.16.20.100` 등) 접속 정보 설정 필요 (PROJECT_PLAN.md 7절 `backend/.env` 참고).

---

## 4. Nginx 설치 — web-a (172.16.10.10) / web-c (172.16.11.10)

```bash
sudo dnf install -y nginx
```

React 빌드 결과물 업로드 (로컬에서):

```bash
scp -i $KEY -o ProxyJump=ec2-user@$BASTION_A -r ./frontend/build/* ec2-user@172.16.10.10:/tmp/web-build/
ssh -i $KEY -J ec2-user@$BASTION_A ec2-user@172.16.10.10 \
  "sudo rm -rf /usr/share/nginx/html/* && sudo cp -r /tmp/web-build/* /usr/share/nginx/html/"
```

리버스 프록시 설정 (`/etc/nginx/conf.d/flyfast.conf`, api-a 기준 — web-c는 api-c IP로 교체):

```nginx
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri /index.html;
    }

    location /api/ {
        proxy_pass http://172.16.20.10:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo nginx -t
sudo systemctl enable --now nginx
```

접속 테스트 (Bastion에서, 또는 web-sg가 열려 있으므로 외부에서도 가능):

```bash
curl -s http://172.16.10.10/
```

> web-c(172.16.11.10)는 `proxy_pass`를 `172.16.21.10:8000`(api-c)으로 바꿔서 동일 절차 반복.

---

## 5. 설치 순서 및 검증 체크리스트

의존성이 적은 것부터 순서대로 진행 권장:

1. [ ] mysql-a, mysql-c — MariaDB 설치 + `flyfast` DB/계정 생성 + 원격 접속 테스트
2. [ ] redis-a, redis-c — Valkey 설치 + `valkey-cli ping` 테스트
3. [ ] api-a, api-c — FastAPI 배포 + `/api/health` 200 응답 확인 + DB/Valkey 연결 확인
4. [ ] web-a, web-c — Nginx 설치 + React 빌드물 서빙 확인 + `/api` 프록시 동작 확인
5. [ ] Bastion 또는 로컬에서 `curl http://<web 퍼블릭 경로 or ALB>/api/health` 로 전체 체인 통합 확인

> 콘솔에서 별도로 만들 web/api Auto Scaling Group의 Launch Template에는 위 1~4번 과정을 **User Data 스크립트**로 옮겨 자동화하는 것을 권장 (인스턴스가 새로 뜰 때마다 수동 설치할 수 없기 때문).
