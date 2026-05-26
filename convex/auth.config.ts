import type { AuthConfig } from "convex/server";

const issuerDomains = [
  process.env.CLERK_JWT_ISSUER_DOMAIN,
  process.env.CLERK_JWT_ISSUER_DOMAIN_DEV,
].filter((domain): domain is string => Boolean(domain));

export default {
  providers: issuerDomains.map((domain) => ({
    domain,
    applicationID: "convex",
  })),
} satisfies AuthConfig;
