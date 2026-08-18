# Web 계층 ALB + Auto Scaling Group 구축 가이드 (ALB_ASG_GUIDE.md)

> 이 문서는 **AWS 콘솔에서 직접 클릭하며 따라 할 가이드**입니다. Terraform으로 관리하지 않기로 한 리소스이므로, 여기서 만드는 ALB/Target Group/Launch Template/ASG는 우리 `.tf` 파일에는 추가하지 않습니다.
> 대상: Web 계층(front01/front02)만 ALB + ASG로 이중화합니다. API/Redis/MySQL은 기존처럼 Terraform이 만든 고정 인스턴스를 그대로 사용합니다.

---

## 0. 사전 정보 (현재 실제 값)

| 항목 | 값 |
|---|---|
| VPC | `Flyfast-vpc` (`vpc-01016078a648a82a5`) |
| Front01 서브넷 (2a) | `Flyfast-front01` (`subnet-05839e15aeb682985`, 172.16.10.0/24) |
| Front02 서브넷 (2c) | `Flyfast-front02` (`subnet-09078dec40a856e7f`, 172.16.11.0/24) |
| Public01 서브넷 (2a, ALB용) | `Flyfast-public01` (`subnet-0bdd4d9116435dcce`, 172.16.0.0/24) |
| Public02 서브넷 (2c, ALB용) | `Flyfast-public02` (`subnet-01f6fd5bb36639880`, 172.16.1.0/24) |
| AMI (기존 web-a와 동일 계열) | Amazon Linux 2023 — 콘솔에서 "Amazon Linux 2023" Quick Start로 새로 선택 (예: `ami-01db0e3486f6a624e`, 리전 최신 버전 자동 갱신됨) |
| 키페어 | `Flyfast-key` |
| 기존 보안그룹 | `Flyfast-web-sg` (TCP 80/443, 현재 `0.0.0.0/0` 허용) |

---

## 1단계 — Launch Template 생성

**EC2 → Launch Templates → Create launch template**

1. Launch template name: `Flyfast-web-lt`
2. AMI: **Amazon Linux 2023** (Quick Start 목록에서 선택)
3. Instance type: `t3.small`
4. Key pair: `Flyfast-key`
5. Network settings:
   - Subnet: *템플릿에는 지정하지 않음* (ASG 생성 시 서브넷을 별도로 지정)
   - Security groups: `Flyfast-web-sg` 선택
6. Advanced details → User data (초기 확인용 placeholder, 실제 앱 배포 전 임시 페이지):
   ```bash
   #!/bin/bash
   dnf install -y nginx
   systemctl enable --now nginx
   echo "<h1>Flyfast web (ASG instance) - $(hostname)</h1>" > /usr/share/nginx/html/index.html
   ```
7. **Create launch template** 클릭

---

## 2단계 — Target Group 생성

**EC2 → Target Groups → Create target group**

1. Target type: **Instances**
2. Target group name: `Flyfast-web-tg`
3. Protocol : Port: `HTTP : 80`
4. VPC: `Flyfast-vpc`
5. Health check path: `/`
6. **Next** → 아직 타겟 등록하지 않고 바로 **Create target group** (ASG가 자동으로 등록함)

---

## 3단계 — Application Load Balancer 생성

**EC2 → Load Balancers → Create load balancer → Application Load Balancer**

1. Name: `Flyfast-web-alb`
2. Scheme: **Internet-facing**
3. VPC: `Flyfast-vpc`
4. Mappings(서브넷): `Flyfast-public01`(2a), `Flyfast-public02`(2c) **둘 다 체크**
5. Security groups:
   - 새 보안그룹 생성 권장: `Flyfast-alb-sg` — Inbound TCP 80 `0.0.0.0/0`, Outbound All
   - (기존 `Flyfast-web-sg`는 그대로 두고, 나중에 SG 강화 작업 때 "인바운드를 `Flyfast-alb-sg`에서만 허용"으로 좁힐 예정 — 지금은 건드리지 않음)
6. Listeners: HTTP : 80 → **Forward to** `Flyfast-web-tg` (2단계에서 만든 타겟 그룹)
7. **Create load balancer**
8. 생성 후 ALB 상세 화면에서 **DNS name**을 복사해둔다 (예: `Flyfast-web-alb-xxxxxxxxxx.ap-northeast-2.elb.amazonaws.com`)

---

## 4단계 — Auto Scaling Group 생성

**EC2 → Auto Scaling Groups → Create Auto Scaling group**

1. Name: `Flyfast-web-asg`
2. Launch template: `Flyfast-web-lt` (1단계에서 만든 것)
3. VPC: `Flyfast-vpc`
4. Availability Zones and subnets: `Flyfast-front01`(2a), `Flyfast-front02`(2c) **둘 다 체크**
5. Load balancing:
   - **Attach to an existing load balancer** 선택
   - Existing target group: `Flyfast-web-tg`
6. Health checks: **Turn on Elastic Load Balancing health checks** 체크 (헬스체크 유예 300초 정도)
7. Group size:
   - Desired capacity: `2`
   - Minimum capacity: `2`
   - Maximum capacity: `4`
8. Scaling policies (선택, 부하테스트 데모용 추천):
   - Target tracking policy 추가 → Metric type: **Average CPU utilization**, Target value: `50`
9. **Create Auto Scaling group**

---

## 5단계 — 동작 확인

```bash
# ALB DNS로 접속 확인 (3단계에서 복사한 DNS name 사용)
curl -s http://<ALB_DNS_NAME>/

# 콘솔에서 확인할 것
# - EC2 → Target Groups → Flyfast-web-tg → Targets 탭 → 2개 인스턴스가 healthy 인지
# - EC2 → Auto Scaling Groups → Flyfast-web-asg → Instance management 탭 → 2대 InService 인지
```

---

## 6단계 — 비용 참고

이 작업으로 새로 발생하는 비용:

| 리소스 | 과금 |
|---|---|
| Application Load Balancer | 시간당 고정 요금 + LCU(트래픽/연결 수 기반) 사용량 |
| ASG로 새로 뜨는 EC2 2~4대 (t3.small) | 인스턴스 시간당 요금 — 기존 Terraform이 만든 `web-a`/`web-c`와는 **별개로 추가** 발생 |

기존 `web-a`/`web-c`(Terraform 관리, 참고/테스트용)는 그대로 살아있는 상태로 유지되므로, ALB+ASG를 실제 서비스 진입점으로 쓰기로 확정하면 이후 `web-a`/`web-c`는 중지(Stop)해서 중복 비용을 줄이는 것을 고려한다.

---

## 7단계 — 문서 반영 체크리스트

- [ ] ALB DNS name을 `Flyfast_프로젝트_명세서.md`의 "AWS 배포" 항목에 갱신
- [ ] `PROJECT_PLAN.md` 로드맵 4단계 체크리스트에 "ALB/ASG 생성 완료" 표시
- [ ] Target Group healthy 상태 스크린샷/결과를 6.2 AWS 인프라 검증 표에 반영
