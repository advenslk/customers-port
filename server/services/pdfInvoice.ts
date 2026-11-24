import PDFDocument from 'pdfkit';
import { db } from '../db';

export function formatMoney(cents: number, currency = 'USD'): string {
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export async function generateInvoicePdfBuffer(invoiceId: number): Promise<{ buffer: Buffer; invoiceNumber: string } | null> {
  const invoice = db
    .prepare(`
      SELECT i.*, o.order_number
      FROM invoices i
      LEFT JOIN orders o ON o.id = i.order_id
      WHERE i.id = ?
    `)
    .get(invoiceId) as any;

  if (!invoice) return null;

  const items = db
    .prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id ASC')
    .all(invoiceId) as any[];

  const settingsRows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
  const settings: Record<string, string> = {};
  for (const r of settingsRows) settings[r.key] = r.value;

  let billing: any = {};
  try {
    billing = JSON.parse(invoice.billing_snapshot_json || '{}');
  } catch {
    billing = {};
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      info: {
        Title: `Invoice ${invoice.invoice_number} — HelzerX Technologies`,
        Author: 'HelzerX Technologies',
        Subject: `Invoice ${invoice.invoice_number}`,
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), invoiceNumber: invoice.invoice_number }));
    doc.on('error', reject);

    const W = doc.page.width; // 595.28
    const H = doc.page.height; // 841.89
    const padX = 44;

    // 1. Pure obsidian black page canvas
    doc.rect(0, 0, W, H).fill('#000000');

    // 2. Top sculpted cobalt-blue to molten-amber-red metallic ribbon wave banner (matching reference image 2)
    doc.save();
    const blueGrad = doc.linearGradient(0, 0, W * 0.52, 130);
    blueGrad.stop(0, '#071426').stop(0.45, '#1D4E89').stop(1, '#05080E');
    doc.moveTo(0, 52)
      .bezierCurveTo(W * 0.16, 40, W * 0.34, 18, W * 0.56, 78)
      .bezierCurveTo(W * 0.4, 128, W * 0.18, 122, 0, 108)
      .closePath()
      .fill(blueGrad);

    const ribbonGrad = doc.linearGradient(W * 0.25, 10, W, 115);
    ribbonGrad
      .stop(0, '#0B1B32')
      .stop(0.32, '#2B110B')
      .stop(0.62, '#B93815')
      .stop(0.85, '#FF6B2C')
      .stop(1, '#EA580C');

    doc.moveTo(W * 0.22, 122)
      .bezierCurveTo(W * 0.34, 14, W * 0.56, 8, W * 0.78, 56)
      .bezierCurveTo(W * 0.9, 80, W * 0.96, 88, W, 86)
      .lineTo(W, 24)
      .bezierCurveTo(W * 0.88, 18, W * 0.74, 2, W * 0.52, 4)
      .bezierCurveTo(W * 0.32, 6, W * 0.2, 62, W * 0.14, 126)
      .closePath()
      .fill(ribbonGrad);

    // Subtle dark fold shadow for 3D depth
    doc.moveTo(W * 0.23, 124)
      .bezierCurveTo(W * 0.35, 34, W * 0.54, 24, W * 0.72, 74)
      .bezierCurveTo(W * 0.84, 106, W * 0.93, 116, W, 118)
      .lineTo(W, 136)
      .lineTo(W * 0.18, 136)
      .closePath()
      .fillOpacity(0.75)
      .fill('#000000');
    doc.restore();
    doc.fillOpacity(1);

    // 3. Top Header Row: White circular HX emblem (left) & Invoice Number (right)
    const emblemX = padX + 18;
    const emblemY = 148;
    doc.circle(emblemX, emblemY, 17).fill('#FFFFFF');
    doc.fillColor('#000000').font('Helvetica-Bold').fontSize(12).text('HX', emblemX - 10, emblemY - 5, { width: 20, align: 'center' });

    doc.fillColor('#E4E4E7')
      .font('Helvetica-Bold')
      .fontSize(11)
      .text(invoice.invoice_number, padX, emblemY - 6, { width: W - padX * 2, align: 'right' });

    // Status line directly under invoice number
    doc.fillColor(invoice.status === 'Paid' ? '#4ADE80' : invoice.status === 'Pending Verification' ? '#FB923C' : '#A1A1AA')
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .text(`STATUS: ${String(invoice.status).toUpperCase()}`, padX, emblemY + 9, { width: W - padX * 2, align: 'right' });

    // 4. Giant Bold Display Title: INVOICE
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(42).text('INVOICE', padX, 188, { characterSpacing: 1.2 });

    // 5. Three-column metadata block: FROM | BILL TO | ISSUED / DUE
    const metaY = 256;
    const col1W = 190;
    const col2W = 190;
    const col3X = padX + col1W + col2W + 16;
    const col3W = W - padX - col3X;

    // FROM
    doc.fillColor('#71717A').font('Helvetica-Bold').fontSize(8).text('FROM', padX, metaY);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(10.5).text(settings.company_name || 'HelzerX Technologies', padX, metaY + 14);
    const fromLines = [
      settings.company_email || 'billing@helzerx.cyou',
      ...(settings.company_address || '548 Market Street, Suite 74200\nSan Francisco, CA 94104\nUnited States').split('\n'),
      settings.company_phone || '+1 (415) 890-4420',
      settings.company_website || 'customers.helzerx.cyou',
      `Tax ID: ${settings.company_tax_id || 'HX-US-94-3829104'}`,
    ];
    doc.fillColor('#A1A1AA').font('Helvetica').fontSize(8.5).text(fromLines.join('\n'), padX, metaY + 30, { width: col1W - 10, lineGap: 2.5 });

    // BILL TO
    const col2X = padX + col1W;
    doc.fillColor('#71717A').font('Helvetica-Bold').fontSize(8).text('BILL TO', col2X, metaY);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(10.5).text(billing.full_name || 'Customer', col2X, metaY + 14);
    const billLines = [
      billing.company_name ? billing.company_name : null,
      billing.email || '',
      billing.mobile || '',
      billing.billing_address || '',
      [billing.city, billing.postal_code].filter(Boolean).join(' '),
      billing.country || '',
      invoice.order_number ? `Order: ${invoice.order_number}` : null,
    ].filter(Boolean);
    doc.fillColor('#A1A1AA').font('Helvetica').fontSize(8.5).text(billLines.join('\n'), col2X, metaY + 30, { width: col2W - 10, lineGap: 2.5 });

    // ISSUED / DUE
    doc.fillColor('#71717A').font('Helvetica-Bold').fontSize(8).text('ISSUED', col3X, metaY, { width: col3W, align: 'right' });
    doc.fillColor('#E4E4E7').font('Helvetica').fontSize(10).text(formatDateShort(invoice.issue_date), col3X, metaY + 13, { width: col3W, align: 'right' });

    doc.fillColor('#71717A').font('Helvetica-Bold').fontSize(8).text('DUE', col3X, metaY + 36, { width: col3W, align: 'right' });
    doc.fillColor('#E4E4E7').font('Helvetica').fontSize(10).text(formatDateShort(invoice.due_date), col3X, metaY + 49, { width: col3W, align: 'right' });

    doc.fillColor('#71717A').font('Helvetica-Bold').fontSize(8).text('CURRENCY', col3X, metaY + 72, { width: col3W, align: 'right' });
    doc.fillColor('#E4E4E7').font('Helvetica').fontSize(9.5).text(invoice.currency || 'USD', col3X, metaY + 85, { width: col3W, align: 'right' });

    // 6. Line Items Table
    let tableY = 398;
    const descX = padX;
    const qtyX = W - padX - 185;
    const rateX = W - padX - 125;
    const amtX = W - padX - 75;

    doc.fillColor('#71717A').font('Helvetica-Bold').fontSize(8);
    doc.text('DESCRIPTION', descX, tableY);
    doc.text('QTY', qtyX, tableY, { width: 40, align: 'right' });
    doc.text('RATE', rateX, tableY, { width: 65, align: 'right' });
    doc.text('AMOUNT', amtX, tableY, { width: 75, align: 'right' });

    tableY += 16;
    doc.strokeColor('#27272A').lineWidth(0.75).moveTo(padX, tableY).lineTo(W - padX, tableY).stroke();

    for (const item of items) {
      tableY += 14;
      doc.fillColor('#FFFFFF').font('Helvetica').fontSize(10).text(item.description, descX, tableY, { width: qtyX - descX - 12 });
      doc.fillColor('#D4D4D8').font('Helvetica').fontSize(10).text(String(item.quantity), qtyX, tableY, { width: 40, align: 'right' });
      doc.text(formatMoney(item.unit_price_cents, invoice.currency), rateX, tableY, { width: 65, align: 'right' });
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(10).text(formatMoney(item.amount_cents, invoice.currency), amtX, tableY, { width: 75, align: 'right' });
      tableY += 24;
      doc.strokeColor('#1F1F23').lineWidth(0.75).moveTo(padX, tableY).lineTo(W - padX, tableY).stroke();
    }

    // 7. Totals Section
    let sumY = tableY + 20;
    const labelX = W - padX - 180;
    const valX = W - padX - 90;

    const addTotalRow = (label: string, val: string, bold = false) => {
      doc.fillColor(bold ? '#FFFFFF' : '#A1A1AA')
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(bold ? 11 : 9.5)
        .text(label, labelX, sumY, { width: 85, align: 'left' });
      doc.fillColor('#FFFFFF')
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(bold ? 11 : 9.5)
        .text(val, valX, sumY, { width: 90, align: 'right' });
      sumY += bold ? 22 : 18;
    };

    addTotalRow('Subtotal', formatMoney(invoice.subtotal_cents, invoice.currency));
    if (invoice.discount_cents > 0) {
      addTotalRow('Discount', `-${formatMoney(invoice.discount_cents, invoice.currency)}`);
    }
    const taxPct = ((invoice.tax_rate_bps || 0) / 100).toFixed(2).replace(/\.00$/, '');
    addTotalRow(`Tax (${taxPct}%)`, formatMoney(invoice.tax_cents, invoice.currency));
    sumY += 4;
    addTotalRow('Total', formatMoney(invoice.total_cents, invoice.currency), true);

    // 8. Bottom Payment Details & Notes
    const bottomY = Math.max(sumY + 34, 650);
    doc.fillColor('#71717A').font('Helvetica-Bold').fontSize(8).text('PAYMENT DETAILS', padX, bottomY);
    const payDetails = [
      `Payment Method: ${invoice.payment_method || 'Bank Transfer'}`,
      `Payment Status: ${invoice.status}`,
      `Bank: ${settings.bank_name || 'Mercury Business Banking'}`,
      `Account: ${settings.bank_account_number || '9800 4412 7820 1190'}`,
      `Routing/SWIFT: ${settings.bank_routing_swift || 'ELVBUS33 / 021000021'}`,
    ];
    doc.fillColor('#A1A1AA').font('Helvetica').fontSize(8.5).text(payDetails.join('\n'), padX, bottomY + 14, { lineGap: 2.5 });

    const notesY = bottomY + 88;
    doc.fillColor('#71717A').font('Helvetica-Bold').fontSize(8).text('NOTES', padX, notesY);
    doc.fillColor('#A1A1AA').font('Helvetica').fontSize(8.5).text(
      invoice.notes || 'Thank you for your business!',
      padX,
      notesY + 14,
      { width: W - padX * 2 }
    );

    doc.end();
  });
}
