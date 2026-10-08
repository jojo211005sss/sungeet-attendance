import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set in .env");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === "--list" || args[0] === "-l") {
    try {
      const users = await sql`SELECT id, name, username, role FROM users ORDER BY id ASC`;
      console.log("\n📋 Existing Users in Database:");
      console.table(users);
    } catch (err) {
      console.error("❌ Failed to fetch users:", err.message);
    }
    return;
  }

  const username = args[0]?.trim().toLowerCase();
  const password = args[1];
  const role = args[2]?.trim().toLowerCase() || "admin";
  const name = args[3]?.trim() || username;

  if (!username || !password) {
    console.log(`
Usage:
  node scripts/set-user.js <username> <password> [role] [name]
  node scripts/set-user.js --list

Examples:
  node scripts/set-user.js admin@sunggeet.com MySecret123 admin "SUNGGEET Admin"
  node scripts/set-user.js manager1 MyPass456 manager "John Manager"
  node scripts/set-user.js employee1 MyPass789 employee "Alice Singer"
  node scripts/set-user.js superior1 SuperPass! superior "Head Admin"

Available roles: employee, manager, admin, superior
`);
    process.exit(1);
  }

  const validRoles = ["employee", "manager", "admin", "superior"];
  if (!validRoles.includes(role)) {
    console.error(`❌ Invalid role: '${role}'. Must be one of: ${validRoles.join(", ")}`);
    process.exit(1);
  }

  try {
    const hashedPassword = bcrypt.hashSync(password, 10);
    const existing = await sql`SELECT id, name, username, role FROM users WHERE username = ${username}`;

    if (existing.length > 0) {
      const updated = await sql`
        UPDATE users
        SET password = ${hashedPassword}, role = ${role}, name = ${name}
        WHERE username = ${username}
        RETURNING id, name, username, role
      `;
      console.log(`\n✅ Updated existing user:`);
      console.table(updated);
    } else {
      const inserted = await sql`
        INSERT INTO users (name, username, password, role)
        VALUES (${name}, ${username}, ${hashedPassword}, ${role})
        RETURNING id, name, username, role
      `;
      console.log(`\n🎉 Successfully created new user:`);
      console.table(inserted);
    }

    // Fix sequences if necessary
    try {
      await sql`SELECT setval('users_id_seq', (SELECT COALESCE(MAX(id), 1) FROM users))`;
    } catch (_) {}
  } catch (err) {
    console.error("❌ Error setting user:", err.message);
  }
}

main();
