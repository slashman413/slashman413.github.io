export type PlanType = 'free' | 'single_pass' | 'monthly' | 'lifetime';

export interface ProStatus {
  isPro: boolean;
  planType: PlanType;
  licenseKey?: string;
  activatedAt?: number;
  unlockedPhotosCount: number;
  unlockedVideosCount: number;
}

const STORAGE_KEY = 'slashmantools_line_chat_pro_v1';

const DEFAULT_STATUS: ProStatus = {
  isPro: false,
  planType: 'free',
  unlockedPhotosCount: 0,
  unlockedVideosCount: 0,
};

// Recognized VIP license keys and prefix patterns
const BUILTIN_KEYS: Record<string, PlanType> = {
  LINEPRO2026: 'lifetime',
  SLASHMAN_VIP: 'lifetime',
  GUMROAD_PRO: 'monthly',
  PROPASS_DEMO: 'single_pass',
};

export const PRICING_PLANS = [
  {
    id: 'single_pass',
    name: '單次暢享包 (Single Pass)',
    priceTWD: 39,
    priceUSD: 1.29,
    badge: '即開即用',
    badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    description: '適合偶爾製作單支短影音或單張擬真對話截圖',
    features: [
      '單張 3x Retina 4K 級無浮水印截圖',
      '或單支 60FPS 無水印短影音導出',
      '保留原始高品質向量與貼圖細節',
      '免綁約、即買即用',
    ],
    gumroadUrl: 'https://slashmaster6.gumroad.com/l/line-chat-generator-pro?wanted=true&variant=single',
  },
  {
    id: 'monthly',
    name: '創作者月費方案 (Pro Monthly)',
    priceTWD: 99,
    priceUSD: 2.99,
    period: '/ 月',
    badge: '自媒體首選',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    description: '短影音自媒體與行銷企劃的日常高產神器',
    features: [
      '30 天內無限次 4K 無浮水印截圖導出',
      '30 天內無限次動態短影音錄製 (WebM/MP4)',
      '解鎖 60FPS 極致流暢動態模式',
      '解鎖全套 10 種全格式訊息與群組已讀',
      '解鎖所有開箱即用情境劇本範本',
    ],
    gumroadUrl: 'https://slashmaster6.gumroad.com/l/line-chat-generator-pro?wanted=true&variant=monthly',
  },
  {
    id: 'lifetime',
    name: '尊榮終身通行證 (Lifetime VIP)',
    priceTWD: 249,
    priceUSD: 7.99,
    period: '終身買斷',
    isPopular: true,
    badge: '👑 最受歡迎 • 永久授權',
    badgeColor: 'bg-gradient-to-r from-amber-500/20 to-yellow-500/20 text-amber-300 border-amber-500/40',
    description: '一次付費永久享有全部進階功能，含未來所有 AI 劇本與更新',
    features: [
      '永久無限制 4K 無浮水印截圖下載',
      '永久無限制高影格率影片錄製與輸出',
      '專屬客製化品牌浮水印功能',
      '優先享有未來 AI 自動編劇與語音合成功能',
      '一組金鑰全裝置通用、終身免費更新',
    ],
    gumroadUrl: 'https://slashmaster6.gumroad.com/l/line-chat-generator-pro?wanted=true&variant=lifetime',
  },
];

export function getProStatus(): ProStatus {
  if (typeof window === 'undefined') return DEFAULT_STATUS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATUS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_STATUS,
      ...parsed,
    };
  } catch (err) {
    console.error('Failed to parse Pro status:', err);
    return DEFAULT_STATUS;
  }
}

export function saveProStatus(status: ProStatus): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(status));
    // Dispatch custom event for reactive update
    window.dispatchEvent(new Event('line_chat_pro_updated'));
  } catch (err) {
    console.error('Failed to save Pro status:', err);
  }
}

export function activateLicense(inputKey: string): {
  success: boolean;
  message: string;
  status?: ProStatus;
} {
  const cleanKey = inputKey.trim().toUpperCase();

  if (!cleanKey) {
    return { success: false, message: '請輸入有效的啟用金鑰或序號！' };
  }

  // Check built-in keys
  if (BUILTIN_KEYS[cleanKey]) {
    const plan = BUILTIN_KEYS[cleanKey];
    const newStatus: ProStatus = {
      isPro: true,
      planType: plan,
      licenseKey: cleanKey,
      activatedAt: Date.now(),
      unlockedPhotosCount: plan === 'single_pass' ? 5 : 99999,
      unlockedVideosCount: plan === 'single_pass' ? 5 : 99999,
    };
    saveProStatus(newStatus);
    return {
      success: true,
      message: `🎉 成功啟用 ${plan === 'lifetime' ? '終身 VIP 尊榮版' : '創作者 Pro 版'}！已解鎖無浮水印下載權限。`,
      status: newStatus,
    };
  }

  // Check valid patterns (e.g., LINE-PRO-XXXX-XXXX or GUM-XXXX-XXXX)
  const isLineProPattern = /^LINE-PRO-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(cleanKey);
  const isGumroadPattern = /^GUM-[A-Z0-9]{4,12}$/.test(cleanKey);
  const isSlashVIPPattern = /^SLASH-[A-Z0-9]{4,8}$/.test(cleanKey);

  if (isLineProPattern || isGumroadPattern || isSlashVIPPattern) {
    const newStatus: ProStatus = {
      isPro: true,
      planType: 'lifetime',
      licenseKey: cleanKey,
      activatedAt: Date.now(),
      unlockedPhotosCount: 99999,
      unlockedVideosCount: 99999,
    };
    saveProStatus(newStatus);
    return {
      success: true,
      message: '🎉 授權序號驗證成功！已解鎖全功能無浮水印與 4K 導出權限。',
      status: newStatus,
    };
  }

  return {
    success: false,
    message: '無效的啟用金鑰。請確認輸入是否正確，或測試使用體驗金鑰 LINEPRO2026',
  };
}

export function unlockSingleCredit(type: 'photo' | 'video'): void {
  const current = getProStatus();
  if (type === 'photo') {
    current.unlockedPhotosCount = (current.unlockedPhotosCount || 0) + 1;
  } else {
    current.unlockedVideosCount = (current.unlockedVideosCount || 0) + 1;
  }
  saveProStatus(current);
}

export function resetProStatus(): void {
  saveProStatus(DEFAULT_STATUS);
}
