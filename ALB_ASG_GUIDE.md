# Web/API 계층 로드밸런서 구축 가이드 (ALB_ASG_GUIDE.md)

> 이 문서는 **AWS 콘솔에서 직접 클릭하며 따라 할 가이드**입니다. Terraform으로 관리하지 않기로 한 리소스이므로, 여기서 만드는 ALB/NLB/Target Group/Launch Template/ASG는 우리 `.tf` 파일에는 추가하지 않습니다.
> 대상: **Part A**는 Web 계층(front01/front02)을 ALB + ASG로 이중화합니다. **Part B**는 API 계층(api-a/api-c) 앞에 내부용 NLB를 둬서, 지금처럼 web-a→api-a / web-c→api-c로 AZ별 1:1 고정 프록시하는 대신 두 web 서버 모두 NLB 하나를 보고 요청하게 만들어 실제 로드밸런싱·장애조치가 되게 합니다. Redis/MySQL은 계속 Terraform이 만든 고정 단일 인스턴스를 그대로 사용합니다.

---

## 0. 사전 정보 (현재 실제 값)

| 항목 | 값 |
|---|---|
| VPC | `Flyfast-vpc` (`vpc-01016078a648a82a5`) |
| Front01 서브넷 (2a) | `Flyfast-front01` (`subnet-05839e15aeb682985`, 172.16.10.0/24) |
| Front02 서브넷 (2c) | `Flyfast-front02` (`subnet-09078dec40a856e7f`, 172.16.11.0/24) |
| Public01 서브넷 (2a, ALB용) | `Flyfast-public01` (`subnet-0bdd4d9116435dcce`, 172.16.0.0/24) |
| Public02 서브넷 (2c, ALB용) | `Flyfast-public02` (`subnet-01f6fd5bb36639880`, 172.16.1.0/24) |
| Backend01 서브넷 (2a, api-a / NLB용) | `Flyfast-backend01` (`subnet-0489af5b2cf7162b7`, 172.16.20.0/24) |
| Backend02 서브넷 (2c, api-c / NLB용) | `Flyfast-backend02` (`subnet-02c2417c925b0231c`, 172.16.21.0/24) |
| AMI (기존 web-a와 동일 계열) | Amazon Linux 2023 — 콘솔에서 "Amazon Linux 2023" Quick Start로 새로 선택 (예: `ami-01db0e3486f6a624e`, 리전 최신 버전 자동 갱신됨) |
| 키페어 | `Flyfast-key` |
| 기존 Web 보안그룹 | `Flyfast-web-sg` (TCP 80/443, 현재 `0.0.0.0/0` 허용) |
| 기존 API 보안그룹 | `Flyfast-api-sg` (TCP 8000, 현재 `0.0.0.0/0` 허용 — NLB 자체는 SG가 없어도 되고, 이미 8000이 열려 있어 별도 SG 작업 없이 바로 붙는다) |
| api-a / api-c 프라이빗 IP | `172.16.20.10` / `172.16.21.10` |
| **(이미 생성됨) ALB** | `Flyfast-ALB` — internet-facing, `Flyfast-public01`/`02`에 배치, HTTP(80)→HTTPS(443) 리다이렉트, HTTPS는 ACM 인증서(`*.wonju.cloud`) 적용 |
| **(이미 생성됨) ALB 타겟그룹** | `Flyfast-tg` — HTTP:80, 지금은 web-a/web-c가 수동 등록되어 healthy |
| **(이미 생성됨) API NLB** | `Flyfast-NLB` — internal, `Flyfast-backend01`/`02`에 배치, 리스너 TCP:80 → 타겟그룹 `Flyfast-tg-nlb`(타겟은 8000번 포트로 개별 등록, api-a/api-c healthy) |
| 도메인 | `wonju.cloud`(루트), `www.wonju.cloud` → 둘 다 ALB로 연결됨. 인증서가 `*.wonju.cloud`만 커버해서 루트 도메인 HTTPS는 인증서 오류 남는 상태(의도적으로 방치하기로 함) |

> **Part A는 ALB/Target Group을 새로 만들지 않는다** — 이미 만든 `Flyfast-ALB`/`Flyfast-tg`를 그대로 재사용하고, **Launch Template + ASG만 추가**해서 그 위에 얹는다. ASG가 띄우는 인스턴스들이 기존 `Flyfast-tg`에 같이 등록되면서, 기존 web-a/web-c와 나란히 ALB의 로드밸런싱 대상이 된다.

---

# Part A — Web 계층 Auto Scaling Group (ALB는 이미 붙어있음)

## 1단계 — Launch Template 생성

**EC2 → Launch Templates → Create launch template**

