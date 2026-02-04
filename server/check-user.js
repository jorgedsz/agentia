const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: 'owner@admin.com' }
  });

  if (!user) {
    console.log('User not found!');
    return;
  }

  console.log('User found:', { id: user.id, email: user.email, name: user.name, role: user.role });

  const isValid = await bcrypt.compare('test123', user.password);
  console.log('Password test123 valid:', isValid);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
});
