/**
 * Giọng đọc tiếng Việt — expo-speech (dùng giọng hệ thống của iOS).
 * - Không hard-code tên giọng: chọn lúc chạy qua getAvailableVoicesAsync(),
 *   lọc giọng vi-VN, ưu tiên chất lượng Enhanced (giọng Linh), rồi mới tới Default.
 * - Giọng đọc đi qua audio session của app (useApplicationAudioSession mặc định
 *   là true) nên sau khi setAudioModeAsync sang .playback thì đọc được cả khi
 *   iPhone tắt màn hình / gạt nút im lặng.
 * - Tốc độ đọc chỉnh được qua tham số `rate` (iOS: 0.5–2.0, mặc định 1.0).
 */
import * as Speech from 'expo-speech';
import { formatWeightSpeech } from './format';

let vietnameseVoiceId: string | null = null;
let voiceReady = false;

/** Chọn giọng vi-VN lúc mở app. Gọi 1 lần khi khởi động. */
export async function initSpeech(): Promise<void> {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const viVoices = voices.filter((v) => v.language === 'vi-VN');
    const enhanced = viVoices.find((v) => v.quality === 'Enhanced');
    const chosen = enhanced ?? viVoices[0] ?? null;
    vietnameseVoiceId = chosen ? chosen.identifier : null;
    voiceReady = true;
  } catch {
    // Không lấy được danh sách giọng: vẫn đọc được bằng giọng mặc định của hệ thống.
    vietnameseVoiceId = null;
    voiceReady = false;
  }
}

export function isVoiceReady(): boolean {
  return voiceReady;
}

/** Đọc 1 câu bất kỳ bằng giọng Việt, với tốc độ cho trước. Trả về câu đã đọc. */
export function speakText(
  text: string,
  rate = 1.0,
  onDone?: () => void,
  onError?: (error: Error) => void,
): string {
  Speech.speak(text, {
    language: 'vi-VN',
    ...(vietnameseVoiceId ? { voice: vietnameseVoiceId } : {}),
    rate,
    pitch: 1.0,
    onDone,
    onError,
  });
  return text;
}

/** Đọc 1 số cân bằng giọng Việt. Trả về câu đã đọc (để hiện lên màn hình). */
export function speakWeight(
  kg: number,
  onDone?: () => void,
  onError?: (error: Error) => void,
  rate = 1.0,
): string {
  const text = formatWeightSpeech(kg);
  return speakText(text, rate, onDone, onError);
}

/** Dừng giọng đọc đang phát (nếu có). */
export function stopSpeech(): void {
  Speech.stop();
}
