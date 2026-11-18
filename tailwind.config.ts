import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // TOCO palette: energetic orange, warm beige, ivory, and dark brown.
        // The existing semantic names are kept so every screen can adopt the new
        // theme without changing its structure or behavior.
        court: {
          50: "#FFF7F0",
          100: "#FEE9D8",
          200: "#FCD0AE",
          300: "#FAB17C",
          400: "#F78F45",
          500: "#F47721",
          600: "#D95D12",
          700: "#B7470C",
          800: "#923A10",
          900: "#783212",
          950: "#411607",
        },
        ball: {
          // 50 / 100 remain fully opaque for sticky table columns.
          50: "#FBF5ED",
          100: "#F5EBDD",
          200: "#EFDFCC",
          300: "#EBDCC9",
          400: "#EAD9C4",
          500: "#EAD9C4",
          600: "#D4B995",
        },
        ink: {
          500: "#7A7068",
          600: "#635A53",
          700: "#4B433D",
          900: "#292420",
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
        card: "0 1px 2px rgba(80, 45, 20, .05), 0 12px 30px -16px rgba(117, 65, 26, .24)",
      },
    },
  },
  plugins: [],
};

export default config;
