// A saved card as people recognise it: "Visa •••• 4242".
const BRANDS = {
  visa: 'Visa', mastercard: 'Mastercard', amex: 'Amex', american_express: 'Amex',
  discover: 'Discover', diners: 'Diners', jcb: 'JCB', unionpay: 'UnionPay',
}

export function cardLabel(card) {
  if (!card || !card.last4) return ''
  const brand = card.brand ? (BRANDS[card.brand] || card.brand.charAt(0).toUpperCase() + card.brand.slice(1)) : 'Tarjeta'
  return `${brand} •••• ${card.last4}`
}
