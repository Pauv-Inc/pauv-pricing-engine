import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright must not be bundled by Next — it's a heavy native dep used only in
  // the Node runtime of /api/discover (local machine, residential IP).
  serverExternalPackages: ["playwright"],
};

export default nextConfig;
