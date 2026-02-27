/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Console dark palette
        console: {
          bg: '#0f0f0f',
          panel: '#1a1a1a',
          border: '#2a2a2a',
          muted: '#3a3a3a',
          text: '#e0e0e0',
          dim: '#888888',
          accent: '#f59e0b',    // amber — cue active
          active: '#3b82f6',    // blue — programmer active
          danger: '#ef4444',    // red — conflict / blackout
          success: '#22c55e',   // green — go
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
};
