/**
 * Bluetooth LE — nối cân DT580.
 *
 * Giao diện chung với code ESP32 bên kia:
 *  - Tên thiết bị BLE: "CanDT580"
 *  - Service UUID:        54aaafad-74a5-4e13-a29f-a5efde5d363f
 *  - Characteristic UUID: 82c91516-57c4-4278-8434-30fd74d1b5b8
 *  - Dữ liệu: text UTF-8, số cân kg 1 số lẻ (vd "12.5"), ESP32 gửi qua
 *    NOTIFY khi cân ổn định. react-native-ble-plx trả về dạng base64,
 *    ở đây decode ra text rồi parse số.
 *
 * Chạy nền / tắt màn hình:
 *  - BleManager dùng restoreStateIdentifier để iOS mở lại app sau khi
 *    hệ thống kill app (state restoration).
 *  - Mất kết nối thì tự quét lại sau 2 giây (onDeviceDisconnected).
 */
import {
  BleManager,
  Device,
  State,
  type BleError,
  type Characteristic,
  type Subscription,
} from 'react-native-ble-plx';
import { Buffer } from 'buffer';

export const BLE_DEVICE_NAME = 'CanDT580';
export const BLE_SERVICE_UUID = '54aaafad-74a5-4e13-a29f-a5efde5d363f';
export const BLE_CHARACTERISTIC_UUID = '82c91516-57c4-4278-8434-30fd74d1b5b8';

export type BleStatus = 'idle' | 'scanning' | 'connected' | 'disconnected';

export interface ScaleBleCallbacks {
  onStatus: (status: BleStatus) => void;
  onWeight: (kg: number) => void;
  onError: (message: string) => void;
}

const RECONNECT_DELAY_MS = 2000;

export class ScaleBle {
  private manager: BleManager;
  private callbacks: ScaleBleCallbacks;
  private device: Device | null = null;
  private monitorSub: Subscription | null = null;
  private disconnectSub: Subscription | null = null;
  private stateSub: Subscription | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private manualDisconnect = false;
  private scanning = false;
  private status: BleStatus = 'idle';

  constructor(callbacks: ScaleBleCallbacks) {
    this.callbacks = callbacks;
    this.manager = new BleManager({
      restoreStateIdentifier: 'CanDT580BleManager',
      restoreStateFunction: (restoredState) => {
        if (!restoredState) return;
        const dev = restoredState.connectedPeripherals.find(
          (d) =>
            d.name === BLE_DEVICE_NAME ||
            (d.serviceUUIDs ?? []).includes(BLE_SERVICE_UUID),
        );
        if (dev) {
          // iOS mở lại app sau khi hệ thống kill: nối lại characteristic.
          this.attachDevice(dev).catch(() => {});
        }
      },
    });
  }

  /** Bắt đầu: chờ Bluetooth bật rồi quét tìm cân. */
  async start(): Promise<void> {
    this.stateSub = this.manager.onStateChange((state) => {
      if (state === State.PoweredOn) {
        this.startScan();
      } else if (state === State.PoweredOff) {
        this.callbacks.onError('Bluetooth đang tắt — bật Bluetooth lên để nối cân.');
        this.setStatus('idle');
      }
    }, true);
  }

  /** Quét tìm cân theo service UUID. */
  async startScan(): Promise<void> {
    if (this.destroyed || this.scanning) return;
    if (this.device) return; // Đang nối rồi thì không quét nữa.
    this.scanning = true;
    this.manualDisconnect = false;
    this.setStatus('scanning');
    try {
      await this.manager.startDeviceScan(
        [BLE_SERVICE_UUID],
        { allowDuplicates: false },
        (error: BleError | null, scannedDevice: Device | null) => {
          if (error) {
            this.scanning = false;
            this.callbacks.onError(error.message || 'Lỗi quét Bluetooth.');
            this.setStatus('idle');
            return;
          }
          if (!scannedDevice) return;
          const isTarget =
            scannedDevice.name === BLE_DEVICE_NAME ||
            (scannedDevice.serviceUUIDs ?? []).includes(BLE_SERVICE_UUID);
          if (!isTarget) return;
          // Tìm thấy cân — dừng quét, nối vào.
          this.manager.stopDeviceScan().catch(() => {});
          this.scanning = false;
          this.connect(scannedDevice).catch((e: unknown) => {
            const message = e instanceof Error ? e.message : 'Không nối được cân.';
            this.callbacks.onError(message);
            this.scheduleReconnect();
          });
        },
      );
    } catch (e: unknown) {
      this.scanning = false;
      const message = e instanceof Error ? e.message : 'Lỗi quét Bluetooth.';
      this.callbacks.onError(message);
      this.setStatus('idle');
    }
  }

