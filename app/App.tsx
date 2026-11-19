/**
 * Cân DT580 — app iPhone đọc số cân ra loa.
 *
 * Luồng: ESP32-C5 (cân DT580) gửi số cân qua BLE -> app nhận -> hiện số to
 * trên màn hình + đọc bằng giọng Việt ra loa Bluetooth (UGREEN).
 * Tắt màn hình vẫn đọc được (background modes bluetooth-central + audio).
 *
 * UI: sạch, hiện đại, chuyên nghiệp — số cân là trung tâm, to và dễ đọc
 * nhất; trạng thái kết nối nhìn là hiểu ngay (xanh = đã nối, vàng = đang
 * quét, đỏ = mất nối, xám = chưa nối). Chữ hệ thống, hiện đúng dấu tiếng
 * Việt, đủ lớn để đọc ngoài chợ. Tôn trọng safe-area, nút bấm đủ to.
 * Thẻ "Cài đặt đọc": nhập đơn giá (đ/kg) + chọn chế độ đọc (cân / tiền /
 * cả hai) + tốc độ giọng đọc. Tiền = số cân × đơn giá. Cài đặt lưu lại
 * để mở app sau vẫn còn.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { setAudioModeAsync } from 'expo-audio';
import { ScaleBle, type BleStatus } from './src/ble';
import { initSpeech, speakText, stopSpeech } from './src/speech';
import {
  formatMoneyDisplay,
  formatReadingSpeech,
  formatWeightDisplay,
  type ReadMode,
} from './src/format';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  SPEECH_RATE_OPTIONS,
  type ReadSettings,
} from './src/settings';
import { colors, fontSize, radius, spacing } from './src/theme';

/** Cùng 1 câu đọc trong 3 giây thì không đọc lại (tránh đọc lặp). */
const SPEAK_DEDUPE_MS = 3000;

/** Nút giá nhanh thường dùng (đồng/kg), bấm 1 phát là xong. */
const QUICK_PRICES = [5000, 8000, 10000, 15000, 20000];

const STATUS_UI: Record<
  BleStatus,
  { label: string; pillBg: string; pillText: string; dot: string; deviceText: string }
> = {
  idle: {
    label: 'Chưa nối',
    pillBg: colors.idleBg,
    pillText: colors.idleText,
    dot: '#9CA3AF',
    deviceText: 'Chưa kết nối • Bấm Quét để nối cân',
  },
  scanning: {
    label: 'Đang quét',
    pillBg: colors.warningBg,
    pillText: colors.warningText,
    dot: colors.warning,
    deviceText: 'Đang quét thiết bị CanDT580…',
  },
  connected: {
    label: 'Đã nối',
    pillBg: colors.successBg,
    pillText: colors.successText,
    dot: colors.success,
    deviceText: 'Đã kết nối • CanDT580',
  },
  disconnected: {
    label: 'Mất nối',
    pillBg: colors.dangerBg,
    pillText: colors.dangerText,
    dot: colors.danger,
    deviceText: 'Mất kết nối — đang nối lại…',
  },
};

function StatusPill({ status }: { status: BleStatus }) {
  const ui = STATUS_UI[status];
  return (
    <View style={[styles.pill, { backgroundColor: ui.pillBg }]}>
      <View style={[styles.pillDot, { backgroundColor: ui.dot }]} />
      <Text style={[styles.pillText, { color: ui.pillText }]}>{ui.label}</Text>
    </View>
  );
}

