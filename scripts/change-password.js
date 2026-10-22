import "dotenv/config";
import { connect } from "../lib/db.js";
import bcrypt from "bcryptjs";

const sql = connect(process.env.DATABASE_URL);

async function changePassword() {
  const username = process.argv[2];
  const newPassword = process.argv[3];

  if (!username || !newPassword) {
    console.log("Usage: node scripts/change-password.js <username> <new_password>");
    process.exit(1);
  }

  try {
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    const result = await sql`
      UPDATE users 
      SET password = ${hashedPassword} 
      WHERE username = ${username.toLowerCase().trim()}
      RETURNING id, name, username
    `;

    if (result.length === 0) {
      console.error(`❌ User '${username}' not found.`);
    } else {
      console.log(`✅ Password updated for ${result[0].name} (${result[0].username})`);
    }
  } catch (error) {
    console.error("❌ Error updating password:", error);
  }
}

changePassword().finally(() => sql.end());
