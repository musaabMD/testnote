import type { NextConfig } from "next";

type ProxyClientMaxBodySize = NonNullable<
  NonNullable<NextConfig["experimental"]>["proxyClientMaxBodySize"]
>;

function getProxyClientMaxBodySize(): ProxyClientMaxBodySize {
  const value = process.env.NEXT_PROXY_CLIENT_MAX_BODY_SIZE;
  if (!value) return "500mb";
  if (/^\d+(b|kb|mb|gb)$/.test(value)) return value as ProxyClientMaxBodySize;

  const bytes = Number(value);
  if (Number.isSafeInteger(bytes) && bytes > 0) return bytes;

  throw new Error(
    "NEXT_PROXY_CLIENT_MAX_BODY_SIZE must be a positive byte count or a size string like 500mb.",
  );
}

const proxyClientMaxBodySize = getProxyClientMaxBodySize();

const nextConfig: NextConfig = {
  experimental: {
    proxyClientMaxBodySize,
  },
  transpilePackages: ["pdfjs-dist"],
  async redirects() {
    return [
      {
        source: "/pdf/pdfview/:path*",
        destination: "/dashboard/content/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
