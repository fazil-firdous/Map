// All settings come from environment variables (see .env.example).
const env = process.env;
const required = (k) => {
  if (!env[k]) throw new Error(`Missing environment variable ${k}`);
  return env[k];
};

module.exports = {
  port: Number(env.PORT || 8080),
  databaseUrl: required("DATABASE_URL"),
  secret: required("APP_SECRET"),                    // long random string, signs OTP hashes
  adminToken: env.ADMIN_TOKEN || "",                 // bootstrap admin access for the moderation page
  uploadsDir: env.UPLOADS_DIR || "/data/uploads",
  publicUrl: env.PUBLIC_URL || "http://localhost:8080",
  corsOrigins: (env.CORS_ORIGINS || "capacitor://localhost,http://localhost,https://localhost").split(",").map(s => s.trim()),
  sms: {
    provider: env.SMS_PROVIDER || "console",         // console | msg91 | 2factor
    msg91Key: env.MSG91_AUTH_KEY || "",
    msg91Template: env.MSG91_TEMPLATE_ID || "",
    twoFactorKey: env.TWOFACTOR_API_KEY || "",
    devReturnCode: env.DEV_RETURN_OTP === "1",       // testing only: returns the OTP in the API response
  },
  // Places within this box only (Srinagar and surroundings)
  bbox: { minLat: 33.9, maxLat: 34.3, minLon: 74.6, maxLon: 75.0 },
};
