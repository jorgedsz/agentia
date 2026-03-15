const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const products = [
    { name: 'Chatbots', slug: 'chatbots', description: 'AI-powered chatbot agents', monthlyPrice: 0, quarterlyPrice: 0, annualPrice: 0, lifetimePrice: 0, sortOrder: 1 },
    { name: 'Voicebots', slug: 'voicebots', description: 'AI-powered voice agents', monthlyPrice: 0, quarterlyPrice: 0, annualPrice: 0, lifetimePrice: 0, sortOrder: 2 },
    { name: 'CRM Account', slug: 'crm', description: 'Customer Relationship Management', monthlyPrice: 0, quarterlyPrice: 0, annualPrice: 0, lifetimePrice: 0, sortOrder: 3 },
    { name: 'Agent Generator Tool', slug: 'agent-generator', description: 'AI agent creation tool', monthlyPrice: 0, quarterlyPrice: 0, annualPrice: 0, lifetimePrice: 0, sortOrder: 4 },
  ];

  for (const product of products) {
    await prisma.product.upsert({
      where: { slug: product.slug },
      update: { name: product.name, description: product.description, sortOrder: product.sortOrder },
      create: product,
    });
  }

  console.log('Seeded 4 default products');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
