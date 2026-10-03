export const themes = [
  {
    id: 'mint',
    name: '夜色青柠',
    description: '清新青柠 · 深墨绿',
    accent: '#c5f277',
    background: '#121915',
    surface: '#22352b',
  },
  {
    id: 'ocean',
    name: '极光蓝',
    description: '冰川蓝 · 午夜海洋',
    accent: '#7dd3fc',
    background: '#101923',
    surface: '#20364c',
  },
  {
    id: 'violet',
    name: '星云紫',
    description: '柔亮薰衣草 · 深空紫',
    accent: '#c4a0ff',
    background: '#191322',
    surface: '#38264d',
  },
  {
    id: 'coral',
    name: '落日珊瑚',
    description: '暖珊瑚 · 玫瑰暮色',
    accent: '#ffad96',
    background: '#211618',
    surface: '#4b2b32',
  },
  {
    id: 'amber',
    name: '鎏金琥珀',
    description: '柔金琥珀 · 浓醇咖啡',
    accent: '#f6d081',
    background: '#1e1a12',
    surface: '#443822',
  },
  {
    id: 'nebula',
    name: '霓虹星河',
    description: '靛蓝 → 紫罗兰 → 玫瑰',
    accent: '#e2b8ff',
    background: '#18152c',
    surface: '#3b2c63',
    gradient: 'linear-gradient(135deg, #4767d0, #8544c4 50%, #d65391)',
  },
  {
    id: 'sunset',
    name: '暮光落日',
    description: '暖橙 → 珊瑚粉 → 葡萄紫',
    accent: '#ffd6a1',
    background: '#251824',
    surface: '#54313e',
    gradient: 'linear-gradient(135deg, #ee9a60, #cc567a 50%, #61439a)',
  },
  {
    id: 'lagoon',
    name: '流光海湾',
    description: '深海蓝 → 湖水青 → 薄荷',
    accent: '#8cebd7',
    background: '#102427',
    surface: '#1f5054',
    gradient: 'linear-gradient(135deg, #246ca5, #299ca9 50%, #68bda7)',
  },
] as const;
export type ThemeId = (typeof themes)[number]['id'];
export function savedTheme(): ThemeId {
  const saved = localStorage.getItem('playroom-theme');
  return themes.find((theme) => theme.id === saved)?.id ?? 'mint';
}
export function applyTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('playroom-theme', theme);
}
