export function getSiteUrl() {
  // Prefer explicit env in production (Vercel)
  const envUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_VERCEL_URL;
 
  if (envUrl) {
    const withProto = envUrl.startsWith("http") ? envUrl : `https://${envUrl}`;
    return withProto.replace(/\/$/, "");
  }
 
  // Fallback to browser origin in dev
  if (typeof window !== "undefined") return window.location.origin;
 
  return "http://localhost:3000";
}