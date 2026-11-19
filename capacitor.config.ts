import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.danielgebhardt.blockersgonnablock',
  appName: 'Blockers Gonna Block',
  webDir: 'dist',
  backgroundColor: '#14172b',
  android: {
    backgroundColor: '#14172b',
  },
  ios: {
    backgroundColor: '#14172b',
    // the game never scrolls: no rubber-band bounce when dragging blocks
    scrollEnabled: false,
    contentInset: 'never',
  },
  plugins: {
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
      style: 'DARK',
    },
  },
};

export default config;
