/** Greedy debt simplification: minimize number of transfers to zero balances. */

function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

/**
 * @param {{ id: number, name: string, balance: number }[]} balances
 *   balance = shouldPay - paid (positive => owes the group)
 * @returns {{ fromId: number, fromName: string, toId: number, toName: string, amount: number }[]}
 */
function minimizeTransfers(balances) {
  const owe = [];
  const receive = [];

  for (const b of balances) {
    const bal = roundMoney(b.balance);
    if (bal > 0.005) owe.push({ id: b.id, name: b.name, amt: bal });
    if (bal < -0.005) receive.push({ id: b.id, name: b.name, amt: -bal });
  }

  owe.sort((a, c) => c.amt - a.amt);
  receive.sort((a, c) => c.amt - a.amt);

  const transfers = [];
  let i = 0;
  let j = 0;

  while (i < owe.length && j < receive.length) {
    const pay = roundMoney(Math.min(owe[i].amt, receive[j].amt));
    if (pay > 0) {
      transfers.push({
        fromId: owe[i].id,
        fromName: owe[i].name,
        toId: receive[j].id,
        toName: receive[j].name,
        amount: pay,
      });
    }
    owe[i].amt = roundMoney(owe[i].amt - pay);
    receive[j].amt = roundMoney(receive[j].amt - pay);
    if (owe[i].amt <= 0.005) i += 1;
    if (receive[j].amt <= 0.005) j += 1;
  }

  return transfers;
}

module.exports = { minimizeTransfers, roundMoney };
