// Where each card processor keeps an account's saved cards. Stripe stores a
// PaymentMethod id; AZUL stores the pagos-azul tarjetaId (AZUL's DataVault
// token never leaves pagos-azul).
const COLUMNS = {
  stripe: { primary: 'stripePaymentMethodId', backup: 'stripePaymentMethodIdBackup' },
  azul: { primary: 'azulTarjetaId', backup: 'azulTarjetaIdBackup' },
};

function cardColumn(provider, slot = 'primary') {
  return COLUMNS[provider]?.[slot === 'backup' ? 'backup' : 'primary'] || null;
}

function savedCardId(user, provider, slot = 'primary') {
  const col = cardColumn(provider, slot);
  return (col && user?.[col]) || null;
}

module.exports = { cardColumn, savedCardId, COLUMNS };