1. Launch template name: `Flyfast-web-lt`
2. AMI: **Amazon Linux 2023** (Quick Start 목록에서 선택)
3. Instance type: `t3.small`
4. Key pair: `Flyfast-key`
5. Network settings:
   - Subnet: *템플릿에는 지정하지 않음* (ASG 생성 시 서브넷을 별도로 지정)
   - Security groups: `Flyfast-web-sg` 선택
6. Advanced details → User data — **GitHub에 코드가 올라가 있으니 부팅 시 그대로 clone+build해서 실제 서비스와 동일한 페이지를 띄운다** (placeholder 페이지를 쓰면, ASG 인스턴스가 같은 타겟그룹에 healthy로 잡히는 순간부터 실사용자가 무작위로 빈 페이지를 보게 되므로 주의):
   ```bash
   #!/bin/bash
   dnf install -y nginx git
   curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
   dnf install -y nodejs

   cd /home/ec2-user
   git clone https://github.com/wonju90/Flyfast.git app
   cd app/frontend
   npm ci
   npm run build
   cp -r dist/* /usr/share/nginx/html/

   cat > /etc/nginx/conf.d/flyfast.conf <<'NGINXCONF'
   server {
       listen 80 default_server;
       listen [::]:80 default_server;
       server_name _;

       root /usr/share/nginx/html;
       index index.html;

       location / {
           try_files $uri /index.html;
       }

       location /api/ {
           proxy_pass http://Flyfast-NLB-b2545acde0e53524.elb.ap-northeast-2.amazonaws.com:80/api/;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   NGINXCONF

   systemctl enable --now nginx
   ```
   > `/api/` 프록시 대상은 지금 만들어진 API NLB DNS(`Flyfast-NLB-b2545acde0e53524.elb.ap-northeast-2.amazonaws.com`)로 이미 고정해뒀다 — web-a/web-c와 동일하게 NLB를 거쳐 api-a/api-c로 분산된다.
7. **Create launch template** 클릭

> Target Group(`Flyfast-tg`)과 ALB(`Flyfast-ALB`)는 이미 만들어져 있으므로 이번 단계에서는 새로 만들지 않는다.

---

## 2단계 — Auto Scaling Group 생성 (기존 Target Group에 붙이기)

**EC2 → Auto Scaling Groups → Create Auto Scaling group**

1. Name: `Flyfast-web-asg`
2. Launch template: `Flyfast-web-lt` (1단계에서 만든 것)
3. VPC: `Flyfast-vpc`
4. Availability Zones and subnets: `Flyfast-front01`(2a), `Flyfast-front02`(2c) **둘 다 체크**
5. Load balancing:
   - **Attach to an existing load balancer** 선택
   - Existing target group: **`Flyfast-tg`** (새로 만들지 않고, 이미 web-a/web-c가 등록된 그 타겟그룹을 그대로 선택 — ASG 인스턴스가 여기에 추가로 등록되어 기존 web-a/web-c와 나란히 ALB의 로드밸런싱 대상이 된다)
6. Health checks: **Turn on Elastic Load Balancing health checks** 체크 (헬스체크 유예는 npm install+build 시간을 감안해서 300~420초 정도로 넉넉하게)
7. Group size:
   - Desired capacity: `2`
   - Minimum capacity: `2`
   - Maximum capacity: `4`
8. Scaling policies (선택, 교육/부하테스트 목적 추천):
   - Target tracking policy 추가 → Metric type: **Average CPU utilization**, Target value: `50`
9. **Create Auto Scaling group**

---

# Part B — API 계층 Network Load Balancer

> 지금은 web-a가 api-a(172.16.20.10)만, web-c가 api-c(172.16.21.10)만 바라보도록 Nginx `location /api/`에 고정 IP로 프록시되어 있다. 이 파트는 api-a/api-c 앞에 **내부용(Internal) NLB**를 하나 두고, web-a/web-c 둘 다 그 NLB만 보게 바꿔서 AZ 간 1:1 고정 페어링을 없애고 실제 로드밸런싱·장애조치가 되게 만든다. API는 ASG로 이중화하지 않고(기존 고정 인스턴스 2대 유지) NLB에 수동으로 등록만 한다.

## 1단계 — Target Group 생성 (API용)

**EC2 → Target Groups → Create target group**

1. Target type: **Instances**
2. Target group name: `Flyfast-api-tg`
3. Protocol : Port: `TCP : 8000`
4. VPC: `Flyfast-vpc`
5. Health check: Protocol `HTTP`, Path `/api/health` (NLB의 TCP 타겟 그룹도 HTTP 헬스체크 지정 가능)
6. **Next** → Register targets 화면에서 **api-a, api-c 둘 다 수동으로 선택**하고 포트 `8000`으로 Include as pending below 클릭 (Web과 달리 ASG가 없어서 자동 등록되지 않음)
7. **Create target group**

