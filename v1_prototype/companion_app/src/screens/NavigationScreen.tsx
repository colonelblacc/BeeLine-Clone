import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Map, Camera, ViewAnnotation, GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavStore } from '../store/navStore';
import { COLORS, OLA_STYLE_URL } from '../constants/config';
import { TurnArrow } from '../components/TurnArrow';
import { TURN_LABELS, PoiType, POI_LABELS, encodeNavState, decodeNavState } from '../constants/ble';
import { 
  watchLocation, 
  getNavigationProgress, 
  isOffRoute, 
  getRemainingPolyline,
  projectRoadNetworkToRegion1,
  startRouteSimulation, 
  SimulationController 
} from '../services/gps';
import { getDirections } from '../services/olamaps';
import { writeNavState } from '../services/ble';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { DEBUG_ROUTE, logDebugProjection } from '../constants/debugRoute';

export function NavigationScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const insets = useSafeAreaInsets();
  const { 
    route, currentStepIndex, turnType, distanceToNextM, etaMin,
    speedLimitKph, currentSpeedKph, heading, isOffRoute: offRouteState, isRerouting,
    isSimulating, simulationMultiplier,
    setNavProgress, setNavigating, setRecording, isRecording, setEta, 
    setCurrentSpeed, setHeading, setIsOffRoute, setIsRerouting, setActivePoi,
    setSimulating, setSimulationMultiplier,
    bleConnected, useMetric, userLocation, destination, setRoute
  } = useNavStore();

  const [isCompassMode, setIsCompassMode] = useState(false);
  const [poiToast, setPoiToast] = useState<string | null>(null);
  const [isSimPaused, setIsSimPaused] = useState(false);
  const [isArrived, setIsArrived] = useState(false);
  
  // Free roam recording stats
  const [recordElapsed, setRecordElapsed] = useState(0);

  const simControllerRef = useRef<SimulationController | null>(null);
  const lastRerouteTimeRef = useRef(0);
  const mapCameraRef = useRef<any>(null);
  const isFollowingRef = useRef(true); // true = camera follows rider

  const routeRef = useRef(route);
  routeRef.current = route;
  const bleConnectedRef = useRef(bleConnected);
  bleConnectedRef.current = bleConnected;
  const speedLimitKphRef = useRef(speedLimitKph);
  speedLimitKphRef.current = speedLimitKph;
  const useMetricRef = useRef(useMetric);
  useMetricRef.current = useMetric;
  const destinationRef = useRef(destination);
  destinationRef.current = destination;
  const isArrivedRef = useRef(isArrived);
  isArrivedRef.current = isArrived;

  // Timer for free roam recording
  useEffect(() => {
    if (isRecording) {
      const interval = setInterval(() => {
        setRecordElapsed(prev => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isRecording]);

  // Main navigation & simulation loop
  useEffect(() => {
    if (!route && !isRecording) return;
    
    setIsArrived(false);
    isArrivedRef.current = false;
    if (route?.steps && route.steps.length > 0) {
      useNavStore.getState().setNavProgress(0, route.steps[0].distanceM);
    }
    
    let lastWriteTime = 0;
    let lastVerifyLogTime = 0;

    const handleTelemetryUpdate = (loc: { latitude: number; longitude: number }, speedKph: number, head: number) => {
      useNavStore.getState().setUserLocation(loc);
      setCurrentSpeed(speedKph);
      setHeading(head);

      // Imperatively move the map camera on every tick so it tracks the rider smoothly
      if (mapCameraRef.current && isFollowingRef.current) {
        try {
          mapCameraRef.current.easeTo({
            center: [loc.longitude, loc.latitude],
            zoom: 17.5,
            pitch: 55,
            bearing: head,
            duration: 400,
            easing: 'linear',
          });
        } catch (e) {
          // ignore
        }
      }

      if (isRecording) {
        return;
      }

      const activeRoute = routeRef.current;
      if (activeRoute && activeRoute.steps && activeRoute.steps.length > 0) {
        // Off-route check (debounce to 10s)
        const off = isOffRoute(loc, activeRoute.polyline, 50);
        setIsOffRoute(off);

        const now = Date.now();
        const activeDest = destinationRef.current;
        if (off && activeDest && !isRerouting && (now - lastRerouteTimeRef.current > 10000)) {
          lastRerouteTimeRef.current = now;
          setIsRerouting(true);
          getDirections(loc, activeDest)
            .then((newRoute) => {
              setRoute(newRoute);
              setIsRerouting(false);
              setIsOffRoute(false);
            })
            .catch((err) => {
              console.error('Auto-reroute failed:', err);
              setIsRerouting(false);
            });
        }

        const curStepIdx = useNavStore.getState().currentStepIndex;
        const { stepIndex, distanceToNextM: dist } = getNavigationProgress(loc, activeRoute.steps, curStepIdx);
        setNavProgress(stepIndex, dist);

        // Check if arrived at final destination
        const reachedEnd = (stepIndex >= activeRoute.steps.length - 1 && dist < 25);
        if (reachedEnd && !isArrivedRef.current) {
          setIsArrived(true);
          isArrivedRef.current = true;
        }

        const remainingSteps = activeRoute.steps.slice(stepIndex);
        const remainingDistM = remainingSteps.reduce((s, step) => s + step.distanceM, 0);
        const etaMinutes = Math.max(1, Math.round((remainingDistM / 1000 / 35) * 60));
        setEta(etaMinutes);
        
        // BLE Data Synchronization — 5 Hz real-time streaming for silky smooth road traversal
        const shouldWrite = bleConnectedRef.current && (now - lastWriteTime >= 200);
        const shouldLog   = isSimulating && (now - lastVerifyLogTime >= 5000);

        if (shouldWrite || shouldLog) {
          if (shouldWrite) lastWriteTime = now;
          if (shouldLog)   lastVerifyLogTime = now;

          const totalDist = activeRoute.totalDistanceM || 1;
          const remainingSteps = activeRoute.steps.slice(stepIndex);
          const remainingDistM = remainingSteps.reduce((s, step) => s + step.distanceM, 0);
          const progressPct = Math.min(100, Math.max(0, Math.round(((totalDist - remainingDistM) / totalDist) * 100)));
          const traveledDistM = Math.max(0, totalDist - remainingDistM);

          const step = activeRoute.steps[stepIndex];
          const rawInstruction = step?.instruction || '';
          const streetName = rawInstruction
            .replace(/^(Turn\s+left\s+onto|Turn\s+right\s+onto|Head\s+|Continue\s+onto|Merge\s+onto|Keep\s+left\s+onto|Keep\s+right\s+onto)\s+/i, '')
            .substring(0, 30) || 'ACTIVE ROUTE';

          const arrived = isArrivedRef.current;
          const aheadPolyline = getRemainingPolyline(loc, activeRoute.polyline);
          const viewportData = projectRoadNetworkToRegion1(loc, aheadPolyline, activeRoute.steps, stepIndex, head, 1.3, 8, traveledDistM);

          // Detailed console log for coordinate mapping verification
          if (now - lastVerifyLogTime >= 2000) {
            lastVerifyLogTime = now;
            console.log(`[GEO-MAP] Loc: (${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}) Head: ${head.toFixed(0)}° Step: ${stepIndex} (${step?.instruction})`);
            console.log(`[GEO-MAP] MainPath (${viewportData.mainRoute.length} pts):`, viewportData.mainRoute.map(p => `(${p.x},${p.y})`).join(' -> '));
            console.log(`[GEO-MAP] Branches (${viewportData.sideBranches.length}):`, viewportData.sideBranches.map(b => `[(${b.x1},${b.y1})->(${b.x2},${b.y2})]`).join(' '));
          }

          const navPayload = {
            turnType: (arrived ? 6 : (step?.turnType ?? 0)) as any,
            distanceM: arrived ? 0 : dist,
            speedLimitKph: speedLimitKphRef.current,
            etaMin: arrived ? 0 : etaMinutes,
            tripProgressPct: arrived ? 100 : progressPct,
            sideRoadYOffset: Math.min(45, Math.max(0, Math.round(((450 - dist) * 45) / 450))),
            sideRoadAngleDeg: viewportData.turnAngleDeg,
            mapPath: viewportData.mainRoute,
            sideBranches: viewportData.sideBranches,
            streetName: arrived ? 'DESTINATION REACHED' : streetName.toUpperCase(),
            useMetric: useMetricRef.current,
          };

          if (shouldWrite) {
            writeNavState(navPayload).catch(console.error);
          }
        }
      }
    };

    if (isSimulating && route) {
      // Start Simulation Engine
      const sim = startRouteSimulation(
        route,
        (simData) => {
          handleTelemetryUpdate(simData.location, simData.speedKph, simData.heading);
          if (simData.isFinished) {
            setIsArrived(true);
            isArrivedRef.current = true;
          }
        },
        simulationMultiplier,
      );
      simControllerRef.current = sim;

      return () => {
        sim.stop();
        simControllerRef.current = null;
      };
    } else {
      // Real GPS Tracking
      const unsub = watchLocation((telemetry) => {
        handleTelemetryUpdate(telemetry.location, telemetry.speedKph, telemetry.heading);
      });

      return () => unsub();
    }
  }, [route, isRecording, isSimulating, simulationMultiplier]);

  const handleStop = () => {
    if (simControllerRef.current) {
      simControllerRef.current.stop();
    }
    setNavigating(false);
    setRecording(false);
    setSimulating(false);
    useNavStore.getState().clearRoute();
    navigation.goBack();
  };

  const handleReportPoi = (type: PoiType) => {
    const poi = { type, xRelM: 0, yRelM: 100 };
    setActivePoi(poi);
    setPoiToast(POI_LABELS[type] || 'Report Sent');

    if (bleConnected && route) {
      const step = route.steps[currentStepIndex];
      writeNavState({
        turnType: (step?.turnType ?? 0) as any,
        distanceM: distanceToNextM,
        speedLimitKph,
        etaMin,
        poi,
        useMetric,
      }).catch(console.error);
    }

    setTimeout(() => {
      setPoiToast(null);
      setActivePoi(null);
    }, 4000);
  };

  const toggleSimMultiplier = () => {
    const nextMultiplier = simulationMultiplier === 1.0 ? 2.0 : simulationMultiplier === 2.0 ? 5.0 : simulationMultiplier === 5.0 ? 10.0 : 1.0;
    setSimulationMultiplier(nextMultiplier);
    if (simControllerRef.current) {
      simControllerRef.current.setSpeedMultiplier(nextMultiplier);
    }
  };

  const handleSkipToNextTurn = () => {
    if (simControllerRef.current?.skipToNextTurn) {
      simControllerRef.current.skipToNextTurn();
    }
  };

  const toggleSimPause = () => {
    if (simControllerRef.current) {
      if (isSimPaused) {
        simControllerRef.current.resume();
        setIsSimPaused(false);
      } else {
        simControllerRef.current.pause();
        setIsSimPaused(true);
      }
    }
  };

  const remainingPolyline = (route && userLocation)
    ? getRemainingPolyline(userLocation, route.polyline)
    : (route?.polyline || []);

  const routeGeoJSON: GeoJSON.FeatureCollection | null = remainingPolyline.length >= 2
    ? {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: remainingPolyline.map(p => [p.longitude, p.latitude]),
          },
        }],
      }
    : null;

  const displayDist = useMetric 
    ? (distanceToNextM > 1000 ? `${(distanceToNextM / 1000).toFixed(1)} km` : `${distanceToNextM} m`)
    : (distanceToNextM * 3.28084 > 5280 ? `${(distanceToNextM / 1609.34).toFixed(1)} mi` : `${Math.round(distanceToNextM * 3.28084)} ft`);

  const currentStep = route?.steps[currentStepIndex];
  const nextStep = route?.steps[currentStepIndex + 1];

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const isSpeeding = speedLimitKph > 0 && currentSpeedKph > speedLimitKph;

  return (
    <View style={styles.container}>
      {!isCompassMode ? (
        <Map
          style={styles.map}
          mapStyle={OLA_STYLE_URL}
          attribution={false}
          logo={false}
        >
          {userLocation && (
            <Camera
              ref={mapCameraRef}
              center={[userLocation.longitude, userLocation.latitude]}
              zoom={17.5}
              pitch={55}
              bearing={heading}
              initialViewState={{
                center: [userLocation.longitude, userLocation.latitude],
                zoom: 17.5,
                pitch: 55,
                bearing: heading,
              }}
            />
          )}

          {userLocation && (
            <ViewAnnotation id="navUserLoc" lngLat={[userLocation.longitude, userLocation.latitude]}>
              <View style={styles.userDotNav}>
                <View style={[styles.userHeadingArrow, { transform: [{ rotate: `${heading}deg` }] }]}>
                  <Ionicons name="navigate" size={24} color={COLORS.accent} />
                </View>
              </View>
            </ViewAnnotation>
          )}

          {routeGeoJSON && (
            <GeoJSONSource id="navRouteSource" data={routeGeoJSON}>
              <Layer
                id="navRouteCasing"
                type="line"
                source="navRouteSource"
                paint={{
                  'line-color': '#10121A',
                  'line-width': 10,
                }}
              />
              <Layer
                id="navRouteFill"
                type="line"
                source="navRouteSource"
                paint={{
                  'line-color': offRouteState ? '#EF4444' : COLORS.accent,
                  'line-width': 6,
                }}
              />
            </GeoJSONSource>
          )}

          {destination && (
            <ViewAnnotation id="navDestLoc" lngLat={[destination.longitude, destination.latitude]}>
              <View style={styles.destPin}>
                <View style={styles.destPinInner} />
              </View>
            </ViewAnnotation>
          )}
        </Map>
      ) : (
        <View style={styles.compassContainer}>
          <View style={styles.compassRose}>
            <TurnArrow type={isArrived ? 6 : turnType} size={160} color={isArrived ? '#FFCF00' : '#FFFFFF'} />
            <Text style={styles.compassDistance}>{isArrived ? 'ARRIVED' : displayDist}</Text>
            <Text style={styles.compassLabel}>{isArrived ? 'Target Destination' : (TURN_LABELS[turnType] || 'Continue')}</Text>
          </View>
        </View>
      )}

      {/* Top Banner HUD */}
      <View style={[styles.topHeaderWrapper, { paddingTop: Math.max(insets.top, 20) }]}>
        {/* Off-Route Alert Banner */}
        {offRouteState && (
          <View style={styles.offRouteBanner}>
            <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.offRouteText}>
              {isRerouting ? 'Off route — Recalculating route...' : 'Off route! Proceeding to recalculate...'}
            </Text>
          </View>
        )}

        {/* POI Toast Notification */}
        {poiToast && (
          <View style={styles.poiToastBanner}>
            <Ionicons name="checkmark-circle" size={18} color="#10B981" style={{ marginRight: 6 }} />
            <Text style={styles.poiToastText}>{poiToast} broadcasted to device</Text>
          </View>
        )}

        <View style={styles.topHeader}>
          {isRecording ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={styles.recordingPulseDot} />
              <View>
                <Text style={styles.headerDistText}>Free Roam</Text>
                <Text style={styles.headerInstText}>GPS Recording Active</Text>
              </View>
            </View>
          ) : isArrived ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="checkmark-circle" size={40} color="#FFCF00" style={{ marginRight: 15 }} />
              <View>
                <Text style={styles.headerDistText}>You Have Arrived!</Text>
                <Text style={styles.headerInstText}>Trip completed successfully</Text>
              </View>
            </View>
          ) : (
            <View style={styles.turnInfoRow}>
              <TurnArrow type={turnType} size={44} color="#FFFFFF" />
              <View style={styles.topHeaderInfo}>
                <Text style={styles.headerDistText}>{displayDist}</Text>
                <Text style={styles.headerInstText} numberOfLines={1}>
                  {currentStep?.instruction || TURN_LABELS[turnType]}
                </Text>
                {nextStep && (
                  <Text style={styles.nextTurnSubtext} numberOfLines={1}>
                    Then {nextStep.instruction} ({nextStep.distanceM}m)
                  </Text>
                )}
              </View>
            </View>
          )}

          {/* Speed Limit Badge */}
          {speedLimitKph > 0 && !isRecording && (
            <View style={styles.speedLimitBadge}>
              <Text style={styles.speedLimitText}>{speedLimitKph}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Floating Simulation Control Bar */}
      {isSimulating && (
        <View style={[styles.simControlBar, { top: Math.max(insets.top + 135, 150) }]}>
          <View style={styles.simBadge}>
            <View style={styles.simDot} />
            <Text style={styles.simBadgeText}>DEMO SIMULATION</Text>
          </View>
          <View style={styles.simActionsRow}>
            <TouchableOpacity style={styles.simBtn} onPress={toggleSimPause}>
              <Ionicons name={isSimPaused ? 'play' : 'pause'} size={18} color="#000" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.simMultiplierBtn} onPress={toggleSimMultiplier}>
              <Text style={styles.simMultiplierText}>{simulationMultiplier}x</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.simSkipBtn} onPress={handleSkipToNextTurn}>
              <Ionicons name="play-forward" size={14} color="#000" />
              <Text style={styles.simSkipText}>Skip Turn</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Floating Speedometer HUD */}
      <View style={[styles.speedometerCard, { bottom: Math.max(insets.bottom + 175, 210) }]}>
        <Text style={[styles.speedValue, isSpeeding && styles.speedValueWarning]}>
          {currentSpeedKph}
        </Text>
        <Text style={styles.speedUnit}>{useMetric ? 'km/h' : 'mph'}</Text>
      </View>

      {/* Floating Controls Overlay */}
      <View style={[styles.floatingControls, { bottom: Math.max(insets.bottom + 105, 140) }]}>
        <TouchableOpacity style={styles.toggleBtn} onPress={() => setIsCompassMode(!isCompassMode)}>
          <Ionicons name={isCompassMode ? 'map' : 'compass'} size={24} color="#000" />
        </TouchableOpacity>

        {/* Hazard & POI Reporting Buttons */}
        {!isCompassMode && !isRecording && (
          <View style={styles.reportingRow}>
            <TouchableOpacity 
              style={[styles.reportBtn, { backgroundColor: '#EF4444' }]} 
              onPress={() => handleReportPoi(PoiType.Hazard)}
            >
              <MaterialCommunityIcons name="alert-octagon" size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.reportBtnText}>Hazard</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.reportBtn, { backgroundColor: '#F59E0B' }]} 
              onPress={() => handleReportPoi(PoiType.SpeedCamera)}
            >
              <MaterialCommunityIcons name="camera-control" size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.reportBtnText}>Camera</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.reportBtn, { backgroundColor: '#10B981' }]} 
              onPress={() => handleReportPoi(PoiType.Fuel)}
            >
              <MaterialCommunityIcons name="gas-station" size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.reportBtnText}>Fuel</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Bottom Telemetry Footer */}
      <View style={[styles.bottomFooter, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        {isRecording ? (
          <View style={styles.footerLeft}>
            <Text style={styles.etaText}>{formatTime(recordElapsed)}</Text>
            <Text style={styles.arrivalText}>Time Elapsed</Text>
          </View>
        ) : (
          <View style={styles.footerLeft}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 15 }}>
              <View>
                <Text style={styles.etaText}>{isArrived ? '0' : etaMin} min</Text>
                <Text style={styles.arrivalText}>ETA</Text>
              </View>
              <View style={styles.footerDivider} />
              <View>
                <Text style={styles.etaSubText}>
                  {route ? (route.totalDistanceM > 1000 ? `${(route.totalDistanceM / 1000).toFixed(1)} km` : `${route.totalDistanceM} m`) : '--'}
                </Text>
                <Text style={styles.arrivalText}>Remaining</Text>
              </View>
            </View>
          </View>
        )}
        
        <TouchableOpacity style={styles.stopButton} onPress={handleStop}>
          <Ionicons name="close" size={28} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0E0F14' },
  map: { flex: 1 },
  compassContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0E0F14',
  },
  compassRose: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  compassDistance: {
    color: '#FFFFFF',
    fontSize: 48,
    fontWeight: '900',
    marginTop: 20,
    letterSpacing: -1,
  },
  compassLabel: {
    color: '#9CA3AF',
    fontSize: 20,
    fontWeight: '600',
    marginTop: 6,
  },
  topHeaderWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(14, 15, 20, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    paddingTop: 8,
  },
  turnInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  topHeaderInfo: {
    marginLeft: 16,
    flex: 1,
  },
  headerDistText: { color: '#FFFFFF', fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  headerInstText: { color: '#E5E7EB', fontSize: 16, fontWeight: '600', marginTop: 2 },
  nextTurnSubtext: { color: '#9CA3AF', fontSize: 12, marginTop: 3 },
  speedLimitBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    borderWidth: 4,
    borderColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  speedLimitText: {
    color: '#000000',
    fontSize: 18,
    fontWeight: '900',
  },
  offRouteBanner: {
    backgroundColor: '#EF4444',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  offRouteText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  poiToastBanner: {
    backgroundColor: '#064E3B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#10B981',
  },
  poiToastText: {
    color: '#ECFDF5',
    fontSize: 13,
    fontWeight: '700',
  },
  simControlBar: {
    position: 'absolute',
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255, 204, 0, 0.95)',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  simBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  simDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#B45309',
    marginRight: 8,
  },
  simBadgeText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  simActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  simBtn: {
    backgroundColor: '#FFFFFF',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  simMultiplierBtn: {
    backgroundColor: '#000000',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  simMultiplierText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  simSkipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFCC00',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  simSkipText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '800',
  },
  speedometerCard: {
    position: 'absolute',
    left: 20,
    backgroundColor: 'rgba(14, 15, 20, 0.9)',
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#374151',
    alignItems: 'center',
    minWidth: 80,
  },
  speedValue: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
  },
  speedValueWarning: {
    color: '#EF4444',
  },
  speedUnit: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  floatingControls: {
    position: 'absolute',
    left: 20,
    right: 20,
    alignItems: 'flex-end',
  },
  toggleBtn: {
    backgroundColor: '#FFCF00',
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  reportingRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    gap: 8,
  },
  reportBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  reportBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  bottomFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0E0F14',
    borderTopWidth: 1,
    borderTopColor: '#1F2937',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 25,
    paddingTop: 18,
  },
  footerLeft: { flexDirection: 'column' },
  footerDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#374151',
  },
  etaText: { color: '#FFFFFF', fontSize: 26, fontWeight: '900' },
  etaSubText: { color: '#E5E7EB', fontSize: 20, fontWeight: '700' },
  arrivalText: { color: '#9CA3AF', fontSize: 13, fontWeight: '600' },
  stopButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1F2937',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#374151',
  },
  recordingPulseDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#EF4444',
    marginRight: 14,
  },
  userDotNav: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 163, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userHeadingArrow: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  destPin: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFCF00',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#0E0F14',
    elevation: 5,
  },
  destPinInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#000000' },
});

