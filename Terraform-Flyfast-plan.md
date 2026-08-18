# Flyfast 인프라 구축을 위한 테라폼 구현 플랜 (Flyfast-plan.md)

본 문서는 `Flyfast` 프로젝트의 멀티 AZ 고가용성 인프라 구성도(`172.16.0.0/16` CIDR) 및 요구사항을 바탕으로 테라폼 코드를 작성하기 위한 **상세 플랜 명세서**입니다.

---

## 1. 프로젝트 개요 및 서브넷 구성 요약

* **서비스 Prefix**: `Flyfast` (변수 처리)
* **VPC CIDR**: `172.16.0.0/16` (변수 처리)
* **AWS Region**: `ap-northeast-2` (변수 처리)
* **SSH Key Pair**: `Flyfast-key` (로컬 저장 경로: `/Users/wonju/keys/Flyfast-key.pem`)

### 서브넷(Subnets) 상세 목록
| 서브넷 이름 | CIDR Block | 가용 영역(AZ) | 구분 | 비고 |
| :--- | :--- | :--- | :--- | :--- |
| **Flyfast-public01** | `172.16.0.0/24` | ap-northeast-2a | Public | Bastion-a 배치, NAT Gateway-a 배치 |
| **Flyfast-public02** | `172.16.1.0/24` | ap-northeast-2c | Public | Bastion-c 배치, NAT Gateway-c 배치 |
| **Flyfast-front01** | `172.16.10.0/24` | ap-northeast-2a | Private | Web-a 인스턴스 배치 |
| **Flyfast-front02** | `172.16.11.0/24` | ap-northeast-2c | Private | Web-c 인스턴스 배치 |
| **Flyfast-backend01**| `172.16.20.0/24` | ap-northeast-2a | Private | API-a, Redis-a 인스턴스 배치 |
| **Flyfast-backend02**| `172.16.21.0/24` | ap-northeast-2c | Private | API-c, Redis-c 인스턴스 배치 |
| **Flyfast-db01** | `172.16.30.0/24` | ap-northeast-2a | Private | MySQL-a 인스턴스 배치 |
| **Flyfast-db02** | `172.16.31.0/24` | ap-northeast-2c | Private | MySQL-c 인스턴스 배치 *(요구사항의 ip 172.16.31.10 반영)* |

---

## 2. 파일별 작성 및 모듈화 명세

요구사항에 맞추어 총 **6개 파일**(`provider.tf`, `values.tf`, `network.tf`, `key.tf`, `ec2.tf`, `output.tf`)로 분할하여 명세를 작성합니다.

```text
.
├── provider.tf  # AWS 프로바이더 및 테라폼 버전 지정
├── values.tf    # Region, CIDR, Prefix 등 변수 정의
├── network.tf   # VPC, Subnets, IGW, NAT GW, Route Tables, Security Groups
├── key.tf       # TLS Private Key 및 AWS Key Pair 생성 (pem 로컬 다운로드)
├── ec2.tf       # Bastion, Web, API, Redis, MySQL EC2 인스턴스 10대 정의
└── output.tf    # 생성된 인프라의 주요 Output 정보 출력
```

---

## 3. 파일별 세부 요구사항 명세

### 3.1. `provider.tf`
* **Terraform 요구 버전**: `>= 1.0.0`
* **AWS Provider 버전**: `~> 5.0`
* **설정**: `provider "aws"` 내 `region = var.aws_region` 연결

### 3.2. `values.tf` (Variables)
* **`aws_region`**: 기본값 `"ap-northeast-2"`
* **`prefix`**: 기본값 `"Flyfast"` (리소스 Prefix 변수)
* **`vpc_cidr`**: 기본값 `"172.16.0.0/16"`
* **`subnet_cidrs`**: Map/List 형태의 CIDR 정의
  * `public01` (`172.16.0.0/24`), `public02` (`172.16.1.0/24`)
  * `front01` (`172.16.10.0/24`), `front02` (`172.16.11.0/24`)
  * `backend01` (`172.16.20.0/24`), `backend02` (`172.16.21.0/24`)
  * `db01` (`172.16.30.0/24`), `db02` (`172.16.31.0/24`)
* **`key_path`**: 기본값 `"/Users/wonju/keys/Flyfast-key.pem"`

### 3.3. `key.tf`
* **`tls_private_key`**: RSA 4096bit 알고리즘 기반 키 생성
* **`aws_key_pair`**: 
  * 이름: `${var.prefix}-key` (`Flyfast-key`)
  * Public Key 등록
* **`local_sensitive_file`**: 
  * 생성된 Private Key를 `/Users/wonju/keys/Flyfast-key.pem` 파일로 저장 (권한 `0600`)

