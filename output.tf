output "vpc_id" {
  description = "ID of the created VPC"
  value       = aws_vpc.this.id
}

output "bastion_public_ips" {
  description = "Public IPs of the bastion hosts"
  value = {
    bastion_a = aws_instance.bastion_a.public_ip
    bastion_c = aws_instance.bastion_c.public_ip
  }
}

output "private_ips" {
  description = "Private IPs of every EC2 instance"
  value = {
    bastion_a = aws_instance.bastion_a.private_ip
    bastion_c = aws_instance.bastion_c.private_ip
    web_a     = aws_instance.web_a.private_ip
    web_c     = aws_instance.web_c.private_ip
    api_a     = aws_instance.api_a.private_ip
    api_c     = aws_instance.api_c.private_ip
    redis_a   = aws_instance.redis_a.private_ip
    redis_c   = aws_instance.redis_c.private_ip
    mysql_a   = aws_instance.mysql_a.private_ip
    mysql_c   = aws_instance.mysql_c.private_ip
  }
}

output "key_path" {
  description = "Local path of the generated SSH private key (.pem)"
  value       = local_sensitive_file.private_key.filename
}
