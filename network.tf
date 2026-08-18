locals {
  subnet_azs = {
    public01  = var.azs["a"]
    public02  = var.azs["c"]
    front01   = var.azs["a"]
    front02   = var.azs["c"]
    backend01 = var.azs["a"]
    backend02 = var.azs["c"]
    db01      = var.azs["a"]
    db02      = var.azs["c"]
  }

  public_subnet_keys    = ["public01", "public02"]
  private_a_subnet_keys = ["front01", "backend01", "db01"]
  private_c_subnet_keys = ["front02", "backend02", "db02"]
}

# ---------------------------------------------------------------------------
# VPC & Internet Gateway
# ---------------------------------------------------------------------------
resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "${var.prefix}-vpc"
  }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id

  tags = {
    Name = "${var.prefix}-igw"
  }
}

# ---------------------------------------------------------------------------
# Subnets
# ---------------------------------------------------------------------------
resource "aws_subnet" "this" {
  for_each = var.subnet_cidrs

  vpc_id                  = aws_vpc.this.id
  cidr_block              = each.value
  availability_zone       = local.subnet_azs[each.key]
  map_public_ip_on_launch = contains(local.public_subnet_keys, each.key)

  tags = {
    Name = "${var.prefix}-${each.key}"
  }
}

# ---------------------------------------------------------------------------
# NAT Gateways (multi-AZ)
# ---------------------------------------------------------------------------
resource "aws_eip" "natgw_a" {
  domain = "vpc"

  tags = {
    Name = "${var.prefix}-eip-natgw-a"
  }
}

resource "aws_eip" "natgw_c" {
  domain = "vpc"

  tags = {
    Name = "${var.prefix}-eip-natgw-c"
  }
}

resource "aws_nat_gateway" "a" {
  allocation_id = aws_eip.natgw_a.id
  subnet_id     = aws_subnet.this["public01"].id

  tags = {
    Name = "${var.prefix}-natgw-a"
  }

  depends_on = [aws_internet_gateway.this]
}

resource "aws_nat_gateway" "c" {
  allocation_id = aws_eip.natgw_c.id
  subnet_id     = aws_subnet.this["public02"].id

  tags = {
    Name = "${var.prefix}-natgw-c"
  }

  depends_on = [aws_internet_gateway.this]
}

# ---------------------------------------------------------------------------
# Route Tables
# ---------------------------------------------------------------------------
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }

  tags = {
    Name = "${var.prefix}-public-rt"
  }
}

resource "aws_route_table" "private_a" {
  vpc_id = aws_vpc.this.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.a.id
  }

  tags = {
    Name = "${var.prefix}-private-rt-a"
  }
}

resource "aws_route_table" "private_c" {
  vpc_id = aws_vpc.this.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.c.id
  }

  tags = {
    Name = "${var.prefix}-private-rt-c"
  }
}

resource "aws_route_table_association" "public" {
  for_each = toset(local.public_subnet_keys)

  subnet_id      = aws_subnet.this[each.key].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private_a" {
  for_each = toset(local.private_a_subnet_keys)

  subnet_id      = aws_subnet.this[each.key].id
  route_table_id = aws_route_table.private_a.id
}

resource "aws_route_table_association" "private_c" {
  for_each = toset(local.private_c_subnet_keys)

  subnet_id      = aws_subnet.this[each.key].id
  route_table_id = aws_route_table.private_c.id
}

# ---------------------------------------------------------------------------
# Security Groups
# ---------------------------------------------------------------------------
resource "aws_security_group" "bastion" {
  name        = "${var.prefix}-bastion-sg"
  description = "for bastion"
  vpc_id      = aws_vpc.this.id

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "ICMP"
    from_port   = -1
    to_port     = -1
    protocol    = "icmp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.prefix}-bastion-sg"
  }
}

resource "aws_security_group" "web" {
  name        = "${var.prefix}-web-sg"
  description = "for web"
  vpc_id      = aws_vpc.this.id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.prefix}-web-sg"
  }
}

resource "aws_security_group" "api" {
  name        = "${var.prefix}-api-sg"
  description = "for api"
  vpc_id      = aws_vpc.this.id

  ingress {
    description = "API"
    from_port   = 8000
    to_port     = 8000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.prefix}-api-sg"
  }
}

resource "aws_security_group" "db" {
  name        = "${var.prefix}-db-sg"
  description = "for db"
  vpc_id      = aws_vpc.this.id

  ingress {
    description = "MySQL"
    from_port   = 3306
    to_port     = 3306
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.prefix}-db-sg"
  }
}

resource "aws_security_group" "redis" {
  name        = "redis-sg"
  description = "for redis"
  vpc_id      = aws_vpc.this.id

  ingress {
    description = "Redis"
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "redis-sg"
  }
}
