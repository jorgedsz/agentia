require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function createOwner() {
  const email = process.argv[2] || 'owner@admin.com';
  const password = process.argv[3] || 'owner123';
  const name = process.argv[4] || 'Owner';

  try {
    // Check if owner exists
    const existingOwner = await prisma.user.findFirst({
      where: { role: 'OWNER' }
    });

    if (existingOwner) {
      console.log('Owner already exists:', existingOwner.email);
      return;
    }

    // Check if email is taken
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      console.log('Email already registered. Updating to OWNER role...');
      await prisma.user.update({
        where: { email },
        data: { role: 'OWNER' }
      });
      console.log('User upgraded to OWNER:', email);
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const owner = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: 'OWNER'
      }
    });

    console.log('Owner account created successfully!');
    console.log('Email:', owner.email);
    console.log('Password:', password);
    console.log('Role:', owner.role);
  } catch (error) {
    console.error('Error creating owner:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createOwner();
