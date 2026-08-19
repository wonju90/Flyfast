data "aws_ami" "amazon_linux_2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# ---------------------------------------------------------------------------
# Bastion (public01 / public02)
# ---------------------------------------------------------------------------
resource "aws_instance" "bastion_a" {
  ami                    = data.aws_ami.amazon_linux_2023.id
  instance_type          = "t3.micro"
  subnet_id              = aws_subnet.this["public01"].id
  private_ip             = "172.16.0.10"
  key_name               = aws_key_pair.this.key_name
  vpc_security_group_ids = [aws_vpc.this.default_security_group_id, aws_security_group.bastion.id]

  tags = {
    Name = "${var.prefix}-bastion-a"
  }
}

resource "aws_instance" "bastion_c" {
  ami                    = data.aws_ami.amazon_linux_2023.id
  instance_type          = "t3.micro"
  subnet_id              = aws_subnet.this["public02"].id
  private_ip             = "172.16.1.10"
  key_name               = aws_key_pair.this.key_name
  vpc_security_group_ids = [aws_vpc.this.default_security_group_id, aws_security_group.bastion.id]

  tags = {
    Name = "${var.prefix}-bastion-c"
  }
}

# ---------------------------------------------------------------------------
# Web (front01 / front02)
# ---------------------------------------------------------------------------
resource "aws_instance" "web_a" {
  ami                    = data.aws_ami.amazon_linux_2023.id
  instance_type          = "t3.small"
  subnet_id              = aws_subnet.this["front01"].id
  private_ip             = "172.16.10.10"
  key_name               = aws_key_pair.this.key_name
  vpc_security_group_ids = [aws_vpc.this.default_security_group_id, aws_security_group.web.id]

  tags = {
    Name = "${var.prefix}-web-a"
  }
}

resource "aws_instance" "web_c" {
  ami                    = data.aws_ami.amazon_linux_2023.id
  instance_type          = "t3.small"
  subnet_id              = aws_subnet.this["front02"].id
  private_ip             = "172.16.11.10"
  key_name               = aws_key_pair.this.key_name
  vpc_security_group_ids = [aws_vpc.this.default_security_group_id, aws_security_group.web.id]

  tags = {
    Name = "${var.prefix}-web-c"
  }
}

# ---------------------------------------------------------------------------
# API (backend01 / backend02)
# ---------------------------------------------------------------------------
resource "aws_instance" "api_a" {
  ami                    = data.aws_ami.amazon_linux_2023.id
  instance_type          = "t3.small"
  subnet_id              = aws_subnet.this["backend01"].id
  private_ip             = "172.16.20.10"
  key_name               = aws_key_pair.this.key_name
  vpc_security_group_ids = [aws_vpc.this.default_security_group_id, aws_security_group.api.id]

  tags = {
    Name = "${var.prefix}-api-a"
  }
}

resource "aws_instance" "api_c" {
  ami                    = data.aws_ami.amazon_linux_2023.id
  instance_type          = "t3.small"
  subnet_id              = aws_subnet.this["backend02"].id
  private_ip             = "172.16.21.10"
  key_name               = aws_key_pair.this.key_name
  vpc_security_group_ids = [aws_vpc.this.default_security_group_id, aws_security_group.api.id]

  tags = {
    Name = "${var.prefix}-api-c"
  }
}

# ---------------------------------------------------------------------------
# Redis (backend01 전용 — 단일 인스턴스, AZ 이중화 없음)
# ---------------------------------------------------------------------------
resource "aws_instance" "redis_a" {
  ami                    = data.aws_ami.amazon_linux_2023.id
  instance_type          = "t3.small"
  subnet_id              = aws_subnet.this["backend01"].id
  private_ip             = "172.16.20.100"
  key_name               = aws_key_pair.this.key_name
  vpc_security_group_ids = [aws_vpc.this.default_security_group_id, aws_security_group.redis.id]

  tags = {
    Name = "${var.prefix}-redis-a"
  }
}

# ---------------------------------------------------------------------------
# MySQL (db01 전용 — 단일 인스턴스, AZ 이중화 없음)
# ---------------------------------------------------------------------------
resource "aws_instance" "mysql_a" {
  ami                    = data.aws_ami.amazon_linux_2023.id
  instance_type          = "t3.small"
  subnet_id              = aws_subnet.this["db01"].id
  private_ip             = "172.16.30.10"
  key_name               = aws_key_pair.this.key_name
  vpc_security_group_ids = [aws_vpc.this.default_security_group_id, aws_security_group.db.id]

  tags = {
    Name = "${var.prefix}-mysql-a"
  }
}
