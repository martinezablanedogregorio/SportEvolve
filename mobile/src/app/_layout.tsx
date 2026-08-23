import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AppNav } from '@/components/AppNav';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#090b0f' } }} />
      <AppNav />
    </>
  );
}
