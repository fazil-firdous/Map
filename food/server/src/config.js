// All settings come from environment variables (KEZIA_* in the shared .env on the VPS).
const env = process.env;
const required = (k) => {
  if (!env[k]) throw new Error(`Missing environment variable ${k}`);
  return env[k];
};

module.exports = {
  port: Number(env.PORT || 8090),
  databaseUrl: required("DATABASE_URL"),
  secret: required("APP_SECRET"),                    // long random string, signs OTP hashes
  adminToken: env.ADMIN_TOKEN || "",                 // admin page access
  uploadsDir: env.UPLOADS_DIR || "/data/kezia-uploads",
  corsOrigins: (env.CORS_ORIGINS || "capacitor://localhost,http://localhost,https://localhost").split(",").map(s => s.trim()),
  sms: {
    provider: env.SMS_PROVIDER || "console",         // console | msg91 | 2factor | renflair
    msg91Key: env.MSG91_AUTH_KEY || "",
    msg91Template: env.MSG91_TEMPLATE_ID || "",
    twoFactorKey: env.TWOFACTOR_API_KEY || "",
    renflairKey: env.RENFLAIR_API_KEY || "",
    devReturnCode: env.DEV_RETURN_OTP === "1",       // testing only: returns the OTP in the API response
  },
  // Test accounts with a fixed code and no SMS (local tests only; not set on the live server).
  test: { ownerPhone: env.TEST_OWNER_PHONE || "", customerPhone: env.TEST_CUSTOMER_PHONE || "", code: env.TEST_CODE || "" },
  // The platform owner: admin, sees everything. Logs in by SMS like everyone else (a fixed code only if OWNER_CODE is set).
  owner: { phone: env.OWNER_PHONE || "", code: env.OWNER_CODE || "" },
  // Optional demo login for Play Store reviewers: fixed code, can browse and check out, but its orders never reach a restaurant.
  review: { phone: env.REVIEW_PHONE || "", code: env.REVIEW_CODE || "" },
  // Login SMS cost money: at most this many a day in total (stops anyone draining the SMS balance), and per network per hour.
  smsDailyMax: Number(env.SMS_DAILY_MAX || 400),
  smsPerIpHour: Number(env.SMS_PER_IP_HOUR || 25),
  // Kulgam district (orders only within this box)
  bbox: { minLat: 33.52, maxLat: 33.75, minLon: 74.80, maxLon: 75.15 },
};
