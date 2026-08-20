import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Map, Camera, ViewAnnotation, GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavStore } from '../store/navStore';
import { COLORS, OLA_STYLE_URL } from '../constants/config';
import { TurnArrow } from '../components/TurnArrow';
import { TURN_LABELS } from '../constants/ble';
import { watchLocation, getNavigationProgress } from '../services/gps';
import { writeNavState } from '../services/ble';
import { Ionicons } from '@expo/vector-icons';

export function NavigationScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const insets = useSafeAreaInsets();
  const { 
    route, currentStepIndex, turnType, distanceToNextM, etaMin,
    setNavProgress, setNavigating, setRecording, isRecording, setEta, bleConnected, useMetric, userLocation, destination
  } = useNavStore();

  const [isCompassMode, setIsCompassMode] = useState(false);
  
  // Mock recording stats
  const [recordElapsed, setRecordElapsed] = useState(0);
  const [recordSpeed, setRecordSpeed] = useState(0);
  
  useEffect(() => {
    if (isRecording) {
      const interval = setInterval(() => {
        setRecordElapsed(prev => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isRecording]);

  useEffect(() => {
    if (!route && !isRecording) return;
    
    const unsub = watchLocation((loc) => {
      useNavStore.getState().setUserLocation(loc);
      
      if (isRecording) {
        setRecordSpeed(loc.coords?.speed ?? 0);
        // We could write dummy nav state to the device here if we wanted the device to show free roam stats!
      } else if (route) {
        const { stepIndex, distanceToNextM: dist } = getNavigationProgress(loc, route.steps, currentStepIndex);
        setNavProgress(stepIndex, dist);

        const remainingSteps = route.steps.slice(stepIndex);
        const remainingDistM = remainingSteps.reduce((s, step) => s + step.distanceM, 0);
        const etaMinutes = Math.max(1, Math.round((remainingDistM / 1000 / 30) * 60));
        setEta(etaMinutes);
        
        if (bleConnected) {
          const totalDist = route.totalDistanceM || 1;
          const progressPct = Math.min(100, Math.max(0, Math.round(((totalDist - remainingDistM) / totalDist) * 100)));
          const step = route.steps[stepIndex];
          const rawInstruction = step?.instruction || '';
          const streetName = rawInstruction.replace(/^(Turn\s+left\s+onto|Turn\s+right\s+onto|Head\s+|Continue\s+onto|Merge\s+onto|Keep\s+left\s+onto|Keep\s+right\s+onto)\s+/i, '').substring(0, 30) || 'ACTIVE ROUTE';

          writeNavState({
            turnType: (step?.turnType ?? 0) as any,
            distanceM: dist,
            speedLimitKph: 50,
            etaMin: etaMinutes,
            tripProgressPct: progressPct,
            sideRoadYOffset: Math.min(45, Math.max(0, Math.round(((450 - dist) * 45) / 450))),
            streetName: streetName.toUpperCase(),
            useMetric: useNavStore.getState().useMetric,
          }).catch(console.error);
        }
      }
    });

    return () => unsub();
  }, [route, isRecording, currentStepIndex, bleConnected]);

  const handleStop = () => {
    setNavigating(false);
    setRecording(false);
    useNavStore.getState().clearRoute();
    navigation.goBack();
  };

  const routeGeoJSON: GeoJSON.FeatureCollection | null = route
    ? {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: route.polyline.map(p => [p.longitude, p.latitude]),
          },
        }],
      }
    : null;

  const displayDist = useMetric 
    ? (distanceToNextM > 1000 ? `${(distanceToNextM / 1000).toFixed(1)} km` : `${distanceToNextM} m`)
    : (distanceToNextM * 3.28084 > 5280 ? `${(distanceToNextM / 1609.34).toFixed(1)} mi` : `${Math.round(distanceToNextM * 3.28084)} ft`);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

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
              center={[userLocation.longitude, userLocation.latitude]}
              zoom={16}
              pitch={45}
              trackUserLocation="heading"
            />
          )}

          {userLocation && (
            <ViewAnnotation id="navUserLoc" lngLat={[userLocation.longitude, userLocation.latitude]}>
              <View style={styles.userDotNav}>
                <View style={styles.userDotNavInner} />
              </View>
            </ViewAnnotation>
          )}

          {routeGeoJSON && (
            <GeoJSONSource id="navRouteSource" data={routeGeoJSON}>
              <Layer
                id="navRouteFill"
                type="line"
                source="navRouteSource"
                paint={{
                  'line-color': '#1E88E5',
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
          <TurnArrow type={turnType} size={180} />
          <Text style={styles.compassDistance}>{displayDist}</Text>
        </View>
      )}

      {/* Top Black Header */}
      <View style={[styles.topHeaderWrapper, { paddingTop: Math.max(insets.top, 15) }]}>
        <View style={styles.topHeader}>
          {isRecording ? (
            <View style={{flexDirection: 'row', alignItems: 'center', marginLeft: 10}}>
              <View style={{width: 12, height: 12, borderRadius: 6, backgroundColor: 'red', marginRight: 15}} />
              <View>
                <Text style={styles.headerDistText}>Recording</Text>
                <Text style={styles.headerInstText}>Free Roam Mode</Text>
              </View>
            </View>
          ) : (
            <>
              <TurnArrow type={turnType} size={40} color="#fff" />
              <View style={styles.topHeaderInfo}>
                <Text style={styles.headerDistText}>{displayDist}</Text>
                <Text style={styles.headerInstText}>{TURN_LABELS[turnType]}</Text>
              </View>
            </>
          )}
        </View>
      </View>

      {/* Floating Controls Overlay */}
      <View style={[styles.floatingControls, { bottom: Math.max(insets.bottom + 120, 160) }]}>
        <TouchableOpacity style={styles.toggleBtn} onPress={() => setIsCompassMode(!isCompassMode)}>
          <Ionicons name={isCompassMode ? 'map' : 'compass'} size={24} color="#000" />
        </TouchableOpacity>

        {!isCompassMode && (
          <View style={styles.reportingRow}>
            <TouchableOpacity style={[styles.reportBtn, { backgroundColor: '#F83A3A' }]}>
              <Text style={styles.reportBtnText}>Bad road</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.reportBtn, { backgroundColor: '#00A341' }]}>
              <Text style={styles.reportBtnText}>Good road</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Bottom Black Footer */}
      <View style={[styles.bottomFooter, { paddingBottom: Math.max(insets.bottom, 25) }]}>
        {isRecording ? (
          <View style={styles.footerLeft}>
            <Text style={styles.etaText}>{formatTime(recordElapsed)}</Text>
            <Text style={styles.arrivalText}>Elapsed</Text>
          </View>
        ) : (
          <View style={styles.footerLeft}>
            <Text style={styles.etaText}>{etaMin} min</Text>
            <Text style={styles.arrivalText}>ETA</Text>
          </View>
        )}
        
        <TouchableOpacity style={styles.stopButton} onPress={handleStop}>
          <Text style={{color: '#fff', fontSize: 24, fontWeight: 'bold'}}>×</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A1A1A' },
  map: { flex: 1 },
  compassContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
  },
  compassDistance: {
    color: '#fff',
    fontSize: 48,
    fontWeight: 'bold',
    marginTop: 20,
  },
  topHeaderWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1A1A1A',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 15,
  },
  topHeaderInfo: {
    marginLeft: 15,
  },
  headerDistText: { color: '#fff', fontSize: 32, fontWeight: 'bold' },
  headerInstText: { color: '#aaa', fontSize: 18 },
  floatingControls: {
    position: 'absolute',
    left: 20,
    right: 20,
    alignItems: 'flex-end',
  },
  toggleBtn: {
    backgroundColor: '#FFCC00',
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  reportingRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
  },
  reportBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  reportBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  bottomFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1A1A1A',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 30,
    paddingTop: 25,
  },
  footerLeft: { flexDirection: 'column' },
  etaText: { color: '#fff', fontSize: 28, fontWeight: 'bold' },
  arrivalText: { color: '#aaa', fontSize: 16 },
  stopButton: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: '#333',
    justifyContent: 'center', alignItems: 'center',
  },
  userDotNav: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(30, 136, 229, 0.3)', justifyContent: 'center', alignItems: 'center' },
  userDotNavInner: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#1E88E5', borderWidth: 2, borderColor: '#fff' },
  destPin: { width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.accent, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: COLORS.surface, elevation: 5 },
  destPinInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#000' },
});
