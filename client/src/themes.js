export const THEMES = [
  {
    id: 'classic',
    label: 'Classic',
    mode: 'light',
    board: { light: '#f0d9b5', dark: '#b58863' },
    pieces: 'cburnett',
    ui: {
      bg: '#f8fafc',
      primary: '#2563eb',
      card: '#ffffff',
      text: '#1e293b',
      textMuted: '#64748b',
      border: '#e2e8f0',
    }
  },
  {
    id: 'ocean',
    label: 'Ocean',
    mode: 'dark',
    board: { light: '#dee3e6', dark: '#8ca2ad' },
    pieces: 'merida',
    ui: {
      bg: '#0f172a',
      primary: '#0891b2',
      card: '#1e293b',
      text: '#e2e8f0',
      textMuted: '#94a3b8',
      border: '#334155',
    }
  },
  {
    id: 'forest',
    label: 'Forest',
    mode: 'light',
    board: { light: '#ffffdd', dark: '#86a666' },
    pieces: 'cburnett',
    ui: {
      bg: '#f0fdf4',
      primary: '#16a34a',
      card: '#ffffff',
      text: '#14532d',
      textMuted: '#4d7c5f',
      border: '#bbf7d0',
    }
  },
  {
    id: 'lava',
    label: 'Lava',
    mode: 'dark',
    board: { light: '#f8d9b0', dark: '#b8532a' },
    pieces: 'alpha',
    ui: {
      bg: '#1c0a00',
      primary: '#ea580c',
      card: '#2c1400',
      text: '#fed7aa',
      textMuted: '#c2795a',
      border: '#451a00',
    }
  },
  {
    id: 'ice',
    label: 'Ice',
    mode: 'light',
    board: { light: '#e8f4f8', dark: '#6699bb' },
    pieces: 'cburnett',
    ui: {
      bg: '#f0f9ff',
      primary: '#0284c7',
      card: '#ffffff',
      text: '#0c4a6e',
      textMuted: '#4b7690',
      border: '#bae6fd',
    }
  },
  {
    id: 'midnight',
    label: 'Midnight',
    mode: 'dark',
    board: { light: '#b0b7c4', dark: '#3d4a60' },
    pieces: 'california',
    ui: {
      bg: '#0d1117',
      primary: '#7c3aed',
      card: '#161b22',
      text: '#c9d1d9',
      textMuted: '#8b949e',
      border: '#30363d',
    }
  },
];

export const PIECE_SETS = ['cburnett', 'merida', 'alpha', 'california', 'kosal'];

// Pieces are loaded from Lichess CDN: https://lichess1.org/assets/piece/{set}/{piece}.svg
// Available sets: cburnett, merida, alpha, california, kosal, chess7, chessnut, companion,
//                 dubrovny, fantasy, fresca, gioco, governor, horsey, icpieces, maestro, pirouetti,
//                 pixel, reillycraig, shapes, spatial, staunty, tatiana

export const getRandomTheme = () =>
  THEMES[Math.floor(Math.random() * THEMES.length)];