  async stopScan(): Promise<void> {
    this.scanning = false;
    try {
      await this.manager.stopDeviceScan();
    } catch {
      // Đang không quét thì thôi.
    }
  }

  /** Ngắt kết nối do người dùng bấm (không tự nối lại). */
  async disconnect(): Promise<void> {
    this.manualDisconnect = true;
    this.clearReconnectTimer();
    await this.stopScan();
    this.cleanupSubscriptions();
    if (this.device) {
      try {
        await this.device.cancelConnection();
      } catch {
        // Đã mất nối rồi thì thôi.
      }
      this.device = null;
    }
    this.setStatus('idle');
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
    this.manualDisconnect = true;
    this.clearReconnectTimer();
    await this.stopScan().catch(() => {});
    this.cleanupSubscriptions();
    this.stateSub?.remove();
    this.stateSub = null;
    try {
      await this.manager.destroy();
    } catch {
      // Bỏ qua.
    }
  }

  private async connect(device: Device): Promise<void> {
    const connected = await device.connect();
    await connected.discoverAllServicesAndCharacteristics();
    this.device = connected;
    this.attachDisconnectListener(connected);
    this.monitorWeight(connected);
    this.setStatus('connected');
  }

  /** Dùng khi iOS restore lại app (thiết bị đã nối sẵn). */
  private async attachDevice(device: Device): Promise<void> {
    try {
      await device.discoverAllServicesAndCharacteristics();
    } catch {
      // Bỏ qua, vẫn thử monitor.
    }
    this.device = device;
    this.attachDisconnectListener(device);
    this.monitorWeight(device);
    this.setStatus('connected');
  }

  private attachDisconnectListener(device: Device): void {
    this.disconnectSub?.remove();
    this.disconnectSub = this.manager.onDeviceDisconnected(
      device.id,
      (_error: BleError | null, _device: Device | null) => {
        this.cleanupSubscriptions();
        this.device = null;
        if (this.destroyed || this.manualDisconnect) {
          this.setStatus('idle');
          return;
        }
        // Mất nối ngoài ý muốn (xa tầm, ESP32 mất nguồn...) -> tự quét lại.
        this.setStatus('disconnected');
        this.scheduleReconnect();
      },
    );
  }

  private monitorWeight(device: Device): void {
    this.monitorSub?.remove();
    this.monitorSub = device.monitorCharacteristicForService(
      BLE_SERVICE_UUID,
      BLE_CHARACTERISTIC_UUID,
      (error: BleError | null, characteristic: Characteristic | null) => {
        if (error) return;
        if (!characteristic?.value) return;
        // react-native-ble-plx trả value dạng base64 -> decode ra text UTF-8.
        const text = Buffer.from(characteristic.value, 'base64')
          .toString('utf8')
          .trim();
        const kg = parseFloat(text);
        if (Number.isFinite(kg) && kg >= 0) {
          this.callbacks.onWeight(kg);
        }
      },
    );
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    if (this.destroyed || this.manualDisconnect) return;
    this.reconnectTimer = setTimeout(() => {
      if (!this.destroyed && !this.manualDisconnect) {
        this.startScan();
      }
    }, RECONNECT_DELAY_MS);
  }

  private cleanupSubscriptions(): void {
    this.monitorSub?.remove();
    this.monitorSub = null;
    this.disconnectSub?.remove();
    this.disconnectSub = null;
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setStatus(status: BleStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.callbacks.onStatus(status);
  }
}
