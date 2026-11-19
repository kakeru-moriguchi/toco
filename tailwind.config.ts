import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // TOCO palette: charcoal, soft gray, white, and warm orange.
        // The existing semantic names are kept so every screen can adopt the new
        // theme without changing its structure or behavior.
        court: {
          50: "#FFF8F2",
          100: "#FDECDC",
          200: "#FBD5B8",
          300: "#F9BD8E",
          400: "#F8AD72",
          500: "#F8A45A",
          600: "#E98A3E",
          700: "#C96E2E",
          800: "#263746",
          900: "#1D2B36",
          950: "#131D25",
        },
        ball: {
          // 50 / 100 remain fully opaque for sticky table columns.
          50: "#F8F9FA",
          100: "#F0F2F3",
          200: "#E2E6E9",
          300: "#D6DCE0",
          400: "#F8AD72",
          500: "#F8A45A",
          600: "#D98444",
        },
        ink: {
          500: "#71808C",
          600: "#596A77",
          700: "#3F515F",
          900: "#263746",
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
        card: "0 1px 2px rgba(38, 55, 70, .06), 0 12px 30px -16px rgba(38, 55, 70, .24)",
      },
    },
  },
  plugins: [],
};

export default config;
