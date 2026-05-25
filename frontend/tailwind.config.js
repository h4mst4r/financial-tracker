/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  // REMOVED safelist - @layer utilities in index.css handle theme classes now
  theme: {
    extend: {
      // REMOVED colors - all theme colors are defined via CSS custom properties in index.css :root
      // This prevents Tailwind from generating hardcoded color utilities that override our @layer classes
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
