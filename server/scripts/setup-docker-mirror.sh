#!/bin/bash
# Docker 镜像加速配置脚本（适用于国内服务器）

echo "配置 Docker 镜像加速器..."

# 创建 Docker 配置目录
sudo mkdir -p /etc/docker

# 写入镜像加速配置
sudo tee /etc/docker/daemon.json <<-'EOF'
{
  "registry-mirrors": [
    "https://docker.1ms.run",
    "https://docker.m.daocloud.io",
    "https://docker.xuanyuan.me"
  ]
}
EOF

# 重启 Docker 服务
sudo systemctl daemon-reload
sudo systemctl restart docker

# 验证配置
echo ""
echo "验证 Docker 镜像配置："
docker info | grep "Registry Mirrors" -A 5

echo ""
echo "Docker 镜像加速器配置完成！"