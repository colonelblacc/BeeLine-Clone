import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, Keyboard, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Map, Camera, CameraRef, ViewAnnotation, GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OLA_STYLE_URL, OLA_STYLE_DARK_URL, COLORS } from '../constants/config';
import { searchPlaces, getDirections, getPlaceDetails, PlaceSuggestion, LatLng } from '../services/olamaps';
import { useNavStore } from '../store/navStore';
import { getCurrentLocation, requestLocationPermission } from '../services/gps';
import { RouteTypeSelector } from '../components/RouteTypeSelector';
import { BLEStatusDot } from '../components/BLEStatusDot';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DEBUG_ROUTE } from '../constants/debugRoute';

export function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { userLocation, setUserLocation, destination, setDestination, setRoute, route, destinationName, clearRoute, bleConnected, connectedDeviceName } = useNavStore();
  
  const [query, setQuery] = useState('');
  const [originQuery, setOriginQuery] = useState('Current Location');
  const [viaQuery, setViaQuery] = useState('');
  const [customOrigin, setCustomOrigin] = useState<LatLng | null>(null);
  const [customVia, setCustomVia] = useState<LatLng | null>(null);
  const [showViaInput, setShowViaInput] = useState(false);
  const [activeInput, setActiveInput] = useState<'origin' | 'dest' | 'via'>('dest');
  
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [routeType, setRouteType] = useState<'Fast' | 'Fun' | 'Compass'>('Fast');
  
  const insets = useSafeAreaInsets();

  const skipSearchRef = useRef(false);
  const hasInitialCenteredRef = useRef(false);
  const mapCameraRef = useRef<CameraRef>(null);

  const [isPlanningMode, setIsPlanningMode] = useState(false);
  const [isRecordSetupMode, setIsRecordSetupMode] = useState(false);
  
  // Interactive Pill & Map Options States
  const [isRoundTrip, setIsRoundTrip] = useState(false);
  const [isGenerateOn, setIsGenerateOn] = useState(false);
  const [isTrafficOn, setIsTrafficOn] = useState(false);
  const [showStepModal, setShowStepModal] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [mapStyleIndex, setMapStyleIndex] = useState(0);

  const mapStyles = [OLA_STYLE_URL, OLA_STYLE_DARK_URL];
  const currentMapStyle = mapStyles[mapStyleIndex];

  const quickCategories = [
    { label: 'Cafe', icon: 'coffee', query: 'Cafe coffee' },
    { label: 'Fuel', icon: 'gas-station', query: 'Petrol pump gas station' },
    { label: 'Scenic', icon: 'pine-tree', query: 'Viewpoint park scenic' },
    { label: 'Parking', icon: 'parking', query: 'Parking spot' },
  ];

  useEffect(() => {
    (async () => {
      const granted = await requestLocationPermission();
      if (granted) {
        const loc = await getCurrentLocation();
        setUserLocation(loc);
      }
    })();
  }, []);

  // Smoothly center and autozoom to user's location when GPS is obtained or updated
  useEffect(() => {
    if (userLocation && mapCameraRef.current && !route) {
      try {
        mapCameraRef.current.flyTo({
          center: [userLocation.longitude, userLocation.latitude],
          zoom: 15.5,
          duration: 1000,
          easing: 'fly',
        });
      } catch (e) {
        console.warn('[Camera] Center error:', e);
      }
    }
  }, [userLocation]);

  useEffect(() => {
    const q = activeInput === 'origin' ? originQuery : activeInput === 'via' ? viaQuery : query;
    
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
  }, [query, originQuery, viaQuery, activeInput, userLocation]);

  const handleSelectQuickCategory = async (catQuery: string) => {
    setActiveInput('dest');
    setLoading(true);
    try {
      const results = await searchPlaces(catQuery, userLocation || undefined);
      setSuggestions(results);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const calculateActiveRoute = async (
    start: LatLng, 
    dest: LatLng, 
    roundTrip: boolean = isRoundTrip,
    twisty: boolean = isGenerateOn
  ) => {
    setLoading(true);
    try {
      let routeRes = await getDirections(start, dest);
      
      if (roundTrip) {
        // Return journey
        const returnPolyline = [...routeRes.polyline].reverse();
        routeRes = {
          ...routeRes,
          polyline: [...routeRes.polyline, ...returnPolyline],
          totalDistanceM: routeRes.totalDistanceM * 2,
          totalDurationSec: routeRes.totalDurationSec * 2,
        };
      }
      
      setRoute(routeRes);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPlace = async (placeId: string, name: string) => {
    skipSearchRef.current = true;
    Keyboard.dismiss();
    setSuggestions([]);
    
    if (placeId === 'CURRENT_LOCATION') {
      setOriginQuery('Current Location');
      setCustomOrigin(null);
      if (destination && userLocation) {
        await calculateActiveRoute(userLocation, destination);
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
          await calculateActiveRoute(resolvedLoc, destination);
        }
      } else if (activeInput === 'via') {
        setViaQuery(name);
        setCustomVia(resolvedLoc);
        const startLoc = customOrigin || userLocation;
        if (startLoc && destination) {
          await calculateActiveRoute(startLoc, destination);
        }
      } else {
        setQuery(name);
        setDestination(resolvedLoc, name);
        const startLoc = customOrigin || userLocation;
        if (startLoc) {
          await calculateActiveRoute(startLoc, resolvedLoc);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSwapLocations = async () => {
    const tempQuery = query;
    const tempOriginQuery = originQuery;
    const tempDest = destination;
    const tempOrigin = customOrigin || userLocation;

    setQuery(tempOriginQuery === 'Current Location' ? '' : tempOriginQuery);
    setOriginQuery(tempQuery || 'Current Location');
    
    if (tempDest) setCustomOrigin(tempDest);
    else setCustomOrigin(null);

    if (tempOrigin && tempQuery) {
      setDestination(tempOrigin, tempOriginQuery);
      await calculateActiveRoute(tempDest || userLocation!, tempOrigin);
    }
  };

  const handleToggleRoundTrip = () => {
    const nextVal = !isRoundTrip;
    setIsRoundTrip(nextVal);
    const startLoc = customOrigin || userLocation;
    if (startLoc && destination) {
      calculateActiveRoute(startLoc, destination, nextVal, isGenerateOn);
    }
  };

  const handleToggleGenerate = () => {
    const nextVal = !isGenerateOn;
    setIsGenerateOn(nextVal);
    const startLoc = customOrigin || userLocation;
    if (startLoc && destination) {
      calculateActiveRoute(startLoc, destination, isRoundTrip, nextVal);
    }
  };

  const handleToggleTraffic = () => {
    setIsTrafficOn(prev => !prev);
  };

  const handleRecenter = () => {
    if (userLocation && mapCameraRef.current) {
      try {
        mapCameraRef.current.flyTo({
          center: [userLocation.longitude, userLocation.latitude],
          zoom: 16,
          duration: 800,
          easing: 'fly',
        });
      } catch (e) {
        console.warn('[Camera] Recenter error:', e);
      }
    }
  };

  const handleResetNorth = () => {
    if (mapCameraRef.current) {
      const center: [number, number] = userLocation ? [userLocation.longitude, userLocation.latitude] : [77.5946, 12.9716];
      try {
        mapCameraRef.current.easeTo({
          center: center,
          bearing: 0,
          duration: 800,
        });
      } catch (e) {
        console.warn('[Camera] ResetNorth error:', e);
      }
    }
  };

  const handleToggleMapStyle = () => {
    setMapStyleIndex(prev => (prev + 1) % 2);
  };

  const handleStartNav = () => {
    if (route) {
      useNavStore.getState().setSimulating(false);
      useNavStore.getState().setNavProgress(0, route.steps[0]?.distanceM || 0);
      useNavStore.getState().setNavigating(true);
      navigation.navigate('Navigation');
    }
  };

  const handleStartSimulation = () => {
    if (route) {
      useNavStore.getState().setSimulating(true, 1.0);
      useNavStore.getState().setNavProgress(0, route.steps[0]?.distanceM || 0);
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
    setShowStepModal(false);
    setShowViaInput(false);
    clearRoute();
    setQuery('');
    setViaQuery('');
    setSuggestions([]);
    Keyboard.dismiss();
  };

  // Smoothly fit map camera to full route bounds when route is loaded
  useEffect(() => {
    if (route && route.polyline.length > 0 && mapCameraRef.current) {
      const lats = route.polyline.map(p => p.latitude);
      const lngs = route.polyline.map(p => p.longitude);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);

      // Bounds are [west, south, east, north] -> [minLng, minLat, maxLng, maxLat]
      mapCameraRef.current.fitBounds?.(
        [minLng, minLat, maxLng, maxLat],
        {
          padding: { top: 80, bottom: 240, left: 50, right: 50 },
          duration: 1000,
        }
      );
    }
  }, [route]);

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
        mapStyle={currentMapStyle}
        attribution={false}
        logo={false}
        onDidFinishLoadingMap={() => {
          if (userLocation && mapCameraRef.current && !route) {
            try {
              mapCameraRef.current.flyTo({
                center: [userLocation.longitude, userLocation.latitude],
                zoom: 15.5,
                duration: 800,
                easing: 'fly',
              });
            } catch (e) {}
          }
        }}
      >
        <Camera
          ref={mapCameraRef}
          center={userLocation ? [userLocation.longitude, userLocation.latitude] : [77.5946, 12.9716]}
          zoom={15.5}
          initialViewState={{
            center: userLocation ? [userLocation.longitude, userLocation.latitude] : [77.5946, 12.9716],
            zoom: 15.5,
          }}
        />

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
                'line-color': isGenerateOn ? '#10B981' : COLORS.accent,
                'line-width': 5,
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
        <View style={[styles.topHeaderRow, { top: Math.max(insets.top, 50) }]}>
          {/* Pair Device Capsule Button on Top-Left */}
          <TouchableOpacity 
            style={[styles.deviceCapsule, bleConnected && styles.deviceCapsuleConnected]}
            onPress={() => navigation.navigate('Device')}
            activeOpacity={0.8}
          >
            <BLEStatusDot />
            <Text style={styles.deviceCapsuleText}>
              {bleConnected ? (connectedDeviceName || 'BeeLine Connected') : 'Pair Device'}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={bleConnected ? '#22C55E' : COLORS.textMuted} style={{ marginLeft: 4 }} />
          </TouchableOpacity>

          {/* Quick Map Controls on Top-Right */}
          <View style={styles.topRightControlsRow}>
            <TouchableOpacity style={styles.mapControlBtnSmall} onPress={handleToggleMapStyle}>
              <Ionicons name="layers-outline" size={20} color={mapStyleIndex === 1 ? COLORS.accent : "#000"} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.mapControlBtnSmall} onPress={handleRecenter}>
              <MaterialCommunityIcons name="crosshairs-gps" size={20} color="#000" />
            </TouchableOpacity>
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
            <TouchableOpacity style={styles.mapControlBtn} onPress={() => navigation.navigate('Settings')}>
              <Ionicons name="settings-outline" size={22} color="#000" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.mapControlBtn} onPress={handleResetNorth}>
              <Ionicons name="compass-outline" size={22} color="#000" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.mapControlBtn} onPress={handleRecenter}>
              <MaterialCommunityIcons name="crosshairs-gps" size={22} color="#000" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.mapControlBtn, mapStyleIndex === 1 && { backgroundColor: '#1F2937' }]} onPress={handleToggleMapStyle}>
              <Ionicons name="layers-outline" size={22} color={mapStyleIndex === 1 ? COLORS.accent : "#000"} />
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
            <TouchableOpacity 
              style={[styles.horizPill, isRoundTrip && { backgroundColor: '#FFCC00' }]} 
              onPress={handleToggleRoundTrip}
            >
              <Ionicons name="swap-horizontal" size={14} color="#333" />
              <Text style={styles.horizPillText}>{isRoundTrip ? 'Round trip ✓' : 'One way'}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.horizPill, isGenerateOn && { backgroundColor: '#10B981' }]} 
              onPress={handleToggleGenerate}
            >
              <Ionicons name="sparkles" size={14} color={isGenerateOn ? '#fff' : '#333'} />
              <Text style={[styles.horizPillText, isGenerateOn && { color: '#fff', fontWeight: 'bold' }]}>
                {isGenerateOn ? 'Curated Scenic' : 'Scenic Mode'}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.horizPill, isTrafficOn && { backgroundColor: '#FFCC00' }]} 
              onPress={handleToggleTraffic}
            >
              <MaterialCommunityIcons name="car-multiple" size={14} color="#333" />
              <Text style={styles.horizPillText}>Traffic: {isTrafficOn ? 'Live On' : 'Off'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.bottomSheet}>
            <View style={styles.dragHandle} />
          
          {/* Quick Categories Bar (When no destination chosen yet) */}
          {!destination && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickChipsScroll}>
              <TouchableOpacity 
                style={[styles.quickChip, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B', borderWidth: 1 }]}
                onPress={() => {
                  setOriginQuery('Kulangara Mills, Mookkannoor');
                  setQuery('Foodcafe Caterers, Mookkannoor');
                  setDestination({ latitude: 10.20176, longitude: 76.39160 }, 'Foodcafe Caterers, Mookkannoor');
                  setUserLocation({ latitude: 10.19689, longitude: 76.38528 });
                  setRoute(DEBUG_ROUTE);
                  try {
                    mapCameraRef.current?.flyTo({
                      center: [76.38528, 10.19689],
                      zoom: 15,
                      duration: 1000,
                      easing: 'fly',
                    });
                  } catch (e) {
                    console.warn('[Camera] TestRoute fly error:', e);
                  }
                }}
              >
                <MaterialCommunityIcons name="map-marker-path" size={16} color="#D97706" style={{ marginRight: 5 }} />
                <Text style={[styles.quickChipText, { color: '#B45309', fontWeight: 'bold' }]}>📍 Test Mookkannoor Route</Text>
              </TouchableOpacity>
              {quickCategories.map((cat) => (
                <TouchableOpacity 
                  key={cat.label} 
                  style={styles.quickChip}
                  onPress={() => handleSelectQuickCategory(cat.query)}
                >
                  <MaterialCommunityIcons name={cat.icon as any} size={16} color="#333" style={{ marginRight: 5 }} />
                  <Text style={styles.quickChipText}>{cat.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Inputs Section */}
          <View style={styles.inputsWrapper}>
            <View style={styles.inputsLeft}>
              <View style={styles.timelineGraphicLeft}>
                <View style={[styles.timelineDot, { backgroundColor: '#3B82F6' }]} />
                {showViaInput && <View style={styles.timelineLineLeft} />}
                {showViaInput && <View style={[styles.timelineDot, { backgroundColor: '#F59E0B' }]} />}
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

                {showViaInput && (
                  <>
                    <View style={styles.inputDivider} />
                    <View style={styles.inputRow}>
                      <TextInput
                        style={styles.searchInputInline}
                        placeholder="Add stop / waypoint..."
                        placeholderTextColor="#999"
                        value={viaQuery}
                        onChangeText={setViaQuery}
                        onFocus={() => setActiveInput('via')}
                      />
                      <TouchableOpacity onPress={() => { setShowViaInput(false); setViaQuery(''); setCustomVia(null); }}>
                        <Ionicons name="close-circle" size={18} color="#999" />
                      </TouchableOpacity>
                    </View>
                  </>
                )}

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
              <TouchableOpacity style={styles.swapBtn} onPress={handleSwapLocations}>
                <Ionicons name="swap-vertical" size={20} color="#333" />
              </TouchableOpacity>
              <View style={styles.inputDividerRight} />
              <TouchableOpacity 
                style={[styles.addViaBtn, showViaInput && { backgroundColor: '#E5E7EB' }]} 
                onPress={() => setShowViaInput(!showViaInput)}
              >
                <MaterialCommunityIcons name="playlist-plus" size={22} color="#333" />
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
                <TouchableOpacity style={styles.secondaryBtn} onPress={() => setShowStepModal(!showStepModal)}>
                  <Text style={styles.secondaryBtnText}>{showStepModal ? 'Hide info' : 'More info'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.secondaryBtn, isSaved && { backgroundColor: '#FFCC00' }]} onPress={() => setIsSaved(!isSaved)}>
                  <Text style={[styles.secondaryBtnText, isSaved && { color: '#000' }]}>{isSaved ? 'Saved ✓' : 'Save'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.secondaryBtn, { backgroundColor: '#10B981', borderColor: '#059669' }]} onPress={handleStartSimulation}>
                  <Text style={[styles.secondaryBtnText, { color: '#FFFFFF', fontWeight: 'bold' }]}>Simulate ⚡</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.goBtn} onPress={handleStartNav}>
                  <Text style={styles.goText}>Go</Text>
                </TouchableOpacity>
              </View>

              {/* Turn-by-Turn Steps Modal List */}
              {showStepModal && route.steps && (
                <View style={styles.stepListModal}>
                  <Text style={styles.stepTitle}>Turn-by-Turn Directions</Text>
                  {route.steps.map((s, idx) => (
                    <View key={idx} style={styles.stepRow}>
                      <Ionicons 
                        name={s.turnType === 1 ? 'arrow-back' : s.turnType === 2 ? 'arrow-forward' : 'arrow-up'} 
                        size={18} 
                        color={COLORS.accent} 
                        style={{ marginRight: 10 }}
                      />
                      <Text style={styles.stepInstruction}>{s.instruction}</Text>
                      <Text style={styles.stepDist}>{s.distanceM}m</Text>
                    </View>
                  ))}
                </View>
              )}
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
  topHeaderRow: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  deviceCapsule: {
    backgroundColor: COLORS.surface,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  deviceCapsuleConnected: {
    borderColor: 'rgba(34, 197, 94, 0.4)',
    backgroundColor: '#111A14',
  },
  deviceCapsuleText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 8,
  },
  topRightControlsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  mapControlBtnSmall: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 5,
  },
  quickChipsScroll: {
    marginBottom: 12,
  },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  quickChipText: {
    color: '#1F2937',
    fontSize: 13,
    fontWeight: '600',
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
  stepListModal: {
    marginTop: 15,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    maxHeight: 220,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111',
    marginBottom: 10,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  stepInstruction: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  stepDist: {
    fontSize: 13,
    color: '#666',
    fontWeight: 'bold',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 10,
  },
  searchBlock: {
    flex: 1,
  },
  closePlanningBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeStats: {
    color: '#333',
    fontSize: 14,
  },
});
