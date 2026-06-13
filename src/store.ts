import type { RentalRecord, DeviceModel, DeviceInfo, InventoryStats, ModelStats, ReminderItem, ParsedPasteResult, DeviceCondition, BulkReturnBatch, BulkReturnLog, TransferMatch, TransferLog } from './types';

const REMINDER_DISMISS_KEY = 'reminder_dismissed';
const DEVICE_CONFIG_KEY = 'device_config';
const MIGRATION_DONE_KEY = 'db_migration_done';

/** 设备库存配置（动态，持久化到 localStorage） */
interface DeviceConfig {
  models: {
    model: DeviceModel;
    nextNumber: number;
    numberDigits: number;
  }[];
}

/** 默认进货均价（仅预设机型，自定义机型从 device_info 表动态获取） */
const DEFAULT_PRICES: Record<string, number> = { 'vivo X200U': 5500, '三星': 2650, '苹果': 6700, '混合': 0 };

/** 获取指定机型的进货均价（优先从设备表计算，兜底用默认值） */
export function getAvgPrice(model: string): number {
  const devices = loadDeviceInfoSync();
  const modelDevices = devices.filter(d => d.model === model && d.purchasePrice > 0);
  if (modelDevices.length > 0) {
    return Math.round(modelDevices.reduce((sum, d) => sum + d.purchasePrice, 0) / modelDevices.length);
  }
  return DEFAULT_PRICES[model] || 0;
}

// ========== 内存缓存 ==========
let cachedRecords: RentalRecord[] | null = null;
let cachedDevices: DeviceInfo[] | null = null;

/** 转换数据库记录为前端类型 */
function dbRecordToRental(r: Record<string, unknown>): RentalRecord {
  return {
    id: r.id as string,
    orderId: r.order_id as string,
    deviceModel: r.device_model as DeviceModel,
    quantity: r.quantity as number,
    deviceNumbers: (r.device_numbers as string[]) || [],
    xianyuCustomer: (r.xianyu_customer as string) || '',
    phone: (r.phone as string) || '',
    shipAddress: (r.ship_address as string) || '',
    addressOnly: (r.address_only as string) || '',
    shipDate: (r.ship_date as string) || '',
    receiptDate: (r.receipt_date as string) || '',
    expectedReturnDate: (r.expected_return_date as string) || '',
    estimatedArrivalDate: (r.estimated_arrival_date as string) || '',
    shopName: (r.shop_name as string) || '',
    status: r.status as RentalRecord['status'],
    returnDate: (r.return_date as string) || '',
    notes: (r.notes as string) || '',
    peerShipping: (r.peer_shipping as boolean) || false,
    peerShippingInfo: (r.peer_shipping_info as string) || '',
    isTransfer: (r.is_transfer as boolean) || false,
    transferredFromId: (r.transferred_from_id as string) || undefined,
    createdAt: r.created_at as string,
  };
}

/** 转换数据库设备为前端类型 */
function dbDeviceToInfo(d: Record<string, unknown>): DeviceInfo {
  return {
    id: d.id as string,
    model: d.model as DeviceModel,
    number: d.number as string,
    purchasePrice: parseFloat(String(d.purchase_price ?? '0')),
    condition: (d.condition as DeviceCondition) || '全新',
    notes: (d.notes as string) || '',
    purchaseDate: (d.purchase_date as string) || '',
    createdAt: d.created_at as string,
    updatedAt: (d.updated_at as string) || '',
  };
}

// ========== 数据加载（从数据库 API） ==========

/** 从数据库加载所有租赁记录 */
export async function loadRecords(): Promise<RentalRecord[]> {
  try {
    const res = await fetch('/api/records');
    const json = await res.json() as { success: boolean; data?: Record<string, unknown>[]; error?: string };
    if (!json.success || !json.data) throw new Error(json.error || '加载记录失败');
    cachedRecords = json.data.map(dbRecordToRental);
    return cachedRecords!;
  } catch (err) {
    console.error('加载记录失败，回退到 localStorage:', err);
    return loadRecordsFromLocal();
  }
}

/** 同步版本（兼容旧调用） */
export function loadRecordsSync(): RentalRecord[] {
  if (cachedRecords) return cachedRecords;
  return loadRecordsFromLocal();
}

/** 从 localStorage 读取（回退） */
function loadRecordsFromLocal(): RentalRecord[] {
  try {
    const raw = localStorage.getItem('rental_records');
    if (!raw) return [];
    const records = JSON.parse(raw) as RentalRecord[];
    for (const r of records) {
      if (!r.deviceNumbers) r.deviceNumbers = [];
    }
    return records;
  } catch {
    return [];
  }
}

/** 从数据库加载所有设备详情 */
export async function loadDeviceInfo(): Promise<DeviceInfo[]> {
  try {
    const res = await fetch('/api/devices');
    const json = await res.json() as { success: boolean; data?: Record<string, unknown>[]; error?: string };
    if (!json.success || !json.data) throw new Error(json.error || '加载设备失败');
    cachedDevices = json.data.map(dbDeviceToInfo);
    return cachedDevices!;
  } catch (err) {
    console.error('加载设备失败，回退到 localStorage:', err);
    return loadDeviceInfoFromLocal();
  }
}

/** 同步版本（兼容旧调用） */
export function loadDeviceInfoSync(): DeviceInfo[] {
  if (cachedDevices) return cachedDevices;
  return loadDeviceInfoFromLocal();
}

/** 从 localStorage 读取（回退） */
function loadDeviceInfoFromLocal(): DeviceInfo[] {
  try {
    const raw = localStorage.getItem('device_info');
    if (!raw) return [];
    return JSON.parse(raw) as DeviceInfo[];
  } catch {
    return [];
  }
}

/** 清除缓存，强制下次重新加载 */
export function invalidateCache(): void {
  cachedRecords = null;
  cachedDevices = null;
}

// ========== 设备编号查询 ==========

/** 获取某型号所有设备编号 */
export function getAllDeviceNumbers(model: DeviceModel): string[] {
  return loadDeviceInfoSync().filter((d) => d.model === model).map((d) => d.number).sort();
}

