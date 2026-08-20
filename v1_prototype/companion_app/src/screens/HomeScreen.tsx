import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, Keyboard, KeyboardAvoidingView, Platform } from 'react-native';
import { Map, Camera, ViewAnnotation, GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OLA_STYLE_URL, COLORS } from '../constants/config';
import { searchPlaces, getDirections, getPlaceDetails, PlaceSuggestion, LatLng } from '../services/olamaps';
import { useNavStore } from '../store/navStore';
import { getCurrentLocation, requestLocationPermission } from '../services/gps';
import { RouteTypeSelector } from '../components/RouteTypeSelector';
import { BLEStatusDot } from '../components/BLEStatusDot';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { userLocation, setUserLocation, destination, setDestination, setRoute, route, destinationName, clearRoute } = useNavStore();
  
  const [query, setQuery] = useState('');
  const [originQuery, setOriginQuery] = useState('Current Location');
  const [customOrigin, setCustomOrigin] = useState<LatLng | null>(null);
  const [activeInput, setActiveInput] = useState<'origin' | 'dest'>('dest');
  
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [routeType, setRouteType] = useState<'Fast' | 'Fun' | 'Compass'>('Fast');
  
  const insets = useSafeAreaInsets();

  const skipSearchRef = useRef(false);

  useEffect(() => {
    (async () => {
      const granted = await requestLocationPermission();
      if (granted) {
        const loc = await getCurrentLocation();
        setUserLocation(loc);
      }
    })();
  }, []);

  useEffect(() => {
    const q = activeInput === 'origin' ? originQuery : query;
    
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }

    const fetchSuggestions = async () => {
      let results: PlaceSuggestion[] = [];
      if (q.length > 2 && q !== 'Current Location') {
        try {
          results = await searchPlaces(q, userLocation || undefined);
        } catch (e) {
          console.error(e);
        }
      }
      
      if (activeInput === 'origin') {
        results = [
          { placeId: 'CURRENT_LOCATION', name: 'Current Location', description: 'Use your phone\'s GPS location' },
          ...results
        ];
      }
      
      setSuggestions(results);
    };

    const delay = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(delay);
  }, [query, originQuery, activeInput, userLocation]);

  const handleSelectPlace = async (placeId: string, name: string) => {
    skipSearchRef.current = true;
    Keyboard.dismiss();
    setSuggestions([]);
    
    if (placeId === 'CURRENT_LOCATION') {
      setOriginQuery('Current Location');
      setCustomOrigin(null);
      if (destination && userLocation) {
        setLoading(true);
        try {
          const routeRes = await getDirections(userLocation, destination);
          setRoute(routeRes);
        } catch (e) {
          console.error(e);
        } finally {
          setLoading(false);
        }
      }
      return;
    }

    setLoading(true);
    try {
      let resolvedLoc: LatLng;
      try {
        const details = await getPlaceDetails(placeId);
        resolvedLoc = details.location;
      } catch {
        resolvedLoc = {
          latitude: userLocation ? userLocation.latitude + 0.05 : 12.9716,
          longitude: userLocation ? userLocation.longitude + 0.05 : 77.5946,
        };
      }

      if (activeInput === 'origin') {
        setOriginQuery(name);
        setCustomOrigin(resolvedLoc);
        if (destination) {
          const routeRes = await getDirections(resolvedLoc, destination);
          setRoute(routeRes);
        }
      } else {
        setQuery(name);
        setDestination(resolvedLoc, name);
        const startLoc = customOrigin || userLocation;
        if (startLoc) {
          const routeRes = await getDirections(startLoc, resolvedLoc);
          setRoute(routeRes);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const [isPlanningMode, setIsPlanningMode] = useState(false);
  const [isRecordSetupMode, setIsRecordSetupMode] = useState(false);

  const handleStartNav = () => {
    if (route) {
      useNavStore.getState().setNavigating(true);
      navigation.navigate('Navigation');
    }
  };

  const handleStartRecording = () => {
    useNavStore.getState().setRecording(true);
    navigation.navigate('Navigation');
  };

  const handleClosePlanning = () => {
    setIsPlanningMode(false);
    setIsRecordSetupMode(false);
    clearRoute();
    setQuery('');
    setSuggestions([]);
    Keyboard.dismiss();
  };

  // Center for Camera: [lng, lat]
  const cameraCenter: [number, number] | undefined = userLocation
    ? [userLocation.longitude, userLocation.latitude]
    : undefined;

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

  return (
    <View style={styles.container}>
      <Map
        style={styles.map}
        mapStyle={OLA_STYLE_URL}
        attribution={false}
        logo={false}
      >
        {cameraCenter && (
          <Camera
            center={cameraCenter}
            zoom={12}
          />
        )}

        {userLocation && (
          <ViewAnnotation
            id="userLoc"
            lngLat={[userLocation.longitude, userLocation.latitude]}
          >
            <View style={styles.userDot} />
          </ViewAnnotation>
        )}

        {routeGeoJSON && (
          <GeoJSONSource id="routeSource" data={routeGeoJSON}>
            <Layer
              id="routeFill"
              type="line"
              source="routeSource"
              paint={{
                'line-color': '#000000',
                'line-width': 4,
              }}
            />
          </GeoJSONSource>
        )}

        {destination && (
          <ViewAnnotation
            id="destLoc"
            lngLat={[destination.longitude, destination.latitude]}
          >
            <View style={styles.destPin}>
              <View style={styles.destPinInner} />
            </View>
          </ViewAnnotation>
        )}
      </Map>

      {!isPlanningMode && (
        <View style={[styles.topRightControls, { top: Math.max(insets.top, 50) }]}>
          <View style={styles.bleIndicator}>
            <BLEStatusDot />
          </View>
        </View>
      )}

      {isPlanningMode && (
        <>
          {/* Top Left Back Button */}
          <TouchableOpacity 
            style={[styles.backBtn, { top: Math.max(insets.top, 50) }]} 
            onPress={handleClosePlanning}
          >
            <Ionicons name="chevron-back" size={24} color="#000" />
          </TouchableOpacity>

          {/* Top Right Map Controls Stack */}
          <View style={[styles.rightMapControls, { top: Math.max(insets.top, 50) }]}>
            <TouchableOpacity style={styles.mapControlBtn}>
              <Ionicons name="settings-outline" size={22} color="#000" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.mapControlBtn}>
              <Ionicons name="compass-outline" size={22} color="#000" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.mapControlBtn}>
              <MaterialCommunityIcons name="crosshairs-gps" size={22} color="#000" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.mapControlBtn}>
              <Ionicons name="layers-outline" size={22} color="#000" />
            </TouchableOpacity>
          </View>

        </>
      )}

      {!isPlanningMode && !isRecordSetupMode && (
        <View style={styles.floatingActionContainer}>
          <TouchableOpacity style={styles.recordBtn} onPress={() => setIsRecordSetupMode(true)}>
            <View style={styles.recordDot} />
            <Text style={styles.recordText}>Record</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.planRideBtn} onPress={() => setIsPlanningMode(true)}>
            <Text style={styles.planRideText}>Plan Ride</Text>
          </TouchableOpacity>
        </View>
      )}

      {isPlanningMode && (
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardWrapper}
          pointerEvents="box-none"
        >
          {/* Horizontal Pills Above Bottom Sheet */}
          <View style={styles.horizontalPillsContainer}>
            <View style={styles.horizPill}>
              <Ionicons name="swap-horizontal" size={14} color="#555" />
              <Text style={styles.horizPillText}>One way</Text>
            </View>
            <View style={styles.horizPill}>
              <Ionicons name="refresh" size={14} color="#555" />
              <Text style={styles.horizPillText}>Generate: Off</Text>
            </View>
            <View style={styles.horizPill}>
              <MaterialCommunityIcons name="car-multiple" size={14} color="#555" />
              <Text style={styles.horizPillText}>Traffic: Off</Text>
            </View>
          </View>

          <View style={styles.bottomSheet}>
            <View style={styles.dragHandle} />
          
          {/* Inputs Section */}
          <View style={styles.inputsWrapper}>
            <View style={styles.inputsLeft}>
              <View style={styles.timelineGraphicLeft}>
                <View style={[styles.timelineDot, { backgroundColor: '#3B82F6' }]} />
                <View style={styles.timelineLineLeft} />
                <View style={[styles.timelineDot, { backgroundColor: COLORS.accent }]} />
              </View>
              <View style={styles.inputsColumn}>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.searchInputInline}
                    placeholder="Current Location"
                    placeholderTextColor="#999"
                    value={originQuery}
                    onChangeText={setOriginQuery}
                    onFocus={() => setActiveInput('origin')}
                  />
                </View>
                <View style={styles.inputDivider} />
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.searchInputInline}
                    placeholder="Where to?"
                    placeholderTextColor="#999"
                    value={query}
                    onChangeText={setQuery}
                    onFocus={() => setActiveInput('dest')}
                  />
                </View>
              </View>
            </View>
            <View style={styles.inputsRight}>
              <TouchableOpacity style={styles.swapBtn}>
                <Ionicons name="swap-vertical" size={20} color="#666" />
              </TouchableOpacity>
              <View style={styles.inputDividerRight} />
              <TouchableOpacity style={styles.addViaBtn}>
                <MaterialCommunityIcons name="playlist-plus" size={22} color="#666" />
              </TouchableOpacity>
            </View>
          </View>

          {suggestions.length > 0 && (
            <View style={styles.suggestionsContainer}>
              <FlatList
                data={suggestions}
                keyExtractor={(item) => item.placeId}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.suggestionItem} onPress={() => handleSelectPlace(item.placeId, item.name)}>
                    <Text style={styles.suggestionName}>{item.name}</Text>
                    <Text style={styles.suggestionDesc} numberOfLines={1}>{item.description}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}

          {route && !suggestions.length && (
            <View style={styles.routeDetailsContainer}>
              <RouteTypeSelector selected={routeType} onSelect={setRouteType} />
              
              {/* Primary Stats */}
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Ionicons name="swap-horizontal" size={16} color="#FFCF00" style={{marginRight: 4}} />
                  <Text style={styles.statText}>{(route.totalDistanceM / 1000).toFixed(1)} km</Text>
                </View>
                <View style={styles.statItem}>
                  <Ionicons name="time-outline" size={16} color="#FFCF00" style={{marginRight: 4}} />
                  <Text style={styles.statText}>{Math.round(route.totalDurationSec / 60)} min</Text>
                </View>
                <View style={styles.statItem}>
                  <Ionicons name="trending-up" size={16} color="#FFCF00" style={{marginRight: 4}} />
                  <Text style={styles.statText}>1112 m</Text>
                </View>
              </View>

              {/* Secondary Stats */}
              <View style={styles.tagsRow}>
                <View style={styles.tagPill}>
                  <MaterialCommunityIcons name="motorbike" size={18} color="#555" />
                </View>
                <View style={styles.tagPill}>
                  <Ionicons name="warning-outline" size={16} color="#555" style={{marginRight: 4}} />
                  <Text style={styles.tagText}>0% highways</Text>
                </View>
                <View style={styles.tagPill}>
                  <MaterialCommunityIcons name="pine-tree" size={16} color="#555" style={{marginRight: 4}} />
                  <Text style={styles.tagText}>2% unpaved</Text>
                </View>
              </View>
              
              {/* Action Buttons */}
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.secondaryBtn}>
                  <Text style={styles.secondaryBtnText}>More info</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryBtn}>
                  <Text style={styles.secondaryBtnText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.goBtn} onPress={handleStartNav}>
                  <Text style={styles.goText}>Go</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
        </KeyboardAvoidingView>
      )}

      {isRecordSetupMode && (
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardWrapper}
          pointerEvents="box-none"
        >
          <View style={styles.header}>
            <View style={[styles.searchBlock, { backgroundColor: 'transparent', borderWidth: 0, shadowOpacity: 0, elevation: 0 }]} />
            <TouchableOpacity style={styles.closePlanningBtn} onPress={handleClosePlanning}>
              <Text style={{color: '#fff', fontSize: 16, fontWeight: 'bold'}}>X</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.bottomSheet}>
            <Text style={[styles.routeStats, { fontSize: 20, fontWeight: 'bold', color: COLORS.text }]}>Free Roam</Text>
            <Text style={[styles.routeStats, { marginBottom: 30 }]}>GPS tracking without a destination.</Text>
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.goBtn} onPress={handleStartRecording}>
                <Text style={styles.goText}>Start Recording</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  map: { flex: 1 },
  topRightControls: {
    position: 'absolute',
    top: 50,
    right: 20,
    alignItems: 'flex-end',
  },
  bleIndicator: {
    backgroundColor: COLORS.surface,
    padding: 12,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  floatingActionContainer: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 15,
  },
  recordBtn: {
    backgroundColor: COLORS.surface,
    paddingVertical: 15,
    paddingHorizontal: 25,
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  recordDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'red',
    marginRight: 8,
  },
  recordText: {
    color: COLORS.text,
    fontWeight: 'bold',
    fontSize: 16,
  },
  planRideBtn: {
    backgroundColor: '#FFCC00',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 30,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  planRideText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 16,
  },
  backBtn: {
    position: 'absolute',
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 5,
  },
  rightMapControls: {
    position: 'absolute',
    right: 20,
    gap: 10,
  },
  mapControlBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 5,
  },
  horizontalPillsContainer: {
    flexDirection: 'row',
    gap: 10,
    marginLeft: 20,
    marginBottom: 15,
  },
  horizPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  horizPillText: {
    marginLeft: 6,
    color: '#333',
    fontWeight: '600',
    fontSize: 13,
  },
  keyboardWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    top: 0,
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: '#F9FAFB', // Light theme like screenshot
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 15,
    elevation: 10,
  },
  dragHandle: {
    width: 40,
    height: 5,
    backgroundColor: '#CCC',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 15,
  },
  inputsWrapper: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
    marginBottom: 10,
  },
  inputsLeft: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 5,
  },
  timelineGraphicLeft: {
    width: 30,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  timelineLineLeft: {
    width: 2,
    flex: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 4,
  },
  inputsColumn: {
    flex: 1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
  },
  inputDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  searchInputInline: {
    flex: 1,
    color: '#000',
    fontSize: 16,
    padding: 0,
    fontWeight: '500',
  },
  inputsRight: {
    width: 50,
    borderLeftWidth: 1,
    borderLeftColor: '#E5E7EB',
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  swapBtn: { padding: 5 },
  inputDividerRight: { width: 30, height: 1, backgroundColor: '#E5E7EB' },
  addViaBtn: { padding: 5 },
  suggestionsContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    maxHeight: 200,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: 5,
    marginBottom: 10,
  },
  suggestionItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  suggestionName: { color: '#000', fontWeight: 'bold' },
  suggestionDesc: { color: '#666', fontSize: 13, marginTop: 4 },
  routeDetailsContainer: {
    marginTop: 5,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 15,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statText: {
    color: '#333',
    fontWeight: '600',
    fontSize: 15,
  },
  tagsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 20,
  },
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E5E7EB',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  tagText: {
    color: '#555',
    fontSize: 13,
    fontWeight: '600',
  },
  actionRow: { 
    flexDirection: 'row', 
    gap: 10,
  },
  secondaryBtn: {
    paddingVertical: 15,
    paddingHorizontal: 15,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: '#333',
    fontWeight: 'bold',
    fontSize: 15,
  },
  goBtn: { 
    flex: 1, 
    paddingVertical: 15, 
    borderRadius: 12, 
    backgroundColor: '#FFCC00', 
    alignItems: 'center',
    justifyContent: 'center',
  },
  goText: { color: '#000', fontWeight: 'bold', fontSize: 18 },
  userDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#3B82F6', borderWidth: 3, borderColor: COLORS.surface },
  destPin: { width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.accent, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: COLORS.surface, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3 },
  destPinInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#000' },
});
