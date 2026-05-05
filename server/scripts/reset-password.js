require('dotenv').config();
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

// Usage:
//   node server/scripts/reset-password.js <email> '<newPassword>'
// Quote the password to protect special characters from the shell.
const [, , email, newPassword] = process.argv;

if (!email || !newPassword) {
  console.error('Usage: node server/scripts/reset-password.js <email> "<newPassword>"');
  process.exit(1);
}

(async () => {
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.error(`No user found with email: ${email}`);
      process.exit(2);
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed }
    });

    console.log(`Password updated for user #${user.id} (${email}). Role: ${user.role}.`);
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(3);
  } finally {
    await prisma.$disconnect();
  }
})();
