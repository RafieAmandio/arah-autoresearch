import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Standalone only under Docker. Vercel builds through its own Build Output
     API, and setting this unconditionally would change that path for no gain.
     DOCKER_BUILD=1 is set only in the Dockerfile, so the move to the VPS is a
     build flag rather than an edit. */
  output: process.env.DOCKER_BUILD ? "standalone" : undefined,
};

export default nextConfig;
