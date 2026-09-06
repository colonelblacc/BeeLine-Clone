import { create } from 'zustand';
import { Device } from 'react-native-ble-plx';
import { RouteResult, LatLng } from '../services/olamaps';
import { TurnType, MapPoi } from '../constants/ble';

interface NavStore {
  // ── GPS / Route state ───────────────────────────────────────────────────────
  userLocation: LatLng | null;
  destination: LatLng | null;
  destinationName: string;
  route: RouteResult | null;
  currentStepIndex: number;
  isNavigating: boolean;
  isRecording: boolean;

  // ── Active navigation telemetry HUD ─────────────────────────────────────────
  turnType: TurnType;
  distanceToNextM: number;
  etaMin: number;
  speedLimitKph: number;
  currentSpeedKph: number;
  heading: number;
  isOffRoute: boolean;
  isRerouting: boolean;
  activePoi: MapPoi | null;

  // ── Simulation state ────────────────────────────────────────────────────────
  isSimulating: boolean;
  simulationMultiplier: number;

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
  setCurrentSpeed: (kph: number) => void;
  setHeading: (deg: number) => void;
  setIsOffRoute: (v: boolean) => void;
  setIsRerouting: (v: boolean) => void;
  setActivePoi: (poi: MapPoi | null) => void;
  setSimulating: (v: boolean, multiplier?: number) => void;
  setSimulationMultiplier: (multiplier: number) => void;
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
  speedLimitKph: 50,
  currentSpeedKph: 0,
  heading: 0,
  isOffRoute: false,
  isRerouting: false,
  activePoi: null,
  isSimulating: false,
  simulationMultiplier: 1.0,
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
    isOffRoute: false,
    isRerouting: false,
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
  setCurrentSpeed: (kph) => set({ currentSpeedKph: kph }),
  setHeading: (deg) => set({ heading: deg }),
  setIsOffRoute: (v) => set({ isOffRoute: v }),
  setIsRerouting: (v) => set({ isRerouting: v }),
  setActivePoi: (poi) => set({ activePoi: poi }),
  setSimulating: (v, multiplier = 1.0) => set({ isSimulating: v, simulationMultiplier: multiplier }),
  setSimulationMultiplier: (multiplier) => set({ simulationMultiplier: multiplier }),
  setBLEConnected: (connected, device = null, name = '') =>
    set({ bleConnected: connected, connectedDevice: device, connectedDeviceName: name }),
  clearRoute: () => set({
    route: null, destination: null, destinationName: '',
    isNavigating: false, isRecording: false, isSimulating: false,
    currentStepIndex: 0, turnType: 0, distanceToNextM: 0, etaMin: 0,
    currentSpeedKph: 0, isOffRoute: false, isRerouting: false, activePoi: null,
  }),
  setMetric: (metric) => set({ useMetric: metric }),
}));

