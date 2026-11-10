/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/api/**/*": ["./.generated/analysis-worker.cjs"]
  },
  allowedDevOrigins: ["127.0.0.1"]
};

export default nextConfig;