## 2단계 — Network Load Balancer 생성

**EC2 → Load Balancers → Create load balancer → Network Load Balancer**

1. Name: `Flyfast-api-nlb`
2. Scheme: **Internal** (외부 공개 아님 — web 서버들만 내부에서 접근)
3. VPC: `Flyfast-vpc`
4. Mappings(서브넷): `Flyfast-backend01`(2a), `Flyfast-backend02`(2c) **둘 다 체크**
5. Listeners: TCP : 8000 → **Forward to** `Flyfast-api-tg` (1단계에서 만든 타겟 그룹)
6. **Create load balancer**
7. 생성 후 NLB 상세 화면에서 **DNS name**을 복사해둔다 (예: `Flyfast-api-nlb-xxxxxxxxxx.elb.ap-northeast-2.amazonaws.com`) — 내부용이라 VPC 안에서만 resolve된다

## 3단계 — Nginx 설정을 NLB로 변경

web-a, web-c 둘 다 **동일하게** `/etc/nginx/conf.d/flyfast.conf`의 `location /api/` 프록시 대상을 각자의 고정 api IP 대신 NLB DNS로 바꾼다.

```nginx
location /api/ {
    proxy_pass http://<NLB_DNS_NAME>:8000/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

이제 web-a/web-c 어느 쪽이든 api-a, api-c 중 살아있는 서버로 NLB가 알아서 분산·장애조치한다 — 기존처럼 짝지어진 api 서버 하나가 죽으면 그 web 서버 전체가 영향받는 구조가 사라진다.

---

# 공통 — 동작 확인 / 비용 / 문서 반영 (Part A + Part B)

## 동작 확인

```bash
# 도메인으로 접속 확인
curl -s https://www.wonju.cloud/

# 콘솔에서 확인할 것
# - EC2 → Target Groups → Flyfast-tg → Targets 탭 → web-a/web-c + ASG 인스턴스까지 전부 healthy 인지
# - EC2 → Auto Scaling Groups → Flyfast-web-asg → Instance management 탭 → 2대 InService 인지
# - EC2 → Target Groups → Flyfast-tg-nlb → Targets 탭 → api-a, api-c 둘 다 healthy 인지 (타겟 포트가 8000인지 재확인)
# - api-a 또는 api-c 중 하나를 systemctl stop flyfast-api로 잠깐 내려보고, 도메인으로 요청해도 여전히 200이 오는지 (NLB가 살아있는 쪽으로만 보내는지) 확인
# - ASG 인스턴스 하나를 콘솔에서 강제 종료(Terminate)해보고, ASG가 자동으로 새 인스턴스를 띄워서 다시 2대를 채우는지 확인 (교육 목적 핵심 포인트)
```

---

## 비용 참고

이 작업으로 새로 발생하는 비용:

| 리소스 | 과금 |
|---|---|
| Application Load Balancer | 시간당 고정 요금 + LCU(트래픽/연결 수 기반) 사용량 |
| Network Load Balancer | 시간당 고정 요금 + NLCU(연결/트래픽 기반) 사용량 — ALB와 별개로 추가 발생 |
| ASG로 새로 뜨는 EC2 2~4대 (t3.small) | 인스턴스 시간당 요금 — 기존 Terraform이 만든 `web-a`/`web-c`와는 **별개로 추가** 발생 |

기존 `web-a`/`web-c`(Terraform 관리, 참고/테스트용)는 그대로 살아있는 상태로 유지되므로, ALB+ASG를 실제 서비스 진입점으로 쓰기로 확정하면 이후 `web-a`/`web-c`는 중지(Stop)해서 중복 비용을 줄이는 것을 고려한다. api-a/api-c는 NLB의 실제 타겟이므로 계속 켜둬야 한다 (NLB 자체는 새 EC2를 만들지 않음, 기존 2대를 그대로 씀).

---

## 문서 반영 체크리스트

- [ ] `wonju.cloud` 도메인과 ALB 연결 사실을 `Flyfast_프로젝트_명세서.md`의 "AWS 배포" 항목에 갱신
- [ ] NLB DNS name과 "Nginx가 NLB를 바라보도록 변경"된 사실을 `Flyfast_프로젝트_명세서.md` 아키텍처 설명에 반영
- [ ] `PROJECT_PLAN.md` 로드맵 4단계 체크리스트에 "ALB/ASG 생성 완료", "API NLB 생성 완료" 표시
- [ ] Target Group healthy 상태 스크린샷/결과를 6.2 AWS 인프라 검증 표에 반영 (`Flyfast-tg`, `Flyfast-tg-nlb` 둘 다)