/** 获取某型号当前在仓（可用）的设备编号 */
export function getAvailableDeviceNumbers(model: DeviceModel): string[] {
  const allNumbers = getAllDeviceNumbers(model);
  const rentedNumbers = getRentedDeviceNumbers();
  return allNumbers.filter((n) => !rentedNumbers.has(n));
}

/** 获取所有机型当前在仓的设备编号 */
export function getAllAvailableDeviceNumbers(): { model: DeviceModel; numbers: string[] }[] {
  const rentedNumbers = getRentedDeviceNumbers();
  const deviceInfo = loadDeviceInfoSync();
  const modelSet = [...new Set(deviceInfo.map((d) => d.model))];
  return modelSet.map((model) => ({
    model,
    numbers: getAllDeviceNumbers(model).filter((n) => !rentedNumbers.has(n)),
  }));
}

/** 根据编号推断机型 */
export function getDeviceModelByNumber(num: string): DeviceModel | null {
  const n = parseInt(num, 10);
  if (n >= 1 && n <= 65) return 'vivo X200U';
  if (n >= 84 && n <= 100) return '三星';
  if (n >= 301 && n <= 304) return '苹果';
  // 查找设备表中是否有此编号的自定义机型
  const device = loadDeviceInfoSync().find(d => d.number === num);
  return device ? device.model : null;
}

/** 获取某型号当前外租中的设备编号集合（支持跨机型记录） */
export function getRentedDeviceNumbers(_model?: DeviceModel): Set<string> {
  const records = loadRecordsSync();
  const rented = new Set<string>();
  for (const r of records) {
    if (r.status === '已发出' && r.deviceNumbers.length > 0) {
      for (const num of r.deviceNumbers) {
        rented.add(num);
      }
    }
  }
  return rented;
}

/** 获取设备编号所在的租赁记录 */
export function getRecordByDeviceNumber(model: DeviceModel, deviceNumber: string): RentalRecord | undefined {
  const records = loadRecordsSync();
  return records.find((r) => r.deviceModel === model && r.status === '已发出' && r.deviceNumbers.includes(deviceNumber));
}

/** 获取设备总量（各型号） */
export function getDeviceTotals(): Record<string, number> {
  const devices = loadDeviceInfoSync();
  const totals: Record<string, number> = {};
  for (const d of devices) {
    totals[d.model] = (totals[d.model] || 0) + 1;
  }
  return totals;
}

// ========== 订单记录 CRUD ==========

/** 新增一条订单记录（状态为"待发货"，无需选择设备编号） */
export async function addRecord(record: Omit<RentalRecord, 'id' | 'orderId' | 'status' | 'returnDate' | 'createdAt'>): Promise<RentalRecord> {
  const orderId = await generateOrderId();
  const newRecord: RentalRecord = {
    ...record,
    id: '',
    orderId,
    status: '待发货',
    returnDate: '',
    notes: record.notes || '',
    peerShipping: false,
    peerShippingInfo: '',
    createdAt: new Date().toISOString(),
  };

  try {
    const res = await fetch('/api/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newRecord),
    });
    const json = await res.json() as { success: boolean; data?: Record<string, unknown>; error?: string };
    if (!json.success || !json.data) throw new Error(json.error || '新增失败');
    const saved = dbRecordToRental(json.data);
    // 清除缓存并重新加载，避免重复
    invalidateCache();
    await loadRecords();
    return saved;
  } catch (err) {
    console.error('新增记录到数据库失败，保存到本地:', err);
    newRecord.id = generateId();
    const records = loadRecordsSync();
    records.unshift(newRecord);
    localStorage.setItem('rental_records', JSON.stringify(records));
    if (cachedRecords) cachedRecords.unshift(newRecord);
    return newRecord;
  }
}

/** 批量新增租赁记录 */
export async function addRecordsBatch(recordList: Omit<RentalRecord, 'id' | 'orderId' | 'status' | 'returnDate' | 'createdAt'>[]): Promise<RentalRecord[]> {
  // 一次性获取最大order_id，然后在本地递增，避免竞态条件
  let nextId = 0;
  try {
    const res = await fetch('/api/records/max-order-id');
    const json = await res.json() as { success: boolean; maxOrderId?: number };
    if (json.success && typeof json.maxOrderId === 'number') {
      nextId = json.maxOrderId;
    }
  } catch (e) {
    console.error('获取最大订单编号失败，回退本地计算:', e);
    const cached = loadRecordsSync();
    for (const r of cached) {
      const num = parseInt(r.orderId, 10);
      if (!isNaN(num) && num > nextId) nextId = num;
    }
  }

  const recordsWithIds: RentalRecord[] = recordList.map((record) => {
    nextId++;
    return {
      ...record,
      id: '',
      orderId: String(nextId),
      status: '待发货',
      returnDate: '',
      notes: record.notes || '',
      createdAt: new Date().toISOString(),
    };
  });

  try {
    const res = await fetch('/api/records/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: recordsWithIds }),
    });
    const json = await res.json() as { success: boolean; data?: Record<string, unknown>[]; error?: string };
    if (!json.success || !json.data) throw new Error(json.error || '批量新增失败');
    const saved = json.data.map(dbRecordToRental);
    // 清除缓存并重新加载，避免重复
    invalidateCache();
    await loadRecords();
    return saved;
  } catch (err) {
    console.error('批量新增记录到数据库失败，保存到本地:', err);
    const localRecords = recordsWithIds.map((r) => ({ ...r, id: generateId() }));
    const existing = loadRecordsSync();
    existing.unshift(...localRecords);
    localStorage.setItem('rental_records', JSON.stringify(existing));
    if (cachedRecords) cachedRecords.unshift(...localRecords);
    return localRecords;
  }
}

