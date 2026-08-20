import { create } from 'zustand';
import { Device } from 'react-native-ble-plx';
import { RouteResult, LatLng } from '../services/olamaps';
import { TurnType } from '../constants/ble';

interface NavStore {
  // ── GPS / Route state ───────────────────────────────────────────────────────
  userLocation: LatLng | null;
  destination: LatLng | null;
  destinationName: string;
  route: RouteResult | null;
  currentStepIndex: number;
  isNavigating: boolean;
  isRecording: boolean;

  // ── Active navigation HUD ───────────────────────────────────────────────────
  turnType: TurnType;
  distanceToNextM: number;
  etaMin: number;
  speedLimitKph: number;

  // ── BLE state ───────────────────────────────────────────────────────────────
  bleConnected: boolean;
  connectedDeviceName: string;
  connectedDevice: Device | null;

  // ── Settings ────────────────────────────────────────────────────────────────
  useMetric: boolean;

  // ── Actions ─────────────────────────────────────────────────────────────────
  setUserLocation: (loc: LatLng) => void;
  setDestination: (loc: LatLng, name: string) => void;
  setRoute: (route: RouteResult) => void;
  setNavProgress: (stepIndex: number, distanceM: number) => void;
  setNavigating: (v: boolean) => void;
  setRecording: (v: boolean) => void;
  setEta: (etaMin: number) => void;
  setSpeedLimit: (kph: number) => void;
  setBLEConnected: (connected: boolean, device?: Device | null, name?: string) => void;
  clearRoute: () => void;
  setMetric: (metric: boolean) => void;
}

export const useNavStore = create<NavStore>((set) => ({
  userLocation: null,
  destination: null,
  destinationName: '',
  route: null,
  currentStepIndex: 0,
  isNavigating: false,
  isRecording: false,
  turnType: 0,
  distanceToNextM: 0,
  etaMin: 0,
  speedLimitKph: 0,
  bleConnected: false,
  connectedDeviceName: '',
  connectedDevice: null,
  useMetric: true,

  setUserLocation: (loc) => set({ userLocation: loc }),
  setDestination: (loc, name) => set({ destination: loc, destinationName: name }),
  setRoute: (route) => set({
    route,
    currentStepIndex: 0,
    turnType: (route.steps[0]?.turnType ?? 0) as TurnType,
    distanceToNextM: route.steps[0]?.distanceM ?? 0,
  }),
  setNavProgress: (stepIndex, distanceM) => set((s) => ({
    currentStepIndex: stepIndex,
    distanceToNextM: distanceM,
    turnType: (s.route?.steps[stepIndex]?.turnType ?? 0) as TurnType,
  })),
  setNavigating: (v) => set({ isNavigating: v }),
  setRecording: (v) => set({ isRecording: v }),
  setEta: (etaMin) => set({ etaMin }),
  setSpeedLimit: (kph) => set({ speedLimitKph: kph }),
  setBLEConnected: (connected, device = null, name = '') =>
    set({ bleConnected: connected, connectedDevice: device, connectedDeviceName: name }),
  clearRoute: () => set({
    route: null, destination: null, destinationName: '',
    isNavigating: false, isRecording: false, currentStepIndex: 0, turnType: 0,
    distanceToNextM: 0, etaMin: 0,
  }),
  setMetric: (metric) => set({ useMetric: metric }),
}));
