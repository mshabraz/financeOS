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
  const words = String(text).split(' ');
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
  return lines.length ? lines : [''];
}

function measureLayout(ctx, opts) {
  const width = 1080;
  const pad = 48;
  const innerPad = 40;
  const innerW = width - pad * 2 - innerPad * 2;

  const pending = (opts.transfers ?? []).filter((t) => !t.settled);
  const rows = pending.length ? pending : (opts.transfers ?? []);
  const compact = rows.length > 10;
  const lineH = compact ? 50 : 68;
  const rowGap = compact ? 6 : 10;

  ctx.font = 'bold 48px system-ui, Segoe UI, sans-serif';
  const titleLines = wrapText(ctx, opts.eventName, innerW);

  let bodyH = innerPad;
  bodyH += 44; // Settlement label
  bodyH += titleLines.length * (compact ? 42 : 50);
  if (opts.totalSpend != null) bodyH += compact ? 36 : 40;
  bodyH += 24 + 28; // divider + "Who pays whom"
  bodyH += rows.length * (lineH + rowGap);
  if (rows.length === 0) bodyH += 48;
  bodyH += innerPad;

  const cardH = bodyH;
  const height = cardH + pad * 2;

  return {
    width,
    height,
    pad,
    innerPad,
    innerW,
    cardH,
    titleLines,
    rows,
    compact,
    lineH,
    rowGap,
    pending,
  };
}

/**
 * @param {{ eventName: string, currency: string, transfers: Array<{ fromName: string, toName: string, amount: number, settled?: boolean }>, totalSpend?: number }} opts
 */
export function downloadSettlementShareImage(opts) {
  const { eventName, currency = 'EUR', totalSpend } = opts;

  const fmt = (n) =>
    new Intl.NumberFormat('et-EE', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n ?? 0);

  const measureCanvas = document.createElement('canvas');
  measureCanvas.width = 1080;
  measureCanvas.height = 1;
  const measureCtx = measureCanvas.getContext('2d');

  const layout = measureLayout(measureCtx, opts);
  const { width, height, pad, innerPad, innerW, cardH, titleLines, rows, compact, lineH, rowGap, pending } = layout;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#0f172a');
  bg.addColorStop(1, '#1e3a5f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  roundRect(ctx, pad, pad, width - pad * 2, cardH, 24);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  const cardLeft = pad + innerPad;
  const cardRight = width - pad - innerPad;
  let y = pad + innerPad;

  ctx.fillStyle = '#0f766e';
  ctx.font = `bold ${compact ? 32 : 36}px system-ui, Segoe UI, sans-serif`;
  ctx.fillText('Settlement', cardLeft, y + 28);
  y += compact ? 40 : 44;

  ctx.fillStyle = '#111827';
  ctx.font = `bold ${compact ? 40 : 48}px system-ui, Segoe UI, sans-serif`;
  for (const line of titleLines) {
    ctx.fillText(line, cardLeft, y + (compact ? 36 : 42));
    y += compact ? 42 : 50;
  }

  if (totalSpend != null) {
    y += compact ? 6 : 8;
    ctx.fillStyle = '#6b7280';
    ctx.font = `${compact ? 26 : 30}px system-ui, Segoe UI, sans-serif`;
    ctx.fillText(`Total: ${fmt(totalSpend)}`, cardLeft, y + 24);
    y += compact ? 32 : 36;
  }

  y += 12;
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cardLeft, y);
  ctx.lineTo(cardRight, y);
  ctx.stroke();
  y += compact ? 24 : 28;

  if (rows.length === 0) {
    ctx.fillStyle = '#059669';
    ctx.font = `${compact ? 28 : 32}px system-ui, Segoe UI, sans-serif`;
    ctx.fillText('Everyone is settled up!', cardLeft, y + 24);
  } else {
    ctx.fillStyle = '#374151';
    ctx.font = `${compact ? 22 : 26}px system-ui, Segoe UI, sans-serif`;
    const label = pending.length ? 'Who pays whom' : 'Payments (all done)';
    ctx.fillText(label, cardLeft, y + 20);
    y += compact ? 32 : 36;

    const rowH = lineH;
    const nameFont = `bold ${compact ? 26 : 30}px system-ui, Segoe UI, sans-serif`;
    const amtFont = `bold ${compact ? 28 : 32}px system-ui, Segoe UI, sans-serif`;

    for (const t of rows) {
      const boxTop = y;
      roundRect(ctx, cardLeft - 8, boxTop, cardRight - cardLeft + 16, rowH, 12);
      ctx.fillStyle = t.settled ? '#ecfdf5' : '#fff7ed';
      ctx.fill();
      ctx.strokeStyle = t.settled ? '#6ee7b7' : '#fed7aa';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#111827';
      ctx.font = nameFont;
      const who = `${t.fromName}  →  ${t.toName}`;
      const maxNameW = cardRight - cardLeft - 140;
      let displayWho = who;
      if (ctx.measureText(who).width > maxNameW) {
        displayWho = `${t.fromName} → ${t.toName}`;
        while (displayWho.length > 3 && ctx.measureText(`${displayWho}…`).width > maxNameW) {
          displayWho = displayWho.slice(0, -1);
        }
        displayWho = `${displayWho}…`;
      }
      ctx.fillText(displayWho, cardLeft + 4, boxTop + rowH / 2 + 10);

      ctx.fillStyle = '#0d9488';
      ctx.font = amtFont;
      const amt = fmt(t.amount);
      ctx.fillText(amt, cardRight - ctx.measureText(amt).width - 4, boxTop + rowH / 2 + 10);

      y += rowH + rowGap;
    }
  }

  const safeName = eventName.replace(/[^\w\s-]/g, '').trim().slice(0, 40) || 'settlement';
  const link = document.createElement('a');
  link.download = `${safeName}-settlement.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
