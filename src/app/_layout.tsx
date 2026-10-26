import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { OpeningAnimation } from '../components/OpeningAnimation';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ duration: 250, fade: true });

export default function RootLayout() {
  return (
    <OpeningAnimation>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </OpeningAnimation>
  );
}
