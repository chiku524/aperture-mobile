import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ApertureScreen } from '../screens/ApertureScreen';
import { IntentScreen } from '../screens/IntentScreen';
import { LedgerScreen } from '../screens/LedgerScreen';
import { ReceiptScreen } from '../screens/ReceiptScreen';
import { SessionDetailScreen } from '../screens/SessionDetailScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { colors } from '../theme';

import type { MainTabParamList, RootStackParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        sceneStyle: { backgroundColor: 'transparent' },
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '600' },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      <Tab.Screen
        name="Intent"
        component={IntentScreen}
        options={{
          title: 'Intent',
          tabBarIcon: ({ color, size }) => <Ionicons name="flag-outline" color={color} size={size ?? 22} />,
        }}
      />
      <Tab.Screen
        name="Ledger"
        component={LedgerScreen}
        options={{
          title: 'Ledger',
          tabBarIcon: ({ color, size }) => <Ionicons name="list" color={color} size={size ?? 22} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" color={color} size={size ?? 22} />,
        }}
      />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '600' },
        contentStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
      <Stack.Screen
        name="Aperture"
        component={ApertureScreen}
        options={{ title: 'Aperture', presentation: 'fullScreenModal', gestureEnabled: false }}
      />
      <Stack.Screen name="Receipt" component={ReceiptScreen} options={{ title: 'Receipt', gestureEnabled: false }} />
      <Stack.Screen name="SessionDetail" component={SessionDetailScreen} options={{ title: 'Session' }} />
    </Stack.Navigator>
  );
}
