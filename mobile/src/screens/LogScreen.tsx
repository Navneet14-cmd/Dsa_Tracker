import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LogListScreen from './LogListScreen';
import LogFormScreen from './LogFormScreen';
import { theme } from '../config/theme';

const Stack = createNativeStackNavigator();

export default function LogScreen() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.colors.background,
        },
        headerShadowVisible: false,
        headerTintColor: theme.colors.text,
        headerTitleStyle: {
          fontFamily: theme.fonts.display,
          fontWeight: theme.typography.fontWeights.bold,
          fontSize: theme.typography.fontSizes.xl,
        },
        contentStyle: {
          backgroundColor: theme.colors.background,
        },
      }}
    >
      <Stack.Screen 
        name="LogList" 
        component={LogListScreen} 
        options={{ title: 'Logged Problems' }} 
      />
      <Stack.Screen 
        name="LogForm" 
        component={LogFormScreen} 
        options={({ route }: any) => ({ 
          title: route.params?.problem ? 'Edit Problem' : 'Log New Problem' 
        })} 
      />
    </Stack.Navigator>
  );
}
