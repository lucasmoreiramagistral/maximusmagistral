import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Configuração do Capacitor para empacotar o app como APK Android.
 *
 * Estratégia: o APK é um WRAPPER que carrega a versão publicada do app
 * (https://maximusmagistral.digital). Vantagens:
 *   - Sem refatorar SSR → SPA (mantém TanStack Start como está)
 *   - APK pega automaticamente a versão mais recente publicada
 *   - Não precisa rebuildar APK a cada mudança de código
 *
 * COMO USAR (no seu PC, depois de baixar o .zip do projeto):
 *
 *   npm install
 *   npm install @capacitor/core @capacitor/cli @capacitor/android
 *   mkdir -p dist && echo "<!doctype html><html><body></body></html>" > dist/index.html
 *   npx cap add android
 *   npx cap sync android
 *   npx cap open android
 *
 * No Android Studio:
 *   Build → Build Bundle(s)/APK → Build APK(s)
 *   APK gerado em: android/app/build/outputs/apk/debug/app-debug.apk
 *
 * Veja CAPACITOR-ANDROID.md para o passo a passo completo.
 */
const config: CapacitorConfig = {
  appId: "digital.maximusmagistral.checklist",
  appName: "Checklist L3",
  webDir: "dist",
  android: {
    allowMixedContent: false,
  },
  server: {
    // Faz o APK carregar diretamente a versão publicada do app.
    // Trocar para o seu domínio de produção se necessário.
    url: "https://maximusmagistral.digital",
    androidScheme: "https",
    cleartext: false,
  },
};

export default config;
