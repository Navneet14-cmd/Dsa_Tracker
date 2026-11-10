import React from 'react';
import { View, ActivityIndicator, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore } from '../store/useAuthStore';
import { theme } from '../config/theme';

// Import Screens
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import LogScreen from '../screens/LogScreen';
import ProgressScreen from '../screens/ProgressScreen';
import PatternsScreen from '../screens/PatternsScreen';
import RevisionScreen from '../screens/RevisionScreen';
import AIScreen from '../screens/AIScreen';

// Navigators
const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Auth Stack Navigation Flow
function AuthNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}

// Custom Bottom Tab Bar aligned with Ledger Design System
function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  return (
    <View style={styles.tabBarContainer}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label =
          options.tabBarLabel !== undefined
            ? options.tabBarLabel
            : options.title !== undefined
            ? options.title
            : route.name;

        const isFocused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        // Icon mapping based on Stitch HTML classes
        let iconName: any = 'circle';
        if (route.name === 'Log') iconName = 'format-list-bulleted';
        else if (route.name === 'Progress') iconName = 'edit-note';
        else if (route.name === 'Patterns') iconName = 'analytics';
        else if (route.name === 'Revision') iconName = 'history';
        else if (route.name === 'AI') iconName = 'auto-awesome';

        return (
          <TouchableOpacity
            key={route.key}
            onPress={onPress}
            style={[
              styles.tabButton,
              isFocused && styles.tabButtonActive
            ]}
          >
            <MaterialIcons 
              name={iconName} 
              size={24} 
              color={isFocused ? theme.colors.primary : theme.colors.textSecondary} 
            />
            <Text style={[
              styles.tabLabel,
              isFocused && styles.tabLabelActive
            ]}>
              {label as string}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// App Tab Dashboard Navigation Flow
function AppTabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.colors.background,
          shadowColor: 'transparent',
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        },
        headerTintColor: theme.colors.text,
        headerTitleStyle: {
          fontFamily: theme.fonts.display,
          fontStyle: 'italic',
          fontWeight: theme.typography.fontWeights.bold,
          fontSize: theme.typography.fontSizes.xl,
        },
      }}
    >
      <Tab.Screen name="Log" component={LogScreen} options={{ title: 'Ledger' }} />
      <Tab.Screen name="Progress" component={ProgressScreen} options={{ title: 'Practice' }} />
      <Tab.Screen name="Patterns" component={PatternsScreen} options={{ title: 'Stats' }} />
      <Tab.Screen name="Revision" component={RevisionScreen} options={{ title: 'Review' }} />
      <Tab.Screen name="AI" component={AIScreen} options={{ title: 'AI Assist' }} />
    </Tab.Navigator>
  );
}

// Root Navigator coordinates Login Stack vs Tab layout
export default function RootNavigator() {
  const token = useAuthStore((state) => state.token);
  const isHydrated = useAuthStore((state) => state.isHydrated);

  // Hydration Guard: Render Loading Spinner while restoring Zustand state/token
  if (!isHydrated) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  // Switch navigation hierarchy based on token availability
  return token ? <AppTabNavigator /> : <AuthNavigator />;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  tabBarContainer: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingBottom: 24,
    paddingTop: 0,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
    borderTopWidth: 2,
    borderTopColor: 'transparent',
  },
  tabButtonActive: {
    borderTopColor: theme.colors.primary,
  },
  tabLabel: {
    fontFamily: theme.fonts.sans,
    fontSize: 10,
    marginTop: 4,
    color: theme.colors.textSecondary,
  },
  tabLabelActive: {
    color: theme.colors.primary,
  },
});