/** 为订单分配设备编号，并将状态改为"已发出" */
export async function assignDeviceNumbers(id: string, deviceNumbers: string[]): Promise<boolean> {
  const records = loadRecordsSync();
  const target = records.find((r) => r.id === id);
  if (!target || target.status !== '待发货') return false;

  // 收集所有机型的在仓编号，支持跨机型分配
  const allAvailable = new Set<string>();
  const devices = loadDeviceInfoSync();
  const allModels = [...new Set(devices.map(d => d.model))];
  for (const m of allModels) {
    for (const num of getAvailableDeviceNumbers(m)) {
      allAvailable.add(num);
    }
  }
  for (const num of deviceNumbers) {
    if (!allAvailable.has(num)) {
      throw new Error(`设备编号 ${num} 已被占用或不存在`);
    }
  }

  // 根据分配的编号推断主机型和数量
  const modelCount: Record<string, number> = {};
  for (const num of deviceNumbers) {
    const m = getDeviceModelByNumber(num) || devices.find(d => d.number === num)?.model || 'vivo X200U';
    modelCount[m] = (modelCount[m] || 0) + 1;
  }
  const primaryModel = (Object.entries(modelCount).sort((a, b) => b[1] - a[1])[0]?.[0] || target.deviceModel) as DeviceModel;
  const isMixed = Object.keys(modelCount).length > 1;

  try {
    const res = await fetch(`/api/records/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceNumbers, quantity: deviceNumbers.length, status: '已发出', deviceModel: primaryModel }),
    });
    const json = await res.json() as { success: boolean; error?: string };
    if (!json.success) throw new Error(json.error || '更新失败');
  } catch (err) {
    console.error('更新数据库失败:', err);
  }

  // 更新缓存
  target.deviceNumbers = [...deviceNumbers];
  target.quantity = deviceNumbers.length;
  target.deviceModel = primaryModel;
  target.status = '已发出';
  if (cachedRecords) {
    const idx = cachedRecords.findIndex((r) => r.id === id);
    if (idx >= 0) cachedRecords[idx] = { ...target };
  }
  return true;
}

/** 标记同行代发 */
export async function assignPeerShipping(id: string, peerInfo: string): Promise<boolean> {
  const records = loadRecordsSync();
  const target = records.find(r => r.id === id);
  if (!target) return false;
  if (target.status !== '待发货') return false;

  try {
    const res = await fetch(`/api/records/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: '已发出', peerShipping: true, peerShippingInfo: peerInfo, quantity: target.quantity }),
    });
    const json = await res.json() as { success: boolean; error?: string };
    if (!json.success) throw new Error(json.error || '更新失败');
  } catch (err) {
    console.error('更新数据库失败:', err);
  }

  // 更新缓存
  target.status = '已发出';
  target.peerShipping = true;
  target.peerShippingInfo = peerInfo;
  if (cachedRecords) {
    const idx = cachedRecords.findIndex(r => r.id === id);
    if (idx >= 0) cachedRecords[idx] = { ...target };
  }
  return true;
}

/** 标记设备归还 */
export async function returnRecord(id: string): Promise<boolean> {
  const records = loadRecordsSync();
  const target = records.find((r) => r.id === id);
  if (!target || target.status === '已归还') return false;

  try {
    const res = await fetch(`/api/records/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: '已归还', returnDate: new Date().toISOString().split('T')[0] }),
    });
    const json = await res.json() as { success: boolean; error?: string };
    if (!json.success) throw new Error(json.error || '归还失败');
  } catch (err) {
    console.error('归还数据库更新失败:', err);
  }

  target.status = '已归还';
  target.returnDate = new Date().toISOString().split('T')[0];
  if (cachedRecords) {
    const idx = cachedRecords.findIndex((r) => r.id === id);
    if (idx >= 0) cachedRecords[idx] = { ...target };
  }
  return true;
}

/** 删除一条记录 */
export async function deleteRecord(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/records/${id}`, { method: 'DELETE' });
    const json = await res.json() as { success: boolean; error?: string };
    if (!json.success) throw new Error(json.error || '删除失败');
  } catch (err) {
    console.error('删除数据库记录失败:', err);
  }

  if (cachedRecords) {
    cachedRecords = cachedRecords.filter((r) => r.id !== id);
  }
  return true;
}

/** 更新租赁记录 */
export async function updateRecord(id: string, updates: Partial<Omit<RentalRecord, 'id' | 'createdAt'>>): Promise<boolean> {
  try {
    const res = await fetch(`/api/records/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const json = await res.json() as { success: boolean; error?: string };
    if (!json.success) throw new Error(json.error || '更新失败');
  } catch (err) {
    console.error('更新数据库记录失败:', err);
  }

  // 更新本地缓存
  if (cachedRecords) {
    const idx = cachedRecords.findIndex((r) => r.id === id);
    if (idx !== -1) {
      cachedRecords[idx] = { ...cachedRecords[idx], ...updates };
    }
  }
  return true;
}

// ========== 设备详情 CRUD ==========

/** 获取单台设备详情 */
export function getDeviceInfo(model: DeviceModel, number: string): DeviceInfo | undefined {
  return loadDeviceInfoSync().find((d) => d.model === model && d.number === number);
}

/** 新增或更新设备详情 */
export async function upsertDeviceInfo(data: Omit<DeviceInfo, 'id' | 'createdAt' | 'updatedAt'>): Promise<DeviceInfo> {
  const devices = loadDeviceInfoSync();
  const existing = devices.find((d) => d.model === data.model && d.number === data.number);

  if (existing) {
    try {
      const res = await fetch(`/api/devices/${existing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchasePrice: String(data.purchasePrice),
          condition: data.condition,
          notes: data.notes,
          purchaseDate: data.purchaseDate,
        }),
      });
      const json = await res.json() as { success: boolean; data?: Record<string, unknown>; error?: string };
      if (!json.success) throw new Error(json.error || '更新失败');
      const updated = dbDeviceToInfo(json.data || { ...existing, ...data, updated_at: new Date().toISOString() });
      if (cachedDevices) {
        const idx = cachedDevices.findIndex((d) => d.id === existing.id);
        if (idx >= 0) cachedDevices[idx] = updated;
      }
      return updated;
    } catch (err) {
      console.error('更新设备详情失败:', err);
      const now = new Date().toISOString();
      const updated = { ...existing, ...data, updatedAt: now };
      if (cachedDevices) {
        const idx = cachedDevices.findIndex((d) => d.id === existing.id);
        if (idx >= 0) cachedDevices[idx] = updated;
      }
      return updated;
    }
  }

  // 新增
  try {
    const res = await fetch('/api/devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: data.model,
        number: data.number,
        purchasePrice: String(data.purchasePrice),
        condition: data.condition,
        notes: data.notes,
        purchaseDate: data.purchaseDate,
      }),
    });
    const json = await res.json() as { success: boolean; data?: Record<string, unknown>; error?: string };
    if (!json.success) throw new Error(json.error || '新增失败');
    const saved = dbDeviceToInfo(json.data!);
    if (cachedDevices) cachedDevices.push(saved);
    return saved;
  } catch (err) {
    console.error('新增设备详情失败:', err);
    const now = new Date().toISOString();
    const newDevice: DeviceInfo = { ...data, id: generateId(), createdAt: now, updatedAt: now };
    if (cachedDevices) cachedDevices.push(newDevice);
    return newDevice;
  }
}

