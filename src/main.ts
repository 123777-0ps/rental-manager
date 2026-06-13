import {
  type RentalRecord,
  type DeviceModel,
  type DeviceCondition,
  type InventoryStats,
  type ModelStats,
  type TabType,
  type BulkReturnBatch,
  type BulkReturnLog,
  type TransferMatch,
  type TransferLog,
} from './types';
import {
  loadRecords,
  loadRecordsSync,
  addRecord,
  deleteRecord,
  returnRecord,
  assignDeviceNumbers,
  getRentedDeviceNumbers,
  getAvailableDeviceNumbers,
  getAllDeviceNumbers,
  assignPeerShipping,
  invalidateCache,
  calcInventory,
  isGuangdongAddress,
  getTransitDays,
  parsePasteText,
  addDays,
  getReminders,
  getSmsPendingRecords,
  isReminderDismissed,
  dismissReminders,
  loadDeviceInfo,
  loadDeviceInfoSync,
  upsertDeviceInfo,
  deleteDeviceInfo,
  calcModelAssetValue,
  addDevicesToInventory,
  removeDevicesFromInventory,
  getDeviceInfoByModel,
  addRecordsBatch,
  getDeviceModelByNumber,
  getAllAvailableDeviceNumbers,
  bulkReturnDevices,
  loadBulkReturnBatches,
  loadBulkReturnDetails,
  deleteBulkReturnBatch,
  updateRecord,
  findTransferMatches,
  confirmTransfer,
  extractCity,
  getTransitDaysBetween,
  loadTransferLogs,
} from './store';

// ========== 全局状态 ==========

/** 动态获取所有机型列表（预设 + 自定义），含 loadDeviceInfoSync 刷新 */
function getAllModels(): DeviceModel[] {
  const deviceInfoList = loadDeviceInfoSync();
  const modelSet = new Set<DeviceModel>();
  for (const d of deviceInfoList) {
    modelSet.add(d.model);
  }
  const presetModels: DeviceModel[] = ['vivo X200U', '三星', '苹果'];
  // 预设在前，自定义在后
  return [...presetModels.filter(m => modelSet.has(m)), ...[...modelSet].filter(m => !presetModels.includes(m))];
}

let currentTab: TabType = 'dashboard';
let filterStatus = 'all';
let filterModel = 'all';
let filterDeviceNumber = '';
let filterXianyuCustomer = '';
let filterShopName = 'all';
let filterShipDateFrom = '';
let filterShipDateTo = '';
let filterReceiptDateFrom = '';
let filterReceiptDateTo = '';
let filterReturnDateFrom = '';
let filterReturnDateTo = '';
let filterArrivalDateFrom = '';
let filterArrivalDateTo = '';
let filterShipAddress = '';
let sortField: 'orderId' | 'shipDate' = 'orderId';
let sortDirection: 'asc' | 'desc' = 'asc';
let currentPage = 1;
const PAGE_SIZE = 10;
let dashboardPendingPage = 1;
let overduePage = 1;
const DASHBOARD_PAGE_SIZE = 10;
let transferPage = 1;
const TRANSFER_PAGE_SIZE = 5;
let ignoredTransferPairs: Set<string> = new Set();
let transferSwapFromId: string | null = null;
let transferLogs: TransferLog[] = [];
let transferLogPage = 1;
let transferSubTab: 'match' | 'records' = 'match';
const TRANSFER_LOG_PAGE_SIZE = 10;

interface PendingOrder {
  id: number;
  shopName: string;
  deviceModel: DeviceModel;
  quantity: number;
  xianyuCustomer: string;
  phone: string;
  shipAddress: string;
  addressOnly: string;
  shipDate: string;
  receiptDate: string;
  expectedReturnDate: string;
  estimatedArrivalDate: string;
  notes: string;
}
let pendingOrders: PendingOrder[] = [];
let pendingOrderSeq = 0;
let dashboardModelFilter: DeviceModel | 'all' = 'all';
let dashboardSearchKey = '';
let assigningRecordId = '';
let assigningDeviceNumbers: string[] = [];

// ========== 主渲染 ==========

export async function render(): Promise<void> {
  // 首次加载时从数据库拉取数据
  try {
    await Promise.all([loadRecords(), loadDeviceInfo()]);
  } catch (err) {
    console.error('加载数据失败:', err);
  }
  // 如果当前是到仓记录页，加载批次数据
  if (currentTab === 'bulk-return') {
    bulkReturnBatches = await loadBulkReturnBatches();
    if (selectedBatchId) {
      bulkReturnDetails = await loadBulkReturnDetails(selectedBatchId);
    }
  }
  // 如果当前是转寄匹配页，计算匹配结果
  if (currentTab === 'transfer') {
    transferMatches = findTransferMatches();
    transferLogs = await loadTransferLogs();
  }
  const app = document.getElementById('app');
  if (!app) return;
  const inventory = calcInventory();
  app.innerHTML = `
    <div class="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100 relative">
      <!-- 背景装饰 -->
      <div class="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div class="absolute -top-40 -right-40 w-96 h-96 bg-blue-200/30 rounded-full blur-3xl"></div>
        <div class="absolute top-1/3 -left-40 w-80 h-80 bg-indigo-200/30 rounded-full blur-3xl"></div>
        <div class="absolute bottom-0 right-1/4 w-72 h-72 bg-cyan-200/20 rounded-full blur-3xl"></div>
      </div>
      <!-- 顶部 -->
      <header class="glass-header border-b border-white/30 relative overflow-hidden">
        <div class="absolute top-0 left-0 right-0 h-1 header-accent"></div>
        <div class="max-w-[1600px] mx-auto px-4 py-3 sm:py-4 flex items-center justify-between">
          <div class="flex items-center gap-2 sm:gap-3">
            <svg class="w-6 h-6 sm:w-7 sm:h-7 text-[#409EFF]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
            <div>
              <h1 class="text-base sm:text-lg font-bold tracking-wide text-[#303133]">租赁设备管理</h1>
              <p class="text-[10px] sm:text-xs text-[#909399]">广州仓库 · 演唱会手机租赁</p>
            </div>
          </div>
          <button id="reminderBell" class="relative hover:bg-[#F5F7FA] p-2 rounded-lg transition-colors">
            <svg class="w-5 h-5 text-[#606266]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
            <span id="reminderBadge" class="hidden absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full items-center justify-center font-bold"></span>
          </button>
          <button id="installAppBtn" class="hover:bg-[#F5F7FA] p-2 rounded-lg transition-colors" title="安装App">
            <svg class="w-5 h-5 text-[#606266]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
          </button>
        </div>
        ${buildDashboard(inventory)}
      </header>
      <main class="max-w-[1600px] mx-auto px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
        ${buildTabBar()}
        ${currentTab === 'dashboard' ? buildDashboardDetail(inventory) : ''}
        ${currentTab === 'ship' ? buildShipForm() : ''}
        ${currentTab === 'records' ? buildRecordsSection() : ''}
        ${currentTab === 'bulk-return' ? buildBulkReturnSection() : ''}
        ${currentTab === 'transfer' ? buildTransferSection() : ''}
      </main>
      <div id="assignModal"></div>
      <div id="recordEditModal"></div>
      <div id="deviceEditModal"></div>
      <div id="addDeviceModal"></div>
      <div id="removeDeviceModal"></div>
      <div id="reminderModal"></div>
    </div>
  `;
  bindEvents();
  if (currentTab === 'dashboard') showReminderModal();
}

// ========== 顶部统计卡片 ==========

function buildDashboard(stats: InventoryStats): string {
  const modelColors = [
    { border: 'border-blue-200', accent: 'text-blue-600', lightBg: 'bg-blue-50' },
    { border: 'border-purple-200', accent: 'text-purple-600', lightBg: 'bg-purple-50' },
    { border: 'border-gray-300', accent: 'text-gray-700', lightBg: 'bg-gray-50' },
    { border: 'border-emerald-200', accent: 'text-emerald-600', lightBg: 'bg-emerald-50' },
    { border: 'border-rose-200', accent: 'text-rose-600', lightBg: 'bg-rose-50' },
    { border: 'border-amber-200', accent: 'text-amber-600', lightBg: 'bg-amber-50' },
  ];
  const modelEntries = Object.entries(stats.models);
  const modelCards = modelEntries.map(([name, m], i) => {
    const c = modelColors[i % modelColors.length];
    return buildStatCard(name, m.total, m.available, m.rented, m.pending, c.border, c.accent, c.lightBg);
  }).join('');
  return `
    <div class="max-w-[1600px] mx-auto px-4">
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 py-4 sm:py-6">
        ${modelCards}
        ${buildTotalCard(stats.totalDevices, stats.totalAvailable, stats.totalRented, stats.totalPending)}
      </div>
    </div>
  `;
}

function buildStatCard(
  name: string, total: number, available: number, rented: number, pending: number,
  border: string, accent: string, lightBg: string
): string {
  const isWarning = available <= 0;
  const warningAccent = isWarning ? 'text-red-600' : accent;
  const warningBg = isWarning ? 'bg-red-50' : lightBg;
  const pendingLabel = pending > 0 ? `<span class="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">待发${pending}单</span>` : '';
  return `
    <div class="glass-card ${border} border rounded-xl p-3 sm:p-4 hover:shadow-card-hover transition-all duration-200">
      <div class="text-xs sm:text-sm font-medium text-gray-500 mb-2 truncate">${name}</div>
      <div class="flex items-baseline gap-1">
        <span class="text-xl sm:text-2xl font-bold ${warningAccent}">${available}</span>
        <span class="text-xs text-gray-400">/</span>
        <span class="text-sm text-gray-400">${total}台</span>
      </div>
      <div class="mt-2 flex items-center gap-1.5 text-xs flex-wrap">
        <span class="${warningBg} ${warningAccent} px-2 py-0.5 rounded-full font-medium">在仓 ${available}</span>
        <span class="bg-[#FDF6EC] text-[#E6A23C] px-2 py-0.5 rounded-full font-medium">外租 ${rented}</span>
        ${pendingLabel}
      </div>
    </div>
  `;
}

function buildTotalCard(total: number, available: number, rented: number, pending: number): string {
  const pendingLabel = pending > 0 ? `<span class="bg-white/20 px-2 py-0.5 rounded-full font-medium">待发${pending}单</span>` : '';
  return `
    <div style="background:linear-gradient(135deg,#409EFF,#2d6fce)" class="text-white rounded-xl p-3 sm:p-4 shadow-card hover:shadow-card-hover transition-all duration-200 backdrop-blur-sm">
      <div class="text-xs sm:text-sm font-medium text-white/80 mb-2">设备总计</div>
      <div class="flex items-baseline gap-1">
        <span class="text-xl sm:text-2xl font-bold">${available}</span>
        <span class="text-xs text-white/60">/</span>
        <span class="text-sm text-white/60">${total}台</span>
      </div>
      <div class="mt-2 flex items-center gap-1.5 text-xs flex-wrap">
        <span class="bg-white/20 px-2 py-0.5 rounded-full font-medium">在仓 ${available}</span>
        <span class="bg-white/20 px-2 py-0.5 rounded-full font-medium">外租 ${rented}</span>
        ${pendingLabel}
      </div>
    </div>
  `;
}

