import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  sassOptions: {
    additionalData: `$var: red;`,
    implementation: "sass-embedded",
  },
};

export default nextConfig;
