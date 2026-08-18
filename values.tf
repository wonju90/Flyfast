variable "aws_region" {
  description = "AWS region to deploy resources into"
  type        = string
  default     = "ap-northeast-2"
}

variable "prefix" {
  description = "Resource name prefix"
  type        = string
  default     = "Flyfast"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "172.16.0.0/16"
}

variable "azs" {
  description = "Availability zones used for the multi-AZ layout"
  type        = map(string)
  default = {
    a = "ap-northeast-2a"
    c = "ap-northeast-2c"
  }
}

variable "subnet_cidrs" {
  description = "CIDR blocks for each subnet, keyed by subnet identifier"
  type        = map(string)
  default = {
    public01  = "172.16.0.0/24"
    public02  = "172.16.1.0/24"
    front01   = "172.16.10.0/24"
    front02   = "172.16.11.0/24"
    backend01 = "172.16.20.0/24"
    backend02 = "172.16.21.0/24"
    db01      = "172.16.30.0/24"
    db02      = "172.16.31.0/24"
  }
}

variable "key_path" {
  description = "Local path where the generated SSH private key (.pem) is stored"
  type        = string
  default     = "/Users/wonju/keys/Flyfast-key.pem"
}
