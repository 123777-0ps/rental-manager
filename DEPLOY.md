# 演唱会手机租赁设备管理系统 - 部署指南

## 一、环境要求

- **Node.js** 24+ （推荐用 [nvm](https://github.com/nvm-sh/nvm) 管理）
- **pnpm** 9+ （安装：`npm install -g pnpm`）
- **Supabase** 账号（免费版即可）

---

## 二、腾讯云部署（推荐）

### 2.1 购买云服务器

1. 登录 [腾讯云控制台](https://console.cloud.tencent.com/)
2. 购买轻量应用服务器（推荐配置）：
   - **CPU**：2核
   - **内存**：2GB
   - **系统**：Ubuntu 22.04
   - **带宽**：4Mbps（按需选择）
   - 轻量服务器年费约 50-100 元，够用且便宜

3. 购买后进入服务器管理页，记录**公网 IP**（如 `43.136.xx.xx`）

### 2.2 连接服务器

```bash
# 方式一：腾讯云控制台网页登录（推荐新手）
# 在服务器管理页点击「登录」→「标准登录」→ 输入密码

# 方式二：本地终端 SSH 连接
ssh root@你的公网IP
# 输入购买时设置的密码
```

### 2.3 安装 Node.js 和 pnpm

```bash
# 安装 nvm（Node 版本管理器）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc

# 安装 Node.js 24
nvm install 24
nvm use 24

# 验证
node -v   # 应输出 v24.x.x
npm -v

# 安装 pnpm
npm install -g pnpm
```

### 2.4 上传项目代码

**方式一：Git 拉取（推荐）**

如果你的代码在 GitHub/Gitee 上：
```bash
# 安装 git
apt update && apt install -y git

# 克隆项目
git clone https://你的仓库地址.git ~/rental-manager
cd ~/rental-manager
```

**方式二：SCP 上传**

在**本地电脑**终端执行（不是服务器上）：
```bash
# 先在沙箱中打包项目（排除 node_modules）
cd /workspace/projects
tar --exclude='node_modules' --exclude='.git' -czf /tmp/rental-manager.tar.gz .

# 上传到服务器
scp /tmp/rental-manager.tar.gz root@你的公网IP:~/rental-manager.tar.gz

# 然后在服务器上解压
ssh root@你的公网IP
mkdir -p ~/rental-manager && cd ~/rental-manager
tar -xzf ~/rental-manager.tar.gz
```

### 2.5 配置 Supabase 数据库

1. 访问 [supabase.com](https://supabase.com) 注册账号
2. 点击 **New Project** 创建项目，选离你最近的区域（推荐新加坡）
3. 进入项目 → 左侧 **SQL Editor** → 复制 `supabase-init.sql` 全部内容 → 点 **Run** 执行
4. 左侧 **Settings** → **API**，记录：
   - **Project URL**：`https://xxxxx.supabase.co`
   - **service_role** 密钥（保密！）

### 2.6 配置环境变量

```bash
cd ~/rental-manager
cp .env.example .env
nano .env
```

填入你的 Supabase 配置：
```env
SUPABASE_URL=https://你的项目ID.supabase.co
SUPABASE_ANON_KEY=你的anon_key
SUPABASE_SERVICE_ROLE_KEY=你的service_role_key
PORT=5000
```

按 `Ctrl+X` → `Y` → `Enter` 保存。

### 2.7 构建并启动

```bash
cd ~/rental-manager

# 安装依赖
pnpm install

# 构建生产版本
pnpm build

# 启动服务
pnpm start
```

此时服务运行在服务器的 5000 端口，但外网还访问不了，需要开放防火墙。

### 2.8 开放防火墙端口

**腾讯云轻量服务器：**
1. 进入 [轻量服务器控制台](https://console.cloud.tencent.com/lighthouse)
2. 点击你的服务器 → **防火墙** 标签页
3. 点击 **添加规则**：
   - 协议：TCP
   - 端口：5000
   - 策略：允许
   - 备注：租赁管理系统

**如果是 CVM 云服务器：**
1. 进入 [安全组管理](https://console.cloud.tencent.com/vpc/securitygroup)
2. 入站规则 → 添加规则 → TCP:5000 → 允许

### 2.9 验证访问

浏览器打开 `http://你的公网IP:5000`，应该能看到系统页面。

### 2.10 配置域名（可选）

如果有域名（如 `rental.yourdomain.com`）：

1. 在域名管理商处添加 A 记录，指向服务器公网 IP
2. 安装 Nginx 反向代理 + SSL 证书：

```bash
# 安装 Nginx
apt install -y nginx

# 安装 certbot（免费 SSL 证书）
apt install -y certbot python3-certbot-nginx

# 配置 Nginx
cat > /etc/nginx/sites-available/rental << 'EOF'
server {
    listen 80;
    server_name rental.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

# 启用配置
ln -s /etc/nginx/sites-available/rental /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# 申请免费 SSL 证书
certbot --nginx -d rental.yourdomain.com
```

配置完成后通过 `https://rental.yourdomain.com` 访问。

### 2.11 保持服务后台运行（必须）

直接 `pnpm start` 会在关闭终端后停止，需要用进程守护工具：

**方式一：PM2（推荐）**

```bash
# 安装 PM2
npm install -g pm2

# 启动服务
cd ~/rental-manager
pm2 start dist-server/server.js --name rental -i 1 -- --port 5000

# 设置开机自启
pm2 startup
pm2 save

# 常用命令
pm2 status          # 查看运行状态
pm2 logs rental     # 查看日志
pm2 restart rental  # 重启
pm2 stop rental     # 停止
```

**方式二：systemd 服务**

```bash
cat > /etc/systemd/system/rental.service << 'EOF'
[Unit]
Description=租赁管理系统
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/rental-manager
ExecStart=/root/.nvm/versions/node/v24.0.0/bin/node dist-server/server.js
Restart=always
RestartSec=10
Environment=PORT=5000
EnvironmentFile=/root/rental-manager/.env

[Install]
WantedBy=multi-user.target
EOF

# 启用并启动
systemctl daemon-reload
systemctl enable rental
systemctl start rental

# 查看状态
systemctl status rental
```

---

## 三、快速部署一键脚本

把以下内容保存为 `deploy.sh`，在服务器上执行 `bash deploy.sh`：

```bash
#!/bin/bash
set -e

echo "===== 演唱会手机租赁管理系统 - 一键部署 ====="

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "安装 Node.js..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
    source ~/.bashrc
    nvm install 24
fi

# 检查 pnpm
if ! command -v pnpm &> /dev/null; then
    echo "安装 pnpm..."
    npm install -g pnpm
fi

# 检查 PM2
if ! command -v pm2 &> /dev/null; then
    echo "安装 PM2..."
    npm install -g pm2
fi

# 检查 .env
if [ ! -f .env ]; then
    echo "⚠️  未找到 .env 文件！"
    echo "请先执行：cp .env.example .env && nano .env"
    echo "填入你的 Supabase 配置后重新运行此脚本。"
    exit 1
fi

# 安装依赖
echo "安装依赖..."
pnpm install

# 构建
echo "构建项目..."
pnpm build

# 启动
echo "启动服务..."
pm2 delete rental 2>/dev/null || true
pm2 start dist-server/server.js --name rental -- --port 5000
pm2 startup
pm2 save

echo ""
echo "===== 部署完成 ====="
echo "访问地址：http://$(curl -s ifconfig.me):5000"
echo ""
echo "常用命令："
echo "  pm2 status        # 查看状态"
echo "  pm2 logs rental   # 查看日志"
echo "  pm2 restart rental # 重启服务"
```

---

## 四、更新部署

当项目代码有更新时：

```bash
cd ~/rental-manager

# 拉取最新代码（如果用 Git）
git pull

# 重新构建
pnpm install
pnpm build

# 重启服务
pm2 restart rental
```

---

## 五、常见问题

### Q: 启动报错 "SUPABASE_URL is not set"
检查 `.env` 文件是否存在且配置正确，确保在项目根目录下。

### Q: 数据库连接失败
- 检查 Supabase 项目是否处于活跃状态（免费版7天不活跃会暂停）
- 确认 service_role_key 正确（不是 anon_key）
- 服务器网络需能访问 Supabase（新加坡节点国内可直连）

### Q: 外网无法访问
- 检查腾讯云防火墙是否开放了 5000 端口
- 检查服务器内 ufw 防火墙：`ufw allow 5000`
- 检查 PM2 是否在运行：`pm2 status`

### Q: 端口被占用
修改 `.env` 中的 `PORT` 为其他端口，同时更新防火墙规则。

### Q: 没有网络能运行吗？
项目内置 localStorage 降级机制。Supabase 不可用时自动回退浏览器本地存储，但数据仅保存在当前浏览器中。
