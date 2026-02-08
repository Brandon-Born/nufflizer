import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef5ff",
          100: "#d9e7ff",
          500: "#2758cc",
          700: "#1e4299",
          900: "#12274d"
        }
      }
    }
  },
  plugins: []
};

export default config;
