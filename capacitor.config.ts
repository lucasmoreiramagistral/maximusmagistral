import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Configuração do Capacitor para empacotar o app como APK Android.
 *
 * COMO USAR (no seu PC, depois de baixar o .zip do projeto):
 *
 *   npm install
 *   npm install @capacitor/core @capacitor/cli @capacitor/android \
 *               @capacitor/filesystem @capacitor/share
 *   npm run build              # gera a pasta dist/
 *   npx cap add android        # cria a pasta android/
 *   npx cap sync android       # copia o build pro projeto Android
 *   npx cap open android       # abre no Android Studio
 *
 * No Android Studio:
 *   Build → Build Bundle(s)/APK → Build APK(s)
 *   APK gerado em: android/app/build/outputs/apk/debug/app-debug.apk
 */
const config: CapacitorConfig = {
  appId: "digital.maximusmagistral.checklist",
  appName: "Checklist L3",
  webDir: "dist",
  android: {
    allowMixedContent: false,
  },
  server: {
    androidScheme: "https",
  },
};

export default config;
