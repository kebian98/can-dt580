/**
 * Lưu cài đặt đọc (chế độ đọc, đơn giá, tốc độ) bằng AsyncStorage
 * để mở app lại vẫn còn.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReadMode } from './format';

export interface ReadSettings {
  /** Chế độ đọc: chỉ cân / chỉ tiền / cả hai. */
  readMode: ReadMode;
  /** Đơn giá, đồng/kg. 0 = chưa nhập. */
  unitPrice: number;
  /** Tốc độ giọng đọc: 0.75 | 1 | 1.25 | 1.5 (mặc định 1x). */
  speechRate: number;
}

export const DEFAULT_SETTINGS: ReadSettings = {
  readMode: 'both',
  unitPrice: 0,
  speechRate: 1.0,
};

export const SPEECH_RATE_OPTIONS = [0.75, 1, 1.25, 1.5] as const;

const STORAGE_KEY = '@candt580/read-settings-v1';

function isReadMode(value: unknown): value is ReadMode {
  return value === 'weight' || value === 'money' || value === 'both';
}

/** Đọc cài đặt đã lưu; chưa có hoặc hỏng thì dùng mặc định. */
export async function loadSettings(): Promise<ReadSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ReadSettings>;
    return {
      readMode: isReadMode(parsed.readMode) ? parsed.readMode : DEFAULT_SETTINGS.readMode,
      unitPrice:
        typeof parsed.unitPrice === 'number' && parsed.unitPrice >= 0
          ? Math.floor(parsed.unitPrice)
          : DEFAULT_SETTINGS.unitPrice,
      speechRate:
        typeof parsed.speechRate === 'number' &&
        parsed.speechRate >= 0.5 &&
        parsed.speechRate <= 2
          ? parsed.speechRate
          : DEFAULT_SETTINGS.speechRate,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Lưu cài đặt. Lỗi thì bỏ qua, lần sau mở app dùng mặc định. */
export async function saveSettings(settings: ReadSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Bỏ qua.
  }
}
