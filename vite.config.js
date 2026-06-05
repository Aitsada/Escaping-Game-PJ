import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  server: {
    host: "127.0.0.1",
  },
  base: mode === "github" ? "/Escaping-Game-PJ/" : "/",
}));
