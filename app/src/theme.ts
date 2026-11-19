/**
 * Design tokens — Cân DT580
 * Bảng màu sáng, ấm, dễ đọc ngoài chợ. Số cân là trung tâm.
 * Trạng thái kết nối dùng màu rõ nghĩa:
 *  - xanh lá = đã nối, vàng/cam = đang quét, đỏ = mất nối, xám = chưa nối.
 */

export const colors = {
  /** Nền app: trắng ấm */
  background: '#F7F5F1',
  /** Mặt thẻ trắng */
  surface: '#FFFFFF',
  /** Xanh lá chủ đạo (chợ tươi / đã nối) */
  primary: '#15803D',
  primaryDark: '#166534',
  primaryLight: '#DCFCE7',
  primarySoft: '#F0FDF4',
  /** Chữ */
  text: '#111827',
  textSecondary: '#4B5563',
  /** Chữ phụ nhỏ (nhãn, ghi chú): đủ đậm để đọc được, không dùng xám nhạt. */
  textMuted: '#6B7280',
  /** Viền mảnh */
  border: '#E7E5E4',
  /** Trạng thái */
  success: '#16A34A',
  successBg: '#DCFCE7',
  successText: '#166534',
  warning: '#D97706',
  warningBg: '#FEF3C7',
  warningText: '#92400E',
  danger: '#DC2626',
  dangerBg: '#FEE2E2',
  dangerText: '#991B1B',
  idle: '#6B7280',
  idleBg: '#F3F4F6',
  idleText: '#4B5563',
  /** Nút */
  buttonDisabled: '#D1D5DB',
} as const;

export const spacing = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 12,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

/** Kích thước chữ — đủ lớn để đọc ngoài chợ. */
export const fontSize = {
  tiny: 12,
  small: 13,
  body: 14,
  subtitle: 15,
  title: 17,
  sectionTitle: 16,
  headerTitle: 22,
  spoken: 20,
  /** Số cân: to nhất màn hình. */
  weight: 104,
  weightUnit: 32,
} as const;
