import React, { useState } from 'react';
import {
  Crown,
  Check,
  X,
  Sparkles,
  Zap,
  ShieldCheck,
  Key,
  ExternalLink,
  HelpCircle,
  Film,
  Camera,
} from 'lucide-react';
import {
  PRICING_PLANS,
  PRO_SALES_OPEN,
  ProStatus,
  activateLicense,
  resetProStatus,
} from '../utils/proStore';

interface ProUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  proStatus: ProStatus;
  onStatusChange: (newStatus: ProStatus) => void;
  defaultPlan?: 'single_pass' | 'monthly' | 'lifetime';
}

export const ProUpgradeModal: React.FC<ProUpgradeModalProps> = ({
  isOpen,
  onClose,
  proStatus,
  onStatusChange,
  defaultPlan = 'lifetime',
}) => {
  const [selectedPlanId, setSelectedPlanId] = useState<string>(defaultPlan);
  const [licenseInput, setLicenseInput] = useState<string>('');
  const [isActivating, setIsActivating] = useState<boolean>(false);
  const [activationMsg, setActivationMsg] = useState<{
    text: string;
    isError: boolean;
  } | null>(null);

  if (!isOpen) return null;

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsActivating(true);
    const res = await activateLicense(licenseInput);
    setIsActivating(false);
    if (res.success && res.status) {
      setActivationMsg({ text: res.message, isError: false });
      onStatusChange(res.status);
      setTimeout(() => {
        onClose();
      }, 1500);
    } else {
      setActivationMsg({ text: res.message, isError: true });
    }
  };

  const handleReset = () => {
    if (confirm('確定要在這台裝置登出 PRO 授權嗎？之後可再次輸入序號啟用。')) {
      resetProStatus();
      onStatusChange({
        isPro: false,
        planType: 'free',
        unlockedPhotosCount: 0,
        unlockedVideosCount: 0,
      });
      setActivationMsg({ text: '已登出，恢復為免費版本。', isError: false });
    }
  };

  const selectedPlan =
    PRICING_PLANS.find((p) => p.id === selectedPlanId) || PRICING_PLANS[2];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl shadow-emerald-500/10 p-6 md:p-8 text-slate-100 scrollbar-thin">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X size={20} />
        </button>

        {/* Modal Header */}
        <div className="text-center max-w-xl mx-auto space-y-2 mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-amber-500/20 via-yellow-500/20 to-emerald-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold tracking-wide">
            <Crown size={14} className="text-amber-400" />
            <span>解鎖 100% 無浮水印 • 超高畫質導出</span>
          </div>

          <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
            升級 LINE Chat Generator PRO
          </h2>
          <p className="text-sm text-slate-400">
            短影音創作者、社群小編與行銷團隊的必備利器，高解析度、零水印、無限制短片錄製
          </p>
        </div>

        {/* Current Active Status Alert if already PRO */}
        {proStatus.isPro && (
          <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-emerald-950/60 to-slate-900 border border-emerald-500/40 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                <ShieldCheck size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">
                    您已啟用 PRO 尊榮版授權
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500 text-white font-extrabold">
                    ACTIVE
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  授權序號：{proStatus.licenseKey}{' • '}
                  {proStatus.planType === 'single_pass'
                    ? '可導出一次無浮水印截圖或影片'
                    : proStatus.planType === 'monthly' && proStatus.expiresAt
                      ? `無限次導出，效期至 ${new Date(proStatus.expiresAt).toLocaleDateString('zh-TW')}`
                      : '享有無限次無浮水印截圖與影片導出'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-slate-400 hover:text-red-400 underline transition-colors px-2 py-1"
            >
              登出授權
            </button>
          </div>
        )}

        {/* Value Comparison Highlights */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60 text-center">
            <div className="h-8 w-8 mx-auto rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-1.5">
              <Sparkles size={16} />
            </div>
            <div className="text-xs font-bold text-white">完全無浮水印</div>
            <div className="text-[11px] text-slate-400">導出 100% 純淨擬真</div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60 text-center">
            <div className="h-8 w-8 mx-auto rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center mb-1.5">
              <Camera size={16} />
            </div>
            <div className="text-xs font-bold text-white">3x Retina 4K</div>
            <div className="text-[11px] text-slate-400">極致超高畫質相片</div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60 text-center">
            <div className="h-8 w-8 mx-auto rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center mb-1.5">
              <Film size={16} />
            </div>
            <div className="text-xs font-bold text-white">60FPS 動態短片</div>
            <div className="text-[11px] text-slate-400">TikTok/Shorts 最佳規格</div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60 text-center">
            <div className="h-8 w-8 mx-auto rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center mb-1.5">
              <Zap size={16} />
            </div>
            <div className="text-xs font-bold text-white">優先享有新功能</div>
            <div className="text-[11px] text-slate-400">未來所有更新全包含</div>
          </div>
        </div>

        {/* Pricing Cards Selection */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {PRICING_PLANS.map((plan) => {
            const isSelected = selectedPlanId === plan.id;
            return (
              <div
                key={plan.id}
                onClick={() => setSelectedPlanId(plan.id)}
                className={`relative flex flex-col justify-between p-5 rounded-2xl cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-gradient-to-b from-slate-800 to-slate-900 border-2 border-emerald-500 shadow-xl shadow-emerald-500/20 -translate-y-1'
                    : 'bg-slate-800/50 border border-slate-700/60 hover:border-slate-600 hover:bg-slate-800/80'
                }`}
              >
                {/* Popular Pill */}
                {plan.isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-emerald-500 text-[10px] font-black text-white shadow-md">
                      MOST POPULAR
                    </span>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${plan.badgeColor}`}
                    >
                      {plan.badge}
                    </span>
                    {isSelected ? (
                      <div className="h-5 w-5 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                        <Check size={12} strokeWidth={3} />
                      </div>
                    ) : (
                      <div className="h-5 w-5 rounded-full border border-slate-600" />
                    )}
                  </div>

                  <h3 className="text-base font-bold text-white mb-1">
                    {plan.name}
                  </h3>
                  <p className="text-xs text-slate-400 mb-4 h-8 leading-tight">
                    {plan.description}
                  </p>

                  <div className="flex items-baseline gap-1.5 mb-4">
                    <span className="text-2xl font-black text-white">
                      NT$ {plan.priceTWD}
                    </span>
                    <span className="text-xs text-slate-400">
                      (~${plan.priceUSD} USD {plan.period || ''})
                    </span>
                  </div>

                  <ul className="space-y-2 mb-6">
                    {plan.features.map((feat, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2 text-xs text-slate-300"
                      >
                        <Check
                          size={14}
                          className="text-emerald-400 shrink-0 mt-0.5"
                        />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {PRO_SALES_OPEN ? (
                  <a
                    href={plan.gumroadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                      isSelected
                        ? 'bg-[#06C755] hover:bg-[#05b34c] text-white shadow-lg shadow-[#06C755]/25'
                        : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                    }`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span>立即線上購買</span>
                    <ExternalLink size={12} />
                  </a>
                ) : (
                  <span className="w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center bg-slate-800 text-slate-400 cursor-default">
                    即將開放購買
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* License Key Activation Section */}
        {PRO_SALES_OPEN && (
        <div className="p-5 rounded-2xl bg-slate-950/70 border border-slate-800">
          <div className="flex items-center gap-2 mb-2 text-xs font-bold text-slate-200">
            <Key size={15} className="text-amber-400" />
            <span>已在 Gumroad 購買？貼上收據中的授權序號立即解鎖：</span>
          </div>

          <form onSubmit={handleActivate} className="flex gap-2">
            <input
              type="text"
              value={licenseInput}
              onChange={(e) => setLicenseInput(e.target.value)}
              placeholder="輸入 Gumroad 授權序號"
              className="flex-1 rounded-xl bg-slate-900 border border-slate-700 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#06C755]"
            />
            <button
              type="submit"
              disabled={isActivating}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs shadow-md transition-all active:scale-95 disabled:opacity-60"
            >
              {isActivating ? '驗證中…' : '啟用授權'}
            </button>
          </form>

          {activationMsg && (
            <div
              className={`mt-3 p-2.5 rounded-xl text-xs font-semibold ${
                activationMsg.isError
                  ? 'bg-red-500/10 border border-red-500/30 text-red-400'
                  : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
              }`}
            >
              {activationMsg.text}
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
};
