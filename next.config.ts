import type { NextConfig } from "next";

// Local phone testing: Next.js 16 blocks LAN dev origins unless they are
// listed here. Set DEV_LAN_ORIGIN to your machine's LAN IP (e.g.
// 192.168.1.67) in .env.local — kept out of the repo so no founder's
// personal IP lands on main.
const devLanOrigin = process.env.DEV_LAN_ORIGIN;

const nextConfig: NextConfig = {
  allowedDevOrigins: devLanOrigin ? [devLanOrigin] : [],
};

export default nextConfig;
