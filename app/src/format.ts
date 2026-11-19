/**
 * Định dạng số cân + số tiền: hiển thị trên màn hình + câu đọc bằng giọng Việt.
 * Số cân chính xác tới gam (3 số lẻ, khớp màn hình cân DT580):
 *  - Hiển thị: 1.174 -> "1.174" | 0.209 -> "0.209" | 12.0 -> "12.000"
 *  - Đọc: 1.174 -> "1 ký 174 gam" | 0.5 -> "nửa ký" | 0.209 -> "209 gam"
 *  - 12.0 -> "12 ký" | 2.5 -> "2 ký rưỡi" | 0 -> "không ký"
 *  - 100.000đ -> "100 nghìn"        | 1.250.000đ -> "1 triệu 250 nghìn"
 *  - 25.000đ  -> "25 nghìn"         | 1.000.000đ -> "1 triệu"
 *  - 1.234.567đ -> "1 triệu 234 nghìn 567 đồng"
 */

/** Số hiển thị trên màn hình, luôn 3 số lẻ (tới gam) để khớp màn hình cân. Chưa có số thì trả về "—". */
export function formatWeightDisplay(kg: number | null): string {
  if (kg === null || Number.isNaN(kg)) return '—';
  return kg.toFixed(3);
}

/** Câu đọc bằng giọng Việt cho 1 số cân (kg), chính xác tới gam. */
export function formatWeightSpeech(kg: number): string {
  if (!Number.isFinite(kg)) return 'không ký';
  const grams = Math.round(kg * 1000);
  if (grams <= 0) return 'không ký';
  if (grams === 500) return 'nửa ký';
  if (grams < 1000) return `${grams} gam`;
  const intPart = Math.floor(grams / 1000);
  const rem = grams % 1000;
  if (rem === 0) return `${intPart} ký`;
  if (rem === 500) return `${intPart} ký rưỡi`;
  return `${intPart} ký ${rem} gam`;
}

/** Số tiền hiển thị trên màn hình, định dạng tiền Việt. VD 100000 -> "100.000đ". */
export function formatMoneyDisplay(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '0đ';
  return `${Math.round(amount).toLocaleString('vi-VN')}đ`;
}

/** Câu đọc bằng giọng Việt cho 1 số tiền (đồng). */
export function formatMoneySpeech(amount: number): string {
  const v = Math.round(amount);
  if (!Number.isFinite(v) || v <= 0) return 'không đồng';
  const millions = Math.floor(v / 1_000_000);
  const thousands = Math.floor((v % 1_000_000) / 1_000);
  const remainder = v % 1_000;
  const parts: string[] = [];
  if (millions > 0) parts.push(`${millions} triệu`);
  if (thousands > 0) parts.push(`${thousands} nghìn`);
  if (remainder > 0) parts.push(`${remainder} đồng`);
  return parts.join(' ');
}

/** Chế độ đọc: chỉ cân / chỉ tiền / cả hai. */
export type ReadMode = 'weight' | 'money' | 'both';

/**
 * Câu đọc đầy đủ theo chế độ: cân, tiền, hoặc cả hai.
 * VD 12.5kg × 8.000đ/kg, chế độ "both" -> "12 ký rưỡi, 100 nghìn".
 * Chưa nhập đơn giá thì luôn chỉ đọc số cân (không đọc "0 đồng").
 */
export function formatReadingSpeech(
  kg: number,
  amount: number,
  mode: ReadMode,
  hasUnitPrice: boolean,
): string {
  const weightText = formatWeightSpeech(kg);
  if (!hasUnitPrice) return weightText;
  if (mode === 'money') return formatMoneySpeech(amount);
  if (mode === 'both') return `${weightText}, ${formatMoneySpeech(amount)}`;
  return weightText;
}
