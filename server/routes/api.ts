import { Router } from 'express';
import { getSupabaseClient } from '../src/storage/database/supabase-client';

const router = Router();

function getClient() {
  return getSupabaseClient();
}

// ==================== 租赁记录 API ====================

// 获取所有租赁记录
router.get('/api/records', async (_req, res) => {
  try {
    const { data, error } = await getClient()
      .from('rental_records')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(`查询失败: ${error.message}`);
    res.json({ success: true, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '查询失败';
    res.status(500).json({ success: false, error: msg });
  }
});

// 获取当前最大订单编号
router.get('/api/records/max-order-id', async (_req, res) => {
  try {
    const { data, error } = await getClient()
      .from('rental_records')
      .select('order_id');
    if (error) throw new Error(`查询失败: ${error.message}`);
    let maxId = 0;
    for (const row of (data || [])) {
      const num = parseInt(row.order_id, 10);
      if (!isNaN(num) && num > maxId) maxId = num;
    }
    res.json({ success: true, maxOrderId: maxId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '查询失败';
    res.status(500).json({ success: false, error: msg });
  }
});

// 新增租赁记录
router.post('/api/records', async (req, res) => {
  try {
    const record = req.body;
    const insertPayload = {
      order_id: record.orderId,
      device_model: record.deviceModel,
      quantity: record.quantity,
      device_numbers: record.deviceNumbers || [],
      xianyu_customer: record.xianyuCustomer || null,
      phone: record.phone || null,
      ship_address: record.shipAddress || null,
      address_only: record.addressOnly || null,
      shop_name: record.shopName || null,
      ship_date: record.shipDate || null,
      receipt_date: record.receiptDate || null,
      expected_return_date: record.expectedReturnDate || null,
      estimated_arrival_date: record.estimatedArrivalDate || null,
      status: record.status || '待发货',
      return_date: record.returnDate || null,
      notes: record.notes || null,
      peer_shipping: record.peerShipping || false,
      peer_shipping_info: record.peerShippingInfo || null,
      is_transfer: record.isTransfer || false,
      transferred_from_id: record.transferredFromId || null,
    };
    const { data, error } = await getClient()
      .from('rental_records')
      .insert(insertPayload)
      .select()
      .single();
    if (error) throw new Error(`新增失败: ${error.message}`);
    res.json({ success: true, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '新增失败';
    res.status(500).json({ success: false, error: msg });
  }
});

// 批量新增租赁记录
router.post('/api/records/batch', async (req, res) => {
  try {
    const client = getClient();
    const records: Record<string, unknown>[] = req.body.records;
    if (!Array.isArray(records) || records.length === 0) {
      res.status(400).json({ success: false, error: 'records数组不能为空' });
      return;
    }
    const insertData = records.map((r) => ({
      order_id: r.orderId as string,
      device_model: r.deviceModel as string,
      quantity: r.quantity as number,
      device_numbers: r.deviceNumbers as string[] || [],
      xianyu_customer: r.xianyuCustomer as string,
      phone: (r.phone as string) || '',
      ship_address: (r.shipAddress as string) || '',
      address_only: (r.addressOnly as string) || '',
      shop_name: (r.shopName as string) || '',
      ship_date: (r.shipDate as string) || '',
      receipt_date: (r.receiptDate as string) || '',
      expected_return_date: (r.expectedReturnDate as string) || '',
      estimated_arrival_date: (r.estimatedArrivalDate as string) || '',
      status: (r.status as string) || '待发货',
      return_date: (r.returnDate as string) || null,
      notes: (r.notes as string) || null,
      peer_shipping: (r.peerShipping as boolean) || false,
      peer_shipping_info: (r.peerShippingInfo as string) || null,
      is_transfer: (r.isTransfer as boolean) || false,
      transferred_from_id: (r.transferredFromId as string) || null,
      created_at: new Date().toISOString(),
    }));
    const { data, error } = await client.from('rental_records').insert(insertData).select();
    if (error) {
      res.status(500).json({ success: false, error: `批量新增失败: ${error.message}` });
      return;
    }
    res.json({ success: true, data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ success: false, error: msg });
  }
});

// 更新租赁记录
router.put('/api/records/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const record = req.body;
    const updateData: Record<string, unknown> = {};
    if (record.orderId !== undefined) updateData.order_id = record.orderId;
    if (record.deviceModel !== undefined) updateData.device_model = record.deviceModel;
    if (record.quantity !== undefined) updateData.quantity = record.quantity;
    if (record.deviceNumbers !== undefined) updateData.device_numbers = record.deviceNumbers;
    if (record.xianyuCustomer !== undefined) updateData.xianyu_customer = record.xianyuCustomer;
    if (record.phone !== undefined) updateData.phone = record.phone;
    if (record.shipAddress !== undefined) updateData.ship_address = record.shipAddress;
    if (record.addressOnly !== undefined) updateData.address_only = record.addressOnly;
    if (record.shopName !== undefined) updateData.shop_name = record.shopName;
    if (record.shipDate !== undefined) updateData.ship_date = record.shipDate;
    if (record.receiptDate !== undefined) updateData.receipt_date = record.receiptDate;
    if (record.expectedReturnDate !== undefined) updateData.expected_return_date = record.expectedReturnDate;
    if (record.estimatedArrivalDate !== undefined) updateData.estimated_arrival_date = record.estimatedArrivalDate;
    if (record.status !== undefined) updateData.status = record.status;
    if (record.returnDate !== undefined) updateData.return_date = record.returnDate;
    if (record.notes !== undefined) updateData.notes = record.notes;
    if (record.peerShipping !== undefined) updateData.peer_shipping = record.peerShipping;
    if (record.peerShippingInfo !== undefined) updateData.peer_shipping_info = record.peerShippingInfo;
    if (record.isTransfer !== undefined) updateData.is_transfer = record.isTransfer;
    if (record.transferredFromId !== undefined) updateData.transferred_from_id = record.transferredFromId;

    const { data, error } = await getClient()
      .from('rental_records')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`更新失败: ${error.message}`);
    res.json({ success: true, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '更新失败';
    res.status(500).json({ success: false, error: msg });
  }
});

// 删除租赁记录
router.delete('/api/records/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await getClient()
      .from('rental_records')
      .delete()
      .eq('id', id);
    if (error) throw new Error(`删除失败: ${error.message}`);
    res.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '删除失败';
    res.status(500).json({ success: false, error: msg });
  }
});

// ==================== 设备详情 API ====================

// 获取所有设备详情
router.get('/api/devices', async (_req, res) => {
  try {
    const { data, error } = await getClient()
      .from('device_info')
      .select('*')
      .order('model', { ascending: true })
      .order('number', { ascending: true });
    if (error) throw new Error(`查询失败: ${error.message}`);
    res.json({ success: true, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '查询失败';
    res.status(500).json({ success: false, error: msg });
  }
});

// 批量新增设备详情
router.post('/api/devices/batch', async (req, res) => {
  try {
    const devices = req.body.devices as Array<{
      model: string;
      number: string;
      purchasePrice: string;
      condition: string;
      notes: string;
      purchaseDate: string;
    }>;
    if (!devices || !Array.isArray(devices) || devices.length === 0) {
      res.status(400).json({ success: false, error: '设备列表不能为空' });
      return;
    }
    const rows = devices.map(d => ({
      model: d.model,
      number: d.number,
      purchase_price: d.purchasePrice || '0',
      condition: d.condition || '全新',
      notes: d.notes || null,
      purchase_date: d.purchaseDate || null,
    }));
    const { data, error } = await getClient()
      .from('device_info')
      .insert(rows)
      .select();
    if (error) throw new Error(`批量新增失败: ${error.message}`);
    res.json({ success: true, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '批量新增失败';
    res.status(500).json({ success: false, error: msg });
  }
});

// 新增单个设备详情
router.post('/api/devices', async (req, res) => {
  try {
    const d = req.body;
    const { data, error } = await getClient()
      .from('device_info')
      .insert({
        model: d.model,
        number: d.number,
        purchase_price: d.purchasePrice || '0',
        condition: d.condition || '全新',
        notes: d.notes || null,
        purchase_date: d.purchaseDate || null,
      })
      .select()
      .single();
    if (error) throw new Error(`新增失败: ${error.message}`);
    res.json({ success: true, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '新增失败';
    res.status(500).json({ success: false, error: msg });
  }
});

// 更新设备详情
router.put('/api/devices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const d = req.body;
    const updateData: Record<string, unknown> = {};
    if (d.purchasePrice !== undefined) updateData.purchase_price = d.purchasePrice;
    if (d.condition !== undefined) updateData.condition = d.condition;
    if (d.notes !== undefined) updateData.notes = d.notes;
    if (d.purchaseDate !== undefined) updateData.purchase_date = d.purchaseDate;
    updateData.updated_at = new Date().toISOString();

    const { data, error } = await getClient()
      .from('device_info')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`更新失败: ${error.message}`);
    res.json({ success: true, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '更新失败';
    res.status(500).json({ success: false, error: msg });
  }
});

// 删除设备详情
router.delete('/api/devices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await getClient()
      .from('device_info')
      .delete()
      .eq('id', id);
    if (error) throw new Error(`删除失败: ${error.message}`);
    res.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '删除失败';
    res.status(500).json({ success: false, error: msg });
  }
});

// 批量删除设备详情（按编号列表）
router.post('/api/devices/batch-delete', async (req, res) => {
  try {
    const { model, numbers } = req.body as { model: string; numbers: string[] };
    if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
      res.status(400).json({ success: false, error: '编号列表不能为空' });
      return;
    }
    const { error } = await getClient()
      .from('device_info')
      .delete()
      .eq('model', model)
      .in('number', numbers);
    if (error) throw new Error(`批量删除失败: ${error.message}`);
    res.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '批量删除失败';
    res.status(500).json({ success: false, error: msg });
  }
});

// ==================== 一键到仓 API ====================

// 一键到仓：记录快照 + 批量归还
router.post('/api/bulk-return', async (_req, res) => {
  try {
    const client = getClient();

    // 1. 查询所有"已发出"的记录（排除同行代发）
    const { data: rentedRecords, error: queryError } = await client
      .from('rental_records')
      .select('*')
      .eq('status', '已发出')
      .eq('peer_shipping', false);
    if (queryError) throw new Error(`查询外租记录失败: ${queryError.message}`);

    if (!rentedRecords || rentedRecords.length === 0) {
      res.json({ success: true, message: '当前没有外租设备', count: 0 });
      return;
    }

    // 2. 生成批次ID
    const batchId = 'BR' + new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);

    // 3. 生成快照记录
    const snapshotRows: Record<string, unknown>[] = [];
    const updateIds: string[] = [];
    const today = new Date().toISOString().split('T')[0];

    for (const r of rentedRecords) {
      const numbers: string[] = Array.isArray(r.device_numbers) ? r.device_numbers : [];
      for (const num of numbers) {
        snapshotRows.push({
          batch_id: batchId,
          record_id: r.id,
          order_id: r.order_id,
          device_model: r.device_model,
          device_number: num,
          xianyu_customer: r.xianyu_customer,
          phone: r.phone,
          ship_address: r.ship_address,
          ship_date: r.ship_date,
          receipt_date: r.receipt_date,
          expected_return_date: r.expected_return_date,
          estimated_arrival_date: r.estimated_arrival_date,
          notes: r.notes,
        });
      }
      updateIds.push(r.id);
    }

    // 4. 插入快照
    if (snapshotRows.length > 0) {
      const { error: insertError } = await client
        .from('bulk_return_logs')
        .insert(snapshotRows);
      if (insertError) throw new Error(`保存快照失败: ${insertError.message}`);
    }

    // 5. 批量更新为已归还
    if (updateIds.length > 0) {
      const { error: updateError } = await client
        .from('rental_records')
        .update({ status: '已归还', return_date: today })
        .in('id', updateIds);
      if (updateError) throw new Error(`批量归还失败: ${updateError.message}`);
    }

    res.json({ success: true, batchId, count: snapshotRows.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '一键到仓失败';
    res.status(500).json({ success: false, error: msg });
  }
});

// 获取一键到仓历史批次列表
router.get('/api/bulk-return/batches', async (_req, res) => {
  try {
    const { data, error } = await getClient()
      .from('bulk_return_logs')
      .select('batch_id, operated_at')
      .order('operated_at', { ascending: false });
    if (error) throw new Error(`查询失败: ${error.message}`);

    // 去重
    const seen = new Set<string>();
    const batches: Array<{ batchId: string; operatedAt: string; count: number }> = [];
    for (const row of (data || [])) {
      if (!seen.has(row.batch_id)) {
        seen.add(row.batch_id);
        batches.push({ batchId: row.batch_id, operatedAt: row.operated_at, count: 0 });
      }
    }
    // 统计每个批次的记录数
    const { data: countData, error: countError } = await getClient()
      .from('bulk_return_logs')
      .select('batch_id');
    if (!countError && countData) {
      const countMap: Record<string, number> = {};
      for (const row of countData) {
        countMap[row.batch_id] = (countMap[row.batch_id] || 0) + 1;
      }
      for (const b of batches) {
        b.count = countMap[b.batchId] || 0;
      }
    }

    res.json({ success: true, data: batches });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '查询失败';
    res.status(500).json({ success: false, error: msg });
  }
});

// 获取某个批次的到仓记录详情
router.get('/api/bulk-return/batches/:batchId', async (req, res) => {
  try {
    const { batchId } = req.params;
    const { data, error } = await getClient()
      .from('bulk_return_logs')
      .select('*')
      .eq('batch_id', batchId)
      .order('device_model', { ascending: true })
      .order('device_number', { ascending: true });
    if (error) throw new Error(`查询失败: ${error.message}`);
    res.json({ success: true, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '查询失败';
    res.status(500).json({ success: false, error: msg });
  }
});

// 删除某个批次的到仓记录
router.delete('/api/bulk-return/batches/:batchId', async (req, res) => {
  try {
    const { batchId } = req.params;
    const { error } = await getClient()
      .from('bulk_return_logs')
      .delete()
      .eq('batch_id', batchId);
    if (error) throw new Error(`删除失败: ${error.message}`);
    res.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '删除失败';
    res.status(500).json({ success: false, error: msg });
  }
});

// ==================== 数据迁移 API ====================

// 从 localStorage 迁移数据到数据库
router.post('/api/migrate', async (req, res) => {
  try {
    const { records, devices } = req.body as {
      records: Array<Record<string, unknown>>;
      devices: Array<Record<string, unknown>>;
    };

    let migratedRecords = 0;
    let migratedDevices = 0;

    // 迁移租赁记录
    if (records && Array.isArray(records) && records.length > 0) {
      const rows = records.map(r => ({
        order_id: r.orderId as string,
        device_model: r.deviceModel as string,
        quantity: r.quantity as number,
        device_numbers: r.deviceNumbers as string[] || [],
        xianyu_customer: (r.xianyuCustomer as string) || null,
        phone: (r.phone as string) || null,
        ship_address: (r.shipAddress as string) || null,
        address_only: (r.addressOnly as string) || null,
        ship_date: (r.shipDate as string) || null,
        receipt_date: (r.receiptDate as string) || null,
        expected_return_date: (r.expectedReturnDate as string) || null,
        estimated_arrival_date: (r.estimatedArrivalDate as string) || null,
        status: (r.status as string) || '待发货',
        return_date: (r.returnDate as string) || null,
        created_at: (r.createdAt as string) || new Date().toISOString(),
      }));
      const { data, error } = await getClient()
        .from('rental_records')
        .upsert(rows, { onConflict: 'order_id' })
        .select();
      if (error) throw new Error(`迁移记录失败: ${error.message}`);
      migratedRecords = data?.length ?? 0;
    }

    // 迁移设备详情
    if (devices && Array.isArray(devices) && devices.length > 0) {
      const rows = devices.map(d => ({
        model: d.model as string,
        number: d.number as string,
        purchase_price: String(d.purchasePrice ?? '0'),
        condition: (d.condition as string) || '全新',
        notes: (d.notes as string) || null,
        purchase_date: (d.purchaseDate as string) || null,
      }));
      const { data, error } = await getClient()
        .from('device_info')
        .upsert(rows, { onConflict: 'model,number' })
        .select();
      if (error) {
        // upsert 需要唯一约束，如果失败则用 insert 忽略重复
        for (const row of rows) {
          const { error: insertError } = await getClient()
            .from('device_info')
            .insert(row);
          if (!insertError) migratedDevices++;
        }
      } else {
        migratedDevices = data?.length ?? 0;
      }
    }

    res.json({
      success: true,
      migratedRecords,
      migratedDevices,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '迁移失败';
    res.status(500).json({ success: false, error: msg });
  }
});

// ==================== 转寄日志 API ====================

// 获取转寄日志
router.get('/api/transfer-logs', async (req, res) => {
  try {
    let query = getClient()
      .from('transfer_logs')
      .select('*');
    // 支持按 from/to 查询（防重复检查）
    const fromId = req.query.from as string | undefined;
    const toId = req.query.to as string | undefined;
    if (fromId) query = query.eq('from_record_id', fromId);
    if (toId) query = query.eq('to_record_id', toId);
    const { data, error } = await query
      .order('confirmed_at', { ascending: false });
    if (error) throw new Error(`查询转寄日志失败: ${error.message}`);
    res.json({ success: true, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '查询转寄日志失败';
    res.status(500).json({ success: false, error: msg });
  }
});

// 新增转寄日志
router.post('/api/transfer-logs', async (req, res) => {
  try {
    const body = req.body;
    const insertPayload = {
      from_record_id: body.fromRecordId,
      to_record_id: body.toRecordId,
      from_order_id: body.fromOrderId,
      to_order_id: body.toOrderId,
      from_customer: body.fromCustomer || '',
      to_customer: body.toCustomer || '',
      device_model: body.deviceModel,
      device_numbers: body.deviceNumbers || [],
      from_address: body.fromAddress || '',
      to_address: body.toAddress || '',
      match_type: body.matchType || 'same_city',
      transit_days: body.transitDays || 1,
    };
    const { data, error } = await getClient()
      .from('transfer_logs')
      .insert(insertPayload)
      .select()
      .single();
    if (error) {
      // 唯一约束冲突说明已存在，返回已有记录
      if (error.code === '23505') {
        const { data: existing } = await getClient()
          .from('transfer_logs')
          .select('*')
          .eq('from_record_id', body.fromRecordId)
          .eq('to_record_id', body.toRecordId)
          .single();
        res.json({ success: true, data: existing });
        return;
      }
      throw new Error(`新增转寄日志失败: ${error.message}`);
    }
    res.json({ success: true, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '新增转寄日志失败';
    res.status(500).json({ success: false, error: msg });
  }
});

// 删除转寄日志
router.delete('/api/transfer-logs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await getClient()
      .from('transfer_logs')
      .delete()
      .eq('id', id);
    if (error) throw new Error(`删除转寄日志失败: ${error.message}`);
    res.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '删除转寄日志失败';
    res.status(500).json({ success: false, error: msg });
  }
});

export default router;
