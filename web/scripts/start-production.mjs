const requiredAuthenticationVariables = ["ADMIN_EMAIL", "ADMIN_PASSWORD", "SESSION_SECRET"];
const isProduction = process.env.NODE_ENV === "production";
const authenticationIsConfigured = requiredAuthenticationVariables.every(
  (variable) => process.env[variable]?.trim(),
);

if (!isProduction || !authenticationIsConfigured) {
  console.error("Production authentication configuration is invalid.");
  process.exitCode = 1;
} else {
  await import("../server.js");
}