/** 删除设备详情 */
export async function deleteDeviceInfo(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/devices/${id}`, { method: 'DELETE' });
    const json = await res.json() as { success: boolean; error?: string };
    if (!json.success) throw new Error(json.error || '删除失败');
  } catch (err) {
    console.error('删除设备详情失败:', err);
  }
  if (cachedDevices) {
    cachedDevices = cachedDevices.filter((d) => d.id !== id);
  }
  return true;
}

// ========== 设备库存加仓/减仓 ==========

/** 加仓：为指定型号添加设备 */
export async function addDevicesToInventory(model: DeviceModel, count: number, startNumber?: number, price?: number, condition?: DeviceCondition, notes?: string): Promise<string[]> {
  const config = loadDeviceConfig();
  let modelConfig = config.models.find((m) => m.model === model);
  // 自定义机型自动创建配置
  if (!modelConfig) {
    modelConfig = { model, nextNumber: 1, numberDigits: 3 };
    config.models.push(modelConfig);
    saveDeviceConfig(config);
  }

  // 如果指定了起始编号，则从该编号开始
  const startNum = startNumber ?? modelConfig.nextNumber;

  const unitPrice = String(price ?? DEFAULT_PRICES[model] ?? 0);
  const unitCondition = condition ?? '全新';
  const now = new Date().toISOString().split('T')[0];
  const newNumbers: string[] = [];
  const deviceRows: Array<{ model: string; number: string; purchasePrice: string; condition: string; notes: string; purchaseDate: string }> = [];

  for (let i = 0; i < count; i++) {
    const num = startNum + i;
    const number = String(num).padStart(modelConfig.numberDigits, '0');
    newNumbers.push(number);
    deviceRows.push({
      model,
      number,
      purchasePrice: unitPrice,
      condition: unitCondition,
      notes: notes ?? '',
      purchaseDate: now,
    });
  }
  // 更新 nextNumber 为已使用的最大编号+1
  modelConfig.nextNumber = startNum + count;

  try {
    const res = await fetch('/api/devices/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ devices: deviceRows }),
    });
    const json = await res.json() as { success: boolean; data?: Record<string, unknown>[]; error?: string };
    if (!json.success) throw new Error(json.error || '加仓失败');
    if (cachedDevices && json.data) {
      for (const d of json.data) {
        cachedDevices.push(dbDeviceToInfo(d));
      }
    }
  } catch (err) {
    console.error('加仓数据库操作失败，保存到本地:', err);
    const timestamp = new Date().toISOString();
    if (cachedDevices) {
      for (const row of deviceRows) {
        cachedDevices.push({
          id: generateId(),
          model: row.model as DeviceModel,
          number: row.number,
          purchasePrice: parseFloat(row.purchasePrice),
          condition: row.condition as DeviceCondition,
          notes: row.notes,
          purchaseDate: row.purchaseDate,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
    }
  }

  saveDeviceConfig(config);
  return newNumbers;
}

/** 减仓：从指定型号移除设备 */
export async function removeDevicesFromInventory(model: DeviceModel, numbers: string[]): Promise<{ success: string[]; failed: { number: string; reason: string }[] }> {
  const rentedSet = getRentedDeviceNumbers(model);
  const pendingRecords = loadRecordsSync().filter((r) => r.deviceModel === model && r.status === '待发货');
  const pendingQty = pendingRecords.reduce((s, r) => s + r.quantity, 0);
  const availableCount = getAllDeviceNumbers(model).length - rentedSet.size;

  const successList: string[] = [];
  const failedList: { number: string; reason: string }[] = [];

  const toRemoveAvailable = numbers.filter((n) => !rentedSet.has(n)).length;
  if (availableCount - toRemoveAvailable < pendingQty) {
    const maxRemovable = availableCount - pendingQty;
    if (maxRemovable <= 0) {
      return { success: [], failed: numbers.map((n) => ({ number: n, reason: rentedSet.has(n) ? '设备外租中' : '移除后可用数量不足满足待发货订单' })) };
    }
  }

  for (const number of numbers) {
    if (rentedSet.has(number)) {
      failedList.push({ number, reason: '设备外租中，无法移除' });
      continue;
    }
    successList.push(number);
  }

  if (successList.length > 0) {
    try {
      const res = await fetch('/api/devices/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, numbers: successList }),
      });
      const json = await res.json() as { success: boolean; error?: string };
      if (!json.success) throw new Error(json.error || '减仓失败');
    } catch (err) {
      console.error('减仓数据库操作失败:', err);
    }
    if (cachedDevices) {
      const removeSet = new Set(successList.map((n) => `${model}:${n}`));
      cachedDevices = cachedDevices.filter((d) => !removeSet.has(`${d.model}:${d.number}`));
    }
    // 同步更新 localStorage，防止缓存失效后回退显示已移除设备
    try {
      const raw = localStorage.getItem('device_info');
      if (raw) {
        const localDevices = JSON.parse(raw) as DeviceInfo[];
        const removeSet = new Set(successList.map((n) => `${model}:${n}`));
        const filtered = localDevices.filter((d) => !removeSet.has(`${d.model}:${d.number}`));
        localStorage.setItem('device_info', JSON.stringify(filtered));
      }
    } catch { /* ignore */ }
  }

  return { success: successList, failed: failedList };
}

/** 批量初始化设备详情（首次使用时） */
export async function initAllDeviceInfo(): Promise<void> {
  // 先尝试从数据库加载已有设备
  try {
    const res = await fetch('/api/devices');
    const json = await res.json() as { success: boolean; data?: Record<string, unknown>[]; error?: string };
    if (json.success && json.data && json.data.length > 0) {
      cachedDevices = json.data.map(dbDeviceToInfo);
      return; // 数据库已有设备，无需初始化
    }
  } catch {
    // API 不可用，继续检查本地缓存
  }

  const existing = loadDeviceInfoSync();
  if (existing.length > 0) return;

  const defaultDevices: Array<{ model: string; number: string; purchasePrice: string; condition: string; notes: string; purchaseDate: string }> = [];
  const ranges: Record<DeviceModel, { start: number; end: number }> = {
    'vivo X200U': { start: 1, end: 65 },
    '三星': { start: 84, end: 100 },
    '苹果': { start: 301, end: 304 },
    '混合': { start: 0, end: 0 },
  };

  for (const model of Object.keys(ranges) as DeviceModel[]) {
    const range = ranges[model];
    for (let i = range.start; i <= range.end; i++) {
      defaultDevices.push({
        model,
        number: String(i).padStart(3, '0'),
        purchasePrice: String(DEFAULT_PRICES[model]),
        condition: '全新',
        notes: '',
        purchaseDate: '',
      });
    }
  }

  try {
    const res = await fetch('/api/devices/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ devices: defaultDevices }),
    });
    const json = await res.json() as { success: boolean; data?: Record<string, unknown>[]; error?: string };
    if (json.success && json.data) {
      cachedDevices = json.data.map(dbDeviceToInfo);
    }
  } catch (err) {
    console.error('初始化设备失败，保存到本地:', err);
    const now = new Date().toISOString();
    cachedDevices = defaultDevices.map(d => ({
      id: generateId(),
      model: d.model as DeviceModel,
      number: d.number,
      purchasePrice: parseFloat(d.purchasePrice),
      condition: d.condition as DeviceCondition,
      notes: d.notes,
      purchaseDate: d.purchaseDate,
      createdAt: now,
      updatedAt: now,
    }));
  }
}

/** 获取某型号所有设备详情 */
export function getDeviceInfoByModel(model: DeviceModel): DeviceInfo[] {
  return loadDeviceInfoSync().filter((d) => d.model === model);
}

/** 计算某型号设备总资产价值 */
export function calcModelAssetValue(model: DeviceModel): number {
  return loadDeviceInfoSync().filter((d) => d.model === model).reduce((sum, d) => sum + d.purchasePrice, 0);
}

/** 生成闲鱼风格订单编号 */
async function generateOrderId(): Promise<string> {
  // 从数据库获取当前最大order_id，保证唯一递增
  try {
    const res = await fetch('/api/records/max-order-id');
    const json = await res.json() as { success: boolean; maxOrderId?: number; error?: string };
    if (json.success && typeof json.maxOrderId === 'number') {
      return String(json.maxOrderId + 1);
    }
  } catch (e) {
    console.error('获取最大订单编号失败，回退本地计算:', e);
  }
  // 降级：从缓存计算
  const records = loadRecordsSync();
  let maxNum = 0;
  for (const r of records) {
    const num = parseInt(r.orderId, 10);
    if (!isNaN(num) && num > maxNum) maxNum = num;
  }
  return String(maxNum + 1);
}

/** 计算库存统计 */
export function calcInventory(): InventoryStats {
  const records = loadRecordsSync();
  const totals = getDeviceTotals();
  // 动态统计所有机型（含自定义）
  const rentedMap: Record<string, number> = {};
  const pendingMap: Record<string, number> = {};
  for (const r of records) {
    const model = r.deviceModel;
    if (r.status === '已发出' && r.deviceNumbers.length > 0) {
      rentedMap[model] = (rentedMap[model] || 0) + (r.deviceNumbers.length || r.quantity);
    } else if (r.status === '待发货') {
      pendingMap[model] = (pendingMap[model] || 0) + r.quantity;
    }
  }

  // 构建 models 动态统计
  const models: Record<string, ModelStats> = {};
  const allModels = new Set([...Object.keys(totals), ...Object.keys(rentedMap), ...Object.keys(pendingMap)]);
  for (const m of allModels) {
    const t = totals[m] || 0;
    const r = rentedMap[m] || 0;
    const p = pendingMap[m] || 0;
    models[m] = { total: t, available: t - r, rented: r, pending: p };
  }

  return {
    totalDevices: Object.values(totals).reduce((s, v) => s + v, 0),
    totalAvailable: Object.values(totals).reduce((s, v) => s + v, 0) - Object.values(rentedMap).reduce((s, v) => s + v, 0),
    totalRented: Object.values(rentedMap).reduce((s, v) => s + v, 0),
    totalPending: Object.values(pendingMap).reduce((s, v) => s + v, 0),
    models,
    // 兼容旧字段
    vivoTotal: models['vivo X200U']?.total || 0,
    vivoAvailable: models['vivo X200U']?.available || 0,
    vivoRented: models['vivo X200U']?.rented || 0,
    vivoPending: models['vivo X200U']?.pending || 0,
    samsungTotal: models['三星']?.total || 0,
    samsungAvailable: models['三星']?.available || 0,
    samsungRented: models['三星']?.rented || 0,
    samsungPending: models['三星']?.pending || 0,
    appleTotal: models['苹果']?.total || 0,
    appleAvailable: models['苹果']?.available || 0,
    appleRented: models['苹果']?.rented || 0,
    applePending: models['苹果']?.pending || 0,
  };
}

/** 获取今日需提醒的项目 */
export function getReminders(): ReminderItem[] {
  const records = loadRecordsSync();
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const reminders: ReminderItem[] = [];

  for (const r of records) {
    if (r.status === '待发货' || r.status === '已发出') {
      if (r.shipDate === today) {
        reminders.push({ type: 'ship', record: r, daysOffset: 0 });
      } else if (r.shipDate === tomorrow) {
        reminders.push({ type: 'ship', record: r, daysOffset: 1 });
      }
    }
    if (r.status === '已发出') {
      if (r.estimatedArrivalDate === today) {
        reminders.push({ type: 'arrival', record: r, daysOffset: 0 });
      } else if (r.estimatedArrivalDate === tomorrow) {
        reminders.push({ type: 'arrival', record: r, daysOffset: 1 });
      }
    }
  }
  return reminders;
}

/** 获取今日需要发送短信的记录 */
export function getSmsPendingRecords(): RentalRecord[] {
  const records = loadRecordsSync();
  const today = new Date().toISOString().split('T')[0];
  return records.filter((r) => r.status === '已发出' && r.shipDate === today && r.phone);
}

/** 标记提醒已关闭 */
export function dismissReminders(): void {
  const today = new Date().toISOString().split('T')[0];
  localStorage.setItem(REMINDER_DISMISS_KEY, today);
}

/** 今日提醒是否已关闭 */
export function isReminderDismissed(): boolean {
  const today = new Date().toISOString().split('T')[0];
  return localStorage.getItem(REMINDER_DISMISS_KEY) === today;
}

// ========== 粘贴解析与地址识别 ==========

/** 判断地址是否广东省内 */
export function isGuangdongAddress(address: string): boolean {
  return /广东/.test(address);
}

/** 获取物流天数（省内1天，偏远省份3天，其他省外2天） */
export function getTransitDays(address: string): number {
  if (isGuangdongAddress(address)) return 1;
  // 吉林、黑龙江、辽宁、山东物流较慢，3天
  if (/吉林|黑龙江|辽宁|山东/.test(address)) return 3;
  return 2;
}

/** 提取地址中的省份 */
function extractProvince(address: string): string {
  const match = address.match(/(广东|广西|海南|福建|浙江|江苏|安徽|江西|湖南|湖北|河南|河北|山东|山西|陕西|四川|重庆|贵州|云南|辽宁|吉林|黑龙江|甘肃|青海|内蒙古|新疆|西藏|宁夏|北京|天津|上海)/);
  return match ? match[1] : '';
}

/** 提取地址中的城市 */
export function extractCity(address: string): string {
  // 先尝试匹配 "XX市"
  const cityMatch = address.match(/([\u4e00-\u9fa5]{2,4}(?:市|自治州))/);
  if (cityMatch) return cityMatch[1];
  // 再尝试匹配省份后面的2-4个字
  const prov = extractProvince(address);
  if (prov) {
    const afterProv = address.slice(address.indexOf(prov) + prov.length);
    const cityMatch2 = afterProv.match(/^([\u4e00-\u9fa5]{2,4})/);
    if (cityMatch2) return cityMatch2[1];
  }
  return '';
}

/** 计算两个地址之间的物流天数 */
export function getTransitDaysBetween(fromAddress: string, toAddress: string): number {
  const fromProv = extractProvince(fromAddress);
  const toProv = extractProvince(toAddress);
  const fromCity = extractCity(fromAddress);
  const toCity = extractCity(toAddress);

  // 同城
  if (fromCity && toCity && fromCity === toCity) return 1;
  // 同省不同城
  if (fromProv && toProv && fromProv === toProv) return 1;
  // 跨省：按目的地偏远程度计算
  return getTransitDays(toAddress);
}

/** 日期加减天数 */
export function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

/** 判断日期A是否 <= 日期B */
function isDateBeforeOrEqual(a: string, b: string): boolean {
  return a <= b;
}

/** 解析短格式日期 */
export function parseShortDate(dateStr: string): string {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const parts = dateStr.trim().split('.');
  if (parts.length < 2) return '';
  const month = parseInt(parts[0], 10);
  const day = parseInt(parts[1], 10);
  if (isNaN(month) || isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) return '';
  let year = currentYear;
  if (month < currentMonth - 6) {
    year = currentYear + 1;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * 智能解析粘贴文本
 */
export function parsePasteText(text: string): ParsedPasteResult {
  const result: ParsedPasteResult = {
    shipAddress: '',
    addressOnly: '',
    receiptDate: '',
    expectedReturnDate: '',
    xianyuCustomer: '',
    phone: '',
    contactName: '',
  };

  if (!text.trim()) return result;

  const phoneMatch = text.match(/1[3-9]\d{9}/);
  if (phoneMatch) {
    result.phone = phoneMatch[0];
  }

  const nameMatch = text.match(/([\u4e00-\u9fa5]{1,4})\s*1[3-9]\d{9}/);
  if (nameMatch) {
    result.contactName = nameMatch[1];
  }

  const bracketMatch = text.match(/[（(](\d{1,2}\.\d{1,2})\s*[-—]\s*(\d{1,2}\.\d{1,2})\s+(.+?)[）)]/);
  if (bracketMatch) {
    result.receiptDate = parseShortDate(bracketMatch[1]);
    result.expectedReturnDate = parseShortDate(bracketMatch[2]);
    // 提取整个括号内容（日期+客户名），方便复制添加好友备注
    const fullBracketContent = `${bracketMatch[1]}-${bracketMatch[2]} ${bracketMatch[3].trim()}`;
    result.xianyuCustomer = fullBracketContent;
  }

  result.shipAddress = text.trim();

  const lines = text.split(/\n/);
  for (const line of lines) {
    const bracketIndex = line.search(/[（(]/);
    if (bracketIndex > 0) {
      let addressPart = line.substring(0, bracketIndex).trim();
      addressPart = addressPart.replace(/^[\u4e00-\u9fa5]{0,4}\s*1[3-9]\d{9}\s*/, '').trim();
      result.addressOnly = addressPart;
      break;
    }
  }

  if (!result.addressOnly && !bracketMatch) {
    const addressLine = lines.find((l) => /省|市|区|县|路|街|号|栋|层/.test(l));
    if (addressLine) {
      result.addressOnly = addressLine.replace(/1[3-9]\d{9}/, '').replace(/^[\u4e00-\u9fa5]{0,4}\s*/, '').trim();
    }
  }

  return result;
}

// ========== 设备配置 ==========

function loadDeviceConfig(): DeviceConfig {
  try {
    const raw = localStorage.getItem(DEVICE_CONFIG_KEY);
    if (raw) return JSON.parse(raw) as DeviceConfig;
  } catch { /* fallback */ }
  return {
    models: [
      { model: 'vivo X200U' as DeviceModel, nextNumber: 66, numberDigits: 3 },
      { model: '三星' as DeviceModel, nextNumber: 101, numberDigits: 3 },
      { model: '苹果' as DeviceModel, nextNumber: 305, numberDigits: 3 },
    ],
  };
}

function saveDeviceConfig(config: DeviceConfig): void {
  localStorage.setItem(DEVICE_CONFIG_KEY, JSON.stringify(config));
}

// ========== 数据迁移 ==========

/** 检查并执行 localStorage → 数据库迁移 */
export async function migrateIfNeeded(): Promise<boolean> {
  const done = localStorage.getItem(MIGRATION_DONE_KEY);
  if (done) return false;

  const localRecords = loadRecordsFromLocal();
  const localDevices = loadDeviceInfoFromLocal();

  if (localRecords.length === 0 && localDevices.length === 0) {
    localStorage.setItem(MIGRATION_DONE_KEY, '1');
    return false;
  }

  try {
    const res = await fetch('/api/migrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: localRecords, devices: localDevices }),
    });
    const json = await res.json() as { success: boolean; migratedRecords?: number; migratedDevices?: number; error?: string };
    if (json.success) {
      localStorage.setItem(MIGRATION_DONE_KEY, '1');
      console.log(`迁移完成: ${json.migratedRecords ?? 0} 条记录, ${json.migratedDevices ?? 0} 台设备`);
      return true;
    }
    console.error('迁移失败:', json.error);
  } catch (err) {
    console.error('迁移请求失败:', err);
  }
  return false;
}

/** 生成唯一 ID */
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

// ========== 一键到仓 ==========

/** 执行一键到仓 */
export async function bulkReturnDevices(): Promise<{ success: boolean; batchId?: string; count?: number; error?: string }> {
  try {
    const res = await fetch('/api/bulk-return', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    const json = await res.json() as { success: boolean; batchId?: string; count?: number; message?: string; error?: string };
    if (!json.success) return { success: false, error: json.error || '一键到仓失败' };
    // 清除缓存，让下次 render 重新加载
    cachedRecords = null;
    return { success: true, batchId: json.batchId, count: json.count ?? 0 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '一键到仓失败';
    return { success: false, error: msg };
  }
}

/** 获取到仓历史批次列表 */
export async function loadBulkReturnBatches(): Promise<BulkReturnBatch[]> {
  try {
    const res = await fetch('/api/bulk-return/batches');
    const json = await res.json() as { success: boolean; data?: Array<{ batchId: string; operatedAt: string; count: number }>; error?: string };
    if (!json.success || !json.data) return [];
    return json.data.map(b => ({
      batchId: b.batchId,
      operatedAt: b.operatedAt,
      count: b.count,
    }));
  } catch {
    return [];
  }
}

/** 获取某个批次的到仓记录详情 */
export async function loadBulkReturnDetails(batchId: string): Promise<BulkReturnLog[]> {
  try {
    const res = await fetch(`/api/bulk-return/batches/${encodeURIComponent(batchId)}`);
    const json = await res.json() as { success: boolean; data?: Record<string, unknown>[]; error?: string };
    if (!json.success || !json.data) return [];
    return json.data.map(r => ({
      id: r.id as string,
      batchId: r.batch_id as string,
      operatedAt: r.operated_at as string,
      recordId: r.record_id as string,
      orderId: r.order_id as string,
      deviceModel: r.device_model as DeviceModel,
      deviceNumber: r.device_number as string,
      xianyuCustomer: (r.xianyu_customer as string) || '',
      phone: (r.phone as string) || '',
      shipAddress: (r.ship_address as string) || '',
      shipDate: (r.ship_date as string) || '',
      receiptDate: (r.receipt_date as string) || '',
      expectedReturnDate: (r.expected_return_date as string) || '',
      estimatedArrivalDate: (r.estimated_arrival_date as string) || '',
      notes: (r.notes as string) || '',
    }));
  } catch {
    return [];
  }
}

/** 删除某个批次的到仓记录 */
export async function deleteBulkReturnBatch(batchId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/bulk-return/batches/${encodeURIComponent(batchId)}`, { method: 'DELETE' });
    const json = await res.json() as { success: boolean };
    return json.success;
  } catch {
    return false;
  }
}

