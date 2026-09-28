/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        abyss: '#2f4858',   // deepest water — chrome, dark surfaces
        current: '#33658a', // mid-column — primary UI
        surface: '#86bbd8', // sea surface — accents, cool highlights
        warmwater: '#f6ae2d', // rising heat — warnings, mid anomaly
        hotspot: '#f26419',   // marine heatwave — alerts, hot anomaly
      },
      fontFamily: {
        display: ['Inter', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}
