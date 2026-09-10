import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// SINGLEFILE=1 → 모든 JS/CSS를 index.html 하나에 인라인 (데모/미리보기용)
export default defineConfig({
  plugins: [react(), ...(process.env.SINGLEFILE ? [viteSingleFile()] : [])],
  build: { target: "es2020" },
});
