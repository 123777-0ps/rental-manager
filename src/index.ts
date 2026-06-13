import './index.css';
import { render } from './main';
import { migrateIfNeeded, initAllDeviceInfo } from './store';

// PWA 安装提示
let deferredPrompt: BeforeInstallPromptEvent | null = null;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

window.addEventListener('beforeinstallprompt', (e: Event) => {
  e.preventDefault();
  deferredPrompt = e as BeforeInstallPromptEvent;
  (window as any).__deferredInstallPrompt = deferredPrompt;
});

// 在非 standalone 模式下，首次访问自动弹出安装引导
function checkAndShowInstallGuide(): void {
  // 已安装为 standalone 模式则不提示
  if (window.matchMedia('(display-mode: standalone)').matches) return;
  // 同一天内不重复提示
  const today = new Date().toDateString();
  const lastShown = localStorage.getItem('pwa_guide_date');
  if (lastShown === today) return;

  // 延迟3秒显示，避免干扰首次加载
  setTimeout(() => {
    showInstallGuide();
    localStorage.setItem('pwa_guide_date', today);
  }, 3000);
}

function showInstallGuide(): void {
  // 避免重复弹窗
  if (document.getElementById('pwa-install-guide')) return;

  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  const isMobile = isIOS || isAndroid;

  const guide = document.createElement('div');
  guide.id = 'pwa-install-guide';
  guide.innerHTML = `
    <div style="position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,0.6);display:flex;align-items:flex-end;justify-content:center;" onclick="if(event.target===this)this.remove()">
      <div style="background:#fff;border-radius:20px 20px 0 0;padding:24px 20px 32px;max-width:420px;width:100%;box-shadow:0 -4px 24px rgba(0,0,0,0.2);">
        <div style="text-align:center;margin-bottom:20px;">
          <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:14px;background:linear-gradient(135deg,#f59e0b,#ea580c);margin-bottom:12px;">
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24"><path d="M12 2L4 7v10l8 5 8-5V7l-8-5z" fill="#fff" opacity="0.3"/><path d="M12 16V8m0 0l-3 3m3-3l3 3" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <div style="font-size:20px;font-weight:700;color:#1f2937;">添加到主屏幕</div>
          <div style="font-size:13px;color:#6b7280;margin-top:4px;">全屏运行，像App一样使用</div>
        </div>

        ${isIOS ? `
          <div style="background:#f0f9ff;border-radius:12px;padding:16px;margin-bottom:16px;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
              <span style="background:#3b82f6;color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0;">1</span>
              <span style="color:#1e40af;font-size:14px;font-weight:600;">点击底部的 <b>分享按钮</b></span>
            </div>
            <div style="text-align:center;padding:8px;">
              <span style="font-size:36px;">&#8613;</span>
              <div style="font-size:11px;color:#6b7280;">Safari 底部中间的分享图标</div>
            </div>
          </div>
          <div style="background:#f0f9ff;border-radius:12px;padding:16px;margin-bottom:16px;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
              <span style="background:#3b82f6;color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0;">2</span>
              <span style="color:#1e40af;font-size:14px;font-weight:600;">向下滑动，点击 <b>"添加到主屏幕"</b></span>
            </div>
          </div>
          <div style="background:#f0fdf4;border-radius:12px;padding:16px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="background:#22c55e;color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0;">3</span>
              <span style="color:#166534;font-size:14px;font-weight:600;">点击右上角 <b>"添加"</b> 完成安装</span>
            </div>
          </div>
          <div style="margin-top:12px;padding:10px;background:#fff7ed;border-radius:8px;text-align:center;font-size:12px;color:#9a3412;">
            请使用 <b>Safari</b> 浏览器打开本网站
          </div>
        ` : isAndroid ? `
          <div style="background:#f0f9ff;border-radius:12px;padding:16px;margin-bottom:16px;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
              <span style="background:#3b82f6;color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0;">1</span>
              <span style="color:#1e40af;font-size:14px;font-weight:600;">点击浏览器右上角的 <b>菜单 &#8942;</b></span>
            </div>
          </div>
          <div style="background:#f0f9ff;border-radius:12px;padding:16px;margin-bottom:16px;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
              <span style="background:#3b82f6;color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0;">2</span>
              <span style="color:#1e40af;font-size:14px;font-weight:600;">点击 <b>"添加到主屏幕"</b> 或 <b>"安装应用"</b></span>
            </div>
          </div>
          <div style="background:#f0fdf4;border-radius:12px;padding:16px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="background:#22c55e;color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0;">3</span>
              <span style="color:#166534;font-size:14px;font-weight:600;">点击 <b>"安装"</b> 完成安装</span>
            </div>
          </div>
          <div style="margin-top:12px;padding:10px;background:#fff7ed;border-radius:8px;text-align:center;font-size:12px;color:#9a3412;">
            请使用 <b>Chrome</b> 浏览器打开本网站
          </div>
        ` : `
          <div style="background:#f0f9ff;border-radius:12px;padding:16px;margin-bottom:16px;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
              <span style="background:#3b82f6;color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0;">Chrome</span>
              <span style="color:#1e40af;font-size:14px;">地址栏右侧安装图标 → <b>"安装应用"</b></span>
            </div>
          </div>
          <div style="background:#f0f9ff;border-radius:12px;padding:16px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="background:#3b82f6;color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0;">Edge</span>
              <span style="color:#1e40af;font-size:14px;">菜单 → 应用 → <b>"将此站点作为应用安装"</b></span>
            </div>
          </div>
        `}

        <button onclick="this.closest('#pwa-install-guide').remove()" style="margin-top:20px;width:100%;background:linear-gradient(135deg,#f59e0b,#ea580c);color:#fff;border:none;border-radius:12px;padding:14px;font-weight:700;font-size:16px;cursor:pointer;">知道了</button>
      </div>
    </div>
  `;
  document.body.appendChild(guide);
}

// 监听手动引导事件（头部下载按钮触发）
window.addEventListener('show-install-guide', () => {
  showInstallGuide();
});

// 初始化：迁移数据 → 初始化设备 → 渲染
async function init(): Promise<void> {
  try {
    await migrateIfNeeded();
    await initAllDeviceInfo();
  } catch (err) {
    console.error('初始化失败:', err);
  }
  await render();
  // 首次加载后检查是否需要显示安装引导
  checkAndShowInstallGuide();
}

init();
