// Whether an account is allowed to keep making calls / sending messages while
// its balance is negative. The flag is inherited down the ownership chain
// (self → agency → whitelabel): setting it on a whitelabel (e.g. LM Consulting)
// lets every account created under it operate on credit. Returns true as soon
// as any ancestor has it enabled.
async function allowsNegativeBalance(prisma, userId) {
  if (!userId) return false;
  const seen = new Set();
  let current = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, allowNegativeBalance: true, agencyId: true, whitelabelId: true },
  });
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.allowNegativeBalance) return true;
    const parentId = current.agencyId || current.whitelabelId;
    if (!parentId) break;
    current = await prisma.user.findUnique({
      where: { id: parentId },
      select: { id: true, allowNegativeBalance: true, agencyId: true, whitelabelId: true },
    });
  }
  return false;
}

module.exports = { allowsNegativeBalance };
