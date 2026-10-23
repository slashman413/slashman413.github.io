export type PlanType = 'free' | 'single_pass' | 'monthly' | 'lifetime';

export interface ProStatus {
  isPro: boolean;
  planType: PlanType;
  licenseKey?: string;
  activatedAt?: number;
  expiresAt?: number;
  unlockedPhotosCount: number;
  unlockedVideosCount: number;
}

const DEFAULT_STATUS: ProStatus = {
  isPro: false,
  planType: 'free',
  unlockedPhotosCount: 0,
  unlockedVideosCount: 0,
};

// PRO is sold as Gumroad product `line-chat-generator-pro` (slashmaster6).
// Keys are verified by the api.slashmantools.us Worker (Gumroad
// /v2/licenses/verify), which returns a token signed with ECDSA P-256. PRO is
// granted only while a stored token passes the signature check below, so
// editing localStorage can't unlock it.
export const PRO_SALES_OPEN = true;

const LICENSE_ENDPOINT = 'https://api.slashmantools.us/license/line-chat-pro';
const TOKEN_KEY = 'slashmantools_line_chat_pro_token_v2';
const LICENSE_PUBLIC_JWK: JsonWebKey = {"kty":"EC","crv":"P-256","x":"_ctdvJKSjgtV-c4jZ44xk9MbUDjCc5v-Pm61jH2NyiY","y":"5g6Fj1D8Vl7_2tdtfi5T96segsD2weYXu4OirkFcn8Q"};

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
    gumroadUrl: 'https://slashmaster6.gumroad.com/l/line-chat-generator-pro?wanted=true&variant=Single%20Pass',
  },
  {
    id: 'monthly',
    name: '30 天創作者通行證 (30-Day Pass)',
    priceTWD: 99,
    priceUSD: 2.99,
    period: '/ 30 天',
    badge: '自媒體首選',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    description: '短影音自媒體與行銷企劃的日常高產神器（一次性付款，不自動續扣）',
    features: [
      '30 天內無限次 4K 無浮水印截圖導出',
      '30 天內無限次動態短影音錄製 (WebM/MP4)',
      '解鎖 60FPS 極致流暢動態模式',
      '解鎖全套 10 種全格式訊息與群組已讀',
      '解鎖所有開箱即用情境劇本範本',
    ],
    gumroadUrl: 'https://slashmaster6.gumroad.com/l/line-chat-generator-pro?wanted=true&variant=30-Day%20Pass',
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
    gumroadUrl: 'https://slashmaster6.gumroad.com/l/line-chat-generator-pro?wanted=true&variant=Lifetime',
  },
];

interface TokenPayload {
  v: number;
  plan: PlanType;
  key: string;
  iat: number;
  exp: number;
}

// Last status that passed verification; getProStatus() is synchronous so the
// React tree reads this cache and refreshProStatus() fills it.
let verifiedStatus: ProStatus = DEFAULT_STATUS;

function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function verifyToken(token: string): Promise<TokenPayload | null> {
  const [body, sig] = token.split('.');
  if (!body || !sig || !crypto?.subtle) return null;
  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      LICENSE_PUBLIC_JWK,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      b64urlDecode(sig),
      new TextEncoder().encode(body)
    );
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as TokenPayload;
    if (payload.v !== 1 || !(payload.exp * 1000 > Date.now())) return null;
    return payload;
  } catch {
    return null;
  }
}

function statusFromPayload(p: TokenPayload): ProStatus {
  return {
    isPro: true,
    planType: p.plan,
    licenseKey: `••••${p.key}`,
    activatedAt: p.iat * 1000,
    expiresAt: p.exp * 1000,
    unlockedPhotosCount: 0,
    unlockedVideosCount: 0,
  };
}

function notify(): void {
  window.dispatchEvent(new Event('line_chat_pro_updated'));
}

export function getProStatus(): ProStatus {
  return verifiedStatus;
}

/** Re-check the stored token (on load and when another tab changes it). */
export async function refreshProStatus(): Promise<ProStatus> {
  if (typeof window === 'undefined' || !PRO_SALES_OPEN) return DEFAULT_STATUS;
  const token = localStorage.getItem(TOKEN_KEY);
  const payload = token ? await verifyToken(token) : null;
  if (token && !payload) localStorage.removeItem(TOKEN_KEY);
  verifiedStatus = payload ? statusFromPayload(payload) : DEFAULT_STATUS;
  notify();
  return verifiedStatus;
}

const ACTIVATION_ERRORS: Record<string, string> = {
  unknown_key: '查無此授權序號，請確認是否完整複製 Gumroad 收據中的序號。',
  purchase_revoked: '此訂單已退款或取消，授權無法使用。',
  expired: '此 30 天通行證已過期，歡迎重新購買。',
  single_pass_used: '此單次暢享包序號已使用過。',
  rate_limited: '嘗試次數過多，請 10 分鐘後再試。',
  invalid_key: '序號格式不正確。',
};

export async function activateLicense(inputKey: string): Promise<{
  success: boolean;
  message: string;
  status?: ProStatus;
}> {
  const cleanKey = inputKey.trim();
  if (!cleanKey) {
    return { success: false, message: '請輸入有效的啟用金鑰或序號！' };
  }
  try {
    const res = await fetch(LICENSE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_key: cleanKey }),
    });
    const data = await res.json().catch(() => ({}));
    const payload = data.ok && data.token ? await verifyToken(data.token) : null;
    if (!payload) {
      return {
        success: false,
        message: ACTIVATION_ERRORS[data.error] || '授權驗證失敗，請稍後再試。',
      };
    }
    localStorage.setItem(TOKEN_KEY, data.token);
    verifiedStatus = statusFromPayload(payload);
    notify();
    return { success: true, message: '🎉 PRO 授權已啟用！', status: verifiedStatus };
  } catch {
    return { success: false, message: '無法連線到授權伺服器，請檢查網路後再試。' };
  }
}

/** A Single Pass covers one export: drop the token once it has been used. */
export function consumeSinglePass(): void {
  if (verifiedStatus.planType !== 'single_pass') return;
  resetProStatus();
}

export function resetProStatus(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem('slashmantools_line_chat_pro_v1');
  verifiedStatus = DEFAULT_STATUS;
  notify();
}
