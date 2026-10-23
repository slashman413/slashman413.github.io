// Vector & High Quality LINE Style Stickers
export interface StickerItem {
  id: string;
  name: string;
  svg: string;
}

export const STICKERS: StickerItem[] = [
  {
    id: 'bear-thumbs-up',
    name: '熊大讚',
    svg: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <circle cx="60" cy="65" r="45" fill="#8B5A2B"/>
      <circle cx="30" cy="30" r="16" fill="#8B5A2B"/>
      <circle cx="90" cy="30" r="16" fill="#8B5A2B"/>
      <circle cx="30" cy="30" r="9" fill="#D2B48C"/>
      <circle cx="90" cy="30" r="9" fill="#D2B48C"/>
      <ellipse cx="60" cy="72" rx="20" ry="14" fill="#D2B48C"/>
      <ellipse cx="60" cy="67" rx="6" ry="4" fill="#3D2314"/>
      <circle cx="45" cy="58" r="4.5" fill="#3D2314"/>
      <circle cx="75" cy="58" r="4.5" fill="#3D2314"/>
      <!-- Thumbs up hand -->
      <g transform="translate(75, 65)">
        <rect x="0" y="10" width="22" height="18" rx="8" fill="#8B5A2B"/>
        <rect x="8" y="0" width="12" height="22" rx="6" fill="#8B5A2B"/>
        <circle cx="14" cy="6" r="5" fill="#A0693B"/>
      </g>
      <text x="60" y="112" text-anchor="middle" font-size="12" font-weight="bold" fill="#06C755">讚啦！</text>
    </svg>`,
  },
  {
    id: 'cony-love',
    name: '兔兔愛心',
    svg: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="44" cy="25" rx="8" ry="24" fill="#FFFFFF" stroke="#E5E7EB" stroke-width="2"/>
      <ellipse cx="76" cy="25" rx="8" ry="24" fill="#FFFFFF" stroke="#E5E7EB" stroke-width="2"/>
      <ellipse cx="44" cy="26" rx="4" ry="16" fill="#FFB6C1"/>
      <ellipse cx="76" cy="26" rx="4" ry="16" fill="#FFB6C1"/>
      <circle cx="60" cy="66" r="40" fill="#FFFFFF" stroke="#E5E7EB" stroke-width="2"/>
      <circle cx="48" cy="62" r="4" fill="#1F2937"/>
      <circle cx="72" cy="62" r="4" fill="#1F2937"/>
      <ellipse cx="60" cy="69" rx="4" ry="3" fill="#FF69B4"/>
      <path d="M 52 74 Q 60 82 68 74" stroke="#1F2937" stroke-width="2" fill="none"/>
      <!-- Blushing cheeks -->
      <circle cx="40" cy="69" r="6" fill="#FFB6C1" opacity="0.8"/>
      <circle cx="80" cy="69" r="6" fill="#FFB6C1" opacity="0.8"/>
      <!-- Big Red Heart -->
      <path d="M 60 90 C 60 90, 48 80, 48 72 C 48 66, 54 62, 60 68 C 66 62, 72 66, 72 72 C 72 80, 60 90, 60 90 Z" fill="#EF4444" transform="translate(25, -20) scale(1.1)"/>
    </svg>`,
  },
  {
    id: 'sally-shock',
    name: '莎莉震驚',
    svg: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <circle cx="60" cy="65" r="42" fill="#FACC15"/>
      <ellipse cx="60" cy="74" rx="16" ry="10" fill="#FB923C"/>
      <circle cx="56" cy="73" r="1.5" fill="#7C2D12"/>
      <circle cx="64" cy="73" r="1.5" fill="#7C2D12"/>
      <circle cx="46" cy="56" r="6.5" fill="#FFFFFF"/>
      <circle cx="46" cy="56" r="3.5" fill="#1E293B"/>
      <circle cx="74" cy="56" r="6.5" fill="#FFFFFF"/>
      <circle cx="74" cy="56" r="3.5" fill="#1E293B"/>
      <!-- shock marks -->
      <line x1="32" y1="40" x2="24" y2="34" stroke="#0284C7" stroke-width="3" stroke-linecap="round"/>
      <line x1="88" y1="40" x2="96" y2="34" stroke="#0284C7" stroke-width="3" stroke-linecap="round"/>
      <text x="60" y="112" text-anchor="middle" font-size="12" font-weight="bold" fill="#EAB308">什麼？！</text>
    </svg>`,
  },
  {
    id: 'moon-laugh',
    name: '饅頭人狂笑',
    svg: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <circle cx="60" cy="60" r="44" fill="#FFFFFF" stroke="#D1D5DB" stroke-width="2.5"/>
      <!-- Closed curved eyes laughing -->
      <path d="M 40 50 Q 48 42 56 50" stroke="#1F2937" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <path d="M 64 50 Q 72 42 80 50" stroke="#1F2937" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <!-- Big open laughing mouth -->
      <path d="M 42 64 Q 60 94 78 64 Z" fill="#DC2626"/>
      <path d="M 50 78 Q 60 88 70 78 Z" fill="#F87171"/>
      <!-- Tears of joy -->
      <ellipse cx="32" cy="56" rx="4" ry="7" fill="#38BDF8" transform="rotate(-20 32 56)"/>
      <ellipse cx="88" cy="56" rx="4" ry="7" fill="#38BDF8" transform="rotate(20 88 56)"/>
      <text x="60" y="114" text-anchor="middle" font-size="12" font-weight="bold" fill="#3B82F6">哈哈哈哈</text>
    </svg>`,
  },
  {
    id: 'bear-crying',
    name: '熊大抱歉',
    svg: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <circle cx="60" cy="65" r="45" fill="#8B5A2B"/>
      <circle cx="30" cy="30" r="16" fill="#8B5A2B"/>
      <circle cx="90" cy="30" r="16" fill="#8B5A2B"/>
      <circle cx="30" cy="30" r="9" fill="#D2B48C"/>
      <circle cx="90" cy="30" r="9" fill="#D2B48C"/>
      <ellipse cx="60" cy="74" rx="20" ry="14" fill="#D2B48C"/>
      <ellipse cx="60" cy="69" rx="6" ry="4" fill="#3D2314"/>
      <circle cx="45" cy="62" r="4.5" fill="#3D2314"/>
      <circle cx="75" cy="62" r="4.5" fill="#3D2314"/>
      <!-- Waterfall tears -->
      <path d="M 45 66 C 45 78, 38 90, 38 100" stroke="#38BDF8" stroke-width="4" stroke-linecap="round" fill="none"/>
      <path d="M 75 66 C 75 78, 82 90, 82 100" stroke="#38BDF8" stroke-width="4" stroke-linecap="round" fill="none"/>
      <text x="60" y="112" text-anchor="middle" font-size="12" font-weight="bold" fill="#EF4444">對不起啦</text>
    </svg>`,
  },
  {
    id: 'ok-stamp',
    name: 'LINE OK 圓章',
    svg: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <circle cx="60" cy="60" r="46" fill="#06C755"/>
      <circle cx="60" cy="60" r="40" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-dasharray="6,4"/>
      <text x="60" y="68" text-anchor="middle" font-size="30" font-weight="900" fill="#FFFFFF" font-family="Arial, sans-serif">OK!</text>
      <path d="M 45 76 L 55 86 L 75 66" stroke="#FFFFFF" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  },
];
