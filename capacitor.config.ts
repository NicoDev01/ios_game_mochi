import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Passe die Bundle-ID bei Bedarf auf deine App-Store-Connect-ID an:
  appId: 'com.mochamocha.app',
  appName: 'MochaMocha',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    backgroundColor: '#D4D3CC',
    preferredContentMode: 'mobile',
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#C5742E',
    },
  },
};

export default config;
