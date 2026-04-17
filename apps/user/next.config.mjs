/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@lucky/ui", "@lucky/schemas", "@lucky/api-types"],
};

export default nextConfig;
