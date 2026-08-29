import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // 大会用オリジナルパレット: 深いコート・グリーン + ボールの蛍光イエロー
        court: {
          50: "#eefaf5",
          100: "#d3f2e5",
          200: "#a8e5cd",
          300: "#71d1ae",
          400: "#3cb78c",
          500: "#1d9b72",
          600: "#117c5c",
          700: "#0e634b",
          800: "#0d4f3d",
          900: "#0b4133",
          950: "#04251d",
        },
        ball: {
          // 50 / 100 は「白の上に ball-500 を薄く重ねた色」を不透明色として持たせたもの。
          // 横スクロールで固定する列の背景に半透明色を使うと、
          // 下を流れるスコアが透けて重なって見えるため、必ず不透明色を使う。
          50: "#fdfae8",
          100: "#f9f4c6",
          400: "#f4e34a",
          500: "#e8d21c",
          600: "#c4ad0c",
        },
        ink: {
          500: "#6b7280",
          700: "#374151",
          900: "#111827",
        },
      },
      fontFamily: {
        sans: [
          "system-ui",
          "-apple-system",
          "Hiragino Sans",
          "Hiragino Kaku Gothic ProN",
          "Noto Sans JP",
          "Meiryo",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px rgba(11, 65, 51, .06), 0 8px 24px -12px rgba(11, 65, 51, .25)",
      },
    },
  },
  plugins: [],
};

export default config;
