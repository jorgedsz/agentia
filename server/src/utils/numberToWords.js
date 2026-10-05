// The "TOTAL A PAGAR EN LETRAS" band on the invoice.
//
// Dominican invoices spell the whole units and leave the cents as a fraction:
// "CIENTO VEINTISIETE DÓLARES CON 00/100". Amounts here are invoice totals -
// credit top-ups and monthly settlements - so a million is not expected. This
// function does not spell millions: an amount of 1,000,000 or more throws
// rather than silently producing wrong words (the thousands logic below only
// covers 0-999,999).

const { round2 } = require('./taxes');

const UNITS = ['CERO', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE',
  'VEINTE', 'VEINTIUN', 'VEINTIDOS', 'VEINTITRES', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISEIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
const TENS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const HUNDREDS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS',
  'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

/** 0–999 in words. */
function underThousand(n) {
  if (n === 100) return 'CIEN';
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts = [];
  if (h > 0) parts.push(HUNDREDS[h]);
  if (rest > 0) {
    if (rest < 30) parts.push(UNITS[rest]);
    else {
      const t = Math.floor(rest / 10);
      const u = rest % 10;
      parts.push(u > 0 ? `${TENS[t]} Y ${UNITS[u]}` : TENS[t]);
    }
  }
  if (parts.length === 0) return UNITS[0];
  return parts.join(' ');
}

/** 0–999,999 in words. */
function wholeInWords(n) {
  if (n < 1000) return underThousand(n);
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  const head = thousands === 1 ? 'MIL' : `${underThousand(thousands)} MIL`;
  return rest > 0 ? `${head} ${underThousand(rest)}` : head;
}

/**
 * "CIENTO VEINTISIETE DÓLARES CON 00/100".
 * `currency` lets another invoice currency pass its own pair of words.
 *
 * Cents come from round2 (the same cash-register rounding used for charges
 * and tax, see taxes.js) rather than a flat Number.EPSILON nudge - a flat
 * nudge is magnitude-dependent and gives the wrong cent at values like 1.005
 * or 0.145 (rounds half a cent DOWN instead of up).
 *
 * Throws a RangeError for 1,000,000 or more - out of scope for an invoice
 * total here, and silently spelling it would be wrong (see file header).
 */
function amountToSpanishWords(amount, currency = { one: 'DÓLAR', many: 'DÓLARES' }) {
  const rounded = round2(amount);
  if (rounded >= 1000000) {
    throw new RangeError(`amountToSpanishWords: ${amount} is out of range - amounts of 1,000,000 or more are not spelled out`);
  }
  const cents = Math.round(rounded * 100);
  const whole = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, '0');
  const noun = whole === 1 ? currency.one : currency.many;
  return `${wholeInWords(whole)} ${noun} CON ${fraction}/100`;
}

module.exports = { amountToSpanishWords, wholeInWords };
