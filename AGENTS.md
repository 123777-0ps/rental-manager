# 项目上下文

## 项目概述

演唱会手机租赁设备管理系统 - 用于广州仓库管理 86 台租赁手机（vivo X200U 65台[编号001-065]、三星17台[编号084-100]、苹果4台[编号301-304]）的发货、归还、库存统计等业务流程。所有订单来源为闲鱼平台，UI风格复刻闲鱼订单版式。支持设备编号级别的精细追踪，每台设备可独立分配与追溯。库存总览含仪表盘图表（SVG环形图）、设备增删改查（进货价格/成色/备注）、资产价值统计。

## 技术栈

- **核心**: Vite 7, TypeScript, Express
- **UI**: Tailwind CSS（闲鱼风格橙/琥珀色配色）
- **数据存储**: Supabase（PostgreSQL 数据库持久化）+ localStorage 降级兜底

## 目录结构

```
├── scripts/            # 构建与启动脚本
│   ├── build.sh        # 构建脚本
│   ├── dev.sh          # 开发环境启动脚本
│   ├── prepare.sh      # 预处理脚本
│   └── start.sh        # 生产环境启动脚本
├── server/             # 服务端逻辑
│   ├── routes/         # API 路由
│   │   ├── index.ts    # 路由注册入口
│   │   └── api.ts      # RESTful API（Supabase CRUD）
│   ├── src/storage/database/  # Supabase 客户端
│   │   ├── supabase-client.ts # Supabase 连接与认证
│   │   └── shared/     # Schema 定义
│   ├── server.ts       # Express 服务入口
│   └── vite.ts         # Vite 中间件集成
├── src/                # 前端源码
│   ├── types.ts        # 类型定义（RentalRecord含deviceNumbers/isTransfer/transferredFromId, TransferMatch, DeviceModel, DeviceStatus, InventoryStats, TabType, ReminderItem）
│   ├── store.ts        # 数据存储层（Supabase API + localStorage 降级、设备编号管理、库存计算、提醒逻辑、闲鱼订单编号生成、智能粘贴解析、转寄匹配findTransferMatches/confirmTransfer/extractCity/getTransitDaysBetween）
│   ├── index.css       # 全局样式（Tailwind + 闲鱼风格 + 自定义动画）
│   ├── index.ts        # 客户端入口
│   └── main.ts         # 主逻辑（UI 渲染、事件绑定、表单处理、智能提醒弹窗）
├── index.html          # 入口 HTML
├── package.json        # 项目依赖管理
├── tsconfig.json       # TypeScript 配置
└── vite.config.ts      # Vite 配置
```

## 核心功能模块

1. **库存总览** - 实时展示各机型在仓/外租/待发货数量、使用率、逾期提醒、待发货订单、设备编号明细（绿色=在仓、橙色=外租）
2. **订单记录** - 闲鱼订单表头录入（订单编号自动生成、设备型号、租赁数量、闲鱼客户、手机号、四段时间链路、智能粘贴自动填写），创建后状态为"待发货"，不选择设备编号
3. **设备记录** - 闲鱼风格订单表格，支持按状态/机型/设备编号/手机号/日期范围筛选，待发货订单可"分配设备"（选择编号后状态变为"已发出"），三端响应式（桌面表格/平板表格/移动卡片）
4. **归还入库** - 一键标记归还，设备编号自动释放回在仓池，保留完整记录
5. **删除管理** - 手动删除无效记录
6. **智能提醒** - 发货弹窗提醒（提前1天/当日）、到仓弹窗提醒（提前1天）、短信通知（一键复制）
7. **转寄匹配** - 自动匹配可转寄订单（已发出→待发货），基于地址物流天数计算，确认转寄后A变为已转寄、B继承设备编号变为已发出

## 关键业务规则

- 订单编号格式：`XY` + 日期(8位) + 序号(4位)，如 `XY202605111234`
- 设备编号体系：vivo X200U 001-065、三星 084-100、苹果 301-304
- 订单创建时状态为"待发货"，不选设备编号；在设备记录中分配编号后变为"已发出"
- 设备四态：待发货 → 已发出 → 已转寄/已归还
- 库存计算：在仓数 = 总量 - 已发出设备编号数量（已归还不计入外租，待发货不计入外租但显示在待发货统计中）
- 发货地址自动识别省内/省外，自动计算物流时间（省内±1天、省外±2天）
- 时间链路：预计发货日期 → 收货日期 → 预计寄出日期 → 预计到仓时间
- 提醒弹窗：每日首次打开页面自动弹出，关闭后当日不再弹出（可点击铃铛重新查看）
- 短信内容固定文案：「您好，您在闲鱼租赁的演唱会拍摄手机已从广州仓库发货，请留意物流信息，祝您观影愉快」

## 数据存储

- 主存储：Supabase PostgreSQL 数据库（通过 RESTful API 读写）
- 降级兜底：当 API 请求失败时自动回退到 localStorage
- localStorage 键名：`rental_records`（降级）、`device_info`（降级）、`rental_migration_done`（迁移标记）
- 数据库表：`rental_records`（订单记录，含is_transfer/transferred_from_id字段）、`device_info`（设备详情）
- 迁移机制：首次加载自动将 localStorage 数据迁移到数据库，迁移完成后标记不再重复
- Supabase 客户端：`server/src/storage/database/supabase-client.ts`（服务端 service_role 访问）
- API 路由：`server/routes/api.ts`（所有 CRUD 操作通过 /api/* 路由）

## 包管理规范

**仅允许使用 pnpm** 作为包管理器，**严禁使用 npm 或 yarn**。

## 开发规范

- 使用 Tailwind CSS 进行样式开发，闲鱼风格配色（orange/amber 主色调）
- 默认按 TypeScript `strict` 心智写代码；优先复用当前作用域已声明的变量、函数、类型和导入
- 禁止隐式 `any` 和 `as any`；函数参数、返回值、解构项、事件对象应有明确类型
- 手机号展示时中间4位脱敏（`139****5678`格式）

## 构建和测试命令

- `pnpm ts-check` - TypeScript 类型检查
- `pnpm lint` - ESLint 代码检查
- `pnpm validate` - 并行执行 ts-check 和 lint:build
- `pnpm dev` - 启动开发环境（端口 5000）
- `pnpm build` - 构建生产版本
- `pnpm start` - 启动生产环境