/**
 * 查找可转寄的订单匹配
 * 条件：
 * - A: 已发出 + 有设备编号 + 有预计寄出日期 + 有收货地址
 * - B: 待发货 + 设备型号匹配 + 有预计收货日期 + 有收货地址
 * - 仅匹配同城和同省（跨省不考虑）
 * - 每个已发出订单最多匹配4个待发货
 * - 优先同城，其次同省，按时间紧凑度排序
 */
export function findTransferMatches(): TransferMatch[] {
  const records = loadRecordsSync();
  const matches: TransferMatch[] = [];

  // 筛选A：已发出、有编号、有预计寄出日期、有收货地址
  const sentRecords = records.filter(r =>
    r.status === '已发出' &&
    r.deviceNumbers.length > 0 &&
    !r.peerShipping &&
    r.expectedReturnDate &&
    r.shipAddress
  );

  // 筛选B：待发货、有预计收货日期、有收货地址
  const pendingRecords = records.filter(r =>
    r.status === '待发货' &&
    r.receiptDate &&
    r.shipAddress
  );

  for (const a of sentRecords) {
    const aProv = extractProvince(a.shipAddress);
    const aCity = extractCity(a.shipAddress);
    const aMatches: TransferMatch[] = [];

    for (const b of pendingRecords) {
      // 设备型号必须匹配（或B未指定型号）
      if (b.deviceModel !== a.deviceModel && b.deviceModel !== '混合') continue;

      const bProv = extractProvince(b.shipAddress);
      const bCity = extractCity(b.shipAddress);

      // 判断同城/同省
      const isSameCity = aCity && bCity && aCity === bCity;
      const isSameProvince = aProv && bProv && aProv === bProv;

      // 跨省不考虑
      if (!isSameCity && !isSameProvince) continue;

      // 计算A的收货地→B的收货地物流天数
      const transitDays = getTransitDaysBetween(a.shipAddress, b.shipAddress);

      // A寄出日期 + 物流天数 ≤ B收货日期
      const estimatedArrival = addDays(a.expectedReturnDate, transitDays);
      if (!isDateBeforeOrEqual(estimatedArrival, b.receiptDate)) continue;

      // 计算匹配得分（天数差越小越好）
      const daysDiff = Math.floor((new Date(b.receiptDate).getTime() - new Date(estimatedArrival).getTime()) / (1000 * 60 * 60 * 24));

      aMatches.push({
        fromRecord: a,
        toRecord: b,
        fromAddress: a.shipAddress,
        toAddress: b.shipAddress,
        transitDays,
        estimatedArrival,
        canTransfer: true,
        score: daysDiff,
        matchType: isSameCity ? 'same_city' : 'same_province',
      });
    }

    // 按优先级排序：同城优先，同省内按时间紧凑度排序
    aMatches.sort((x, y) => {
      if (x.matchType === 'same_city' && y.matchType !== 'same_city') return -1;
      if (x.matchType !== 'same_city' && y.matchType === 'same_city') return 1;
      return x.score - y.score;
    });

    // 每个已发出最多匹配4个
    matches.push(...aMatches.slice(0, 4));
  }

  // 全局按优先级排序
  matches.sort((x, y) => {
    if (x.matchType === 'same_city' && y.matchType !== 'same_city') return -1;
    if (x.matchType !== 'same_city' && y.matchType === 'same_city') return 1;
    return x.score - y.score;
  });

  return matches;
}