### 3.4. `network.tf`
#### A. VPC & Gateways
* **VPC**: `${var.prefix}-vpc` (`172.16.0.0/16`)
* **Internet Gateway (IGW)**: `${var.prefix}-igw`
* **NAT Gateways (2개 - 멀티 AZ)**: 
  * `${var.prefix}-natgw-a` (`public01` 서브넷 배치, EIP-a 연동)
  * `${var.prefix}-natgw-c` (`public02` 서브넷 배치, EIP-c 연동)

#### B. Route Tables
* **Public RT**: IGW 타겟 (`0.0.0.0/0`) $ightarrow$ `public01`, `public02` 연결
* **Private RT-a**: NAT GW-a 타겟 (`0.0.0.0/0`) $ightarrow$ `front01`, `backend01`, `db01` 연결
* **Private RT-c**: NAT GW-c 타겟 (`0.0.0.0/0`) $ightarrow$ `front02`, `backend02`, `db02` 연결

#### C. Security Groups (보안 그룹 5종)
> 모든 보안 그룹의 Outbound 규칙은 `0.0.0.0/0` (All Traffic) 허용으로 설정됩니다.

1. **`Flyfast-bastion-sg`**
   * Description: `for bastion`
   * Inbound: SSH (TCP 22) `0.0.0.0/0`, ICMP (All) `0.0.0.0/0`
2. **`Flyfast-web-sg`**
   * Description: `for web`
   * Inbound: HTTP (TCP 80) `0.0.0.0/0`, HTTPS (TCP 443) `0.0.0.0/0`
3. **`Flyfast-api-sg`**
   * Description: `for api`
   * Inbound: Custom TCP (8000) `0.0.0.0/0`
4. **`Flyfast-db-sg`** *(명세상 이름 반영: `Flyfast-api-sg` 조건도 명시되었으나 구분을 위해 `Flyfast-db-sg`로 식별)*
   * Description: `for db`
   * Inbound: MySQL/Aurora (TCP 3306) `0.0.0.0/0`
5. **`redis-sg`** *(요구 조건 이름 반영: `redis-sg`)*
   * Description: `for redis`
   * Inbound: Custom TCP (6379) `0.0.0.0/0`

---

### 3.5. `ec2.tf`
* **AMI**: Amazon Linux 2023 최신 데이터소스 (`data "aws_ami"`)
* **Key Name**: `Flyfast-key` (`aws_key_pair` 참조)

| 구분 | 인스턴스 이름 Tag | Type | 배치 Subnet | Private IP | 보안 그룹 (Security Groups) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Bastion-a** | `Flyfast-bastion-a` | `t3.micro` | `Flyfast-public01` | `172.16.0.10` | `default`, `Flyfast-bastion-sg` |
| **Bastion-c** | `Flyfast-bastion-c` | `t3.micro` | `Flyfast-public02` | `172.16.1.10` | `default`, `Flyfast-bastion-sg` |
| **Web-a** | `Flyfast-web-a` | `t3.small` | `Flyfast-front01` | `172.16.10.10` | `default`, `Flyfast-web-sg` |
| **Web-c** | `Flyfast-web-c` | `t3.small` | `Flyfast-front02` | `172.16.11.10` | `default`, `Flyfast-web-sg` |
| **API-a** | `Flyfast-api-a` | `t3.small` | `Flyfast-backend01` | `172.16.20.10` | `default`, `Flyfast-api-sg` |
| **API-c** | `Flyfast-api-c` | `t3.small` | `Flyfast-backend02` | `172.16.21.10` | `default`, `Flyfast-api-sg` |
| **Redis-a** | `Flyfast-redis-a` | `t3.small` | `Flyfast-backend01` | `172.16.20.100` | `default`, `redis-sg` |
| **Redis-c** | `Flyfast-redis-c` | `t3.small` | `Flyfast-backend02` | `172.16.21.100` | `default`, `redis-sg` |
| **MySQL-a** | `Flyfast-mysql-a` | `t3.small` | `Flyfast-db01` | `172.16.30.10` | `default`, `Flyfast-db-sg` |
| **MySQL-c** | `Flyfast-mysql-c` | `t3.small` | `Flyfast-db02` | `172.16.31.10` | `default`, `Flyfast-db-sg` |

### 3.6. `output.tf`
* `vpc_id`: 생성된 VPC ID
* `bastion_public_ips`: Bastion-a, Bastion-c의 퍼블릭 IP
* `private_ips`: 각 EC2 인스턴스들의 할당된 프라이빗 IP 맵
* `key_path`: 저장된 SSH 키 로컬 경로 안내

---

## 4. 실행 및 배포 절차

1. **초기화**: `terraform init`
2. **구문 검증**: `terraform validate`
3. **플랜 확인**: `terraform plan`
4. **프로비저닝 실행**: `terraform apply`
