# 📱 Gerar APK Android com Capacitor

App ID: `digital.maximusmagistral.checklist`
Modo: Bundle local (offline-first)

## Pré-requisitos no PC

- **Node.js 20+** e **npm**
- **Android Studio** instalado (com Android SDK + plataforma API 34+)
- **JDK 17** (o Android Studio normalmente já instala)
- Variáveis de ambiente: `ANDROID_HOME` apontando pro SDK e `JAVA_HOME` pro JDK

## Passo a passo (uma vez só)

```bash
# 1. Baixe o .zip do projeto no Lovable e extraia
cd checklist-l3

# 2. Instale dependências do projeto
npm install

# 3. Instale os pacotes do Capacitor
npm install @capacitor/core @capacitor/cli
npm install @capacitor/android @capacitor/filesystem @capacitor/share

# 4. Build do frontend (gera a pasta dist/)
npm run build

# 5. Adicione a plataforma Android (cria a pasta android/)
npx cap add android

# 6. Sincronize o build com o projeto Android
npx cap sync android

# 7. Abra o Android Studio
npx cap open android
```

## Gerando o APK no Android Studio

1. Espere o **Gradle Sync** terminar (barra de progresso embaixo).
2. Menu: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
3. Quando terminar, clique no link **locate** que aparece — abre a pasta com o APK.
4. Caminho do APK: `android/app/build/outputs/apk/debug/app-debug.apk`
5. Transfira pro celular (USB, Drive, WhatsApp web), abra o arquivo e instale.

> Pode aparecer "Fontes desconhecidas" — autorize só pra esse app.

## Após mudanças no código

```bash
npm run build
npx cap sync android
# Volta no Android Studio e clica Build → Build APK(s) de novo
```

## Permissões já configuradas

- ✅ **Internet** (Supabase) — Capacitor adiciona por padrão
- ✅ **Salvar arquivo Excel** — vai pra pasta `Documents/` do celular via `@capacitor/filesystem`
- ✅ **Compartilhar** — abre menu nativo (WhatsApp, Drive, email) via `@capacitor/share`

## Como o Excel funciona no app

- **No navegador**: download direto pelo browser (igual hoje).
- **No APK**: salva em `Documents/FM09_CHECKLIST_..._EDITAVEL.xlsx` e abre o menu **Compartilhar** pra você mandar pra onde quiser.

## APK assinado pra produção (Play Store ou distribuição interna)

No Android Studio: **Build → Generate Signed Bundle / APK** → seguir o wizard pra criar uma keystore.
Sem assinatura, o APK debug funciona instalado direto, mas não pode ir pra Play Store.
