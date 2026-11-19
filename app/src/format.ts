/**
 * Định dạng số cân + số tiền: hiển thị trên màn hình + câu đọc bằng giọng Việt.
 * Cách đọc kiểu chợ, tự nhiên:
 *  - 12.5 -> "12 ký rưỡi"   | 12.3 -> "12 ký 3" | 12.0 -> "12 ký"
 *  - 0.5  -> "nửa ký"       | 0.3  -> "0 ký 3"  | 0    -> "không ký"
 *  - 100.000đ -> "100 nghìn"        | 1.250.000đ -> "1 triệu 250 nghìn"
 *  - 25.000đ  -> "25 nghìn"         | 1.000.000đ -> "1 triệu"
 *  - 1.234.567đ -> "1 triệu 234 nghìn 567 đồng"
 */

/** Số hiển thị trên màn hình, luôn 1 số lẻ. Chưa có số thì trả về "—". */
export function formatWeightDisplay(kg: number | null): string {
  if (kg === null || Number.isNaN(kg)) return '—';
  return kg.toFixed(1);
}

/** Câu đọc bằng giọng Việt cho 1 số cân (kg). */
export function formatWeightSpeech(kg: number): string {
  if (!Number.isFinite(kg) || kg <= 0) return 'không ký';
  const intPart = Math.floor(kg);
  const frac = Math.round((kg - intPart) * 10);
  if (frac === 0) return `${intPart} ký`;
  if (frac === 5) return intPart === 0 ? 'nửa ký' : `${intPart} ký rưỡi`;
  if (intPart === 0) return `0 ký ${frac}`;
  return `${intPart} ký ${frac}`;
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
