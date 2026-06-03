import { fmtCurrency, fmtNumber } from '../../utils/displayFormat';

export const fmt = (n, ccy = 'EUR') => fmtCurrency(n, ccy);
export const fmtQty = (n) => fmtNumber(n);
