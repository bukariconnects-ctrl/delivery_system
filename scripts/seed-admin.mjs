// Seed script: creates ibro@gmail.com admin account
// Usage: node scripts/seed-admin.mjs

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing env vars. Run with:");
  console.error(
    '  $env:NEXT_PUBLIC_SUPABASE_URL="..."; $env:SUPABASE_SERVICE_ROLE_KEY="..."; node scripts/seed-admin.mjs'
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const email = "ibro@gmail.com";
  const password = "admin123";

  // 1. Try to create the user (may already exist)
  console.log(`Creating user ${email}...`);
  const { data: created, error: createErr } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "System Admin" },
    });

  let userId;
  if (createErr) {
    if (createErr.message.includes("already been registered")) {
      console.log("User already exists, fetching...");
      const { data: list } = await supabase.auth.admin.listUsers();
      const existing = list?.users?.find((u) => u.email === email);
      if (!existing) {
        console.error("Could not find existing user");
        process.exit(1);
      }
      userId = existing.id;
    } else {
      console.error("Create user error:", createErr.message);
      process.exit(1);
    }
  } else {
    userId = created.user.id;
    console.log("User created:", userId);
  }

  // 2. Update profile to admin role
  console.log(`Setting role to admin for ${userId}...`);
  const { error: updateErr } = await supabase
    .from("profiles")
    .update({ role: "admin", full_name: "System Admin" })
    .eq("id", userId);

  if (updateErr) {
    console.error("Update profile error:", updateErr.message);
    process.exit(1);
  }

  console.log("✅ Admin account seeded successfully!");
  console.log(`   Email: ${email}`);
  console.log(`   Password: ${password}`);
  console.log(`   Role: admin`);
}

main();