/** Nút chọn nhỏ (giá nhanh, chế độ đọc, tốc độ): chọn rồi thì nền xanh lá. */
function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function App() {
  const [status, setStatus] = useState<BleStatus>('idle');
  const [weight, setWeight] = useState<number | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [lastSpoken, setLastSpoken] = useState<{ text: string; time: string } | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cài đặt đọc (lưu lại để mở app sau vẫn còn).
  const [readMode, setReadMode] = useState<ReadMode>(DEFAULT_SETTINGS.readMode);
  const [unitPrice, setUnitPrice] = useState<number>(DEFAULT_SETTINGS.unitPrice);
  const [unitPriceText, setUnitPriceText] = useState('');
  const [speechRate, setSpeechRate] = useState<number>(DEFAULT_SETTINGS.speechRate);

  const bleRef = useRef<ScaleBle | null>(null);
  const voiceEnabledRef = useRef(true);
  const lastSpokenRef = useRef<{ text: string; at: number } | null>(null);
  // Cài đặt mới nhất cho callback onWeight (callback đăng ký 1 lần lúc mở app).
  const settingsRef = useRef<ReadSettings>(DEFAULT_SETTINGS);
  const settingsLoadedRef = useRef(false);

  useEffect(() => {
    voiceEnabledRef.current = voiceEnabled;
  }, [voiceEnabled]);

  // Đồng bộ cài đặt vào ref cho callback BLE; lưu lại mỗi khi đổi.
  useEffect(() => {
    settingsRef.current = { readMode, unitPrice, speechRate };
    if (settingsLoadedRef.current) {
      saveSettings({ readMode, unitPrice, speechRate }).catch(() => {});
    }
  }, [readMode, unitPrice, speechRate]);

  const handleUnitPriceChange = useCallback((text: string) => {
    const digits = text.replace(/[^0-9]/g, '');
    setUnitPriceText(digits);
    setUnitPrice(digits === '' ? 0 : parseInt(digits, 10));
  }, []);

  const handleQuickPrice = useCallback((price: number) => {
    setUnitPrice(price);
    setUnitPriceText(String(price));
  }, []);

  const handleVoiceToggle = useCallback((value: boolean) => {
    setVoiceEnabled(value);
    if (!value) {
      stopSpeech();
      setSpeaking(false);
    }
  }, []);

  useEffect(() => {
    // Nạp cài đặt đọc đã lưu (chế độ đọc, đơn giá, tốc độ).
    loadSettings()
      .then((saved) => {
        setReadMode(saved.readMode);
        setUnitPrice(saved.unitPrice);
        setUnitPriceText(saved.unitPrice > 0 ? String(saved.unitPrice) : '');
        setSpeechRate(saved.speechRate);
        settingsRef.current = saved;
        settingsLoadedRef.current = true;
      })
      .catch(() => {
        settingsLoadedRef.current = true;
      });

    // Audio session nền: đọc được khi tắt màn hình + khi gạt nút im lặng.
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    }).catch(() => {});

    initSpeech().catch(() => {});

    const ble = new ScaleBle({
      onStatus: (s) => {
        setStatus(s);
        if (s === 'connected') setError(null);
      },
      onWeight: (kg) => {
        setWeight(kg);
        const now = Date.now();
        const settings = settingsRef.current;
        const amount = Math.round(kg * settings.unitPrice);
        const text = formatReadingSpeech(
          kg,
          amount,
          settings.readMode,
          settings.unitPrice > 0,
        );
        const last = lastSpokenRef.current;
        if (last && last.text === text && now - last.at < SPEAK_DEDUPE_MS) return;
        if (!voiceEnabledRef.current) return;
        lastSpokenRef.current = { text, at: now };
        setSpeaking(true);
        setLastSpoken({
          text,
          time: new Date().toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
        });
        speakText(
          text,
          settings.speechRate,
          () => setSpeaking(false),
          () => setSpeaking(false),
        );
      },
      onError: (message) => setError(message),
    });
    bleRef.current = ble;
    ble.start();

    return () => {
      stopSpeech();
      ble.destroy();
      bleRef.current = null;
    };
  }, []);

  const handleActionPress = useCallback(() => {
    setError(null);
    if (status === 'connected') {
      bleRef.current?.disconnect();
    } else if (status !== 'scanning') {
      bleRef.current?.startScan();
    }
  }, [status]);

  const statusUi = STATUS_UI[status];
  const actionLabel =
    status === 'connected'
      ? 'Ngắt kết nối'
      : status === 'scanning'
        ? 'Đang quét…'
        : status === 'disconnected'
          ? 'Quét lại'
          : 'Quét & Kết nối';
  const isActionDisabled = status === 'scanning';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header: logo + tên app + trạng thái */}
        <View style={styles.header}>
          <View style={styles.logoMark}>
            <Text style={styles.logoText}>kg</Text>
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title}>Cân DT580</Text>
            <Text style={styles.subtitle}>Cân tính tiền • Bluetooth</Text>
          </View>
          <StatusPill status={status} />
        </View>

        {/* Thẻ số cân — trung tâm màn hình */}
        <View style={styles.weightCard}>
          <Text style={styles.weightLabel}>SỐ CÂN HIỆN TẠI</Text>
          <View style={styles.weightRow}>
            <Text
              style={styles.weightNumber}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.5}
            >
              {formatWeightDisplay(weight)}
            </Text>
            <Text style={styles.weightUnit}>kg</Text>
          </View>
          {unitPrice > 0 && weight !== null ? (
            <View style={styles.moneyRow}>
              <Text style={styles.moneyLabel}>THÀNH TIỀN</Text>
              <Text style={styles.moneyValue}>
                {formatMoneyDisplay(Math.round(weight * unitPrice))}
              </Text>
            </View>
          ) : null}
          <Text style={styles.weightHint}>
            {weight === null
              ? 'Chưa nhận số cân — bấm Quét & Kết nối'
              : speaking
                ? 'Đang đọc…'
                : 'Cân ổn định mới đọc số'}
          </Text>
          <View style={styles.divider} />
          <View style={styles.deviceRow}>
            <View style={[styles.dot, { backgroundColor: statusUi.dot }]} />
            <Text style={styles.deviceText}>{statusUi.deviceText}</Text>
          </View>
        </View>

        {/* Công tắc giọng đọc */}
        <View style={styles.rowCard}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Giọng đọc</Text>
            <Text style={styles.rowSubtitle}>Đọc số cân ra loa khi cân ổn định</Text>
          </View>
          <Switch
            value={voiceEnabled}
            onValueChange={handleVoiceToggle}
            trackColor={{ false: '#D1D5DB', true: colors.primary }}
            thumbColor="#FFFFFF"
            ios_backgroundColor="#D1D5DB"
          />
        </View>

        {/* Cài đặt đọc: đơn giá + chế độ đọc + tốc độ */}
        <View style={styles.settingsCard}>
          <Text style={styles.rowTitle}>Cài đặt đọc</Text>
          <Text style={styles.settingsSubtitle}>
            Đơn giá, chế độ đọc và tốc độ giọng đọc — lưu lại để mở app sau vẫn còn
          </Text>

          {/* Đơn giá */}
          <Text style={styles.fieldLabel}>Đơn giá (đồng/kg)</Text>
          <View style={styles.priceRow}>
            <TextInput
              style={styles.priceInput}
              value={unitPriceText}
              onChangeText={handleUnitPriceChange}
              keyboardType="numeric"
              returnKeyType="done"
              maxLength={9}
              placeholder="VD: 8000"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.priceSuffix}>đ/kg</Text>
          </View>
          <View style={styles.chipRow}>
            {QUICK_PRICES.map((price) => (
              <Chip
                key={price}
                label={formatMoneyDisplay(price).replace('đ', '')}
                selected={unitPrice === price}
                onPress={() => handleQuickPrice(price)}
              />
            ))}
          </View>
          {unitPrice === 0 ? (
            <Text style={styles.priceHint}>Chưa nhập đơn giá — app chỉ đọc số cân.</Text>
          ) : (
            <Text style={styles.priceHint}>
              Đang tính: {formatMoneyDisplay(unitPrice)}/kg
            </Text>
          )}

          {/* Chế độ đọc */}
          <Text style={styles.fieldLabel}>Chế độ đọc</Text>
          <View style={styles.chipRow}>
            <Chip
              label="Chỉ cân"
              selected={readMode === 'weight'}
              onPress={() => setReadMode('weight')}
            />
            <Chip
              label="Chỉ tiền"
              selected={readMode === 'money'}
              onPress={() => setReadMode('money')}
            />
            <Chip
              label="Cả hai"
              selected={readMode === 'both'}
              onPress={() => setReadMode('both')}
            />
          </View>
          {unitPrice === 0 && readMode !== 'weight' ? (
            <Text style={styles.priceHint}>Chưa có đơn giá nên tạm đọc số cân thôi.</Text>
          ) : null}

          {/* Tốc độ đọc */}
          <Text style={styles.fieldLabel}>Tốc độ đọc</Text>
          <View style={styles.chipRow}>
            {SPEECH_RATE_OPTIONS.map((rate) => (
              <Chip
                key={rate}
                label={`${rate}x`}
                selected={speechRate === rate}
                onPress={() => setSpeechRate(rate)}
              />
            ))}
          </View>
        </View>

        {/* Vừa đọc */}
        <View style={styles.rowCard}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Vừa đọc</Text>
            <Text style={[styles.spokenText, !lastSpoken && styles.spokenTextEmpty]}>
              {lastSpoken ? lastSpoken.text : 'Chưa đọc lần nào'}
            </Text>
          </View>
          {lastSpoken ? <Text style={styles.spokenTime}>{lastSpoken.time}</Text> : null}
        </View>

        {/* Lỗi (nếu có) */}
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Nút hành động + ghi chú, cố định dưới đáy */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[
            styles.actionButton,
            status === 'connected' && styles.actionButtonDisconnect,
            isActionDisabled && styles.actionButtonDisabled,
          ]}
          onPress={handleActionPress}
          disabled={isActionDisabled}
          activeOpacity={0.85}
        >
          {status === 'scanning' ? (
            <ActivityIndicator color="#FFFFFF" style={styles.actionSpinner} />
          ) : null}
          <Text
            style={[
              styles.actionButtonText,
              status === 'connected' && styles.actionButtonTextDisconnect,
            ]}
          >
            {actionLabel}
          </Text>
        </TouchableOpacity>
        <Text style={styles.footer}>
          Cân gửi số qua Bluetooth khi cân ổn định. Mở app là tự nối lại.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  logoMark: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  logoText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: fontSize.headerTitle,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: fontSize.small,
    color: colors.textSecondary,
    marginTop: 2,
  },

  /* Status pill */
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  pillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  pillText: {
    fontSize: fontSize.small,
    fontWeight: '700',
  },

  /* Thẻ số cân */
  weightCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    marginBottom: spacing.md,
    shadowColor: '#1C1917',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  weightLabel: {
    fontSize: fontSize.tiny,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: colors.textMuted,
    textAlign: 'center',
  },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  weightNumber: {
    fontSize: fontSize.weight,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -2,
    fontVariant: ['tabular-nums'],
    lineHeight: fontSize.weight * 1.05,
  },
  weightUnit: {
    fontSize: fontSize.weightUnit,
    fontWeight: '700',
    color: colors.textSecondary,
    marginLeft: spacing.sm,
  },
  weightHint: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.xs,
  },
  deviceText: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.text,
  },

  /* Thành tiền trong thẻ số cân */
  moneyRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  moneyLabel: {
    fontSize: fontSize.tiny,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: colors.textMuted,
    marginRight: spacing.sm,
  },
  moneyValue: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.primary,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },

  /* Thẻ cài đặt đọc */
  settingsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
    shadowColor: '#1C1917',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  settingsSubtitle: {
    fontSize: fontSize.small,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  fieldLabel: {
    fontSize: fontSize.small,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  priceInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
    backgroundColor: colors.background,
  },
  priceSuffix: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.textSecondary,
    marginLeft: spacing.sm,
  },
  priceHint: {
    fontSize: fontSize.small,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
    marginTop: spacing.xs,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    margin: 4,
    backgroundColor: colors.background,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },

  /* Thẻ hàng (giọng đọc / vừa đọc) */
  rowCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    shadowColor: '#1C1917',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  rowText: {
    flex: 1,
    marginRight: spacing.sm,
  },
  rowTitle: {
    fontSize: fontSize.sectionTitle,
    fontWeight: '700',
    color: colors.text,
  },
  rowSubtitle: {
    fontSize: fontSize.small,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  spokenText: {
    fontSize: fontSize.spoken,
    fontWeight: '800',
    color: colors.primary,
    marginTop: 2,
  },
  spokenTextEmpty: {
    fontSize: fontSize.subtitle,
    fontWeight: '600',
    color: colors.textMuted,
  },
  spokenTime: {
    fontSize: fontSize.small,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },

  /* Lỗi */
  errorBox: {
    backgroundColor: colors.dangerBg,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  errorText: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.dangerText,
    lineHeight: 20,
  },

  /* Đáy: nút + ghi chú */
  bottomBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  actionButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonDisabled: {
    backgroundColor: colors.buttonDisabled,
  },
  actionButtonDisconnect: {
    backgroundColor: colors.dangerBg,
  },
  actionSpinner: {
    marginRight: spacing.sm,
  },
  actionButtonText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  actionButtonTextDisconnect: {
    color: colors.danger,
  },
  footer: {
    fontSize: fontSize.tiny,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 16,
  },
});