function buildTabBar(): string {
  const tabs: { key: TabType; label: string; icon: string }[] = [
    { key: 'dashboard', label: '库存总览', icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z' },
    { key: 'ship', label: '订单记录', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
    { key: 'records', label: '设备记录', icon: 'M12 19l9 2-9-18-9 18 9-2zm0 0v-8' },
    { key: 'bulk-return', label: '到仓记录', icon: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4' },
    { key: 'transfer', label: '转寄匹配', icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4' },
  ];
  return `
    <div class="max-w-[1600px] mx-auto px-4">
      <div class="flex gap-1 bg-white/70 backdrop-blur-md border border-blue-100/50 rounded-xl p-1">
        ${tabs.map((t) => `
          <button data-tab="${t.key}" class="tab-btn flex-1 flex items-center justify-center gap-1.5 py-2.5 sm:py-3 px-3 rounded-lg text-sm font-medium transition-all ${
            currentTab === t.key
              ? 'bg-white/90 text-blue-600 shadow-card'
              : 'text-gray-500 hover:text-gray-700'
          }">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${t.icon}"/>
            </svg>
            <span>${t.label}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

// ========== 库存总览（仪表盘 + 设备CRUD） ==========

function buildDashboardDetail(stats: InventoryStats): string {
  const records = loadRecordsSync();
  const today = new Date().toISOString().split('T')[0];
  const overdueRecords = records.filter((r) => r.status === '已发出' && r.expectedReturnDate < today);
  const pendingRecords = records.filter((r) => r.status === '待发货');

  // 动态计算所有机型资产价值（含自定义机型）
  const allModelKeys = Object.keys(stats.models);
  const modelAssetValues: Record<string, number> = {};
  for (const m of allModelKeys) {
    modelAssetValues[m] = calcModelAssetValue(m);
  }
  const totalValue = Object.values(modelAssetValues).reduce((s, v) => s + v, 0);

  return `
    <div class="space-y-6">
      ${overdueRecords.length > 0 ? (() => {
        const totalPages = Math.ceil(overdueRecords.length / DASHBOARD_PAGE_SIZE);
        if (overduePage > totalPages) overduePage = totalPages;
        if (overduePage < 1) overduePage = 1;
        const start = (overduePage - 1) * DASHBOARD_PAGE_SIZE;
        const pageRecords = overdueRecords.slice(start, start + DASHBOARD_PAGE_SIZE);
        return `
        <div class="glass-card overflow-hidden">
          <div class="glass-card-header bg-red-50 flex items-center gap-2">
            <svg class="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>
            <h3 class="text-red-700 font-semibold">逾期未还提醒 (${overdueRecords.length}条)</h3>
          </div>
          <div class="glass-card-body space-y-2">
            ${pageRecords.map((r) => `
              <div class="flex items-center justify-between bg-red-50/50 border border-red-100 rounded-lg px-3 py-2 text-sm">
                <div class="flex items-center gap-2 flex-1 min-w-0">
                  <span class="text-blue-600 font-mono text-xs">${r.orderId}</span>
                  <span class="text-gray-300">|</span>
                  <span class="font-medium truncate">${r.xianyuCustomer}</span>
                  <span class="text-gray-400">|</span>
                  <span class="text-gray-600">${r.deviceModel} x${r.deviceNumbers.length || r.quantity}</span>
                  ${r.deviceNumbers.length > 0 ? `<span class="text-sm text-blue-400 font-mono">[${r.deviceNumbers.join(', ')}]</span>` : ''}
                </div>
                <span class="text-red-500 text-xs whitespace-nowrap ml-2">应还 ${r.expectedReturnDate}</span>
              </div>
            `).join('')}
            ${totalPages > 1 ? `
            <div class="flex items-center justify-between mt-2 pt-2 border-t border-red-100">
              <div class="text-xs text-red-500">第 ${overduePage} / ${totalPages} 页</div>
              <div class="flex items-center gap-1">
                <button id="overdueFirst" class="px-2.5 py-1 rounded-md text-xs font-medium border border-red-200 bg-white hover:bg-red-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed" ${overduePage <= 1 ? 'disabled' : ''}>首页</button>
                <button id="overduePrev" class="px-2.5 py-1 rounded-md text-xs font-medium border border-red-200 bg-white hover:bg-red-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed" ${overduePage <= 1 ? 'disabled' : ''}>上一页</button>
                ${(() => {
                  let sp = Math.max(1, overduePage - 2);
                  const ep = Math.min(totalPages, sp + 4);
                  sp = Math.max(1, ep - 4);
                  const pages: string[] = [];
                  for (let p = sp; p <= ep; p++) {
                    pages.push(
                      `<button class="overdue-page-btn px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${p === overduePage ? 'bg-red-500 text-white border-red-500' : 'border-red-200 bg-white hover:bg-red-100'}" data-page="${p}">${p}</button>`
                    );
                  }
                  return pages.join('');
                })()}
                <button id="overdueNext" class="px-2.5 py-1 rounded-md text-xs font-medium border border-red-200 bg-white hover:bg-red-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed" ${overduePage >= totalPages ? 'disabled' : ''}>下一页</button>
                <button id="overdueLast" class="px-2.5 py-1 rounded-md text-xs font-medium border border-red-200 bg-white hover:bg-red-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed" ${overduePage >= totalPages ? 'disabled' : ''}>尾页</button>
              </div>
            </div>
            ` : ''}
          </div>
        </div>
        `;
      })() : ''}

      ${pendingRecords.length > 0 ? (() => {
        const totalPages = Math.ceil(pendingRecords.length / DASHBOARD_PAGE_SIZE);
        if (dashboardPendingPage > totalPages) dashboardPendingPage = totalPages;
        if (dashboardPendingPage < 1) dashboardPendingPage = 1;
        const start = (dashboardPendingPage - 1) * DASHBOARD_PAGE_SIZE;
        const pageRecords = pendingRecords.slice(start, start + DASHBOARD_PAGE_SIZE);
        return `
        <div class="glass-card overflow-hidden">
          <div class="glass-card-header bg-blue-50 flex items-center gap-2">
            <svg class="w-5 h-5 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <h3 class="text-blue-700 font-semibold">待发货订单 (${pendingRecords.length}条)</h3>
          </div>
          <div class="glass-card-body space-y-2">
            ${pageRecords.map((r) => `
              <div class="flex items-center justify-between bg-blue-50/50 border border-blue-100 rounded-lg px-3 py-2 text-sm">
                <div class="flex items-center gap-2 flex-1 min-w-0">
                  <span class="text-blue-600 font-mono text-xs">${r.orderId}</span>
                  <span class="text-gray-300">|</span>
                  <span class="font-medium truncate">${r.xianyuCustomer}</span>
                  <span class="text-gray-400">|</span>
                  <span class="text-gray-600">${r.deviceModel} x${r.quantity}</span>
                </div>
                <div class="flex items-center gap-2 ml-2">
                  <span class="text-blue-500 text-xs whitespace-nowrap">预计发货 ${r.shipDate}</span>
                  <button data-action="delete" data-id="${r.id}" class="text-red-400 hover:bg-red-50 px-1.5 py-0.5 rounded text-xs font-medium transition-colors" title="删除订单">删除</button>
                </div>
              </div>
            `).join('')}
          </div>
          ${totalPages > 1 ? `
          <div class="px-4 pb-4 pt-2 border-t border-gray-100 flex items-center justify-between">
            <div class="text-xs text-blue-500">第 ${dashboardPendingPage} / ${totalPages} 页</div>
            <div class="flex items-center gap-1">
              <button id="dashPendingFirst" class="px-2.5 py-1 rounded-md text-xs font-medium border border-blue-200 bg-white hover:bg-blue-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed" ${dashboardPendingPage <= 1 ? 'disabled' : ''}>首页</button>
              <button id="dashPendingPrev" class="px-2.5 py-1 rounded-md text-xs font-medium border border-blue-200 bg-white hover:bg-blue-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed" ${dashboardPendingPage <= 1 ? 'disabled' : ''}>上一页</button>
              ${(() => {
                const pages: number[] = [];
                let sp = Math.max(1, dashboardPendingPage - 2);
                const ep = Math.min(totalPages, sp + 4);
                if (ep - sp < 4) sp = Math.max(1, ep - 4);
                for (let p = sp; p <= ep; p++) pages.push(p);
                return pages.map((p) =>
                  `<button class="dash-pending-page-btn px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${p === dashboardPendingPage ? 'bg-blue-500 text-white border-blue-500' : 'border-blue-200 bg-white hover:bg-blue-100'}" data-page="${p}">${p}</button>`
                ).join('');
              })()}
              <button id="dashPendingNext" class="px-2.5 py-1 rounded-md text-xs font-medium border border-blue-200 bg-white hover:bg-blue-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed" ${dashboardPendingPage >= totalPages ? 'disabled' : ''}>下一页</button>
              <button id="dashPendingLast" class="px-2.5 py-1 rounded-md text-xs font-medium border border-blue-200 bg-white hover:bg-blue-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed" ${dashboardPendingPage >= totalPages ? 'disabled' : ''}>尾页</button>
            </div>
          </div>
          ` : ''}
        </div>
      `;})() : ''}

      <!-- 仪表盘统计 -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        ${(() => {
          const gaugeColors: Record<string, string> = { 'vivo X200U': '#409EFF', '三星': '#8b5cf6', '苹果': '#6b7280' };
          const defaultColors = ['#f59e0b', '#10b981', '#ec4899', '#06b6d4', '#8b5cf6'];
          let customIdx = 0;
          const cards = allModelKeys.map((m) => {
            const ms = stats.models[m];
            const color = gaugeColors[m] ?? defaultColors[customIdx++ % defaultColors.length];
            return buildGaugeCard(m, ms.total, ms.available, ms.rented, color, modelAssetValues[m]);
          });
          cards.push(buildAssetCard(totalValue, stats.totalDevices, stats.totalAvailable, stats.totalRented));
          return cards.join('\n');
        })()}
      </div>

      <!-- 库存详情表 -->
      <div class="glass-card overflow-hidden">
        <div class="glass-card-header">
          <h3 class="font-semibold text-gray-800">库存详情</h3>
        </div>
        <div class="p-4 sm:p-6">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-gray-500 border-b border-gray-100">
                  <th class="pb-3 font-medium">设备型号</th>
                  <th class="pb-3 font-medium text-center">总量</th>
                  <th class="pb-3 font-medium text-center">在仓</th>
                  <th class="pb-3 font-medium text-center">外租</th>
                  <th class="pb-3 font-medium text-center">待发货</th>
                  <th class="pb-3 font-medium text-center">使用率</th>
                  <th class="pb-3 font-medium text-center">资产价值</th>
                  <th class="pb-3 font-medium text-center">操作</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                ${(() => {
                  const barColors: Record<string, string> = { 'vivo X200U': 'bg-blue-500', '三星': 'bg-purple-500', '苹果': 'bg-gray-500' };
                  const defaultBars = ['bg-amber-500', 'bg-emerald-500', 'bg-pink-500', 'bg-cyan-500'];
                  let customIdx = 0;
                  return allModelKeys.map((m) => {
                    const ms = stats.models[m];
                    const bar = barColors[m] ?? defaultBars[customIdx++ % defaultBars.length];
                    return buildInventoryRow(m, ms.total, ms.rented, ms.pending, bar, modelAssetValues[m]);
                  }).join('\n');
                })()}
                <tr class="font-semibold text-gray-800">
                  <td class="py-3">合计</td>
                  <td class="py-3 text-center">${stats.totalDevices}</td>
                  <td class="py-3 text-center">${stats.totalAvailable}</td>
                  <td class="py-3 text-center">${stats.totalRented}</td>
                  <td class="py-3 text-center">${stats.totalPending}</td>
                  <td class="py-3 text-center">${stats.totalDevices > 0 ? Math.round((stats.totalRented / stats.totalDevices) * 100) : 0}%</td>
                  <td class="py-3 text-center text-blue-600">${formatCurrency(totalValue)}</td>
                  <td class="py-3 text-center">-</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- 一键到仓按钮 -->
      ${stats.totalRented > 0 ? `
        <div class="glass-card p-4 sm:p-6">
          <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 class="font-semibold text-gray-800 flex items-center gap-2">
                <svg class="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>
                一键到仓
              </h3>
              <p class="text-sm text-gray-500 mt-1">将所有外租设备（${stats.totalRented}台）标记为已归还，释放全部库存。操作前会自动记录外租快照。</p>
            </div>
            <button id="bulkReturnBtn" class="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-medium rounded-xl hover:from-emerald-600 hover:to-emerald-700 transition-all shadow-[0_4px_12px_-2px_rgba(16,185,129,0.4)] whitespace-nowrap flex items-center gap-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
              一键到仓
            </button>
          </div>
        </div>
      ` : ''}

      <!-- 设备编号明细与CRUD -->
      ${buildDeviceCRUDSection()}

      ${records.length > 0 ? `
        <div class="glass-card overflow-hidden">
          <div class="glass-card-header">
            <h3 class="font-semibold text-gray-800">最近操作记录</h3>
          </div>
          <div class="divide-y divide-gray-100">
            ${records.slice(0, 5).map((r) => `
              <div class="flex items-center justify-between p-4 sm:px-6">
                <div class="flex items-center gap-3 min-w-0">
                  <span class="w-2 h-2 rounded-full flex-shrink-0 ${r.status === '待发货' ? 'bg-blue-400' : r.status === '已发出' ? 'bg-[#E6A23C]' : r.status === '已归还' ? 'bg-[#409EFF]' : 'bg-gray-300'}"></span>
                  <div class="min-w-0">
                    <div class="text-sm font-medium text-gray-800 truncate">${r.xianyuCustomer} · ${r.deviceModel} x${r.deviceNumbers.length || r.quantity}${r.deviceNumbers.length > 0 ? ` <span class="text-sm text-blue-400 font-mono">[${r.deviceNumbers.join(', ')}]</span>` : ''}</div>
                    <div class="text-xs text-gray-400">${r.orderId} · ${r.shipDate}发货</div>
                  </div>
                </div>
                <span class="text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ml-2 ${
                  r.status === '待发货' ? 'bg-blue-50 text-blue-600' : r.peerShipping ? 'bg-orange-50 text-orange-600' : r.status === '已发出' ? 'bg-[#FDF6EC] text-[#E6A23C]' : r.status === '已归还' ? 'bg-[#409EFF]/10 text-[#409EFF]' : 'bg-gray-100 text-gray-500'
                }">${r.peerShipping && r.status === '已发出' ? '同行代发' : r.status}</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function buildGaugeCard(name: string, total: number, available: number, rented: number, color: string, assetValue: number): string {
  const usageRate = total > 0 ? Math.round((rented / total) * 100) : 0;
  const circumference = 2 * Math.PI * 40;
  const strokeDash = total > 0 ? (rented / total) * circumference : 0;
  return `
    <div class="glass-card p-4 sm:p-5">
      <div class="text-sm font-medium text-gray-600 mb-3">${name}</div>
      <div class="flex items-center gap-4">
        <div class="relative w-24 h-24 flex-shrink-0">
          <svg class="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="40" fill="none" stroke="#f3f4f6" stroke-width="8"/>
            <circle cx="50" cy="50" r="40" fill="none" stroke="${color}" stroke-width="8"
              stroke-dasharray="${strokeDash} ${circumference - strokeDash}"
              stroke-linecap="round" class="transition-all duration-500"/>
          </svg>
          <div class="absolute inset-0 flex items-center justify-center">
            <div class="text-center">
              <div class="text-lg font-bold" style="color:${color}">${usageRate}%</div>
              <div class="text-[10px] text-gray-400">使用率</div>
            </div>
          </div>
        </div>
        <div class="flex-1 space-y-1.5">
          <div class="flex justify-between text-xs"><span class="text-gray-400">在仓</span><span class="font-semibold text-[#409EFF]">${available}台</span></div>
          <div class="flex justify-between text-xs"><span class="text-gray-400">外租</span><span class="font-semibold text-[#E6A23C]">${rented}台</span></div>
          <div class="flex justify-between text-xs"><span class="text-gray-400">总价</span><span class="font-semibold text-blue-600">${formatCurrency(assetValue)}</span></div>
        </div>
      </div>
    </div>
  `;
}

function buildAssetCard(totalValue: number, total: number, available: number, rented: number): string {
  const usageRate = total > 0 ? Math.round((rented / total) * 100) : 0;
  const circumference = 2 * Math.PI * 40;
  const strokeDash = total > 0 ? (rented / total) * circumference : 0;
  return `
    <div style="background:#409EFF" class="text-white rounded-xl border border-blue-400 shadow-card p-4 sm:p-5">
      <div class="text-sm font-medium text-white/80 mb-3">资产总览</div>
      <div class="flex items-center gap-4">
        <div class="relative w-24 h-24 flex-shrink-0">
          <svg class="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="8"/>
            <circle cx="50" cy="50" r="40" fill="none" stroke="white" stroke-width="8"
              stroke-dasharray="${strokeDash} ${circumference - strokeDash}"
              stroke-linecap="round" class="transition-all duration-500"/>
          </svg>
          <div class="absolute inset-0 flex items-center justify-center">
            <div class="text-center">
              <div class="text-lg font-bold">${usageRate}%</div>
              <div class="text-[10px] text-white/80">总使用率</div>
            </div>
          </div>
        </div>
        <div class="flex-1 space-y-1.5">
          <div class="flex justify-between text-xs"><span class="text-white/80">设备总计</span><span class="font-semibold">${total}台</span></div>
          <div class="flex justify-between text-xs"><span class="text-white/80">在仓</span><span class="font-semibold">${available}台</span></div>
          <div class="flex justify-between text-xs"><span class="text-white/80">总资产</span><span class="font-semibold">${formatCurrency(totalValue)}</span></div>
        </div>
      </div>
    </div>
  `;
}

function formatCurrency(value: number): string {
  if (value === 0) return '未录入';
  if (value >= 10000) return `¥${(value / 10000).toFixed(1)}万`;
  return `¥${value.toLocaleString()}`;
}

function buildInventoryRow(name: string, total: number, rented: number, pending: number, barColor: string, assetValue: number): string {
  // name 即为设备型号的 key（直接用 device_info 中的 model 字段）
  const modelKey = name;
  const available = total - rented;
  const usageRate = total > 0 ? Math.round((rented / total) * 100) : 0;
  return `
    <tr>
      <td class="py-3">
        <div class="flex items-center gap-2">
          <div class="w-1 h-8 ${barColor} rounded-full"></div>
          <span class="font-medium text-gray-700">${name}</span>
        </div>
      </td>
      <td class="py-3 text-center text-gray-600">${total}</td>
      <td class="py-3 text-center ${available <= 0 ? 'text-red-600 font-semibold' : 'text-[#409EFF]'}">${available}</td>
      <td class="py-3 text-center text-[#E6A23C]">${rented}</td>
      <td class="py-3 text-center text-blue-600">${pending}</td>
      <td class="py-3 text-center">
        <div class="flex items-center justify-center gap-2">
          <div class="w-16 bg-gray-100 rounded-full h-1.5">
            <div class="${barColor} h-1.5 rounded-full" style="width: ${usageRate}%"></div>
          </div>
          <span class="text-xs text-gray-500">${usageRate}%</span>
        </div>
      </td>
      <td class="py-3 text-center text-blue-600 text-xs">${formatCurrency(assetValue)}</td>
      <td class="py-3 text-center">
        <div class="flex items-center justify-center gap-1">
          <button data-action="add-device" data-model="${modelKey}" class="text-[#409EFF] hover:bg-[#409EFF]/10 px-1.5 py-0.5 rounded text-xs font-medium transition-colors" title="加仓">+加仓</button>
          <button data-action="remove-device" data-model="${modelKey}" class="text-red-500 hover:bg-red-50 px-1.5 py-0.5 rounded text-xs font-medium transition-colors" title="减仓">-减仓</button>
        </div>
      </td>
    </tr>
  `;
}

/** 构建设备编号明细 + CRUD 区域 */
function buildDeviceCRUDSection(): string {
  const allDevices = loadDeviceInfoSync();
  const dynamicModels = [...new Set(allDevices.map(d => d.model))];
  const models: string[] = dynamicModels.length > 0 ? dynamicModels : getAllModels();
  const records = loadRecordsSync();
  const filterLabel = dashboardModelFilter === 'all' ? '全部' : dashboardModelFilter;

  const filteredModels = dashboardModelFilter === 'all' ? models : [dashboardModelFilter];
  const filteredDevices = dashboardModelFilter === 'all' ? allDevices : allDevices.filter((d) => d.model === dashboardModelFilter);

  const searchDevices = dashboardSearchKey
    ? filteredDevices.filter((d) =>
        d.number.includes(dashboardSearchKey) ||
        d.notes.includes(dashboardSearchKey) ||
        d.condition.includes(dashboardSearchKey)
      )
    : filteredDevices;

  const numberCustomerMap = new Map<string, string>();
  for (const r of records) {
    if (r.status === '已发出') {
      for (const num of r.deviceNumbers) {
        const numModel = getDeviceModelByNumber(num) || r.deviceModel;
        numberCustomerMap.set(`${numModel}:${num}`, r.xianyuCustomer);
      }
    }
  }

  return `
    <div class="glass-card overflow-hidden">
      <div class="glass-card-header">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <h3 class="font-semibold text-gray-800">设备编号明细</h3>
          <div class="flex items-center gap-3">
            <button data-action="add-device" data-model="${dashboardModelFilter !== 'all' ? dashboardModelFilter : ''}" class="text-xs bg-[#409EFF]/100 hover:bg-[#409EFF]/80 text-white px-3 py-1.5 rounded-lg transition-colors font-medium flex items-center gap-1">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
              加仓
            </button>
            <button data-action="remove-device" data-model="${dashboardModelFilter !== 'all' ? dashboardModelFilter : ''}" class="text-xs bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg transition-colors font-medium flex items-center gap-1">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/></svg>
              减仓
            </button>
            <div class="flex items-center gap-2 text-xs text-gray-400">
              <span class="inline-block w-3 h-3 bg-[#409EFF]/10 border border-[#409EFF]/30 rounded"></span>在仓
              <span class="inline-block w-3 h-3 bg-[#E6A23C]/20 border border-[#E6A23C]/30 rounded ml-1"></span>外租
            </div>
          </div>
        </div>
        <div class="flex items-center gap-3 mt-3 flex-wrap">
          <select id="dashboardModelFilter" class="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white">
            <option value="all" ${dashboardModelFilter === 'all' ? 'selected' : ''}>全部机型</option>
            ${models.map(m => `<option value="${m}" ${dashboardModelFilter === m ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
          <input type="text" id="dashboardSearchKey" value="${dashboardSearchKey}" class="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none flex-1 min-w-[120px] max-w-[200px]" placeholder="搜索编号/备注/成色" />
          <span class="text-xs text-gray-400">${searchDevices.length} 台设备</span>
        </div>
      </div>
      <div class="p-4 sm:p-6 space-y-4">
        ${filteredModels.map((model) => {
          const modelDevices = searchDevices.filter((d) => d.model === model);
          if (modelDevices.length === 0) return '';
          const rentedSet = getRentedDeviceNumbers(model);
          const modelLabel = model;
          const modelRentedCount = modelDevices.filter((d) => rentedSet.has(d.number)).length;
          return `
            <div>
              <div class="flex items-center gap-2 mb-2">
                <span class="text-sm font-medium text-gray-700">${modelLabel}</span>
                <span class="text-xs text-gray-400">(${modelRentedCount}/${modelDevices.length} 外租)</span>
              </div>
              <div class="flex flex-wrap gap-1.5">
                ${modelDevices.map((d) => {
                  const isRented = rentedSet.has(d.number);
                  const customer = numberCustomerMap.get(`${model}:${d.number}`);
                  const hasInfo = d.purchasePrice > 0 || d.notes || d.condition !== '全新';
                  const conditionColor = d.condition === '全新' ? 'text-[#409EFF]' : d.condition === '轻微磨损' ? 'text-yellow-500' : d.condition === '中度磨损' ? 'text-blue-500' : d.condition === '严重磨损' ? 'text-red-500' : d.condition === '损坏' ? 'text-red-700' : 'text-gray-400';
                  return `<span class="inline-flex flex-col items-center justify-center w-14 ${d.notes ? 'h-12' : 'h-9'} text-xs font-mono rounded-md cursor-pointer transition-all hover:shadow-md ${
                    isRented
                      ? 'bg-[#E6A23C]/20 text-[#E6A23C] border border-[#E6A23C]/30'
                      : 'bg-[#409EFF]/10 text-[#409EFF] border border-[#409EFF]/30 hover:border-[#409EFF]/50'
                  }" data-device-model="${model}" data-device-number="${d.number}" title="${isRented && customer ? `外租→${customer}` : '点击编辑'}${hasInfo ? ` | ${d.condition}${d.purchasePrice > 0 ? ` | ¥${d.purchasePrice}` : ''}${d.notes ? ` | ${d.notes}` : ''}` : ''}">
                    <span>${d.number}</span>
                    ${d.notes ? `<span class="text-[9px] leading-tight text-current/70 max-w-[48px] truncate">${d.notes}</span>` : `${hasInfo ? `<span class="ml-0.5 w-1 h-1 rounded-full ${conditionColor} bg-current"></span>` : ''}`}
                  </span>`;
                }).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// ========== 加仓弹窗 ==========

function showAddDeviceModal(preselectedModel: string): void {
  const modal = document.getElementById('addDeviceModal');
  if (!modal) return;

  const allDeviceInfo = loadDeviceInfoSync();
  const existingModels = [...new Set(allDeviceInfo.map(d => d.model))];
  const presetModels: string[] = ['vivo X200U', '三星', '苹果'];
  const models = [...new Set([...presetModels, ...existingModels])];
  const selectedModel = preselectedModel || '';

  modal.innerHTML = `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" id="addDeviceOverlay">
      <div class="backdrop-blur-xl bg-white/92 border border-blue-100/60 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-modal-in">
        <div class="bg-gradient-to-r from-[#409EFF] to-[#3A8EE6] p-4 text-white">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="font-bold">加仓入库</h3>
              <p class="text-[#409EFF]/80 text-xs mt-0.5">新增设备到仓库</p>
            </div>
            <button id="closeAddDevice" class="hover:bg-white/20 p-1 rounded-lg transition-colors">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
        <div class="p-4 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">设备型号</label>
            <select id="addDeviceModel" class="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#409EFF] outline-none bg-white">
              <option value="">请选择型号</option>
              ${models.map((m) => `<option value="${m}" ${m === selectedModel ? 'selected' : ''}>${m}</option>`).join('')}
              <option value="__custom__">➕ 自定义机型</option>
            </select>
          </div>
          <div id="customModelSection" class="hidden">
            <label class="block text-sm font-medium text-gray-700 mb-1.5">自定义机型名称</label>
            <input type="text" id="addDeviceCustomModel" class="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#409EFF] outline-none" placeholder="输入新机型名称" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">进货单价 <span class="text-gray-400 font-normal text-xs">(选填)</span></label>
            <input type="number" id="addDevicePrice" min="0" class="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#409EFF] outline-none" placeholder="默认0" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">新增数量</label>
            <input type="number" id="addDeviceCount" min="1" max="50" value="1" class="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#409EFF] outline-none" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">起始编号 <span class="text-gray-400 font-normal text-xs">(可手动修改)</span></label>
            <input type="text" id="addDeviceStartNum" class="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#409EFF] outline-none" placeholder="输入起始编号" />
          </div>
          <div id="addDevicePreview" class="text-xs text-gray-400"></div>
        </div>
        <div class="p-4 border-t border-gray-100 bg-gray-50 flex gap-3">
          <button id="cancelAddDevice" class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-2 px-4 rounded-lg transition-colors text-sm">取消</button>
          <button id="confirmAddDevice" class="flex-1 bg-[#409EFF] hover:bg-[#3A8EE6] text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm">确认加仓</button>
        </div>
      </div>
    </div>`;

  const closeModal = (): void => { const el = document.getElementById('addDeviceModal'); if (el) el.innerHTML = ''; };

  document.getElementById('closeAddDevice')?.addEventListener('click', closeModal);
  document.getElementById('cancelAddDevice')?.addEventListener('click', closeModal);
  document.getElementById('addDeviceOverlay')?.addEventListener('click', (e: MouseEvent) => { if (e.target === e.currentTarget) closeModal(); });

  const customModelSection = document.getElementById('customModelSection');
  const customModelInput = document.getElementById('addDeviceCustomModel') as HTMLInputElement | null;
  const startInput = document.getElementById('addDeviceStartNum') as HTMLInputElement | null;

  const updatePreview = (): void => {
    const modelSel = document.getElementById('addDeviceModel') as HTMLSelectElement | null;
    const countInput = document.getElementById('addDeviceCount') as HTMLInputElement | null;
    const preview = document.getElementById('addDevicePreview');
    if (!modelSel || !countInput || !startInput || !preview) return;

    const isCustom = modelSel.value === '__custom__';
    if (customModelSection) {
      customModelSection.classList.toggle('hidden', !isCustom);
    }
    if (isCustom && customModelInput) {
      customModelInput.focus();
    }

    const model = isCustom ? (customModelInput?.value.trim() || '') : modelSel.value;
    const count = parseInt(countInput.value, 10);
    if (!model || !count || count <= 0) {
      startInput.value = '';
      preview.textContent = '';
      return;
    }

    const existingNumbers = getAllDeviceNumbers(model as DeviceModel);
    const maxNum = existingNumbers.length > 0 ? Math.max(...existingNumbers.map((n) => parseInt(n, 10))) : 0;
    const autoStartNum = maxNum + 1;
    // 仅在输入框为空或未被用户修改时自动填充
    if (!startInput.value || startInput.dataset.auto === '1') {
      startInput.value = String(autoStartNum);
      startInput.dataset.auto = '1';
    }

    const startNum = parseInt(startInput.value, 10) || autoStartNum;
    const newNumbers: string[] = [];
    for (let i = 0; i < count; i++) {
      newNumbers.push(String(startNum + i).padStart(3, '0'));
    }
    preview.innerHTML = `将新增编号：<span class="text-[#409EFF] font-mono">${newNumbers.join(', ')}</span>`;
  };

  document.getElementById('addDeviceModel')?.addEventListener('change', () => { if (startInput) startInput.dataset.auto = ''; updatePreview(); });
  document.getElementById('addDeviceCount')?.addEventListener('input', updatePreview);
  startInput?.addEventListener('input', () => { if (startInput) startInput.dataset.auto = ''; updatePreview(); });
  customModelInput?.addEventListener('input', updatePreview);
  updatePreview();

  document.getElementById('confirmAddDevice')?.addEventListener('click', async () => {
    const modelSel = (document.getElementById('addDeviceModel') as HTMLSelectElement).value;
    const isCustom = modelSel === '__custom__';
    const model = (isCustom ? customModelInput?.value.trim() : modelSel) as DeviceModel;
    const count = parseInt((document.getElementById('addDeviceCount') as HTMLInputElement).value, 10);

    if (!model) { showToast(isCustom ? '请输入自定义机型名称' : '请选择设备型号', 'error'); return; }
    if (!count || count <= 0) { showToast('请输入有效的数量', 'error'); return; }

    const startStr = (document.getElementById('addDeviceStartNum') as HTMLInputElement).value.trim();
    const startNum = parseInt(startStr, 10);
    if (!startNum || startNum <= 0) { showToast('请输入有效的起始编号', 'error'); return; }

    const priceInput = document.getElementById('addDevicePrice') as HTMLInputElement | null;
    const price = priceInput?.value ? parseFloat(priceInput.value) : undefined;

    try {
      const newNumbers = await addDevicesToInventory(model, count, startNum, price);
      const endNum = newNumbers[newNumbers.length - 1];
      showToast(`${model} 加仓 ${count} 台，编号 ${newNumbers[0]}-${endNum}`, 'success');
      closeModal();
      render();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '加仓失败';
      showToast(msg, 'error');
    }
  });
}

// ========== 减仓弹窗 ==========

async function showRemoveDeviceModal(preselectedModel: string): Promise<void> {
  // 先刷新数据，确保减仓列表是最新的
  try {
    invalidateCache();
    await Promise.all([loadDeviceInfo(), loadRecords()]);
  } catch (err) {
    console.warn('刷新数据失败，使用缓存:', err);
  }
  
  const modal = document.getElementById('removeDeviceModal');
  if (!modal) return;

  const models: DeviceModel[] = getAllModels();
  const selectedModel = (preselectedModel && models.includes(preselectedModel as DeviceModel)) ? preselectedModel as DeviceModel : '';

  modal.innerHTML = `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" id="removeDeviceOverlay">
      <div class="backdrop-blur-xl bg-white/92 border border-blue-100/60 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden animate-modal-in">
        <div class="bg-gradient-to-r from-red-500 to-rose-500 p-4 text-white">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="font-bold">减仓出库</h3>
              <p class="text-red-100 text-xs mt-0.5">移除设备（仅可移除在仓设备）</p>
            </div>
            <button id="closeRemoveDevice" class="hover:bg-white/20 p-1 rounded-lg transition-colors">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
        <div class="p-4 space-y-4 overflow-y-auto max-h-[55vh]">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">设备型号</label>
            <select id="removeDeviceModel" class="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-red-500 outline-none bg-white">
              <option value="">请选择型号</option>
              ${models.map((m) => `<option value="${m}" ${m === selectedModel ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
          </div>
          <div id="removeDeviceGrid" class="flex flex-wrap gap-1.5"></div>
          <div id="removeDeviceSelected" class="text-xs text-gray-400"></div>
        </div>
        <div class="p-4 border-t border-gray-100 bg-gray-50 flex gap-3">
          <button id="cancelRemoveDevice" class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-2 px-4 rounded-lg transition-colors text-sm">取消</button>
          <button id="confirmRemoveDevice" class="flex-1 bg-red-500 hover:bg-red-600 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm">确认减仓</button>
        </div>
      </div>
    </div>`;

  const closeModal = (): void => { const el = document.getElementById('removeDeviceModal'); if (el) el.innerHTML = ''; };
  let selectedForRemoval: string[] = [];

  document.getElementById('closeRemoveDevice')?.addEventListener('click', closeModal);
  document.getElementById('cancelRemoveDevice')?.addEventListener('click', closeModal);
  document.getElementById('removeDeviceOverlay')?.addEventListener('click', (e: MouseEvent) => { if (e.target === e.currentTarget) closeModal(); });

  const updateGrid = (): void => {
    const modelSel = document.getElementById('removeDeviceModel') as HTMLSelectElement | null;
    const grid = document.getElementById('removeDeviceGrid');
    const selectedEl = document.getElementById('removeDeviceSelected');
    if (!modelSel || !grid) return;

    const model = modelSel.value as DeviceModel;
    if (!model) { grid.innerHTML = '<p class="text-xs text-gray-400">请先选择型号</p>'; return; }

    const allNumbers = getAllDeviceNumbers(model);
    const rentedSet = getRentedDeviceNumbers(model);
    const availableSet = getAvailableDeviceNumbers(model);

    grid.innerHTML = allNumbers.map((num) => {
      const isRented = rentedSet.has(num);
      const isSelected = selectedForRemoval.includes(num);
      const classes = isRented
        ? 'bg-gray-200 text-gray-400 cursor-not-allowed border-gray-200'
        : isSelected
          ? 'bg-red-500 text-white border-red-500 shadow-card'
          : 'bg-[#409EFF]/10 text-[#409EFF] border-[#409EFF]/30 hover:border-red-400 cursor-pointer';
      return `<button type="button" data-remove-num="${num}" data-remove-rented="${isRented}" class="remove-num-btn inline-flex items-center justify-center w-14 h-9 text-xs font-mono rounded-md border transition-all ${classes}" ${isRented ? 'disabled' : ''}>${num}</button>`;
    }).join('');

    if (selectedEl) {
      if (selectedForRemoval.length > 0) {
        selectedEl.innerHTML = `<span class="text-red-600">已选 ${selectedForRemoval.length} 台：${selectedForRemoval.join(', ')}</span>`;
      } else {
        selectedEl.textContent = '点击绿色编号选择要移除的设备';
      }
    }

    grid.querySelectorAll('.remove-num-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const num = (btn as HTMLElement).dataset.removeNum || '';
        const isRented = (btn as HTMLElement).dataset.removeRented === 'true';
        if (isRented) return;
        const idx = selectedForRemoval.indexOf(num);
        if (idx >= 0) {
          selectedForRemoval.splice(idx, 1);
        } else {
          selectedForRemoval.push(num);
        }
        updateGrid();
      });
    });
  };

  document.getElementById('removeDeviceModel')?.addEventListener('change', () => { selectedForRemoval = []; updateGrid(); });
  if (selectedModel) updateGrid();

  document.getElementById('confirmRemoveDevice')?.addEventListener('click', async () => {
    const model = (document.getElementById('removeDeviceModel') as HTMLSelectElement).value as DeviceModel;
    if (!model) { showToast('请选择设备型号', 'error'); return; }
    if (selectedForRemoval.length === 0) { showToast('请选择要移除的设备编号', 'error'); return; }

    try {
      const result = await removeDevicesFromInventory(model, selectedForRemoval);
      if (result.success.length > 0) {
        showToast(`${model} 减仓 ${result.success.length} 台（${result.success.join(', ')}）`, 'success');
      }
      if (result.failed.length > 0) {
        showToast(`${result.failed.length} 台无法移除: ${result.failed.map(f => f.number + ' ' + f.reason).join('; ')}`, 'error');
      }
      selectedForRemoval = [];
      closeModal();
      render();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '减仓失败';
      showToast(msg, 'error');
    }
  });
}

// ========== 设备详情编辑弹窗 ==========

function showDeviceEditModal(model: DeviceModel, number: string): void {
  const devices = loadDeviceInfoSync();
  const device = devices.find((d) => d.model === model && d.number === number);
  if (!device) return;

  const rentedSet = getRentedDeviceNumbers(model);
  const isRented = rentedSet.has(number);
  const records = loadRecordsSync();
  const rentalRecord = isRented ? records.find((r) => r.status === '已发出' && r.deviceNumbers.includes(number)) : undefined;

  const modal = document.getElementById('deviceEditModal');
  if (!modal) return;

  const conditionOptions: DeviceCondition[] = ['全新', '轻微磨损', '中度磨损', '严重磨损', '损坏'];

  modal.innerHTML = `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" id="deviceEditOverlay">
      <div class="backdrop-blur-xl bg-white/92 border border-blue-100/60 rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-hidden animate-modal-in">
        <div class="bg-gradient-to-r from-[#409EFF] to-[#3A8EE6] p-4 text-white">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="font-bold">设备详情</h3>
              <p class="text-blue-100 text-xs mt-0.5">${model} · 编号 ${number}</p>
            </div>
            <button id="closeDeviceEdit" class="hover:bg-white/20 p-1 rounded-lg transition-colors">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
        <div class="p-4 space-y-4 overflow-y-auto max-h-[60vh]">
          <div class="flex items-center gap-2 p-3 rounded-lg ${isRented ? 'bg-[#FDF6EC] border border-[#E6A23C]/20' : 'bg-[#409EFF]/10 border border-[#409EFF]/20'}">
            <span class="w-2.5 h-2.5 rounded-full ${isRented ? 'bg-[#E6A23C]' : 'bg-[#409EFF]'}"></span>
            <span class="text-sm font-medium ${isRented ? 'text-[#E6A23C]' : 'text-[#409EFF]'}">${isRented ? `外租中 → ${rentalRecord?.xianyuCustomer || '未知客户'}` : '在仓可用'}</span>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1.5">进货价格</label>
              <div class="relative">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">¥</span>
                <input type="number" id="editPurchasePrice" value="${device.purchasePrice || ''}" min="0" step="0.01" class="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="0.00" />
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1.5">购入日期</label>
              <input type="date" id="editPurchaseDate" value="${device.purchaseDate}" max="2030-12-31" class="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">设备成色</label>
            <select id="editCondition" class="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white">
              ${conditionOptions.map((c) => `<option value="${c}" ${device.condition === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">备注信息</label>
            <textarea id="editNotes" rows="3" class="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none" placeholder="如：屏幕轻微划痕、电池健康度90%等">${device.notes}</textarea>
          </div>
        </div>
        ${isRented ? `
        <div class="p-4 border-t border-gray-100 bg-[#FDF6EC]">
          <div class="flex items-center gap-2 mb-2">
            <svg class="w-4 h-4 text-[#E6A23C]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <span class="text-sm text-[#E6A23C] font-medium">该设备正在外租中</span>
          </div>
          ${rentalRecord ? `<div class="text-xs text-gray-500 space-y-0.5 mb-3">
            <div>客户：${rentalRecord.xianyuCustomer || '-'}</div>
            <div>发货日期：${rentalRecord.shipDate || '-'}</div>
            <div>订单编号：${rentalRecord.orderId}</div>
          </div>` : ''}
          <button id="returnDeviceBtn" class="w-full py-2.5 bg-[#67C23A] hover:bg-[#5DAF31] text-white font-medium rounded-lg transition-colors text-sm flex items-center justify-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            归还入库
          </button>
        </div>
        ` : ''}
        <div class="p-4 border-t border-gray-100 bg-gray-50 flex gap-3">
          <button id="deleteDeviceBtn" class="px-4 bg-red-50 hover:bg-red-100 text-red-600 font-medium py-2 rounded-lg transition-colors text-sm border border-red-200">删除记录</button>
          <div class="flex-1"></div>
          <button id="cancelDeviceEdit" class="px-4 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-2 rounded-lg transition-colors text-sm">取消</button>
          <button id="saveDeviceEdit" class="px-6 bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 rounded-lg transition-colors text-sm">保存</button>
        </div>
      </div>
    </div>`;

  const closeModal = (): void => { const el = document.getElementById('deviceEditModal'); if (el) el.innerHTML = ''; };

  document.getElementById('closeDeviceEdit')?.addEventListener('click', closeModal);
  document.getElementById('cancelDeviceEdit')?.addEventListener('click', closeModal);
  document.getElementById('deviceEditOverlay')?.addEventListener('click', (e: MouseEvent) => { if (e.target === e.currentTarget) closeModal(); });

  document.getElementById('saveDeviceEdit')?.addEventListener('click', async () => {
    const price = parseFloat((document.getElementById('editPurchasePrice') as HTMLInputElement).value) || 0;
    const condition = (document.getElementById('editCondition') as HTMLSelectElement).value as DeviceCondition;
    const notes = (document.getElementById('editNotes') as HTMLTextAreaElement).value.trim();
    const purchaseDate = (document.getElementById('editPurchaseDate') as HTMLInputElement).value;

    await upsertDeviceInfo({ model, number, purchasePrice: price, condition, notes, purchaseDate });
    showToast(`设备 ${number} 信息已保存`, 'success');
    closeModal();
    render();
  });

  document.getElementById('returnDeviceBtn')?.addEventListener('click', async () => {
    if (!rentalRecord) return;
    if (!confirm(`确认归还设备 ${model} 编号 ${number}？`)) return;

    const remainingNumbers = rentalRecord.deviceNumbers.filter((n: string) => n !== number);
    if (remainingNumbers.length > 0) {
      // 还有其他设备编号，只移除当前编号
      const success = await updateRecord(rentalRecord.id, { deviceNumbers: remainingNumbers });
      if (success) {
        showToast(`编号 ${number} 已归还，订单 ${rentalRecord.orderId} 仍有 ${remainingNumbers.length} 台设备外租`, 'success');
      }
    } else {
      // 这是最后一个编号，整个订单归还
      await returnRecord(rentalRecord.id);
      showToast(`编号 ${number} 已归还，订单 ${rentalRecord.orderId} 已完成`, 'success');
    }
    closeModal();
    render();
  });

  document.getElementById('deleteDeviceBtn')?.addEventListener('click', async () => {
    if (device && confirm(`确认删除编号 ${number} 的设备详情？设备本身不会从系统中移除。`)) {
      await deleteDeviceInfo(device.id);
      showToast(`编号 ${number} 设备详情已删除`, 'warning');
      closeModal();
      render();
    }
  });
}

// ========== 订单记录 ==========

function buildShipForm(): string {
  const inventory = calcInventory();
  const batchList = pendingOrders.length > 0 ? `
    <div class="glass-card mt-4 overflow-hidden">
      <div class="glass-card-header flex items-center justify-between">
        <div class="flex items-center gap-2">
          <svg class="w-5 h-5 text-[#409EFF]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
          <h3 class="font-semibold text-gray-800">待提交订单</h3>
          <span class="text-xs bg-[#409EFF]/20 text-[#409EFF] font-medium px-2 py-0.5 rounded-full">${pendingOrders.length} 条</span>
        </div>
        <div class="flex gap-2">
          <button type="button" id="clearBatchBtn" class="text-xs text-gray-400 hover:text-red-500 px-2 py-1 transition-colors">清空全部</button>
          <button type="button" id="submitBatchBtn" class="text-sm bg-gradient-to-r from-[#409EFF] to-[#3A8EE6] hover:from-[#3A8EE6] hover:to-[#337ECC] text-white px-4 py-1.5 rounded-lg transition-all font-medium shadow-[0_4px_12px_rgba(64,158,255,0.3)]">批量提交 (${pendingOrders.length})</button>
        </div>
      </div>
      <div class="divide-y divide-gray-50">
        ${pendingOrders.map((o, i) => `
          <div class="p-3 sm:p-4 flex items-start gap-3 hover:bg-gray-50/50 transition-colors">
            <span class="text-xs text-gray-300 font-mono mt-1 w-5 text-right shrink-0">${i + 1}</span>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-sm font-medium text-gray-800">${o.deviceModel}</span>
                <span class="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">x${o.quantity}</span>
                <span class="text-sm text-gray-600">${o.xianyuCustomer}</span>
                ${o.shopName ? `<span class="text-xs bg-[#409EFF]/10 text-[#409EFF] px-1.5 py-0.5 rounded">${o.shopName}</span>` : ''}
                ${o.phone ? `<span class="text-xs text-gray-400">${o.phone}</span>` : ''}
              </div>
              <div class="text-xs text-gray-400 mt-1 truncate">${o.shipAddress || '无地址'}</div>
              ${o.notes ? `<div class="text-xs text-[#409EFF] mt-0.5 truncate">备注：${o.notes}</div>` : ''}
              <div class="text-xs text-gray-400 mt-0.5">${o.shipDate} → ${o.receiptDate} → ${o.expectedReturnDate} → ${o.estimatedArrivalDate}</div>
            </div>
            <button type="button" data-pending-id="${o.id}" class="remove-pending-btn text-gray-300 hover:text-red-500 transition-colors p-1 shrink-0">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  return `
    <div class="max-w-2xl mx-auto">
      <div class="glass-card overflow-hidden">
        <div class="glass-card-header">
          <div class="flex items-center gap-2">
            <svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
            <h3 class="font-semibold text-gray-800">订单记录</h3>
          </div>
          <p class="text-sm text-gray-400 mt-1">录入闲鱼订单信息，添加到批量列表后统一提交</p>
        </div>
        <form id="shipForm" class="p-4 sm:p-6 space-y-5">
          <!-- 所属店铺（全局选择，最先选择） -->
          <div class="bg-gradient-to-r from-[#409EFF]/10 to-blue-50/80 border border-[#409EFF]/30 rounded-lg p-3 flex items-center gap-3">
            <div class="flex items-center gap-2 shrink-0">
              <svg class="w-4 h-4 text-[#409EFF]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
              <span class="text-sm font-medium text-[#409EFF]">所属店铺</span>
            </div>
            <select id="shopName" class="flex-1 border border-[#409EFF]/30 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#409EFF] focus:border-[#409EFF] outline-none transition-all bg-white font-medium">
              <option value="有礼貌的饭饭">有礼貌的饭饭</option>
              <option value="美味米饭">美味米饭</option>
            </select>
            <span class="text-xs text-gray-400">所有订单将使用此店铺</span>
          </div>

          <!-- 智能粘贴区 -->
          <div class="bg-blue-50/80 border border-blue-200 rounded-lg p-4 space-y-3">
            <div class="flex items-center gap-2">
              <svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
              <span class="text-sm font-medium text-blue-700">智能粘贴</span>
              <span class="text-xs text-blue-500">粘贴闲鱼订单自动识别填写</span>
            </div>
            <textarea id="pasteArea" rows="3" class="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white resize-none" placeholder="粘贴格式示例：&#10;李 13771620809&#10;江苏省南京市建邺区...（5.22-5.24 还我小雪糕）"></textarea>
            <button type="button" id="parsePasteBtn" class="text-sm bg-blue-500 hover:bg-blue-600 text-white px-4 py-1.5 rounded-lg transition-colors font-medium">识别填写</button>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">发货地址 <span class="text-red-400">*</span></label>
            <div class="relative">
              <input type="text" id="shipAddress" class="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all pr-24" placeholder="收货人+手机号+地址，自动识别省内/省外" required />
              <span id="provinceTag" class="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">未识别</span>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1.5">设备型号 <span class="text-red-400">*</span></label>
              <select id="shipModel" class="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white" required>
                ${getAllModels().map(m => `<option value="${m}">${m} (在仓${(inventory.models[m]?.available || 0)}台)</option>`).join('\n                ')}
                <option value="混合">混合机型</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1.5">租赁数量 <span class="text-red-400">*</span></label>
              <input type="number" id="shipQuantity" min="1" max="50" value="1" class="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" required />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1.5">闲鱼客户 <span class="text-red-400">*</span></label>
              <input type="text" id="shipCustomer" class="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="买家昵称" required />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1.5">客户手机号</label>
              <input type="tel" id="shipPhone" class="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="1开头11位手机号" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1.5">备注</label>
              <input type="text" id="shipNotes" class="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="订单备注（可选）" />
            </div>
          </div>

          <!-- 四段时间链路 -->
          <div class="bg-[#FDF6EC]/50 rounded-lg p-4 space-y-3">
            <div class="flex items-center gap-2 text-[#E6A23C]">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              <span class="text-sm font-medium">时间链路</span>
              <span class="text-xs text-[#E6A23C]">发货 → 收货 → 寄出 → 到仓</span>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">预计发货日期 <span class="text-red-400">*</span></label>
                <input type="date" id="shipDate" max="2030-12-31" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" required />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">收货日期 <span class="text-red-400">*</span></label>
                <input type="date" id="receiptDate" max="2030-12-31" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" required />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">预计寄出日期 <span class="text-red-400">*</span></label>
                <input type="date" id="expectedReturnDate" max="2030-12-31" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" required />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">预计到仓时间 <span class="text-red-400">*</span></label>
                <input type="date" id="arrivalDate" max="2030-12-31" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" required />
              </div>
            </div>
            <div id="autoCalcInfo" class="text-xs text-gray-400 flex items-center gap-1">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              <span id="transitHint">根据地址自动计算物流天数</span>
            </div>
          </div>

          <div class="flex gap-3">
            <button type="button" id="addToBatchBtn" class="flex-1 bg-white border-2 border-[#409EFF] text-[#409EFF] hover:bg-[#409EFF]/10 font-semibold py-3 px-4 rounded-lg transition-all text-sm">添加到批量列表</button>
            <button type="submit" class="flex-1 bg-gradient-to-r from-[#409EFF] to-[#3A8EE6] hover:from-[#3A8EE6] hover:to-[#337ECC] text-white font-semibold py-3 px-4 rounded-lg transition-all shadow-[0_4px_12px_rgba(64,158,255,0.3)] hover:shadow-[0_6px_16px_rgba(64,158,255,0.4)] text-sm">立即创建</button>
          </div>
        </form>
      </div>
      ${batchList}
    </div>
  `;
}

// ========== 到仓记录 ==========

let bulkReturnBatches: BulkReturnBatch[] = [];
let bulkReturnDetails: BulkReturnLog[] = [];
let selectedBatchId: string = '';
let bulkReturnFilterNumber: string = '';
let bulkReturnPage: number = 1;

// 转寄匹配
let transferMatches: TransferMatch[] = [];
let transferLoading: boolean = false;

function buildBulkReturnSection(): string {
  const totalPages = Math.ceil(bulkReturnDetails.length / PAGE_SIZE);
  if (bulkReturnPage > totalPages && totalPages > 0) bulkReturnPage = totalPages;
  if (bulkReturnPage < 1) bulkReturnPage = 1;
  const start = (bulkReturnPage - 1) * PAGE_SIZE;
  const filteredDetails = bulkReturnFilterNumber
    ? bulkReturnDetails.filter(d => d.deviceNumber.includes(bulkReturnFilterNumber) || d.xianyuCustomer.includes(bulkReturnFilterNumber) || d.orderId.includes(bulkReturnFilterNumber))
    : bulkReturnDetails;
  const filteredTotalPages = Math.ceil(filteredDetails.length / PAGE_SIZE);
  const pagedDetails = filteredDetails.slice((bulkReturnPage - 1) * PAGE_SIZE, bulkReturnPage * PAGE_SIZE);

  return `
    <div class="space-y-4">
      <!-- 批次列表 -->
      <div class="glass-card overflow-hidden">
        <div class="glass-card-header flex items-center justify-between">
          <h3 class="font-semibold text-gray-800 flex items-center gap-2">
            <svg class="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
            一键到仓历史
          </h3>
        </div>
        <div class="glass-card-body">
          ${bulkReturnBatches.length === 0 ? `
            <div class="text-center py-12 text-gray-400">
              <svg class="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8"/></svg>
              <p>暂无到仓记录</p>
              <p class="text-sm mt-1">在库存总览中点击"一键到仓"后，记录会保存在这里</p>
            </div>
          ` : `
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              ${bulkReturnBatches.map(b => {
                const date = new Date(b.operatedAt);
                const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
                const isSelected = selectedBatchId === b.batchId;
                return `
                  <div class="border ${isSelected ? 'border-emerald-400 bg-emerald-50/50 ring-1 ring-emerald-200' : 'border-gray-200 bg-white/80 hover:border-gray-300'} rounded-xl p-4 cursor-pointer transition-all" data-action="select-batch" data-batch-id="${b.batchId}">
                    <div class="flex items-center justify-between mb-2">
                      <span class="text-sm font-mono font-semibold ${isSelected ? 'text-emerald-700' : 'text-gray-700'}">${b.batchId}</span>
                      <span class="text-xs px-2 py-0.5 rounded-full ${isSelected ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}">${b.count}台</span>
                    </div>
                    <div class="text-xs text-gray-500">${dateStr}</div>
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </div>
      </div>

      <!-- 批次详情 -->
      ${selectedBatchId ? `
        <div class="glass-card overflow-hidden">
          <div class="glass-card-header flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <h3 class="font-semibold text-gray-800">
              批次详情：${selectedBatchId}
              <span class="text-sm font-normal text-gray-500 ml-2">共${filteredDetails.length}台</span>
            </h3>
            <div class="flex items-center gap-2">
              <input type="text" id="bulkReturnFilterInput" value="${bulkReturnFilterNumber}" placeholder="按编号/客户/订单筛选" class="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 w-52 bg-white" />
              <button data-action="delete-batch" data-batch-id="${selectedBatchId}" class="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                删除记录
              </button>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-gray-500 border-b border-gray-100">
                  <th class="px-4 py-3 font-medium">#</th>
                  <th class="px-4 py-3 font-medium">设备编号</th>
                  <th class="px-4 py-3 font-medium">机型</th>
                  <th class="px-4 py-3 font-medium">订单号</th>
                  <th class="px-4 py-3 font-medium">闲鱼客户</th>
                  <th class="px-4 py-3 font-medium">手机号</th>
                  <th class="px-4 py-3 font-medium">发货日期</th>
                  <th class="px-4 py-3 font-medium">预计寄出</th>
                  <th class="px-4 py-3 font-medium">预计到仓</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                ${pagedDetails.map((d, i) => {
                  const model = getDeviceModelByNumber(d.deviceNumber);
                  return `
                    <tr class="hover:bg-blue-50/30 transition-colors">
                      <td class="px-4 py-2.5 text-gray-400">${(bulkReturnPage - 1) * PAGE_SIZE + i + 1}</td>
                      <td class="px-4 py-2.5">
                        <span class="font-mono text-blue-600 font-medium text-sm">${d.deviceNumber}</span>
                      </td>
                      <td class="px-4 py-2.5 text-gray-700">${model}</td>
                      <td class="px-4 py-2.5 text-gray-500 font-mono text-xs">${d.orderId}</td>
                      <td class="px-4 py-2.5 text-emerald-600 text-sm">${d.xianyuCustomer || '-'}</td>
                      <td class="px-4 py-2.5 text-gray-500 text-sm">${d.phone ? d.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : '-'}</td>
                      <td class="px-4 py-2.5 text-violet-600 text-sm">${d.shipDate || '-'}</td>
                      <td class="px-4 py-2.5 text-amber-600 text-sm">${d.expectedReturnDate || '-'}</td>
                      <td class="px-4 py-2.5 text-gray-500 text-sm">${d.estimatedArrivalDate || '-'}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
          ${filteredTotalPages > 1 ? buildBulkReturnPagination(filteredTotalPages) : ''}
        </div>
      ` : ''}
    </div>
  `;
}

function buildBulkReturnPagination(totalPages: number): string {
  const pages: number[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - bulkReturnPage) <= 1) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== -1) {
      pages.push(-1);
    }
  }
  return `
    <div class="flex items-center justify-center gap-1 py-4 border-t border-gray-100">
      <button id="bulkReturnFirst" class="px-2.5 py-1.5 text-xs rounded-lg border ${bulkReturnPage <= 1 ? 'text-gray-300 border-gray-100 cursor-not-allowed' : 'text-gray-600 border-gray-200 hover:bg-gray-50'}">首页</button>
      <button id="bulkReturnPrev" class="px-2.5 py-1.5 text-xs rounded-lg border ${bulkReturnPage <= 1 ? 'text-gray-300 border-gray-100 cursor-not-allowed' : 'text-gray-600 border-gray-200 hover:bg-gray-50'}">上一页</button>
      ${pages.map(p => p === -1
        ? '<span class="px-1 text-gray-400">...</span>'
        : `<button class="bulk-return-page-btn px-2.5 py-1.5 text-xs rounded-lg border ${p === bulkReturnPage ? 'bg-emerald-500 text-white border-emerald-500' : 'border-gray-200 hover:bg-gray-50 text-gray-600'}" data-page="${p}">${p}</button>`
      ).join('')}
      <button id="bulkReturnNext" class="px-2.5 py-1.5 text-xs rounded-lg border ${bulkReturnPage >= totalPages ? 'text-gray-300 border-gray-100 cursor-not-allowed' : 'text-gray-600 border-gray-200 hover:bg-gray-50'}">下一页</button>
      <button id="bulkReturnLast" class="px-2.5 py-1.5 text-xs rounded-lg border ${bulkReturnPage >= totalPages ? 'text-gray-300 border-gray-100 cursor-not-allowed' : 'text-gray-600 border-gray-200 hover:bg-gray-50'}">尾页</button>
      <span class="text-xs text-gray-400 ml-2">${bulkReturnPage}/${totalPages}</span>
    </div>
  `;
}

// ========== 设备记录 ==========

function buildRecordsSection(): string {
  const records = getFilteredRecords();
  return `
    <div class="space-y-4">
      <!-- 筛选栏 -->
      <div class="glass-card p-4">
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-8 gap-3">
          <div>
            <label class="block text-xs text-gray-400 mb-1">状态</label>
            <select id="filterStatus" class="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white">
              <option value="all" ${filterStatus === 'all' ? 'selected' : ''}>全部</option>
              <option value="待发货" ${filterStatus === '待发货' ? 'selected' : ''}>待发货</option>
              <option value="已发出" ${filterStatus === '已发出' ? 'selected' : ''}>已发出</option>
              <option value="已归还" ${filterStatus === '已归还' ? 'selected' : ''}>已归还</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">机型</label>
            <select id="filterModel" class="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white">
              <option value="all" ${filterModel === 'all' ? 'selected' : ''}>全部</option>
              ${getAllModels().map(m => `<option value="${m}" ${filterModel === m ? 'selected' : ''}>${m}</option>`).join('\n              ')}
              <option value="混合" ${filterModel === '混合' ? 'selected' : ''}>混合</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">店铺</label>
            <select id="filterShopName" class="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white">
              <option value="all" ${filterShopName === 'all' ? 'selected' : ''}>全部</option>
              <option value="有礼貌的饭饭" ${filterShopName === '有礼貌的饭饭' ? 'selected' : ''}>有礼貌的饭饭</option>
              <option value="美味米饭" ${filterShopName === '美味米饭' ? 'selected' : ''}>美味米饭</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">设备编号</label>
            <input type="text" id="filterDeviceNumber" value="${filterDeviceNumber}" class="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="编号搜索" />
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">闲鱼客户</label>
            <input type="text" id="filterXianyuCustomer" value="${filterXianyuCustomer}" class="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="客户名搜索" />
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">发货地址</label>
            <input type="text" id="filterShipAddress" value="${filterShipAddress}" class="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="地址搜索" />
          </div>
          <div class="col-span-1">
            <div class="space-y-1.5">
              <div>
                <label class="block text-xs text-gray-400 mb-0.5">发出 / 收货</label>
                <div class="flex items-center gap-1">
                  <input type="date" id="filterShipDateFrom" value="${filterShipDateFrom}" max="2030-12-31" class="flex-1 min-w-0 border border-indigo-100 rounded-md px-1.5 py-1.5 text-xs focus:ring-2 focus:ring-indigo-400 outline-none bg-indigo-50/40 text-indigo-700 placeholder-indigo-300" />
                  <span class="text-indigo-300 text-xs shrink-0">~</span>
                  <input type="date" id="filterShipDateTo" value="${filterShipDateTo}" max="2030-12-31" class="flex-1 min-w-0 border border-indigo-100 rounded-md px-1.5 py-1.5 text-xs focus:ring-2 focus:ring-indigo-400 outline-none bg-indigo-50/40 text-indigo-700 placeholder-indigo-300" />
                </div>
              </div>
              <div>
                <label class="block text-xs text-gray-400 mb-0.5">寄出 / 到仓</label>
                <div class="flex items-center gap-1">
                  <input type="date" id="filterReturnDateFrom" value="${filterReturnDateFrom}" max="2030-12-31" class="flex-1 min-w-0 border border-amber-100 rounded-md px-1.5 py-1.5 text-xs focus:ring-2 focus:ring-amber-400 outline-none bg-amber-50/40 text-amber-700 placeholder-amber-300" />
                  <span class="text-amber-300 text-xs shrink-0">~</span>
                  <input type="date" id="filterReturnDateTo" value="${filterReturnDateTo}" max="2030-12-31" class="flex-1 min-w-0 border border-amber-100 rounded-md px-1.5 py-1.5 text-xs focus:ring-2 focus:ring-amber-400 outline-none bg-amber-50/40 text-amber-700 placeholder-amber-300" />
                </div>
              </div>
            </div>
          </div>
          <div class="col-span-1">
            <div class="space-y-1.5">
              <div>
                <label class="block text-xs text-gray-400 mb-0.5">收货日期</label>
                <div class="flex items-center gap-1">
                  <input type="date" id="filterReceiptDateFrom" value="${filterReceiptDateFrom}" max="2030-12-31" class="flex-1 min-w-0 border border-emerald-100 rounded-md px-1.5 py-1.5 text-xs focus:ring-2 focus:ring-emerald-400 outline-none bg-emerald-50/40 text-emerald-700 placeholder-emerald-300" />
                  <span class="text-emerald-300 text-xs shrink-0">~</span>
                  <input type="date" id="filterReceiptDateTo" value="${filterReceiptDateTo}" max="2030-12-31" class="flex-1 min-w-0 border border-emerald-100 rounded-md px-1.5 py-1.5 text-xs focus:ring-2 focus:ring-emerald-400 outline-none bg-emerald-50/40 text-emerald-700 placeholder-emerald-300" />
                </div>
              </div>
              <div>
                <label class="block text-xs text-gray-400 mb-0.5">到仓日期</label>
                <div class="flex items-center gap-1">
                  <input type="date" id="filterArrivalDateFrom" value="${filterArrivalDateFrom}" max="2030-12-31" class="flex-1 min-w-0 border border-rose-100 rounded-md px-1.5 py-1.5 text-xs focus:ring-2 focus:ring-rose-400 outline-none bg-rose-50/40 text-rose-700 placeholder-rose-300" />
                  <span class="text-rose-300 text-xs shrink-0">~</span>
                  <input type="date" id="filterArrivalDateTo" value="${filterArrivalDateTo}" max="2030-12-31" class="flex-1 min-w-0 border border-rose-100 rounded-md px-1.5 py-1.5 text-xs focus:ring-2 focus:ring-rose-400 outline-none bg-rose-50/40 text-rose-700 placeholder-rose-300" />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="mt-3 flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="text-xs text-gray-500">排序：</span>
            <select id="sortFieldSelect" class="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white focus:ring-1 focus:ring-blue-300 focus:border-blue-300 outline-none">
              <option value="orderId" ${sortField === 'orderId' ? 'selected' : ''}>订单序号</option>
              <option value="shipDate" ${sortField === 'shipDate' ? 'selected' : ''}>发货日期</option>
            </select>
            <button id="sortDirectionBtn" class="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white hover:bg-gray-50 transition-colors flex items-center gap-1" title="${sortDirection === 'asc' ? '升序' : '降序'}">
              ${sortDirection === 'asc' ? '<svg class="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/></svg><span class="text-blue-500">升序</span>' : '<svg class="w-3.5 h-3.5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg><span class="text-orange-500">降序</span>'}
            </button>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-gray-400">共 ${records.length} 条</span>
            <button id="clearDateFilters" class="text-xs text-indigo-500 hover:text-indigo-700 border border-indigo-200 hover:border-indigo-300 rounded-md px-2.5 py-1 transition-colors flex items-center gap-1">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
              清除日期
            </button>
            <button id="clearFilters" class="text-xs text-gray-400 hover:text-blue-500 border border-gray-200 hover:border-blue-300 rounded-md px-2.5 py-1 transition-colors">清除全部</button>
          </div>
        </div>
      </div>

      ${records.length === 0 ? `
        <div class="glass-card p-12 text-center">
          <svg class="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          <p class="text-gray-400">暂无记录</p>
        </div>
      ` : (() => {
        const totalPages = Math.ceil(records.length / PAGE_SIZE);
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;
        const start = (currentPage - 1) * PAGE_SIZE;
        const pageRecords = records.slice(start, start + PAGE_SIZE);
        return `
        <div class="hidden lg:block glass-card overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-blue-50/80 text-left text-blue-800 border-b-2 border-blue-200">
                  <th class="px-2.5 py-2.5 font-medium whitespace-nowrap">订单编号</th>
                  <th class="px-2.5 py-2.5 font-medium whitespace-nowrap">型号</th>
                  <th class="px-2.5 py-2.5 font-medium whitespace-nowrap">设备编号</th>
                  <th class="px-2.5 py-2.5 font-medium whitespace-nowrap">店铺</th>
                  <th class="px-2.5 py-2.5 font-medium whitespace-nowrap text-emerald-700">闲鱼客户</th>
                  <th class="px-2.5 py-2.5 font-medium whitespace-nowrap text-cyan-700">手机号</th>
                  <th class="px-2.5 py-2.5 font-medium whitespace-nowrap text-orange-700">发货地址</th>
                  <th class="px-2.5 py-2.5 font-medium whitespace-nowrap text-amber-700">备注</th>
                  <th class="px-2.5 py-2.5 font-medium whitespace-nowrap text-violet-700">发货日期</th>
                  <th class="px-2.5 py-2.5 font-medium whitespace-nowrap">收货日期</th>
                  <th class="px-2.5 py-2.5 font-medium whitespace-nowrap">寄出日期</th>
                  <th class="px-2.5 py-2.5 font-medium whitespace-nowrap">到仓时间</th>
                  <th class="px-2.5 py-2.5 font-medium text-center whitespace-nowrap">状态</th>
                  <th class="px-2.5 py-2.5 font-medium whitespace-nowrap text-cyan-700">发货格式</th>
                  <th class="px-2.5 py-2.5 font-medium text-center whitespace-nowrap sticky right-0 bg-blue-50 z-10 min-w-[280px]">操作</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                ${pageRecords.map((r, i) => buildRecordRow(r, start + i + 1)).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="hidden sm:block lg:hidden glass-card overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-blue-50/80 text-left text-blue-800 border-b-2 border-blue-200">
                  <th class="px-2 py-2 font-medium text-xs whitespace-nowrap">订单号</th>
                  <th class="px-2 py-2 font-medium text-xs whitespace-nowrap">型号</th>
                  <th class="px-2 py-2 font-medium text-xs whitespace-nowrap">编号</th>
                  <th class="px-2 py-2 font-medium text-xs whitespace-nowrap text-emerald-700">客户</th>
                  <th class="px-2 py-2 font-medium text-xs whitespace-nowrap text-orange-700">地址</th>
                  <th class="px-2 py-2 font-medium text-xs whitespace-nowrap text-amber-700">备注</th>
                  <th class="px-2 py-2 font-medium text-xs whitespace-nowrap text-violet-700">发货</th>
                  <th class="px-2 py-2 font-medium text-xs whitespace-nowrap">收货</th>
                  <th class="px-2 py-2 font-medium text-xs whitespace-nowrap">寄出</th>
                  <th class="px-2 py-2 font-medium text-xs whitespace-nowrap">到仓</th>
                  <th class="px-2 py-2 font-medium text-xs text-center whitespace-nowrap">状态</th>
                  <th class="px-2 py-2 font-medium text-xs whitespace-nowrap text-cyan-700">发货格式</th>
                  <th class="px-2 py-2 font-medium text-xs text-center whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                ${pageRecords.map((r, i) => buildRecordRowTablet(r, start + i + 1)).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="sm:hidden space-y-3">
          ${pageRecords.map((r, i) => buildRecordCard(r, start + i + 1)).join('')}
        </div>

        ${totalPages > 1 ? `
        <div class="glass-card px-4 py-3 flex items-center justify-between">
          <div class="text-sm text-gray-500">第 ${currentPage} / ${totalPages} 页，共 ${records.length} 条</div>
          <div class="flex items-center gap-1">
            <button id="firstPage" class="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed" ${currentPage <= 1 ? 'disabled' : ''}>首页</button>
            <button id="prevPage" class="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed" ${currentPage <= 1 ? 'disabled' : ''}>上一页</button>
            ${(() => {
              const pages: number[] = [];
              let startPage = Math.max(1, currentPage - 2);
              const endPage = Math.min(totalPages, startPage + 4);
              if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);
              for (let p = startPage; p <= endPage; p++) pages.push(p);
              return pages.map((p) =>
                `<button class="page-btn px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${p === currentPage ? 'bg-[#409EFF] text-white border-[#409EFF]' : 'border-gray-200 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600'}" data-page="${p}">${p}</button>`
              ).join('');
            })()}
            <button id="nextPage" class="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed" ${currentPage >= totalPages ? 'disabled' : ''}>下一页</button>
            <button id="lastPage" class="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed" ${currentPage >= totalPages ? 'disabled' : ''}>尾页</button>
          </div>
        </div>
        ` : ''}
      `; })()}
    </div>
  `;
}

function buildTransferSection(): string {
  const matches = findTransferMatches();
  const shippedOrders = loadRecordsSync().filter(r => r.status === '已发出' && !r.peerShipping && r.deviceNumbers.length > 0);
  const pendingOrdersList = loadRecordsSync().filter(r => r.status === '待发货');

  // Filter out ignored pairs
  const filteredMatches = matches.filter(m => !ignoredTransferPairs.has(`${m.fromRecord.id}-${m.toRecord.id}`));

  // Transfer logs pagination
  const logTotalPages = Math.ceil(transferLogs.length / TRANSFER_LOG_PAGE_SIZE);
  if (transferLogPage > logTotalPages && logTotalPages > 0) transferLogPage = logTotalPages;
  if (transferLogPage < 1) transferLogPage = 1;
  const logStart = (transferLogPage - 1) * TRANSFER_LOG_PAGE_SIZE;
  const logPageData = transferLogs.slice(logStart, logStart + TRANSFER_LOG_PAGE_SIZE);

  const sameCityCount = filteredMatches.filter(m => m.matchType === 'same_city').length;
  const sameProvinceCount = filteredMatches.filter(m => m.matchType === 'same_province').length;

  return `
    <div class="space-y-4">
      <!-- 子标签页切换 -->
      <div class="flex items-center gap-1 bg-gray-100/80 rounded-xl p-1">
        <button data-action="transfer-subtab" data-tab="match" class="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${transferSubTab === 'match' ? 'bg-white shadow-sm text-orange-600' : 'text-gray-500 hover:text-gray-700'}">
          转寄匹配 ${filteredMatches.length > 0 ? `<span class="ml-1 inline-flex items-center justify-center min-w-5 h-5 text-[10px] font-bold bg-orange-500 text-white rounded-full px-1">${filteredMatches.length}</span>` : ''}
        </button>
        <button data-action="transfer-subtab" data-tab="records" class="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${transferSubTab === 'records' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}">
          转寄记录 ${transferLogs.length > 0 ? `<span class="ml-1 inline-flex items-center justify-center min-w-5 h-5 text-[10px] font-bold bg-blue-500 text-white rounded-full px-1">${transferLogs.length}</span>` : ''}
        </button>
      </div>

      ${transferSubTab === 'match' ? `
      <!-- ========== 转寄匹配 ========== -->
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <div class="text-sm text-gray-500">
            已发出 <span class="font-bold text-orange-600">${shippedOrders.length}</span> 单 · 待发货 <span class="font-bold text-blue-600">${pendingOrdersList.length}</span> 单
            <span class="text-gray-300 mx-1">|</span>
            <span class="text-xs text-emerald-600 font-medium">同城 ${sameCityCount}</span>
            <span class="text-xs text-amber-600 font-medium">同省 ${sameProvinceCount}</span>
          </div>
        </div>

      ${filteredMatches.length === 0 ? `
          <div class="glass-card p-8 text-center">
            <div class="text-gray-400 text-4xl mb-3">📦</div>
            <p class="text-gray-500">暂无可转寄的订单匹配</p>
            <p class="text-gray-400 text-xs mt-1">仅匹配同城/同省订单，跨省不匹配。每个已发出最多匹配4个待发货</p>
          </div>
      ` : `
          <div class="space-y-3">
            ${filteredMatches.map((m, i) => {
              const fromCity = extractCity(m.fromRecord.shipAddress);
              const toCity = extractCity(m.toRecord.shipAddress);
              const matchLabel = m.matchType === 'same_city'
                ? '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">同城</span>'
                : '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">同省</span>';
              return `
              <div class="glass-card overflow-hidden ${m.matchType === 'same_city' ? 'border-l-4 border-emerald-400' : 'border-l-4 border-amber-400'}">
                <div class="flex items-center justify-between px-4 py-2 bg-gradient-to-r ${m.matchType === 'same_city' ? 'from-emerald-50/80 to-transparent' : 'from-amber-50/80 to-transparent'} border-b border-gray-100/50">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-bold text-gray-700">#${i + 1}</span>
                    ${matchLabel}
                    <span class="text-xs text-gray-400">${m.transitDays}天物流</span>
                  </div>
                  <span class="text-xs text-gray-400">预计到达: ${m.estimatedArrival}</span>
                </div>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-gray-100/80">
                  <!-- 寄出方 -->
                  <div class="p-3 bg-orange-50/20">
                    <div class="flex items-center gap-2 mb-2">
                      <span class="text-xs font-bold text-orange-600 bg-orange-100 px-2 py-0.5 rounded">寄出方</span>
                      <span class="text-xs text-gray-400 font-mono">${m.fromRecord.orderId}</span>
                    </div>
                    <div class="space-y-1 text-sm">
                      <div class="flex justify-between"><span class="text-gray-500">客户</span><span class="font-medium text-gray-700">${m.fromRecord.xianyuCustomer || '-'}</span></div>
                      <div class="flex justify-between"><span class="text-gray-500">机型</span><span class="font-medium">${m.fromRecord.deviceModel} ×${m.fromRecord.deviceNumbers.length} <span class="text-blue-500 text-xs">(${m.fromRecord.deviceNumbers.join(', ')})</span></span></div>
                      <div><span class="text-gray-500 text-xs">收货地址</span><div class="font-medium text-gray-700 text-xs mt-0.5 leading-relaxed" title="${m.fromRecord.shipAddress}">${m.fromRecord.shipAddress || '-'}</div></div>
                      <div class="flex justify-between"><span class="text-gray-500">预计寄出</span><span class="font-medium text-violet-600">${m.fromRecord.expectedReturnDate || '-'}</span></div>
                    </div>
                  </div>
                  <!-- 收件方 -->
                  <div class="p-3 bg-blue-50/20">
                    <div class="flex items-center gap-2 mb-2">
                      <span class="text-xs font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded">收件方</span>
                      <span class="text-xs text-gray-400 font-mono">${m.toRecord.orderId}</span>
                    </div>
                    <div class="space-y-1 text-sm">
                      <div class="flex justify-between"><span class="text-gray-500">客户</span><span class="font-medium text-gray-700">${m.toRecord.xianyuCustomer || '-'}</span></div>
                      <div class="flex justify-between"><span class="text-gray-500">机型</span><span class="font-medium">${m.toRecord.deviceModel} ×${m.toRecord.quantity}</span></div>
                      <div><span class="text-gray-500 text-xs">收货地址</span><div class="font-medium text-gray-700 text-xs mt-0.5 leading-relaxed" title="${m.toRecord.shipAddress}">${m.toRecord.shipAddress || '-'}</div></div>
                      <div class="flex justify-between"><span class="text-gray-500">预计收货</span><span class="font-medium text-emerald-600">${m.toRecord.receiptDate || '-'}</span></div>
                    </div>
                  </div>
                </div>
                <!-- 底部路线+操作 -->
                <div class="flex items-center justify-between px-4 py-2 bg-gray-50/50 border-t border-gray-100/50">
                  <div class="flex items-center gap-2 text-xs text-gray-400">
                    <span class="max-w-[140px] truncate" title="${m.fromRecord.shipAddress}">${fromCity}</span>
                    <svg class="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
                    <span class="max-w-[140px] truncate" title="${m.toRecord.shipAddress}">${toCity}</span>
                    <span class="text-gray-300">|</span>
                    <span>${m.transitDays}天</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <button class="text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5 border border-gray-200 rounded-lg transition-colors" data-action="ignore-transfer" data-from-id="${m.fromRecord.id}" data-to-id="${m.toRecord.id}">忽略</button>
                    <button class="text-xs text-white bg-indigo-500 hover:bg-indigo-600 px-4 py-1.5 rounded-lg transition-colors shadow-[0_2px_8px_-2px_rgba(99,102,241,0.3)]" data-action="confirm-transfer" data-from-id="${m.fromRecord.id}" data-to-id="${m.toRecord.id}" data-match-type="${m.matchType}">确认转寄</button>
                  </div>
                </div>
              </div>
            `;}).join('')}
          </div>
      `}
      </div>
      ` : `
      <!-- ========== 转寄记录 ========== -->
      <div class="space-y-3">
        ${transferLogs.length === 0 ? `
          <div class="glass-card p-8 text-center">
            <div class="text-gray-300 text-4xl mb-3">📋</div>
            <p class="text-gray-500 font-medium">暂无转寄记录</p>
            <p class="text-gray-400 text-xs mt-1">确认转寄后会在此记录</p>
          </div>
        ` : `
          <div class="glass-card overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="bg-gradient-to-r from-blue-50/80 to-indigo-50/50 border-b border-blue-100/50">
                    <th class="px-4 py-3 text-left text-xs font-semibold text-blue-600">确认时间</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-blue-600">寄出方</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-blue-600">收件方</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-blue-600">机型/编号</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-blue-600">路线</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-blue-600">类型</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-50">
                  ${logPageData.map(log => {
                    const confirmedDate = log.confirmedAt ? new Date(log.confirmedAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
                    return `
                    <tr class="hover:bg-blue-50/30 transition-colors">
                      <td class="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">${confirmedDate}</td>
                      <td class="px-4 py-3">
                        <div class="text-xs font-medium text-orange-600">${log.fromCustomer || '-'}</div>
                        <div class="text-[10px] text-gray-400 font-mono">${log.fromOrderId}</div>
                        <div class="text-[10px] text-gray-400 truncate max-w-[140px]" title="${log.fromAddress}">${log.fromAddress || '-'}</div>
                      </td>
                      <td class="px-4 py-3">
                        <div class="text-xs font-medium text-blue-600">${log.toCustomer || '-'}</div>
                        <div class="text-[10px] text-gray-400 font-mono">${log.toOrderId}</div>
                        <div class="text-[10px] text-gray-400 truncate max-w-[140px]" title="${log.toAddress}">${log.toAddress || '-'}</div>
                      </td>
                      <td class="px-4 py-3">
                        <div class="text-xs font-medium">${log.deviceModel}</div>
                        <div class="text-[10px] text-blue-500 font-mono">${log.deviceNumbers.join(', ')}</div>
                      </td>
                      <td class="px-4 py-3 text-xs text-gray-500">
                        <div class="whitespace-nowrap">${extractCity(log.fromAddress)} → ${extractCity(log.toAddress)}</div>
                        <div class="text-[10px] text-gray-400">${log.transitDays}天</div>
                      </td>
                      <td class="px-4 py-3">
                        ${log.matchType === 'same_city'
                          ? '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">同城</span>'
                          : '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">同省</span>'
                        }
                      </td>
                    </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
            ${logTotalPages > 1 ? `
              <div class="flex items-center justify-between px-4 py-2.5 border-t border-blue-100/50 bg-blue-50/30">
                <span class="text-xs text-gray-400">共 ${transferLogs.length} 条 · 第 ${transferLogPage}/${logTotalPages} 页</span>
                <div class="flex items-center gap-1">
                  <button data-action="transfer-log-prev" class="text-xs px-2.5 py-1 rounded border border-blue-200 hover:bg-blue-50 transition-colors disabled:opacity-40" ${transferLogPage <= 1 ? 'disabled' : ''}>上一页</button>
                  <button data-action="transfer-log-next" class="text-xs px-2.5 py-1 rounded border border-blue-200 hover:bg-blue-50 transition-colors disabled:opacity-40" ${transferLogPage >= logTotalPages ? 'disabled' : ''}>下一页</button>
                </div>
              </div>
            ` : `
              <div class="flex items-center justify-center px-4 py-2.5 border-t border-blue-100/50 bg-blue-50/30">
                <span class="text-xs text-gray-400">共 ${transferLogs.length} 条记录</span>
              </div>
            `}
          </div>
        `}
      </div>
      `}
    </div>
  `;
}

function getStatusBadge(status: string, isOverdue: boolean, peerShipping?: boolean): string {
  if (peerShipping && status === '已发出') {
    return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-600"><span class="w-1.5 h-1.5 rounded-full bg-orange-400"></span>同行代发</span>`;
  }
  const config: Record<string, { bg: string; text: string; dot: string; label: string }> = {
    '待发货': { bg: 'bg-blue-50', text: 'text-blue-600', dot: 'bg-blue-400', label: '待发货' },
    '已发出': isOverdue
      ? { bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-400', label: '逾期' }
      : { bg: 'bg-[#FDF6EC]', text: 'text-[#E6A23C]', dot: 'bg-[#E6A23C]', label: '已发出' },
    '已归还': { bg: 'bg-[#409EFF]/10', text: 'text-[#409EFF]', dot: 'bg-[#409EFF]', label: '已归还' },
    '已转寄': { bg: 'bg-purple-50', text: 'text-purple-600', dot: 'bg-purple-400', label: '已转寄' },
  };
  const c = config[status] || config['待发货'];
  return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}"><span class="w-1.5 h-1.5 rounded-full ${c.dot}"></span>${c.label}</span>`;
}

function formatDeviceNumbers(record: RentalRecord): string {
  if (record.deviceNumbers.length > 0) return record.isTransfer ? `转寄: ${record.deviceNumbers.join(', ')}` : record.deviceNumbers.join(', ');
  if (record.peerShipping && record.peerShippingInfo) return `同行: ${record.peerShippingInfo}`;
  if (record.peerShipping) return '同行代发';
  return '未分配';
}

function buildShipFormatText(record: RentalRecord): string {
  if (!record.shipAddress) return '';
  if (record.deviceNumbers.length > 0) return `（${record.deviceNumbers.join(',')}）${record.shipAddress};`;
  return `${record.shipAddress};`;
}

function buildRecordRow(record: RentalRecord, _index: number): string {
  const today = new Date().toISOString().split('T')[0];
  const isOverdue = record.status === '已发出' && record.expectedReturnDate < today;
  const addressDisplay = record.shipAddress
    ? `<span class="text-orange-600 text-xs block max-w-[220px]" title="${record.shipAddress}">${record.shipAddress}</span>`
    : '<span class="text-gray-300">-</span>';
  const shipFormat = buildShipFormatText(record);
  return `
    <tr class="hover:bg-blue-50/30 transition-colors ${isOverdue ? 'bg-red-50/40' : ''} ${record.status === '待发货' ? 'bg-blue-50/20' : ''}">
      <td class="px-2.5 py-2.5"><span class="font-mono text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">${record.orderId}</span></td>
      <td class="px-2.5 py-2.5 font-medium text-gray-800 whitespace-nowrap">${record.deviceModel}</td>
      <td class="px-2.5 py-2.5"><span class="font-mono text-sm ${record.deviceNumbers.length > 0 ? 'text-blue-400' : record.peerShipping ? 'text-amber-500' : 'text-gray-400 italic'}">${formatDeviceNumbers(record)}</span></td>
      <td class="px-2.5 py-2.5 font-medium text-gray-800">${record.shopName || '-'}</td>
      <td class="px-2.5 py-2.5 text-emerald-600 font-medium"><span class="cursor-pointer hover:underline" data-action="copy-customer" data-customer="${record.xianyuCustomer}">${record.xianyuCustomer}</span></td>
      <td class="px-2.5 py-2.5 text-cyan-600 font-mono text-sm cursor-pointer hover:text-cyan-500" data-action="copy-phone" data-phone="${record.phone || ''}" title="点击复制">${record.phone || '-'}</td>
      <td class="px-2.5 py-2.5">${addressDisplay}</td>
      <td class="px-2.5 py-2.5 text-amber-600 text-xs max-w-[120px] truncate" title="${record.notes || ''}">${record.notes || '-'}</td>
      <td class="px-2.5 py-2.5 text-violet-600 whitespace-nowrap font-medium">${record.shipDate}</td>
      <td class="px-2.5 py-2.5 text-gray-600 whitespace-nowrap">${record.receiptDate}</td>
      <td class="px-2.5 py-2.5 whitespace-nowrap ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-600'}">${record.expectedReturnDate}${isOverdue ? ' <span class="text-red-400 text-xs">逾期</span>' : ''}</td>
      <td class="px-2.5 py-2.5 text-gray-600 whitespace-nowrap">${record.estimatedArrivalDate}</td>
      <td class="px-2.5 py-2.5 text-center">${getStatusBadge(record.status, isOverdue, record.peerShipping)}</td>
      <td class="px-2.5 py-2.5">${shipFormat ? `<span class="text-xs text-cyan-700 bg-cyan-50 px-1.5 py-0.5 rounded cursor-pointer font-mono hover:bg-cyan-100 transition-colors" title="点击复制" data-action="copy-ship-format" data-format="${shipFormat.replace(/"/g, '&quot;')}">${shipFormat.length > 30 ? shipFormat.slice(0, 30) + '...' : shipFormat}</span>` : '<span class="text-gray-300 text-xs">-</span>'}</td>
      <td class="px-2.5 py-2.5 text-center sticky right-0 bg-white/90 backdrop-blur-sm z-20 min-w-[280px] shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)]">
        <div class="flex items-center justify-center gap-1 flex-nowrap">
          <button data-action="edit" data-id="${record.id}" class="text-gray-500 hover:bg-gray-50 px-2 py-1 rounded text-xs font-medium transition-colors">编辑</button>
          ${record.status === '待发货' ? `<button data-action="assign" data-id="${record.id}" class="text-blue-600 hover:bg-blue-50 px-2 py-1 rounded text-xs font-medium transition-colors">分配设备</button><button data-action="peer-ship" data-id="${record.id}" class="text-amber-600 hover:bg-amber-50 px-2 py-1 rounded text-xs font-medium transition-colors">同行代发</button>` : ''}
          ${record.status === '已发出' ? `<button data-action="return" data-id="${record.id}" class="text-[#409EFF] hover:bg-[#409EFF]/10 px-2 py-1 rounded text-xs font-medium transition-colors">归还</button><button data-action="reassign" data-id="${record.id}" class="text-amber-600 hover:bg-amber-50 px-2 py-1 rounded text-xs font-medium transition-colors">重新分配</button>` : ''}
          <button data-action="delete" data-id="${record.id}" class="text-red-400 hover:bg-red-50 px-2 py-1 rounded text-xs font-medium transition-colors">删除</button>
        </div>
      </td>
    </tr>
  `;
}

function buildRecordRowTablet(record: RentalRecord, _index: number): string {
  const today = new Date().toISOString().split('T')[0];
  const isOverdue = record.status === '已发出' && record.expectedReturnDate < today;
  const addressShort = record.shipAddress
    ? `<span class="text-orange-600 text-[10px] block max-w-[140px]" title="${record.shipAddress}">${record.shipAddress}</span>`
    : '<span class="text-gray-300">-</span>';
  const shipFormat = buildShipFormatText(record);
  return `
    <tr class="hover:bg-blue-50/30 transition-colors ${isOverdue ? 'bg-red-50/40' : ''} ${record.status === '待发货' ? 'bg-blue-50/20' : ''}">
      <td class="px-2 py-2"><span class="font-mono text-[10px] text-blue-600">${record.orderId}</span></td>
      <td class="px-2 py-2 font-medium text-gray-800 text-xs whitespace-nowrap">${record.deviceModel}</td>
      <td class="px-2 py-2 text-sm"><span class="font-mono ${record.deviceNumbers.length > 0 ? 'text-blue-400' : record.peerShipping ? 'text-amber-500' : 'text-gray-400 italic'}">${formatDeviceNumbers(record)}</span></td>
      <td class="px-2 py-2 text-xs text-emerald-600 font-medium"><span class="cursor-pointer hover:underline" data-action="copy-customer" data-customer="${record.xianyuCustomer}">${record.xianyuCustomer}</span></td>
      <td class="px-2 py-2 text-xs">${addressShort}</td>
      <td class="px-2 py-2 text-xs text-amber-600 max-w-[80px] truncate" title="${record.notes || ''}">${record.notes || '-'}</td>
      <td class="px-2 py-2 text-xs text-violet-600 whitespace-nowrap font-medium">${record.shipDate}</td>
      <td class="px-2 py-2 text-xs text-gray-600 whitespace-nowrap">${record.receiptDate}</td>
      <td class="px-2 py-2 text-xs whitespace-nowrap ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-600'}">${record.expectedReturnDate}</td>
      <td class="px-2 py-2 text-xs text-gray-600 whitespace-nowrap">${record.estimatedArrivalDate}</td>
      <td class="px-2 py-2 text-center">${getStatusBadge(record.status, isOverdue, record.peerShipping)}</td>
      <td class="px-2 py-2">${shipFormat ? `<span class="text-[10px] text-cyan-700 bg-cyan-50 px-1 py-0.5 rounded cursor-pointer font-mono hover:bg-cyan-100 transition-colors" title="点击复制" data-action="copy-ship-format" data-format="${shipFormat.replace(/"/g, '&quot;')}">${shipFormat.length > 20 ? shipFormat.slice(0, 20) + '...' : shipFormat}</span>` : '<span class="text-gray-300 text-[10px]">-</span>'}</td>
      <td class="px-2 py-2 text-center">
        <div class="flex items-center justify-center gap-1">
          <button data-action="edit" data-id="${record.id}" class="text-gray-500 hover:bg-gray-50 px-1.5 py-0.5 rounded text-xs font-medium transition-colors">编辑</button>
          ${record.status === '待发货' ? `<button data-action="assign" data-id="${record.id}" class="text-blue-600 hover:bg-blue-50 px-1.5 py-0.5 rounded text-xs font-medium transition-colors">分配</button><button data-action="peer-ship" data-id="${record.id}" class="text-amber-600 hover:bg-amber-50 px-1.5 py-0.5 rounded text-xs font-medium transition-colors">代发</button>` : ''}
          ${record.status === '已发出' ? `<button data-action="return" data-id="${record.id}" class="text-[#409EFF] hover:bg-[#409EFF]/10 px-1.5 py-0.5 rounded text-xs font-medium transition-colors">归还</button><button data-action="reassign" data-id="${record.id}" class="text-amber-600 hover:bg-amber-50 px-1.5 py-0.5 rounded text-xs font-medium transition-colors">重新分配</button>` : ''}
          <button data-action="delete" data-id="${record.id}" class="text-red-400 hover:bg-red-50 px-1.5 py-0.5 rounded text-xs font-medium transition-colors">删除</button>
        </div>
      </td>
    </tr>
  `;
}

function buildRecordCard(record: RentalRecord, _index: number): string {
  const today = new Date().toISOString().split('T')[0];
  const isOverdue = record.status === '已发出' && record.expectedReturnDate < today;
  return `
    <div class="glass-card p-4 ${isOverdue ? 'border-red-300' : ''} ${record.status === '待发货' ? 'border-blue-300' : ''}">
      <div class="flex items-center justify-between mb-2.5">
        <span class="font-mono text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">${record.orderId}</span>
        ${getStatusBadge(record.status, isOverdue, record.peerShipping)}
      </div>
      <div class="flex items-center gap-2 mb-2 flex-wrap">
        <span class="font-medium text-gray-800">${record.deviceModel}</span>
        ${record.deviceNumbers.length > 0 ? `<span class="text-sm text-blue-400 font-mono bg-blue-50 px-1.5 py-0.5 rounded">[${record.deviceNumbers.join(', ')}]</span>` : record.peerShipping ? `<span class="text-sm text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded">同行: ${record.peerShippingInfo || '代发'}</span>` : '<span class="text-sm text-gray-400 italic bg-gray-50 px-1.5 py-0.5 rounded">未分配设备</span>'}
      </div>
      <div class="flex items-center gap-2 mb-2.5 text-sm">
        ${record.shopName ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">${record.shopName}</span>` : ''}
        <span class="text-emerald-600 font-medium">${record.xianyuCustomer}</span>
        ${record.phone ? `<span class="text-cyan-600 font-mono text-sm cursor-pointer hover:text-cyan-500" data-action="copy-phone" data-phone="${record.phone}" title="点击复制">${record.phone}</span>` : ''}
      </div>
      ${record.shipAddress ? `<div class="text-xs text-orange-600 mb-2.5" title="${record.shipAddress}">${record.shipAddress}</div>` : ''}
      ${record.notes ? `<div class="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded mb-2.5">备注: ${record.notes}</div>` : ''}
      <div class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        <div class="flex justify-between"><span class="text-gray-400">发货日期</span><span class="text-violet-600 font-medium">${record.shipDate}</span></div>
        <div class="flex justify-between"><span class="text-gray-400">收货日期</span><span>${record.receiptDate}</span></div>
        <div class="flex justify-between"><span class="text-gray-400">寄出日期</span><span class="${isOverdue ? 'text-red-600 font-medium' : ''}">${record.expectedReturnDate}${isOverdue ? ' (逾期)' : ''}</span></div>
        <div class="flex justify-between"><span class="text-gray-400">到仓时间</span><span>${record.estimatedArrivalDate}</span></div>
      </div>
      ${(() => { const sf = buildShipFormatText(record); return sf ? `<div class="mt-2 text-xs text-cyan-700 bg-cyan-50 px-2 py-1.5 rounded cursor-pointer font-mono hover:bg-cyan-100 transition-colors" title="点击复制" data-action="copy-ship-format" data-format="${sf.replace(/"/g, '&quot;')}">发货: ${sf}</div>` : ''; })()}
      ${record.status === '已归还' && record.returnDate ? `<div class="mt-1.5 text-sm flex justify-between"><span class="text-gray-400">实际归还</span><span class="text-[#409EFF]">${record.returnDate}</span></div>` : ''}
      <div class="flex justify-end gap-2 mt-3 pt-3 border-t border-gray-50">
        <button data-action="edit" data-id="${record.id}" class="text-gray-500 hover:bg-gray-50 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-gray-200">编辑</button>
        ${record.status === '待发货' ? `<button data-action="assign" data-id="${record.id}" class="text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-blue-200">分配设备</button><button data-action="peer-ship" data-id="${record.id}" class="text-amber-600 hover:bg-amber-50 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-amber-200">同行代发</button>` : ''}
        ${record.status === '已发出' ? `<button data-action="return" data-id="${record.id}" class="text-[#409EFF] hover:bg-[#409EFF]/10 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-[#409EFF]/30">确认归还</button><button data-action="reassign" data-id="${record.id}" class="text-amber-600 hover:bg-amber-50 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-amber-200">重新分配</button>` : ''}
        <button data-action="delete" data-id="${record.id}" class="text-red-400 hover:bg-red-50 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-red-200">删除</button>
      </div>
    </div>
  `;
}

// ========== 设备记录编辑弹窗 ==========

function showRecordEditModal(recordId: string): void {
  const records = loadRecordsSync();
  const record = records.find((r) => r.id === recordId);
  if (!record) return;

  const modal = document.getElementById('recordEditModal');
  if (!modal) return;

  modal.innerHTML = `
    <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" id="editOverlay">
      <div class="backdrop-blur-xl bg-white/92 border border-blue-100/60 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div class="sticky top-0 backdrop-blur-xl bg-white/90 z-10 px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 class="text-lg font-bold text-gray-800">编辑订单 #${record.orderId}</h3>
          <button id="closeEditModal" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div class="p-6 space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-600 mb-1">店铺</label>
              <select id="editShopName" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#409EFF] focus:border-[#409EFF] outline-none">
                <option value="有礼貌的饭饭" ${record.shopName === '有礼貌的饭饭' ? 'selected' : ''}>有礼貌的饭饭</option>
                <option value="美味米饭" ${record.shopName === '美味米饭' ? 'selected' : ''}>美味米饭</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-600 mb-1">设备型号（可多选）</label>
              <div class="flex gap-3 mt-1">
                ${getAllModels().map(m => `<label class="flex items-center gap-1.5 cursor-pointer bg-gray-50 rounded-lg px-3 py-2 border border-gray-200 hover:border-[#409EFF] transition-colors has-[:checked]:bg-blue-50 has-[:checked]:border-[#409EFF]">
                  <input type="checkbox" class="edit-model-cb accent-[#409EFF]" value="${m}" ${record.deviceModel === m || record.deviceModel === '混合' ? 'checked' : ''} />
                  <span class="text-sm">${m}</span>
                </label>`).join('\n                ')}
              </div>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-600 mb-1">闲鱼客户</label>
              <input id="editXianyuCustomer" type="text" value="${record.xianyuCustomer}" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#409EFF] focus:border-[#409EFF] outline-none" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-600 mb-1">手机号</label>
              <input id="editPhone" type="text" value="${record.phone}" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#409EFF] focus:border-[#409EFF] outline-none" />
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-600 mb-1">收货地址</label>
            <input id="editShipAddress" type="text" value="${record.shipAddress}" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#409EFF] focus:border-[#409EFF] outline-none" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-600 mb-1">备注</label>
            <input id="editNotes" type="text" value="${record.notes || ''}" placeholder="添加备注信息" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#409EFF] focus:border-[#409EFF] outline-none" />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-600 mb-1">预计发货日期</label>
              <input id="editShipDate" type="date" value="${record.shipDate}" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#409EFF] focus:border-[#409EFF] outline-none" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-600 mb-1">收货日期</label>
              <input id="editReceiptDate" type="date" value="${record.receiptDate}" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#409EFF] focus:border-[#409EFF] outline-none" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-600 mb-1">预计寄出日期</label>
              <input id="editExpectedReturnDate" type="date" value="${record.expectedReturnDate}" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#409EFF] focus:border-[#409EFF] outline-none" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-600 mb-1">预计到仓时间</label>
              <input id="editEstimatedArrivalDate" type="date" value="${record.estimatedArrivalDate}" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#409EFF] focus:border-[#409EFF] outline-none" />
            </div>
          </div>
          ${record.status === '已归还' && record.returnDate ? `
          <div>
            <label class="block text-sm font-medium text-gray-600 mb-1">实际归还日期</label>
            <input id="editReturnDate" type="date" value="${record.returnDate}" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#409EFF] focus:border-[#409EFF] outline-none" />
          </div>
          ` : ''}
        </div>
        <div class="sticky bottom-0 backdrop-blur-xl bg-white/90 border-t border-gray-100 px-6 py-4 flex justify-end gap-3">
          <button id="cancelEditBtn" class="px-5 py-2 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors">取消</button>
          <button id="saveEditBtn" class="px-5 py-2 rounded-lg text-sm font-medium text-white bg-[#409EFF] hover:bg-[#3A8EE6] transition-colors">保存修改</button>
        </div>
      </div>
    </div>
  `;

  // 绑定事件
  const close = (): void => { modal.innerHTML = ''; };
  document.getElementById('closeEditModal')?.addEventListener('click', close);
  document.getElementById('cancelEditBtn')?.addEventListener('click', close);
  document.getElementById('editOverlay')?.addEventListener('click', (e: Event) => {
    if ((e.target as HTMLElement).id === 'editOverlay') close();
  });

  document.getElementById('saveEditBtn')?.addEventListener('click', async () => {
    // 获取选中的机型
    const checkedModels = Array.from(modal.querySelectorAll('.edit-model-cb:checked')).map(
      (cb) => (cb as HTMLInputElement).value
    );
    if (checkedModels.length === 0) {
      showToast('请至少选择一种设备型号', 'warning');
      return;
    }
    const modelValue: DeviceModel = checkedModels.length > 1 ? '混合' : checkedModels[0] as DeviceModel;

    const updates: Partial<RentalRecord> = {
      shopName: (document.getElementById('editShopName') as HTMLSelectElement).value,
      deviceModel: modelValue,
      xianyuCustomer: (document.getElementById('editXianyuCustomer') as HTMLInputElement).value.trim(),
      phone: (document.getElementById('editPhone') as HTMLInputElement).value.trim(),
      shipAddress: (document.getElementById('editShipAddress') as HTMLInputElement).value.trim(),
      notes: (document.getElementById('editNotes') as HTMLInputElement).value.trim(),
      shipDate: (document.getElementById('editShipDate') as HTMLInputElement).value,
      receiptDate: (document.getElementById('editReceiptDate') as HTMLInputElement).value,
      expectedReturnDate: (document.getElementById('editExpectedReturnDate') as HTMLInputElement).value,
      estimatedArrivalDate: (document.getElementById('editEstimatedArrivalDate') as HTMLInputElement).value,
    };
    const returnDateEl = document.getElementById('editReturnDate') as HTMLInputElement | null;
    if (returnDateEl) updates.returnDate = returnDateEl.value;

    await updateRecord(recordId, updates);
    close();
    showToast('订单修改成功', 'success');
    render();
  });
}

// ========== Toast 提示 ==========

function showToast(message: string, type: 'success' | 'warning' | 'error' = 'success'): void {
  const colors = {
    success: 'bg-[#67C23A]',
    warning: 'bg-[#E6A23C]',
    error: 'bg-[#F56C6C]',
  };
  const icons = {
    success: '✓',
    warning: '⚠',
    error: '✕',
  };
  const toast = document.createElement('div');
  toast.className = `fixed top-6 left-1/2 -translate-x-1/2 z-[100] ${colors[type]} text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-medium animate-slide-down`;
  toast.innerHTML = `<span class="text-base">${icons[type]}</span><span>${message}</span>`;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s, transform 0.3s';
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(-10px)';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// ========== 设备分配弹窗 ==========

async function showAssignModal(recordId: string): Promise<void> {
  // 先刷新数据，确保减仓后的设备不会出现
  try {
    invalidateCache();
    await Promise.all([loadDeviceInfo(), loadRecords()]);
  } catch (err) {
    console.warn('刷新数据失败，使用缓存:', err);
  }
  
  const records = loadRecordsSync();
  const record = records.find((r) => r.id === recordId);
  if (!record || record.status !== '待发货') return;

  assigningRecordId = recordId;
  assigningDeviceNumbers = [...record.deviceNumbers];

  const models: DeviceModel[] = getAllModels();

  const modal = document.getElementById('assignModal');
  if (!modal) return;

  const modelSections = models.map((m) => {
    const allNums = getAllDeviceNumbers(m);
    const rentedSet = getRentedDeviceNumbers(m);
    return { model: m, numbers: allNums, rentedSet };
  });

  modal.innerHTML = `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" id="assignOverlay">
      <div class="backdrop-blur-xl bg-white/92 border border-blue-100/60 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden animate-modal-in">
        <div class="bg-gradient-to-r from-blue-500 to-blue-600 p-4 text-white">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="font-bold">分配设备编号</h3>
              <p class="text-blue-100 text-xs mt-0.5">${record.orderId} · ${record.xianyuCustomer} · 订单数量 ${record.quantity} 台</p>
            </div>
            <button id="closeAssign" class="hover:bg-white/20 p-1 rounded-lg transition-colors">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
        <div class="p-4 space-y-3 overflow-y-auto max-h-[55vh]">
          <div class="flex items-center justify-between">
            <span id="assignCount" class="text-sm font-medium text-gray-700">已选 ${assigningDeviceNumbers.length} 台${assigningDeviceNumbers.length !== record.quantity ? `（订单 ${record.quantity} 台）` : ''}</span>
            <div class="flex items-center gap-2">
              <button type="button" id="assignSelectAll" class="text-xs text-blue-600 hover:text-blue-700 font-medium">全选在仓</button>
              <span class="text-gray-300">|</span>
              <button type="button" id="assignClear" class="text-xs text-gray-500 hover:text-gray-700 font-medium">清空</button>
            </div>
          </div>
          <div class="flex items-center gap-1.5 text-xs text-gray-400">
            <span class="inline-block w-3 h-3 bg-white border border-gray-300 rounded"></span>可选
            <span class="inline-block w-3 h-3 bg-blue-500 rounded ml-1"></span>已选
            <span class="inline-block w-3 h-3 bg-gray-300 rounded ml-1"></span>已外租
          </div>
          ${modelSections.map((sec) => {
            const availableCount = sec.numbers.filter((n) => !sec.rentedSet.has(n) && !assigningDeviceNumbers.includes(n)).length;
            const selectedInModel = sec.numbers.filter((n) => assigningDeviceNumbers.includes(n)).length;
            return `
            <div class="mb-2">
              <div class="flex items-center gap-2 mb-1.5">
                <span class="text-xs font-semibold text-gray-600">${sec.model}</span>
                <span class="text-xs text-gray-400">在仓 ${availableCount} · 已选 ${selectedInModel}</span>
              </div>
              <div class="flex flex-wrap gap-1.5">
                ${sec.numbers.map((num) => {
                  const isRented = sec.rentedSet.has(num);
                  const isSelected = assigningDeviceNumbers.includes(num);
                  const classes = isRented
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed border-gray-300'
                    : isSelected
                      ? 'bg-blue-500 text-white border-blue-500 shadow-card'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400 cursor-pointer';
                  return `<button type="button" data-assign-num="${num}" data-assign-rented="${isRented}" class="assign-num-btn inline-flex items-center justify-center w-12 h-8 text-xs font-mono rounded-md border transition-all ${classes}" ${isRented ? 'disabled' : ''}>${num}</button>`;
                }).join('')}
              </div>
            </div>`;
          }).join('')}
        </div>
        <div class="p-4 border-t border-gray-100 bg-gray-50 space-y-3">
          <div id="peerShippingSection" class="hidden">
            <label class="block text-xs font-medium text-gray-600 mb-1">同行代发备注</label>
            <input type="text" id="peerShippingInfoInput" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="如：代发方名称、联系方式等" />
          </div>
          <div class="flex gap-3">
            <button id="cancelAssign" class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-2 px-4 rounded-lg transition-colors text-sm">取消</button>
            <button id="peerShippingBtn" class="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm">同行代发</button>
            <button id="confirmAssign" class="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm">确认分配并发出</button>
          </div>
        </div>
      </div>
    </div>`;

  const closeModal = (): void => { const el = document.getElementById('assignModal'); if (el) el.innerHTML = ''; assigningRecordId = ''; assigningDeviceNumbers = []; };

  document.getElementById('closeAssign')?.addEventListener('click', closeModal);
  document.getElementById('cancelAssign')?.addEventListener('click', closeModal);
  document.getElementById('assignOverlay')?.addEventListener('click', (e: MouseEvent) => { if (e.target === e.currentTarget) closeModal(); });

  modal.querySelectorAll('.assign-num-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const num = (btn as HTMLElement).dataset.assignNum || '';
      const isRented = (btn as HTMLElement).dataset.assignRented === 'true';
      if (isRented) return;
      const idx = assigningDeviceNumbers.indexOf(num);
      if (idx >= 0) { assigningDeviceNumbers.splice(idx, 1); } else { assigningDeviceNumbers.push(num); }
      refreshAssignGrid(record.quantity);
    });
  });

  document.getElementById('assignSelectAll')?.addEventListener('click', () => {
    const allAvailable: string[] = [];
    for (const m of models) {
      allAvailable.push(...getAvailableDeviceNumbers(m));
    }
    assigningDeviceNumbers = allAvailable;
    refreshAssignGrid(record.quantity);
  });

  document.getElementById('assignClear')?.addEventListener('click', () => {
    assigningDeviceNumbers = [];
    refreshAssignGrid(record.quantity);
  });

  document.getElementById('confirmAssign')?.addEventListener('click', async () => {
    if (assigningDeviceNumbers.length === 0) { showToast('请至少选择一个设备编号', 'error'); return; }
    try {
      await assignDeviceNumbers(assigningRecordId, [...assigningDeviceNumbers]);
      showToast(`[${assigningDeviceNumbers.join(', ')}] 已分配并发出（共${assigningDeviceNumbers.length}台）`, 'success');
      closeModal();
      render();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '分配设备失败';
      showToast(msg, 'error');
    }
  });

  document.getElementById('peerShippingBtn')?.addEventListener('click', async () => {
    const peerSection = document.getElementById('peerShippingSection');
    const peerInput = document.getElementById('peerShippingInfoInput') as HTMLInputElement | null;
    if (peerSection && peerSection.classList.contains('hidden')) {
      peerSection.classList.remove('hidden');
      peerInput?.focus();
      return;
    }
    const peerInfo = peerInput?.value?.trim() || '';
    try {
      await assignPeerShipping(assigningRecordId, peerInfo);
      invalidateCache();
      await loadRecords();
      showToast('已标记为同行代发', 'success');
      closeModal();
      render();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '操作失败';
      showToast(msg, 'error');
    }
  });
}

function refreshAssignGrid(quantity: number): void {
  const models: DeviceModel[] = getAllModels();
  const gridContainer = document.querySelector('#assignModal .overflow-y-auto');
  const countEl = document.getElementById('assignCount');
  if (!gridContainer) return;

  const modelSections = models.map((m) => {
    const allNums = getAllDeviceNumbers(m);
    const rentedSet = getRentedDeviceNumbers(m);
    return { model: m, numbers: allNums, rentedSet };
  });

  const html = `
    <div class="flex items-center justify-between">
      <span id="assignCount" class="text-sm font-medium text-gray-700">已选 ${assigningDeviceNumbers.length} 台${assigningDeviceNumbers.length !== quantity ? `（订单 ${quantity} 台）` : ''}</span>
      <div class="flex items-center gap-2">
        <button type="button" id="assignSelectAll" class="text-xs text-blue-600 hover:text-blue-700 font-medium">全选在仓</button>
        <span class="text-gray-300">|</span>
        <button type="button" id="assignClear" class="text-xs text-gray-500 hover:text-gray-700 font-medium">清空</button>
      </div>
    </div>
    <div class="flex items-center gap-1.5 text-xs text-gray-400">
      <span class="inline-block w-3 h-3 bg-white border border-gray-300 rounded"></span>可选
      <span class="inline-block w-3 h-3 bg-blue-500 rounded ml-1"></span>已选
      <span class="inline-block w-3 h-3 bg-gray-300 rounded ml-1"></span>已外租
    </div>
    ${modelSections.map((sec) => {
      const availableCount = sec.numbers.filter((n) => !sec.rentedSet.has(n) && !assigningDeviceNumbers.includes(n)).length;
      const selectedInModel = sec.numbers.filter((n) => assigningDeviceNumbers.includes(n)).length;
      return `
      <div class="mb-2">
        <div class="flex items-center gap-2 mb-1.5">
          <span class="text-xs font-semibold text-gray-600">${sec.model}</span>
          <span class="text-xs text-gray-400">在仓 ${availableCount} · 已选 ${selectedInModel}</span>
        </div>
        <div class="flex flex-wrap gap-1.5">
          ${sec.numbers.map((num) => {
            const isRented = sec.rentedSet.has(num);
            const isSelected = assigningDeviceNumbers.includes(num);
            const classes = isRented
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed border-gray-300'
              : isSelected
                ? 'bg-blue-500 text-white border-blue-500 shadow-card'
                : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400 cursor-pointer';
            return `<button type="button" data-assign-num="${num}" data-assign-rented="${isRented}" class="assign-num-btn inline-flex items-center justify-center w-12 h-8 text-xs font-mono rounded-md border transition-all ${classes}" ${isRented ? 'disabled' : ''}>${num}</button>`;
          }).join('')}
        </div>
      </div>`;
    }).join('')}`;

  gridContainer.innerHTML = html;

  if (countEl) countEl.textContent = `已选 ${assigningDeviceNumbers.length} 台${assigningDeviceNumbers.length !== quantity ? `（订单 ${quantity} 台）` : ''}`;

  gridContainer.querySelectorAll('.assign-num-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const num = (btn as HTMLElement).dataset.assignNum || '';
      const isRented = (btn as HTMLElement).dataset.assignRented === 'true';
      if (isRented) return;
      const idx = assigningDeviceNumbers.indexOf(num);
      if (idx >= 0) { assigningDeviceNumbers.splice(idx, 1); } else { assigningDeviceNumbers.push(num); }
      refreshAssignGrid(quantity);
    });
  });

  document.getElementById('assignSelectAll')?.addEventListener('click', () => {
    const allAvailable: string[] = [];
    for (const m of models) {
      allAvailable.push(...getAvailableDeviceNumbers(m));
    }
    assigningDeviceNumbers = allAvailable;
    refreshAssignGrid(quantity);
  });

  document.getElementById('assignClear')?.addEventListener('click', () => {
    assigningDeviceNumbers = [];
    refreshAssignGrid(quantity);
  });
}

// ========== 重新分配设备弹窗 ==========

async function showReassignModal(recordId: string): Promise<void> {
  // 先刷新数据，确保减仓后的设备不会出现
  try {
    invalidateCache();
    await Promise.all([loadDeviceInfo(), loadRecords()]);
  } catch (err) {
    console.warn('刷新数据失败，使用缓存:', err);
  }
  
  const records = loadRecordsSync();
  const record = records.find(r => r.id === recordId);
  if (!record) return;
  const oldNumbers = record.deviceNumbers || [];
  const modal = document.getElementById('assignModal');
  if (!modal) return;
  // Build device grid for all models
  const allDevices = loadDeviceInfoSync();
  const models = getAllModels();
  let deviceGridHtml = '';
  for (const model of models) {
    const devices = allDevices.filter(d => d.model === model);
    const rentedNumbers = new Set(records.filter(r => r.status === '已发出' && r.deviceNumbers && r.id !== recordId).flatMap(r => r.deviceNumbers || []));
    const rentedCount = devices.filter(d => rentedNumbers.has(d.number)).length;
    const inStoreDevices = devices.filter(d => !rentedNumbers.has(d.number));
    // Include current device's numbers as selected
    const currentModelNumbers = oldNumbers.filter(n => getDeviceModelByNumber(n) === model);
    deviceGridHtml += `
      <div class="mb-4">
        <div class="flex items-center justify-between mb-2">
          <span class="font-medium text-gray-700">${model}</span>
          <span class="text-xs text-gray-400">在仓 ${devices.length - rentedCount} / ${devices.length}</span>
        </div>
        <div class="flex flex-wrap gap-1.5">
          ${devices.map(d => {
            const isRented = rentedNumbers.has(d.number);
            const isSelected = currentModelNumbers.includes(d.number);
            const bgClass = isSelected ? 'bg-blue-500 text-white shadow-sm' : isRented ? 'bg-gray-100 text-gray-300 cursor-not-allowed' : 'bg-gray-50 text-gray-600 hover:bg-blue-50 hover:text-blue-600 cursor-pointer';
            return `<button type="button" class="px-2.5 py-1 rounded text-xs font-medium transition-all ${bgClass}" data-number="${d.number}" data-model="${model}" ${isRented && !isSelected ? 'disabled' : ''}>${d.number}</button>`;
          }).join('')}
        </div>
      </div>`;
  }
  modal.innerHTML = `
    <div class="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="backdrop-blur-xl bg-white/92 border border-blue-100/60 rounded-2xl shadow-elevated w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div class="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-4 rounded-t-2xl flex items-center justify-between">
          <h3 class="font-bold text-lg">重新分配设备</h3>
          <button id="closeReassignModal" class="text-white/80 hover:text-white text-2xl leading-none">&times;</button>
        </div>
        <div class="p-5">
          <div class="mb-3 px-3 py-2 bg-amber-50 rounded-lg border border-amber-200 text-sm text-amber-700">
            原设备编号: <span class="font-mono font-bold">${oldNumbers.join(', ') || '无'}</span> → 重新选择后将自动释放原编号
          </div>
          <div class="mb-3">
            <span class="text-sm font-medium text-gray-600">已选 <span id="reassignSelectedCount" class="text-blue-600 font-bold">${oldNumbers.length}</span> 台（订单 ${record.quantity} 台）</span>
          </div>
          ${deviceGridHtml}
          <div class="flex gap-3 mt-6">
            <button id="confirmReassign" class="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white py-2.5 rounded-xl font-medium shadow-[0_4px_12px_rgba(59,130,246,0.3)] hover:shadow-[0_6px_16px_rgba(59,130,246,0.4)] transition-all disabled:opacity-50" disabled>确认重新分配</button>
            <button id="cancelReassign" class="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl font-medium hover:bg-gray-50 transition-all">取消</button>
          </div>
        </div>
      </div>
    </div>`;
  modal.classList.remove('hidden');
  // Track selected numbers
  let selectedNumbers = [...oldNumbers];
  const updateCount = (): void => {
    const countEl = document.getElementById('reassignSelectedCount');
    if (countEl) countEl.textContent = String(selectedNumbers.length);
    const confirmBtn = document.getElementById('confirmReassign') as HTMLButtonElement | null;
    if (confirmBtn) confirmBtn.disabled = selectedNumbers.length === 0;
  };
  // Bind number buttons
  modal.querySelectorAll('button[data-number]').forEach(btn => {
    btn.addEventListener('click', () => {
      const number = btn.getAttribute('data-number')!;
      const model = btn.getAttribute('data-model')!;
      if (selectedNumbers.includes(number)) {
        selectedNumbers = selectedNumbers.filter(n => n !== number);
        btn.className = btn.className.replace('bg-blue-500 text-white shadow-sm', 'bg-gray-50 text-gray-600 hover:bg-blue-50 hover:text-blue-600 cursor-pointer');
      } else {
        selectedNumbers.push(number);
        btn.className = btn.className.replace('bg-gray-50 text-gray-600 hover:bg-blue-50 hover:text-blue-600 cursor-pointer', 'bg-blue-500 text-white shadow-sm');
      }
      updateCount();
    });
  });
  // Close/cancel
  const closeModal = (): void => { modal.classList.add('hidden'); };
  document.getElementById('closeReassignModal')?.addEventListener('click', closeModal);
  document.getElementById('cancelReassign')?.addEventListener('click', closeModal);
  // Confirm reassign
  document.getElementById('confirmReassign')?.addEventListener('click', async () => {
    if (selectedNumbers.length === 0) return;
    try {
      // First release old numbers (set deviceNumbers to empty, status back to 待发货 temporarily)
      await updateRecord(recordId, { deviceNumbers: [], quantity: selectedNumbers.length, status: '待发货' });
      // Then assign new numbers
      await assignDeviceNumbers(recordId, selectedNumbers);
      showToast('设备重新分配成功', 'success');
      closeModal();
      invalidateCache();
      await loadRecords();
      render();
    } catch (err) {
      console.error('重新分配失败:', err);
      showToast('重新分配失败', 'error');
    }
  });
}

// ========== 智能提醒弹窗 ==========

function showReminderModal(): void {
  if (isReminderDismissed()) { updateReminderBadge(); return; }
  const reminders = getReminders();
  const smsRecords = getSmsPendingRecords();
  if (reminders.length === 0 && smsRecords.length === 0) return;

  const modal = document.getElementById('reminderModal');
  if (!modal) return;

  const shipReminders = reminders.filter((r) => r.type === 'ship');
  const arrivalReminders = reminders.filter((r) => r.type === 'arrival');

  modal.innerHTML = `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" id="reminderOverlay">
      <div class="backdrop-blur-xl bg-white/92 border border-blue-100/60 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden animate-modal-in">
        <div class="bg-gradient-to-r from-[#409EFF] to-[#3A8EE6] p-4 text-white">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
              <h3 class="font-bold">智能提醒</h3>
            </div>
            <button id="closeReminder" class="hover:bg-white/20 p-1 rounded-lg transition-colors">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
        <div class="p-4 space-y-4 overflow-y-auto max-h-[60vh]">
          ${shipReminders.length > 0 ? `
            <div>
              <div class="flex items-center gap-2 mb-2">
                <span class="w-6 h-6 bg-[#E6A23C]/20 text-[#E6A23C] rounded-full flex items-center justify-center">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
                </span>
                <span class="font-semibold text-gray-800 text-sm">发货提醒 (${shipReminders.length})</span>
              </div>
              <div class="space-y-2">${shipReminders.map((r) => `
                <div class="bg-[#FDF6EC] border border-[#E6A23C]/20 rounded-lg px-3 py-2 text-sm">
                  <div class="flex items-center justify-between">
                    <div><span class="font-mono text-sm text-blue-400">${r.record.orderId}</span><span class="text-gray-600 ml-2">${r.record.xianyuCustomer} · ${r.record.deviceModel} x${r.record.deviceNumbers.length || r.record.quantity}</span>${r.record.deviceNumbers.length > 0 ? `<span class="text-sm text-blue-400 font-mono ml-1">[${r.record.deviceNumbers.join(', ')}]</span>` : r.record.peerShipping ? `<span class="text-sm text-amber-500 ml-1">同行: ${r.record.peerShippingInfo || '代发'}</span>` : ''}${r.record.status === '待发货' ? `<span class="text-sm text-blue-400 ml-1">(待分配设备)</span>` : ''}</div>
                    <span class="text-[#E6A23C] text-xs font-medium">${r.daysOffset === 0 ? '今日发货' : '明日发货'}</span>
                  </div>
                </div>`).join('')}</div>
            </div>` : ''}
          ${arrivalReminders.length > 0 ? `
            <div>
              <div class="flex items-center gap-2 mb-2">
                <span class="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
                </span>
                <span class="font-semibold text-gray-800 text-sm">到仓提醒 (${arrivalReminders.length})</span>
              </div>
              <div class="space-y-2">${arrivalReminders.map((r) => `
                <div class="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-sm">
                  <div class="flex items-center justify-between">
                    <div><span class="font-mono text-sm text-blue-400">${r.record.orderId}</span><span class="text-gray-600 ml-2">${r.record.xianyuCustomer} · ${r.record.deviceModel} x${r.record.deviceNumbers.length || r.record.quantity}</span>${r.record.deviceNumbers.length > 0 ? `<span class="text-sm text-blue-400 font-mono ml-1">[${r.record.deviceNumbers.join(', ')}]</span>` : ''}</div>
                    <span class="text-blue-600 text-xs font-medium">${r.daysOffset === 0 ? '今日到仓' : '明日到仓'}</span>
                  </div>
                </div>`).join('')}</div>
            </div>` : ''}
          ${smsRecords.length > 0 ? `
            <div>
              <div class="flex items-center gap-2 mb-2">
                <span class="w-6 h-6 bg-[#409EFF]/20 text-[#409EFF] rounded-full flex items-center justify-center">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>
                </span>
                <span class="font-semibold text-gray-800 text-sm">今日短信通知 (${smsRecords.length})</span>
              </div>
              <div class="space-y-2">${smsRecords.map((r) => {
                const smsText = '您好，您在闲鱼租赁的演唱会拍摄手机已从广州仓库发货，请留意物流信息，祝您观影愉快';
                return `<div class="bg-[#409EFF]/10 border border-[#409EFF]/20 rounded-lg px-3 py-2 text-sm">
                  <div class="flex items-center gap-1 mb-1">
                    <span class="font-mono text-xs text-[#409EFF]">${r.orderId}</span>
                    <span class="text-gray-400">→</span>
                    <span class="text-gray-600 text-xs">${r.phone}</span>
                    <button data-action="copy-sms" data-sms="${smsText}" class="ml-auto text-[#409EFF] hover:bg-[#409EFF]/20 px-2 py-0.5 rounded text-xs font-medium transition-colors">复制短信</button>
                  </div>
                  <p class="text-gray-600 text-xs leading-relaxed">${smsText}</p>
                </div>`;
              }).join('')}</div>
              <div class="mt-2 p-2 bg-gray-50 rounded-lg text-xs text-gray-400 flex items-start gap-1.5">
                <svg class="w-3.5 h-3.5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                <span>点击"复制短信"后可直接粘贴发送</span>
              </div>
            </div>` : ''}
        </div>
        <div class="p-4 border-t border-gray-100 bg-gray-50">
          <button id="dismissReminder" class="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm">我已知晓，今日不再提醒</button>
        </div>
      </div>
    </div>`;

  const closeModal = (): void => { const el = document.getElementById('reminderModal'); if (el) el.innerHTML = ''; };
  const closeBtn = document.getElementById('closeReminder');
  const dismissBtn = document.getElementById('dismissReminder');
  const overlay = document.getElementById('reminderOverlay');

  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (dismissBtn) dismissBtn.addEventListener('click', () => { dismissReminders(); closeModal(); });
  if (overlay) overlay.addEventListener('click', (e: MouseEvent) => { if (e.target === overlay) closeModal(); });

  document.querySelectorAll('[data-action="copy-sms"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const sms = (btn as HTMLElement).dataset.sms || '';
      try { await navigator.clipboard.writeText(sms); } catch {
        const ta = document.createElement('textarea'); ta.value = sms; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      }
      showToast('短信内容已复制', 'success');
    });
  });
  updateReminderBadge();
}

function updateReminderBadge(): void {
  const reminders = getReminders();
  const badge = document.getElementById('reminderBadge');
  if (badge && reminders.length > 0) {
    badge.textContent = String(reminders.length);
    badge.classList.remove('hidden');
    badge.classList.add('flex');
  }
}

// ========== 辅助函数 ==========

function getFilteredRecords(): RentalRecord[] {
  let records = loadRecordsSync();
  if (filterStatus !== 'all') records = records.filter((r) => r.status === filterStatus);
  if (filterModel !== 'all') records = records.filter((r) => r.deviceModel === filterModel);
  if (filterShopName !== 'all') records = records.filter((r) => r.shopName === filterShopName);
  if (filterDeviceNumber) {
    const keyword = filterDeviceNumber.trim();
    records = records.filter((r) => r.deviceNumbers.some((n) => n.includes(keyword)));
  }
  if (filterXianyuCustomer) {
    const keyword = filterXianyuCustomer.trim();
    records = records.filter((r) => r.xianyuCustomer.includes(keyword));
  }
  if (filterShipAddress) {
    const keyword = filterShipAddress.trim();
    records = records.filter((r) => r.shipAddress.includes(keyword));
  }
  if (filterShipDateFrom) records = records.filter((r) => r.shipDate >= filterShipDateFrom);
  if (filterShipDateTo) records = records.filter((r) => r.shipDate <= filterShipDateTo);
  if (filterReceiptDateFrom) records = records.filter((r) => r.receiptDate >= filterReceiptDateFrom);
  if (filterReceiptDateTo) records = records.filter((r) => r.receiptDate <= filterReceiptDateTo);
  if (filterReturnDateFrom) records = records.filter((r) => r.expectedReturnDate >= filterReturnDateFrom);
  if (filterReturnDateTo) records = records.filter((r) => r.expectedReturnDate <= filterReturnDateTo);
  if (filterArrivalDateFrom) records = records.filter((r) => r.estimatedArrivalDate >= filterArrivalDateFrom);
  if (filterArrivalDateTo) records = records.filter((r) => r.estimatedArrivalDate <= filterArrivalDateTo);
  records.sort((a, b) => {
    const dir = sortDirection === 'asc' ? 1 : -1;
    if (sortField === 'orderId') {
      const idA = parseInt(a.orderId, 10) || 0;
      const idB = parseInt(b.orderId, 10) || 0;
      if (idA !== idB) return (idA - idB) * dir;
      // 订单编号相同时按发货日期排序
      if (a.shipDate && b.shipDate) return a.shipDate.localeCompare(b.shipDate) * dir;
      if (a.shipDate) return -1;
      if (b.shipDate) return 1;
      return 0;
    } else {
      // 按发货日期排序
      if (a.shipDate && b.shipDate) {
        const dateCompare = a.shipDate.localeCompare(b.shipDate);
        if (dateCompare !== 0) return dateCompare * dir;
      } else if (a.shipDate) {
        return -1 * dir;
      } else if (b.shipDate) {
        return 1 * dir;
      }
      // 同一发货日期再按订单编号排序
      const idA = parseInt(a.orderId, 10) || 0;
      const idB = parseInt(b.orderId, 10) || 0;
      return (idA - idB) * dir;
    }
  });
  return records;
}

// ========== 地址变化自动计算 ==========

function onAddressChange(): void {
  const addressInput = document.getElementById('shipAddress') as HTMLInputElement | null;
  const provinceTag = document.getElementById('provinceTag');
  const transitHint = document.getElementById('transitHint');
  const autoCalcInfo = document.getElementById('autoCalcInfo');

  if (!addressInput || !provinceTag) return;

  const address = addressInput.value.trim();
  if (!address) {
    provinceTag.textContent = '未识别';
    provinceTag.className = 'absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-400';
    if (transitHint) transitHint.textContent = '根据地址自动计算物流天数';
    return;
  }

  const isGD = isGuangdongAddress(address);
  const days = getTransitDays(address);

  if (isGD) {
    provinceTag.textContent = '广东省内 · 1天';
    provinceTag.className = 'absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium px-2 py-0.5 rounded-full bg-[#409EFF]/10 text-[#409EFF]';
  } else {
    provinceTag.textContent = '省外 · 2天';
    provinceTag.className = 'absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600';
  }

  if (transitHint) transitHint.textContent = `当前识别：${isGD ? '广东省内，物流1天' : '省外，物流2天'}`;

  const receiptInput = document.getElementById('receiptDate') as HTMLInputElement | null;
  const shipDateInput = document.getElementById('shipDate') as HTMLInputElement | null;
  if (receiptInput && receiptInput.value && shipDateInput) {
    shipDateInput.value = addDays(receiptInput.value, -days);
  }

  const returnInput = document.getElementById('expectedReturnDate') as HTMLInputElement | null;
  const arrivalInput = document.getElementById('arrivalDate') as HTMLInputElement | null;
  if (returnInput && returnInput.value && arrivalInput) {
    arrivalInput.value = addDays(returnInput.value, days);
  }

  if (autoCalcInfo) {
    autoCalcInfo.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg><span>已根据${isGD ? '省内(1天)' : '省外(2天)'}自动计算发货日期和到仓时间</span>`;
    autoCalcInfo.className = 'text-xs text-[#409EFF] flex items-center gap-1';
  }
}

// ========== 事件绑定 ==========

function bindEvents(): void {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentTab = (btn as HTMLElement).dataset.tab as TabType;
      render();
    });
  });

  const shipForm = document.getElementById('shipForm');
  if (shipForm) shipForm.addEventListener('submit', handleShipSubmit);

  const addToBatchBtn = document.getElementById('addToBatchBtn');
  if (addToBatchBtn) addToBatchBtn.addEventListener('click', handleAddToBatch);

  const submitBatchBtn = document.getElementById('submitBatchBtn');
  if (submitBatchBtn) submitBatchBtn.addEventListener('click', handleSubmitBatch);

  const clearBatchBtn = document.getElementById('clearBatchBtn');
  if (clearBatchBtn) clearBatchBtn.addEventListener('click', handleClearBatch);

  document.querySelectorAll('.remove-pending-btn').forEach(btn => {
    btn.addEventListener('click', (e: Event) => {
      const id = Number((e.currentTarget as HTMLElement).dataset.id);
      handleRemovePending(id);
    });
  });

  const filterStatusEl = document.getElementById('filterStatus') as HTMLSelectElement | null;
  const filterModelEl = document.getElementById('filterModel') as HTMLSelectElement | null;
  const filterDeviceNumberEl = document.getElementById('filterDeviceNumber') as HTMLInputElement | null;
  const filterXianyuCustomerEl = document.getElementById('filterXianyuCustomer') as HTMLInputElement | null;
  const filterShipAddressEl = document.getElementById('filterShipAddress') as HTMLInputElement | null;
  const filterShipDateFromEl = document.getElementById('filterShipDateFrom') as HTMLInputElement | null;
  const filterShipDateToEl = document.getElementById('filterShipDateTo') as HTMLInputElement | null;
  const filterReturnDateFromEl = document.getElementById('filterReturnDateFrom') as HTMLInputElement | null;
  const filterReturnDateToEl = document.getElementById('filterReturnDateTo') as HTMLInputElement | null;
  const filterReceiptDateFromEl = document.getElementById('filterReceiptDateFrom') as HTMLInputElement | null;
  const filterReceiptDateToEl = document.getElementById('filterReceiptDateTo') as HTMLInputElement | null;
  const filterArrivalDateFromEl = document.getElementById('filterArrivalDateFrom') as HTMLInputElement | null;
  const filterArrivalDateToEl = document.getElementById('filterArrivalDateTo') as HTMLInputElement | null;

  if (filterStatusEl) filterStatusEl.addEventListener('change', () => { filterStatus = filterStatusEl.value; currentPage = 1; render(); });
  if (filterModelEl) filterModelEl.addEventListener('change', () => { filterModel = filterModelEl.value; currentPage = 1; render(); });
  const filterShopNameEl = document.getElementById('filterShopName') as HTMLSelectElement | null;
  if (filterShopNameEl) filterShopNameEl.addEventListener('change', () => { filterShopName = filterShopNameEl.value; currentPage = 1; render(); });
  if (filterDeviceNumberEl) {
    filterDeviceNumberEl.addEventListener('blur', () => { filterDeviceNumber = filterDeviceNumberEl.value; currentPage = 1; render(); });
    filterDeviceNumberEl.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') { filterDeviceNumber = filterDeviceNumberEl.value; currentPage = 1; render(); } });
  }
  if (filterXianyuCustomerEl) {
    filterXianyuCustomerEl.addEventListener('blur', () => { filterXianyuCustomer = filterXianyuCustomerEl.value; currentPage = 1; render(); });
    filterXianyuCustomerEl.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') { filterXianyuCustomer = filterXianyuCustomerEl.value; currentPage = 1; render(); } });
  }
  if (filterShipAddressEl) {
    filterShipAddressEl.addEventListener('blur', () => { filterShipAddress = filterShipAddressEl.value; currentPage = 1; render(); });
    filterShipAddressEl.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') { filterShipAddress = filterShipAddressEl.value; currentPage = 1; render(); } });
  }
  if (filterShipDateFromEl) filterShipDateFromEl.addEventListener('change', () => { filterShipDateFrom = filterShipDateFromEl.value; currentPage = 1; render(); });
  if (filterShipDateToEl) filterShipDateToEl.addEventListener('change', () => { filterShipDateTo = filterShipDateToEl.value; currentPage = 1; render(); });
  if (filterReceiptDateFromEl) filterReceiptDateFromEl.addEventListener('change', () => { filterReceiptDateFrom = filterReceiptDateFromEl.value; currentPage = 1; render(); });
  if (filterReceiptDateToEl) filterReceiptDateToEl.addEventListener('change', () => { filterReceiptDateTo = filterReceiptDateToEl.value; currentPage = 1; render(); });
  if (filterReturnDateFromEl) filterReturnDateFromEl.addEventListener('change', () => { filterReturnDateFrom = filterReturnDateFromEl.value; currentPage = 1; render(); });
  if (filterReturnDateToEl) filterReturnDateToEl.addEventListener('change', () => { filterReturnDateTo = filterReturnDateToEl.value; currentPage = 1; render(); });
  if (filterArrivalDateFromEl) filterArrivalDateFromEl.addEventListener('change', () => { filterArrivalDateFrom = filterArrivalDateFromEl.value; currentPage = 1; render(); });
  if (filterArrivalDateToEl) filterArrivalDateToEl.addEventListener('change', () => { filterArrivalDateTo = filterArrivalDateToEl.value; currentPage = 1; render(); });

  const clearDateFiltersBtn = document.getElementById('clearDateFilters');
  if (clearDateFiltersBtn) clearDateFiltersBtn.addEventListener('click', () => { filterShipDateFrom = ''; filterShipDateTo = ''; filterReceiptDateFrom = ''; filterReceiptDateTo = ''; filterReturnDateFrom = ''; filterReturnDateTo = ''; filterArrivalDateFrom = ''; filterArrivalDateTo = ''; currentPage = 1; render(); });

  const sortFieldEl = document.getElementById('sortFieldSelect') as HTMLSelectElement | null;
  if (sortFieldEl) sortFieldEl.addEventListener('change', () => { sortField = sortFieldEl.value as 'shipDate' | 'orderId'; currentPage = 1; render(); });

  const sortDirectionBtn = document.getElementById('sortDirectionBtn');
  if (sortDirectionBtn) sortDirectionBtn.addEventListener('click', () => { sortDirection = sortDirection === 'asc' ? 'desc' : 'asc'; currentPage = 1; render(); });

  const clearFiltersBtn = document.getElementById('clearFilters');
  if (clearFiltersBtn) clearFiltersBtn.addEventListener('click', () => { filterStatus = 'all'; filterModel = 'all'; filterShopName = 'all'; filterDeviceNumber = ''; filterXianyuCustomer = ''; filterShipAddress = ''; filterShipDateFrom = ''; filterShipDateTo = ''; filterReceiptDateFrom = ''; filterReceiptDateTo = ''; filterReturnDateFrom = ''; filterReturnDateTo = ''; filterArrivalDateFrom = ''; filterArrivalDateTo = ''; sortField = 'orderId'; sortDirection = 'asc'; currentPage = 1; render(); });

  // 分页事件
  const prevPageBtn = document.getElementById('prevPage');
  const nextPageBtn = document.getElementById('nextPage');
  const firstPageBtn = document.getElementById('firstPage');
  const lastPageBtn = document.getElementById('lastPage');
  if (firstPageBtn) firstPageBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage = 1; render(); } });
  if (prevPageBtn) prevPageBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage--; render(); } });
  if (nextPageBtn) nextPageBtn.addEventListener('click', () => { const records = getFilteredRecords(); const totalPages = Math.ceil(records.length / PAGE_SIZE); if (currentPage < totalPages) { currentPage++; render(); } });
  if (lastPageBtn) lastPageBtn.addEventListener('click', () => { const records = getFilteredRecords(); const totalPages = Math.ceil(records.length / PAGE_SIZE); if (currentPage < totalPages) { currentPage = totalPages; render(); } });
  document.querySelectorAll('.page-btn').forEach((btn) => {
    btn.addEventListener('click', () => { const page = parseInt((btn as HTMLElement).dataset.page || '1', 10); if (page !== currentPage) { currentPage = page; render(); } });
  });

  document.querySelectorAll('[data-action="return"], [data-action="delete"], [data-action="assign"], [data-action="edit"], [data-action="reassign"], [data-action="peer-ship"]').forEach((btn) => {
    btn.addEventListener('click', handleAction);
  });

  // 发货格式点击复制
  document.querySelectorAll('[data-action="copy-ship-format"]').forEach((el) => {
    el.addEventListener('click', () => {
      const format = (el as HTMLElement).dataset.format || '';
      if (format) {
        navigator.clipboard.writeText(format).then(() => {
          showToast('已复制发货格式: ' + format, 'success');
        }).catch(() => {
          // fallback
          const ta = document.createElement('textarea');
          ta.value = format;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          showToast('已复制发货格式: ' + format, 'success');
        });
      }
    });
  });

  // 手机号点击复制（事件委托）
  document.addEventListener('click', (e: Event) => {
    const target = (e.target as HTMLElement).closest('[data-action="copy-phone"]');
    if (!target) return;
    const phone = (target as HTMLElement).dataset.phone || '';
    if (phone) {
      navigator.clipboard.writeText(phone).then(() => {
        showToast('已复制手机号: ' + phone, 'success');
      }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = phone;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('已复制手机号: ' + phone, 'success');
      });
    }
  });

  // 复制闲鱼客户名
  document.addEventListener('click', (e: MouseEvent) => {
    const target = (e.target as HTMLElement).closest('[data-action="copy-customer"]');
    if (!target) return;
    const customer = (target as HTMLElement).dataset.customer || '';
    if (customer) {
      navigator.clipboard.writeText(customer).then(() => {
        showToast('已复制客户名: ' + customer, 'success');
      }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = customer;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('已复制客户名: ' + customer, 'success');
      });
    }
  });

  // 转寄匹配操作（事件委托）
  document.addEventListener('click', async (e: MouseEvent) => {
    const target = (e.target as HTMLElement).closest('[data-action]');
    if (!target) return;
    const action = (target as HTMLElement).dataset.action;
    
    if (action === 'confirm-transfer') {
      const fromId = (target as HTMLElement).dataset.fromId || '';
      const toId = (target as HTMLElement).dataset.toId || '';
      const matchType = ((target as HTMLElement).dataset.matchType || 'same_city') as 'same_city' | 'same_province';
      if (!fromId || !toId) return;
      const btn = target as HTMLElement;
      // 防重复提交：如果按钮已禁用则忽略
      if ((btn as HTMLButtonElement).disabled) return;
      // 找到源订单的所有设备编号
      const match = transferMatches.find(m => m.fromRecord.id === fromId && m.toRecord.id === toId);
      const selectedNumbers = match?.fromRecord.deviceNumbers || [];
      // 确认对话框
      const fromRec = match?.fromRecord;
      const toRec = match?.toRecord;
      const confirmed = confirm(`确认转寄？\n\n寄出方：${fromRec?.orderId || ''} ${fromRec?.xianyuCustomer || ''}\n收件方：${toRec?.orderId || ''} ${toRec?.xianyuCustomer || ''}\n设备：${selectedNumbers.join(', ')}\n\n转寄后寄出方将变为"已转寄"，收件方继承编号变为"已发出"`);
      if (!confirmed) return;
      btn.innerHTML = '<span class="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full"></span>';
      (btn as HTMLButtonElement).disabled = true;
      // 禁用同卡片所有按钮防止重复
      const card = btn.closest('.glass-card');
      card?.querySelectorAll('button').forEach(b => { (b as HTMLButtonElement).disabled = true; });
      try {
        const success = await confirmTransfer(fromId, toId, selectedNumbers, matchType);
        if (success) {
          showToast('转寄成功！设备已转给收件方', 'success');
          render();
        } else {
          showToast('转寄失败，请检查数据', 'error');
          btn.textContent = '确认转寄';
          (btn as HTMLButtonElement).disabled = false;
        }
      } catch (err) {
        showToast('转寄失败: ' + (err instanceof Error ? err.message : String(err)), 'error');
        btn.textContent = '确认转寄';
        (btn as HTMLButtonElement).disabled = false;
      }
    }
    
    if (action === 'transfer-subtab') {
      const tab = (target as HTMLElement).dataset.tab as 'match' | 'records';
      if (tab) {
        transferSubTab = tab;
        render();
      }
      return;
    }
    
    if (action === 'ignore-transfer') {
      const fromId = (target as HTMLElement).dataset.fromId || '';
      const toId = (target as HTMLElement).dataset.toId || '';
      if (fromId && toId) {
        const key = `${fromId}-${toId}`;
        ignoredTransferPairs.add(key);
        render();
      }
    }
    
    if (action === 'change-transfer-target') {
      const fromId = (target as HTMLElement).dataset.fromId || '';
      if (fromId) {
        transferSwapFromId = fromId;
        render();
      }
    }

    if (action === 'transfer-log-prev') {
      if (transferLogPage > 1) {
        transferLogPage--;
        render();
      }
    }

    if (action === 'transfer-log-next') {
      const totalPages = Math.ceil(transferLogs.length / TRANSFER_LOG_PAGE_SIZE);
      if (transferLogPage < totalPages) {
        transferLogPage++;
        render();
      }
    }
  });

  // 加仓/减仓按钮
  document.querySelectorAll('[data-action="add-device"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const model = (btn as HTMLElement).dataset.model || '';
      showAddDeviceModal(model);
    });
  });

  document.querySelectorAll('[data-action="remove-device"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const model = (btn as HTMLElement).dataset.model || '';
      await showRemoveDeviceModal(model);
    });
  });

  document.querySelectorAll('[data-device-model]').forEach((el) => {
    el.addEventListener('click', () => {
      const model = (el as HTMLElement).dataset.deviceModel as DeviceModel;
      const number = (el as HTMLElement).dataset.deviceNumber || '';
      showDeviceEditModal(model, number);
    });
  });

  const dashboardModelFilterEl = document.getElementById('dashboardModelFilter') as HTMLSelectElement | null;
  if (dashboardModelFilterEl) dashboardModelFilterEl.addEventListener('change', () => { dashboardModelFilter = dashboardModelFilterEl.value as DeviceModel | 'all'; dashboardPendingPage = 1; render(); });

  // 仪表盘待发货分页
  const dashPendingPrev = document.getElementById('dashPendingPrev');
  const dashPendingNext = document.getElementById('dashPendingNext');
  const dashPendingFirst = document.getElementById('dashPendingFirst');
  const dashPendingLast = document.getElementById('dashPendingLast');
  if (dashPendingFirst) dashPendingFirst.addEventListener('click', () => { if (dashboardPendingPage > 1) { dashboardPendingPage = 1; render(); } });
  if (dashPendingPrev) dashPendingPrev.addEventListener('click', () => { if (dashboardPendingPage > 1) { dashboardPendingPage--; render(); } });
  if (dashPendingNext) dashPendingNext.addEventListener('click', () => { const records = loadRecordsSync().filter((r) => r.status === '待发货'); const totalPages = Math.ceil(records.length / DASHBOARD_PAGE_SIZE); if (dashboardPendingPage < totalPages) { dashboardPendingPage++; render(); } });
  if (dashPendingLast) dashPendingLast.addEventListener('click', () => { const records = loadRecordsSync().filter((r) => r.status === '待发货'); const totalPages = Math.ceil(records.length / DASHBOARD_PAGE_SIZE); if (dashboardPendingPage < totalPages) { dashboardPendingPage = totalPages; render(); } });
  document.querySelectorAll('.dash-pending-page-btn').forEach((btn) => {
    btn.addEventListener('click', () => { const page = parseInt((btn as HTMLElement).dataset.page || '1', 10); if (page !== dashboardPendingPage) { dashboardPendingPage = page; render(); } });
  });

  // 逾期未还分页
  const overdueFirst = document.getElementById('overdueFirst');
  const overduePrev = document.getElementById('overduePrev');
  const overdueNext = document.getElementById('overdueNext');
  const overdueLast = document.getElementById('overdueLast');
  if (overdueFirst) overdueFirst.addEventListener('click', () => { if (overduePage > 1) { overduePage = 1; render(); } });
  if (overduePrev) overduePrev.addEventListener('click', () => { if (overduePage > 1) { overduePage--; render(); } });
  if (overdueNext) overdueNext.addEventListener('click', () => { const records = loadRecordsSync().filter((r) => r.status === '已发出' && r.expectedReturnDate < new Date().toISOString().split('T')[0]); const totalPages = Math.ceil(records.length / DASHBOARD_PAGE_SIZE); if (overduePage < totalPages) { overduePage++; render(); } });
  if (overdueLast) overdueLast.addEventListener('click', () => { const records = loadRecordsSync().filter((r) => r.status === '已发出' && r.expectedReturnDate < new Date().toISOString().split('T')[0]); const totalPages = Math.ceil(records.length / DASHBOARD_PAGE_SIZE); if (overduePage < totalPages) { overduePage = totalPages; render(); } });
  document.querySelectorAll('.overdue-page-btn').forEach((btn) => {
    btn.addEventListener('click', () => { const page = parseInt((btn as HTMLElement).dataset.page || '1', 10); if (page !== overduePage) { overduePage = page; render(); } });
  });

  const dashboardSearchKeyEl = document.getElementById('dashboardSearchKey') as HTMLInputElement | null;
  if (dashboardSearchKeyEl) {
    dashboardSearchKeyEl.addEventListener('blur', () => { dashboardSearchKey = dashboardSearchKeyEl.value; render(); });
    dashboardSearchKeyEl.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') { dashboardSearchKey = dashboardSearchKeyEl.value; render(); } });
  }

  const parseBtn = document.getElementById('parsePasteBtn');
  if (parseBtn) parseBtn.addEventListener('click', handleParsePaste);

  const addressInput = document.getElementById('shipAddress') as HTMLInputElement | null;
  if (addressInput) addressInput.addEventListener('input', onAddressChange);

  const receiptInput = document.getElementById('receiptDate') as HTMLInputElement | null;
  if (receiptInput) receiptInput.addEventListener('change', onAddressChange);

  const returnInput = document.getElementById('expectedReturnDate') as HTMLInputElement | null;
  if (returnInput) returnInput.addEventListener('change', onAddressChange);

  const bell = document.getElementById('reminderBell');
  if (bell) bell.addEventListener('click', () => { localStorage.removeItem('reminder_dismissed'); showReminderModal(); });

  // 安装App按钮
  const installBtn = document.getElementById('installAppBtn');
  if (installBtn) installBtn.addEventListener('click', () => {
    // 尝试触发原生安装提示
    const promptEvent = (window as any).__deferredInstallPrompt;
    if (promptEvent) {
      promptEvent.prompt();
      promptEvent.userChoice.then(() => { (window as any).__deferredInstallPrompt = null; });
    } else {
      // 显示手动引导
      const guideEvent = new CustomEvent('show-install-guide');
      window.dispatchEvent(guideEvent);
    }
  });

  // 一键到仓按钮
  const bulkReturnBtn = document.getElementById('bulkReturnBtn');
  if (bulkReturnBtn) bulkReturnBtn.addEventListener('click', handleBulkReturn);

  // 到仓记录 - 批次选择（事件委托）
  document.querySelectorAll('[data-action="select-batch"]').forEach((el) => {
    el.addEventListener('click', async () => {
      selectedBatchId = (el as HTMLElement).dataset.batchId || '';
      bulkReturnPage = 1;
      bulkReturnFilterNumber = '';
      if (selectedBatchId) {
        bulkReturnDetails = await loadBulkReturnDetails(selectedBatchId);
      }
      render();
    });
  });

  // 到仓记录 - 删除批次
  document.querySelectorAll('[data-action="delete-batch"]').forEach((el) => {
    el.addEventListener('click', async () => {
      const batchId = (el as HTMLElement).dataset.batchId || '';
      if (batchId && confirm('确认删除此批到仓记录？删除后不可恢复。')) {
        const ok = await deleteBulkReturnBatch(batchId);
        if (ok) {
          if (selectedBatchId === batchId) { selectedBatchId = ''; bulkReturnDetails = []; }
          bulkReturnBatches = await loadBulkReturnBatches();
          showToast('已删除到仓记录', 'success');
          render();
        } else {
          showToast('删除失败', 'error');
        }
      }
    });
  });

  // 到仓记录 - 编号筛选
  const bulkReturnFilterInput = document.getElementById('bulkReturnFilterInput') as HTMLInputElement | null;
  if (bulkReturnFilterInput) {
    bulkReturnFilterInput.addEventListener('blur', () => { bulkReturnFilterNumber = bulkReturnFilterInput.value; bulkReturnPage = 1; render(); });
    bulkReturnFilterInput.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') { bulkReturnFilterNumber = bulkReturnFilterInput.value; bulkReturnPage = 1; render(); } });
  }

  // 到仓记录分页
  const brFirst = document.getElementById('bulkReturnFirst');
  const brPrev = document.getElementById('bulkReturnPrev');
  const brNext = document.getElementById('bulkReturnNext');
  const brLast = document.getElementById('bulkReturnLast');
  if (brFirst) brFirst.addEventListener('click', () => { if (bulkReturnPage > 1) { bulkReturnPage = 1; render(); } });
  if (brPrev) brPrev.addEventListener('click', () => { if (bulkReturnPage > 1) { bulkReturnPage--; render(); } });
  if (brNext) brNext.addEventListener('click', () => { const filtered = bulkReturnFilterNumber ? bulkReturnDetails.filter(d => d.deviceNumber.includes(bulkReturnFilterNumber) || d.xianyuCustomer.includes(bulkReturnFilterNumber) || d.orderId.includes(bulkReturnFilterNumber)) : bulkReturnDetails; const tp = Math.ceil(filtered.length / PAGE_SIZE); if (bulkReturnPage < tp) { bulkReturnPage++; render(); } });
  if (brLast) brLast.addEventListener('click', () => { const filtered = bulkReturnFilterNumber ? bulkReturnDetails.filter(d => d.deviceNumber.includes(bulkReturnFilterNumber) || d.xianyuCustomer.includes(bulkReturnFilterNumber) || d.orderId.includes(bulkReturnFilterNumber)) : bulkReturnDetails; const tp = Math.ceil(filtered.length / PAGE_SIZE); if (bulkReturnPage < tp) { bulkReturnPage = tp; render(); } });
  document.querySelectorAll('.bulk-return-page-btn').forEach((btn) => {
    btn.addEventListener('click', () => { const page = parseInt((btn as HTMLElement).dataset.page || '1', 10); if (page !== bulkReturnPage) { bulkReturnPage = page; render(); } });
  });

  updateReminderBadge();
}

function handleParsePaste(): void {
  const pasteArea = document.getElementById('pasteArea') as HTMLTextAreaElement | null;
  if (!pasteArea) return;
  const text = pasteArea.value.trim();
  if (!text) { showToast('请先粘贴订单信息', 'warning'); return; }

  const parsed = parsePasteText(text);

  const addressInput = document.getElementById('shipAddress') as HTMLInputElement | null;
  const customerInput = document.getElementById('shipCustomer') as HTMLInputElement | null;
  const phoneInput = document.getElementById('shipPhone') as HTMLInputElement | null;
  const receiptInput = document.getElementById('receiptDate') as HTMLInputElement | null;
  const returnInput = document.getElementById('expectedReturnDate') as HTMLInputElement | null;

  if (addressInput && parsed.shipAddress) addressInput.value = parsed.shipAddress;
  if (customerInput && parsed.xianyuCustomer) customerInput.value = parsed.xianyuCustomer;
  if (phoneInput && parsed.phone) phoneInput.value = parsed.phone;
  if (receiptInput && parsed.receiptDate) receiptInput.value = parsed.receiptDate;
  if (returnInput && parsed.expectedReturnDate) returnInput.value = parsed.expectedReturnDate;

  onAddressChange();

  const filledFields: string[] = [];
  if (parsed.shipAddress) filledFields.push('地址');
  if (parsed.xianyuCustomer) filledFields.push('客户');
  if (parsed.phone) filledFields.push('手机号');
  if (parsed.receiptDate) filledFields.push('收货日期');
  if (parsed.expectedReturnDate) filledFields.push('寄出日期');

  if (filledFields.length === 0) {
    showToast('未能识别有效信息，请检查粘贴格式', 'warning');
    return;
  }

  // 检查数据完整性，尝试自动加入批量列表
  const shopName = (document.getElementById('shopName') as HTMLSelectElement).value;
  const model = (document.getElementById('shipModel') as HTMLSelectElement).value;
  const quantity = parseInt((document.getElementById('shipQuantity') as HTMLInputElement).value, 10);
  const customer = customerInput?.value.trim() || '';
  const phone = phoneInput?.value.trim() || '';
  const address = addressInput?.value.trim() || '';
  const addressOnly = addressInput?.dataset.addressOnly || '';
  const shipDate = (document.getElementById('shipDate') as HTMLInputElement).value;
  const receiptDate = receiptInput?.value || '';
  const returnDate = returnInput?.value || '';
  const arrivalDate = (document.getElementById('arrivalDate') as HTMLInputElement).value;

  const missingFields: string[] = [];
  if (!shopName) missingFields.push('店铺');
  if (!model) missingFields.push('设备型号');
  if (!quantity || quantity <= 0) missingFields.push('租赁数量');
  if (!customer) missingFields.push('闲鱼客户');
  if (!address) missingFields.push('发货地址');
  if (!shipDate) missingFields.push('预计发货日期');
  if (!receiptDate) missingFields.push('收货日期');
  if (!returnDate) missingFields.push('预计寄出日期');
  if (!arrivalDate) missingFields.push('预计到仓时间');

  if (missingFields.length === 0) {
    // 数据完整，自动加入批量列表
    pendingOrders.push({
      id: ++pendingOrderSeq,
      shopName,
      deviceModel: model as DeviceModel,
      quantity,
      xianyuCustomer: customer,
      phone,
      shipAddress: address,
      addressOnly,
      shipDate,
      receiptDate,
      expectedReturnDate: returnDate,
      estimatedArrivalDate: arrivalDate,
      notes: (document.getElementById('shipNotes') as HTMLInputElement)?.value.trim() || '',
    });

    // 清空粘贴区和表单
    pasteArea.value = '';
    const form = document.getElementById('shipForm') as HTMLFormElement | null;
    if (form) {
      // 重置除店铺和型号外的字段
      (document.getElementById('shipCustomer') as HTMLInputElement).value = '';
      (document.getElementById('shipPhone') as HTMLInputElement).value = '';
      (document.getElementById('shipAddress') as HTMLInputElement).value = '';
      delete (document.getElementById('shipAddress') as HTMLInputElement).dataset.addressOnly;
      (document.getElementById('shipDate') as HTMLInputElement).value = '';
      (document.getElementById('receiptDate') as HTMLInputElement).value = '';
      (document.getElementById('expectedReturnDate') as HTMLInputElement).value = '';
      (document.getElementById('arrivalDate') as HTMLInputElement).value = '';
      (document.getElementById('shipQuantity') as HTMLInputElement).value = '1';
    }
    const provinceTag = document.getElementById('provinceTag');
    if (provinceTag) { provinceTag.textContent = '未识别'; provinceTag.className = 'absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-400'; }
    const hint = document.getElementById('transitHint');
    if (hint) hint.textContent = '根据地址自动计算物流天数';

    render();
    showToast(`已识别并自动添加到批量列表（共 ${pendingOrders.length} 条）`, 'success');
  } else {
    // 数据不完整，提示缺少字段
    showToast(`已识别${filledFields.join('、')}，还缺少：${missingFields.join('、')}`, 'warning');
  }
}

function collectFormData(): { shopName: string; model: DeviceModel; quantity: number; customer: string; phone: string; address: string; addressOnly: string; shipDate: string; receiptDate: string; returnDate: string; arrivalDate: string; notes: string } | null {
  const shopName = (document.getElementById('shopName') as HTMLSelectElement).value;
  const model = (document.getElementById('shipModel') as HTMLSelectElement).value as DeviceModel;
  const quantity = parseInt((document.getElementById('shipQuantity') as HTMLInputElement).value, 10);
  const customer = (document.getElementById('shipCustomer') as HTMLInputElement).value.trim();
  const phone = (document.getElementById('shipPhone') as HTMLInputElement).value.trim();
  const address = (document.getElementById('shipAddress') as HTMLInputElement).value.trim();
  const addressOnly = (document.getElementById('shipAddress') as HTMLInputElement).dataset.addressOnly || '';
  const shipDate = (document.getElementById('shipDate') as HTMLInputElement).value;
  const receiptDate = (document.getElementById('receiptDate') as HTMLInputElement).value;
  const returnDate = (document.getElementById('expectedReturnDate') as HTMLInputElement).value;
  const arrivalDate = (document.getElementById('arrivalDate') as HTMLInputElement).value;
  const notes = (document.getElementById('shipNotes') as HTMLInputElement)?.value.trim() || '';

  if (!shopName) { showToast('请选择所属店铺', 'error'); return null; }
  if (!model) { showToast('请选择设备型号', 'error'); return null; }
  if (!quantity || quantity <= 0) { showToast('请输入有效的租赁数量', 'error'); return null; }
  if (!customer) { showToast('请输入闲鱼客户昵称', 'error'); return null; }
  if (!address) { showToast('请输入发货地址', 'error'); return null; }
  if (!shipDate) { showToast('请选择预计发货日期', 'error'); return null; }
  if (!receiptDate) { showToast('请选择收货日期', 'error'); return null; }
  if (!returnDate) { showToast('请选择预计寄出日期', 'error'); return null; }
  if (!arrivalDate) { showToast('请选择预计到仓时间', 'error'); return null; }
  if (phone && !/^1[3-9]\d{9}$/.test(phone)) { showToast('手机号格式不正确', 'error'); return null; }

  return { shopName, model, quantity, customer, phone, address, addressOnly, shipDate, receiptDate, returnDate, arrivalDate, notes };
}

function resetForm(): void {
  // 保存所属店铺选择（跨订单保持）
  const shopSelect = document.getElementById('shopName') as HTMLSelectElement | null;
  const savedShop = shopSelect?.value ?? '';
  const form = document.getElementById('shipForm') as HTMLFormElement | null;
  if (form) form.reset();
  // 恢复所属店铺
  if (shopSelect && savedShop) shopSelect.value = savedShop;
  const provinceTag = document.getElementById('provinceTag');
  if (provinceTag) { provinceTag.textContent = '未识别'; provinceTag.className = 'absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-400'; }
  const addressInput = document.getElementById('shipAddress') as HTMLInputElement | null;
  if (addressInput) delete addressInput.dataset.addressOnly;
  const hint = document.getElementById('transitHint');
  if (hint) hint.textContent = '根据地址自动计算物流天数';
}

function handleAddToBatch(): void {
  const data = collectFormData();
  if (!data) return;

  pendingOrders.push({
    id: ++pendingOrderSeq,
    shopName: data.shopName,
    deviceModel: data.model,
    quantity: data.quantity,
    xianyuCustomer: data.customer,
    phone: data.phone,
    shipAddress: data.address,
    addressOnly: data.addressOnly,
    shipDate: data.shipDate,
    receiptDate: data.receiptDate,
    expectedReturnDate: data.returnDate,
    estimatedArrivalDate: data.arrivalDate,
    notes: data.notes,
  });

  showToast(`已添加到批量列表（共 ${pendingOrders.length} 条）`, 'success');
  resetForm();
  render();
}

async function handleSubmitBatch(): Promise<void> {
  if (pendingOrders.length === 0) { showToast('批量列表为空', 'error'); return; }

  try {
    const records = pendingOrders.map(o => ({
      deviceModel: o.deviceModel as DeviceModel,
      quantity: o.quantity,
      deviceNumbers: [] as string[],
      xianyuCustomer: o.xianyuCustomer,
      phone: o.phone,
      shipAddress: o.shipAddress,
      addressOnly: o.addressOnly,
      shipDate: o.shipDate,
      receiptDate: o.receiptDate,
      expectedReturnDate: o.expectedReturnDate,
      estimatedArrivalDate: o.estimatedArrivalDate,
      shopName: o.shopName,
      notes: o.notes || '',
      peerShipping: false,
      peerShippingInfo: '',
    }));

    const results = await addRecordsBatch(records);
    const orderIds = results.map(r => r.orderId).join('、');
    showToast(`批量录入 ${results.length} 条订单成功！单号：${orderIds}`, 'success');
    pendingOrders = [];
    currentTab = 'records';
    render();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '批量录入失败';
    showToast(msg, 'error');
  }
}

function handleRemovePending(id: number): void {
  pendingOrders = pendingOrders.filter(o => o.id !== id);
  showToast('已从列表移除', 'success');
  render();
}

function handleClearBatch(): void {
  if (pendingOrders.length === 0) return;
  if (!confirm('确认清空所有待提交订单？')) return;
  pendingOrders = [];
  showToast('已清空批量列表', 'success');
  render();
}

async function handleShipSubmit(e: Event): Promise<void> {
  e.preventDefault();
  const data = collectFormData();
  if (!data) return;

  try {
    const newRecord = await addRecord({
      deviceModel: data.model, quantity: data.quantity, deviceNumbers: [],
      xianyuCustomer: data.customer, phone: data.phone, shipAddress: data.address, addressOnly: data.addressOnly,
      shipDate: data.shipDate, receiptDate: data.receiptDate, expectedReturnDate: data.returnDate, estimatedArrivalDate: data.arrivalDate,
      shopName: data.shopName,
      notes: data.notes || '',
      peerShipping: false,
      peerShippingInfo: '',
    });
    showToast(`订单已录入，单号：${newRecord.orderId}，请在设备记录中分配设备编号`, 'success');
    currentTab = 'records';
    render();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '订单录入失败';
    showToast(msg, 'error');
  }
}

async function handleBulkReturn(): Promise<void> {
  const inventory = calcInventory();
  const rentedCount = inventory.totalRented;
  if (rentedCount === 0) {
    showToast('当前没有外租设备', 'warning');
    return;
  }

  // 确认弹窗
  const modal = document.getElementById('reminderModal');
  if (modal) {
    modal.innerHTML = `
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/30 backdrop-blur-sm" id="bulkReturnOverlay"></div>
        <div class="relative backdrop-blur-2xl bg-white/92 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
          <div class="bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-4">
            <h3 class="text-white font-semibold text-lg flex items-center gap-2">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
              确认一键到仓
            </h3>
          </div>
          <div class="p-6 space-y-4">
            <div class="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div class="flex items-start gap-2">
                <svg class="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>
                <div class="text-sm text-amber-800">
                  <p class="font-medium">操作说明</p>
                  <ul class="mt-1 space-y-1 list-disc list-inside text-amber-700">
                    <li>将所有 <strong>${rentedCount}台</strong> 外租设备标记为已归还</li>
                    <li>操作前会自动记录当前外租设备快照</li>
                    <li>快照可在"到仓记录"中查看</li>
                    <li>此操作<strong>不可撤销</strong></li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
          <div class="sticky bottom-0 backdrop-blur-xl bg-white/90 border-t border-gray-100 px-6 py-4 flex justify-end gap-3">
            <button id="bulkReturnCancel" class="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">取消</button>
            <button id="bulkReturnConfirm" class="px-5 py-2 text-sm bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-medium rounded-xl hover:from-emerald-600 hover:to-emerald-700 transition-all shadow-[0_4px_12px_-2px_rgba(16,185,129,0.4)]">确认到仓</button>
          </div>
        </div>
      </div>
    `;
    modal.classList.remove('hidden');

    const overlay = document.getElementById('bulkReturnOverlay');
    const cancelBtn = document.getElementById('bulkReturnCancel');
    const confirmBtn = document.getElementById('bulkReturnConfirm');

    const close = () => { modal.classList.add('hidden'); modal.innerHTML = ''; };
    if (overlay) overlay.addEventListener('click', close);
    if (cancelBtn) cancelBtn.addEventListener('click', close);

    if (confirmBtn) {
      confirmBtn.addEventListener('click', async () => {
        confirmBtn.textContent = '处理中...';
        (confirmBtn as HTMLButtonElement).disabled = true;
        const result = await bulkReturnDevices();
        close();
        if (result.success) {
          showToast(`一键到仓成功！${result.count}台设备已归还，批次：${result.batchId}`, 'success');
          render();
        } else {
          showToast('一键到仓失败：' + (result.error || '未知错误'), 'error');
        }
      });
    }
  }
}

async function handleAction(e: Event): Promise<void> {
  const btn = (e.currentTarget as HTMLElement);
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  if (!action || !id) return;
  if (action === 'edit') {
    showRecordEditModal(id);
  } else if (action === 'assign') {
    await showAssignModal(id);
  } else if (action === 'reassign') {
    await showReassignModal(id);
  } else if (action === 'return') {
    if (confirm('确认该设备已归还广州仓库？')) { await returnRecord(id); showToast('设备已标记归还', 'success'); render(); }
  } else if (action === 'delete') {
    if (confirm('确认删除此条记录？删除后不可恢复。')) { await deleteRecord(id); showToast('记录已删除', 'warning'); render(); }
  } else if (action === 'peer-ship') {
    await showAssignModal(id);
  }
}
