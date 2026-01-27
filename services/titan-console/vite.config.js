import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import { componentTagger } from "lovable-tagger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
    server: {
        host: "::",
        port: 3001,
    },
    preview: {
        host: "0.0.0.0",
        port: process.env.PORT ? parseInt(process.env.PORT) : 8080,
        allowedHosts: true,
        // Allow all hosts in production (configured via reverse proxy)
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
}));
//# sourceMappingURL=vite.config.js.map