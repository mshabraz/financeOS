/**
 * Renders a shareable settlement PNG for group chats (no extra dependencies).
 */

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * @param {{ eventName: string, currency: string, transfers: Array<{ fromName: string, toName: string, amount: number, settled?: boolean }>, totalSpend?: number }} opts
 */
export function downloadSettlementShareImage(opts) {
  const {
    eventName,
    currency = 'EUR',
    transfers = [],
    totalSpend,
  } = opts;

  const fmt = (n) =>
    new Intl.NumberFormat('et-EE', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n ?? 0);

  const width = 1080;
  const pad = 48;
  const lineH = 72;
  const headerH = 200;
  const pending = transfers.filter((t) => !t.settled);
  const rows = pending.length ? pending : transfers;
  const height = headerH + Math.max(rows.length, 1) * lineH + pad + 32;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#0f172a');
  bg.addColorStop(1, '#1e3a5f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  roundRect(ctx, pad, pad, width - pad * 2, height - pad * 2, 24);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  let y = pad + 56;
  ctx.fillStyle = '#0f766e';
  ctx.font = 'bold 40px system-ui, Segoe UI, sans-serif';
  ctx.fillText('💸 Settlement', pad + 40, y);

  y += 52;
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 48px system-ui, Segoe UI, sans-serif';
  const titleLines = wrapText(ctx, eventName, width - pad * 2 - 80);
  for (const line of titleLines) {
    ctx.fillText(line, pad + 40, y);
    y += 54;
  }

  if (totalSpend != null) {
    y += 8;
    ctx.fillStyle = '#6b7280';
    ctx.font = '32px system-ui, Segoe UI, sans-serif';
    ctx.fillText(`Total: ${fmt(totalSpend)}`, pad + 40, y);
    y += 44;
  }

  y += 16;
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad + 40, y);
  ctx.lineTo(width - pad - 40, y);
  ctx.stroke();
  y += 40;

  if (rows.length === 0) {
    ctx.fillStyle = '#059669';
    ctx.font = '36px system-ui, Segoe UI, sans-serif';
    ctx.fillText('✓ Everyone is settled up!', pad + 40, y + 20);
  } else {
    ctx.fillStyle = '#374151';
    ctx.font = '28px system-ui, Segoe UI, sans-serif';
    const label = pending.length ? 'Who pays whom' : 'Payments (all done)';
    ctx.fillText(label, pad + 40, y);
    y += 48;

    for (const t of rows) {
      roundRect(ctx, pad + 32, y - 36, width - pad * 2 - 64, lineH - 12, 14);
      ctx.fillStyle = t.settled ? '#ecfdf5' : '#fff7ed';
      ctx.fill();
      ctx.strokeStyle = t.settled ? '#6ee7b7' : '#fed7aa';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#111827';
      ctx.font = 'bold 34px system-ui, Segoe UI, sans-serif';
      const who = `${t.fromName}  →  ${t.toName}`;
      ctx.fillText(who, pad + 56, y + 8);

      ctx.fillStyle = '#0d9488';
      ctx.font = 'bold 38px system-ui, Segoe UI, sans-serif';
      const amt = fmt(t.amount);
      ctx.fillText(amt, width - pad - 56 - ctx.measureText(amt).width, y + 8);

      y += lineH;
    }
  }

  const safeName = eventName.replace(/[^\w\s-]/g, '').trim().slice(0, 40) || 'settlement';
  const link = document.createElement('a');
  link.download = `${safeName}-settlement.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
