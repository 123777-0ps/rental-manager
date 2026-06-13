#!/bin/bash
# ============================================
# 演唱会手机租赁管理系统 - 一键部署脚本
# 适用系统：Ubuntu 20.04 / 22.04
# 使用方法：sudo bash deploy.sh
# ============================================

set -e

echo "============================================"
echo "  演唱会手机租赁管理系统 - 一键部署"
echo "============================================"

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

success() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# 检查是否 root
if [ "$EUID" -ne 0 ]; then
  error "请使用 sudo 运行此脚本: sudo bash deploy.sh"
fi

# ==================== 配置 ====================
APP_NAME="rental"
APP_DIR="/opt/rental"
APP_PORT=5000
NODE_MAJOR=24

echo ""
echo "请输入以下配置信息（直接回车使用默认值）："
echo ""

# 域名
read -p "域名（没有域名直接回车跳过）: " DOMAIN
DOMAIN=${DOMAIN:-""}

# Supabase 配置
read -p "Supabase URL（如 https://xxxx.supabase.co）: " SUPABASE_URL
if [ -z "$SUPABASE_URL" ]; then
  error "Supabase URL 不能为空"
fi

read -p "Supabase Service Role Key: " SUPABASE_KEY
if [ -z "$SUPABASE_KEY" ]; then
  error "Supabase Service Role Key 不能为空"
fi

echo ""
echo "============================================"
echo "  开始部署..."
echo "============================================"

# ==================== 1. 安装 Node.js ====================
echo ""
echo "--- [1/6] 安装 Node.js ${NODE_MAJOR} ---"

if command -v node &> /dev/null && [[ "$(node -v)" == v${NODE_MAJOR}* ]]; then
  success "Node.js 已安装: $(node -v)"
else
  curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash -
  apt-get install -y nodejs
  success "Node.js 安装完成: $(node -v)"
fi

# ==================== 2. 安装 pnpm + PM2 ====================
echo ""
echo "--- [2/6] 安装 pnpm 和 PM2 ---"

if command -v pnpm &> /dev/null; then
  success "pnpm 已安装: $(pnpm -v)"
else
  npm install -g pnpm
  success "pnpm 安装完成: $(pnpm -v)"
fi

if command -v pm2 &> /dev/null; then
  success "PM2 已安装: $(pm2 -v)"
else
  npm install -g pm2
  success "PM2 安装完成"
fi

# ==================== 3. 安装项目依赖 & 构建 ====================
echo ""
echo "--- [3/6] 安装依赖 & 构建 ---"

cd ${APP_DIR}

# 写入 .env
cat > .env << EOF
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_KEY}
PORT=${APP_PORT}
EOF
success ".env 配置已写入"

pnpm install --frozen-lockfile 2>/dev/null || pnpm install
success "依赖安装完成"

pnpm run build
success "项目构建完成"

# ==================== 4. 启动服务 ====================
echo ""
echo "--- [4/6] 启动服务 ---"

pm2 delete ${APP_NAME} 2>/dev/null || true
pm2 start pnpm --name "${APP_NAME}" -- start
pm2 save

# 开机自启
pm2_startup_output=$(pm2 startup 2>&1) || true
if echo "$pm2_startup_output" | grep -q "sudo"; then
  echo "$pm2_startup_output" | grep "sudo" | bash 2>/dev/null || true
fi
success "服务已启动 (PM2 守护)"

# ==================== 5. 开放防火墙 ====================
echo ""
echo "--- [5/6] 配置防火墙 ---"

if command -v ufw &> /dev/null; then
  ufw allow 80/tcp 2>/dev/null || true
  ufw allow 443/tcp 2>/dev/null || true
  ufw allow ${APP_PORT}/tcp 2>/dev/null || true
  success "UFW 防火墙已放行 80/443/${APP_PORT}"
elif command -v firewall-cmd &> /dev/null; then
  firewall-cmd --permanent --add-port=80/tcp 2>/dev/null || true
  firewall-cmd --permanent --add-port=443/tcp 2>/dev/null || true
  firewall-cmd --permanent --add-port=${APP_PORT}/tcp 2>/dev/null || true
  firewall-cmd --reload 2>/dev/null || true
  success "Firewalld 防火墙已放行 80/443/${APP_PORT}"
else
  warn "未检测到防火墙，请手动开放 80/443/${APP_PORT} 端口"
fi

# ==================== 6. Nginx + SSL ====================
echo ""
echo "--- [6/6] 配置 Nginx ---"

if [ -n "$DOMAIN" ]; then
  if ! command -v nginx &> /dev/null; then
    apt-get install -y nginx
  fi

  cat > /etc/nginx/sites-available/${APP_NAME} << EOF
server {
    listen 80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
EOF

  ln -sf /etc/nginx/sites-available/${APP_NAME} /etc/nginx/sites-enabled/
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl reload nginx
  success "Nginx 配置完成"

  # SSL 证书
  if command -v certbot &> /dev/null; then
    echo ""
    read -p "是否申请免费 SSL 证书？(y/n): " DO_SSL
    if [ "$DO_SSL" = "y" ]; then
      certbot --nginx -d ${DOMAIN} --non-interactive --agree-tos --register-unsafely-without-email || \
      certbot --nginx -d ${DOMAIN}
      success "SSL 证书安装完成"
    fi
  else
    warn "certbot 未安装，跳过 SSL。稍后可手动安装："
    warn "  apt install certbot python3-certbot-nginx"
    warn "  certbot --nginx -d ${DOMAIN}"
  fi
else
  warn "未配置域名，跳过 Nginx"
  warn "可通过 http://<服务器IP>:${APP_PORT} 直接访问"
  warn "PWA 安装功能需要 HTTPS，建议配置域名 + SSL"
fi

# ==================== 完成 ====================
echo ""
echo "============================================"
echo -e "${GREEN}  部署完成！${NC}"
echo "============================================"
echo ""

if [ -n "$DOMAIN" ]; then
  echo "  访问地址: https://${DOMAIN}"
else
  # 获取服务器公网IP
  PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s ip.sb 2>/dev/null || echo "<服务器IP>")
  echo "  访问地址: http://${PUBLIC_IP}:${APP_PORT}"
fi

echo ""
echo "  常用命令："
echo "    查看日志:  pm2 logs ${APP_NAME}"
echo "    重启服务:  pm2 restart ${APP_NAME}"
echo "    停止服务:  pm2 stop ${APP_NAME}"
echo "    更新代码:  cd ${APP_DIR} && git pull && pnpm install && pnpm run build && pm2 restart ${APP_NAME}"
echo ""
