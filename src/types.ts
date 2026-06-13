/** 设备型号（动态，支持任意机型） */
export type DeviceModel = string;

/** 设备状态（五态：待发货→已发出→已转寄/已归还，在仓为初始态） */
export type DeviceStatus = '待发货' | '已发出' | '已转寄' | '已归还';

/** 设备成色 */
export type DeviceCondition = '全新' | '轻微磨损' | '中度磨损' | '严重磨损' | '损坏';

/** 租赁记录 */
export interface RentalRecord {
  id: string;
  orderId: string;
  deviceModel: DeviceModel;
  quantity: number;
  deviceNumbers: string[];
  xianyuCustomer: string;
  phone: string;
  shipAddress: string;
  addressOnly: string;
  shipDate: string;
  receiptDate: string;
  expectedReturnDate: string;
  estimatedArrivalDate: string;
  shopName: string;
  status: DeviceStatus;
  returnDate: string;
  notes: string;
  peerShipping: boolean;
  peerShippingInfo: string;
  isTransfer?: boolean;
  transferredFromId?: string;
  createdAt: string;
}

/** 设备详情信息 */
export interface DeviceInfo {
  id: string;
  model: DeviceModel;
  number: string;
  purchasePrice: number;
  condition: DeviceCondition;
  notes: string;
  purchaseDate: string;
  createdAt: string;
  updatedAt: string;
}

/** 转寄匹配结果 */
export interface TransferMatch {
  fromRecord: RentalRecord;
  toRecord: RentalRecord;
  fromAddress: string;
  toAddress: string;
  transitDays: number;
  estimatedArrival: string;
  canTransfer: boolean;
  score: number;
  matchType: 'same_city' | 'same_province';
}

/** 转寄记录 */
export interface TransferLog {
  id: string;
  fromRecordId: string;
  toRecordId: string;
  fromOrderId: string;
  toOrderId: string;
  fromCustomer: string;
  toCustomer: string;
  deviceModel: DeviceModel;
  deviceNumbers: string[];
  fromAddress: string;
  toAddress: string;
  matchType: 'same_city' | 'same_province';
  transitDays: number;
  confirmedAt: string;
}

/** 单个机型库存统计 */
export interface ModelStats {
  total: number;
  available: number;
  rented: number;
  pending: number;
}

/** 库存统计（完全动态，包含所有机型） */
export interface InventoryStats {
  totalDevices: number;
  totalAvailable: number;
  totalRented: number;
  totalPending: number;
  /** 按机型动态统计（包含所有预设和自定义机型） */
  models: Record<string, ModelStats>;
  /** @deprecated 使用 models 代替，保留兼容 */
  vivoTotal: number;
  vivoAvailable: number;
  vivoRented: number;
  vivoPending: number;
  samsungTotal: number;
  samsungAvailable: number;
  samsungRented: number;
  samsungPending: number;
  appleTotal: number;
  appleAvailable: number;
  appleRented: number;
  applePending: number;
}

/** 页面标签 */
export type TabType = 'dashboard' | 'ship' | 'records' | 'transfer' | 'bulk-return';

/** 一键到仓快照记录 */
export interface BulkReturnLog {
  id: string;
  batchId: string;
  operatedAt: string;
  recordId: string;
  orderId: string;
  deviceModel: DeviceModel;
  deviceNumber: string;
  xianyuCustomer: string;
  phone: string;
  shipAddress: string;
  shipDate: string;
  receiptDate: string;
  expectedReturnDate: string;
  estimatedArrivalDate: string;
  notes: string;
}

/** 一键到仓批次摘要 */
export interface BulkReturnBatch {
  batchId: string;
  operatedAt: string;
  count: number;
}

/** 提醒类型 */
export interface ReminderItem {
  type: 'ship' | 'arrival';
  record: RentalRecord;
  daysOffset: number;
}

/** 粘贴解析结果 */
export interface ParsedPasteResult {
  shipAddress: string;
  addressOnly: string;
  receiptDate: string;
  expectedReturnDate: string;
  xianyuCustomer: string;
  phone: string;
  contactName: string;
}
