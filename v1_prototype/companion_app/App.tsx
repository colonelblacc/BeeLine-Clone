import React from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TransformRequestManager } from '@maplibre/maplibre-react-native';
import { Ionicons } from '@expo/vector-icons';

import { HomeScreen } from './src/screens/HomeScreen';
import { NavigationScreen } from './src/screens/NavigationScreen';
import { DeviceScreen } from './src/screens/DeviceScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { COLORS, OLA_API_KEY } from './src/constants/config';

// Inject API key into ALL Ola Maps tile/sprite/glyph requests so the map renders correctly
TransformRequestManager.addUrlSearchParam({
  id: 'ola-api-key',
  match: 'api\.olamaps\.io',
  name: 'api_key',
  value: OLA_API_KEY,
});

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
        },
        tabBarActiveTintColor: COLORS.accent,
        tabBarInactiveTintColor: COLORS.textMuted,
      }}
    >
      <Tab.Screen 
        name="Map" 
        component={HomeScreen} 
        options={{ tabBarIcon: ({color, size}) => <Ionicons name="map" size={size} color={color} /> }}
      />
      <Tab.Screen 
        name="Device" 
        component={DeviceScreen} 
        options={{ tabBarIcon: ({color, size}) => <Ionicons name="hardware-chip" size={size} color={color} /> }}
      />
      <Tab.Screen 
        name="Settings" 
        component={SettingsScreen} 
        options={{ tabBarIcon: ({color, size}) => <Ionicons name="settings" size={size} color={color} /> }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
          <Stack.Screen name="Main" component={TabNavigator} />
          <Stack.Screen name="Navigation" component={NavigationScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