/**
 * 确认转寄操作
 * 1. 原订单A状态变为"已转寄"，标记isTransfer
 * 2. 订单B继承A的设备编号，状态变为"已发出"，标记transferredFromId
 * 3. 订单B的发货地址改为A的收货地址，发货日期改为A的预计寄出日期
 * 4. 记录转寄日志
 * 5. 更新数据库
 */
export async function confirmTransfer(fromId: string, toId: string, selectedNumbers: string[], matchType: 'same_city' | 'same_province'): Promise<boolean> {
  try {
    const records = loadRecordsSync();
    const fromRecord = records.find(r => r.id === fromId);
    const toRecord = records.find(r => r.id === toId);

    if (!fromRecord || !toRecord) return false;
    if (fromRecord.status !== '已发出') return false;
    if (toRecord.status !== '待发货') return false;

    // 检查是否已存在相同转寄日志（防重复）
    try {
      const checkRes = await fetch(`/api/transfer-logs?from=${fromId}&to=${toId}`);
      const checkJson = await checkRes.json() as { success: boolean; data?: unknown[] };
      if (checkJson.success && checkJson.data && checkJson.data.length > 0) {
        console.warn('该转寄记录已存在，跳过重复写入');
      }
    } catch {
      // 检查失败不阻断流程
    }

    // 计算转寄后的物流天数和日期
    const transitDays = getTransitDaysBetween(fromRecord.shipAddress, toRecord.shipAddress);
    const newShipDate = fromRecord.expectedReturnDate;
    const newReceiptDate = addDays(newShipDate, transitDays);

    // 更新原订单A：状态变为"已转寄"，标记转寄
    await updateRecord(fromId, { status: '已转寄', isTransfer: true });

    // 更新订单B：继承编号、更新发货信息、标记转寄来源
    await updateRecord(toId, {
      deviceNumbers: selectedNumbers,
      quantity: selectedNumbers.length,
      deviceModel: fromRecord.deviceModel,
      status: '已发出',
      shipDate: newShipDate,
      receiptDate: newReceiptDate,
      isTransfer: true,
      transferredFromId: fromId,
    });

    // 记录转寄日志到数据库
    try {
      await fetch('/api/transfer-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromRecordId: fromId,
          toRecordId: toId,
          fromOrderId: fromRecord.orderId,
          toOrderId: toRecord.orderId,
          fromCustomer: fromRecord.xianyuCustomer,
          toCustomer: toRecord.xianyuCustomer,
          deviceModel: fromRecord.deviceModel,
          deviceNumbers: selectedNumbers,
          fromAddress: fromRecord.shipAddress,
          toAddress: toRecord.shipAddress,
          matchType,
          transitDays,
        }),
      });
    } catch (e) {
      console.error('转寄日志写入失败:', e);
    }

    // 刷新缓存
    cachedRecords = null;
    await loadRecords();

    return true;
  } catch (e) {
    console.error('转寄操作失败:', e);
    return false;
  }
}

/** 加载转寄日志列表 */
export async function loadTransferLogs(): Promise<TransferLog[]> {
  try {
    const res = await fetch('/api/transfer-logs');
    const json = await res.json() as { success: boolean; data?: Record<string, unknown>[]; error?: string };
    if (!json.success || !json.data) return [];
    return json.data.map(r => ({
      id: r.id as string,
      fromRecordId: r.from_record_id as string,
      toRecordId: r.to_record_id as string,
      fromOrderId: r.from_order_id as string,
      toOrderId: r.to_order_id as string,
      fromCustomer: (r.from_customer as string) || '',
      toCustomer: (r.to_customer as string) || '',
      deviceModel: r.device_model as DeviceModel,
      deviceNumbers: (r.device_numbers as string[]) || [],
      fromAddress: (r.from_address as string) || '',
      toAddress: (r.to_address as string) || '',
      matchType: r.match_type as 'same_city' | 'same_province',
      transitDays: r.transit_days as number,
      confirmedAt: r.confirmed_at as string,
    }));
  } catch {
    return [];
  }
}
