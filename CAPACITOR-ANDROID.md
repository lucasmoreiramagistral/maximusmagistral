# 📱 Gerar APK Android com Capacitor

App ID: `digital.maximusmagistral.checklist`
Estratégia: **wrapper online** (o APK carrega https://maximusmagistral.digital)

## Por que wrapper online?

Este projeto usa **TanStack Start com SSR** (renderização no servidor) — não é
um SPA estático. Para o APK funcionar sem quebrar o app web, o Capacitor é
configurado para **carregar a versão já publicada** do site dentro de uma
WebView nativa.

Vantagens:
- ✅ Não precisa refatorar nada do código
- ✅ APK pega automaticamente cada nova publicação (sem rebuildar o APK)
- ✅ Login, banco, anomalias, checklist e verso funcionam exatamente igual ao web
- ✅ Mesma origem que o site → cookies/auth Supabase funcionam normal

Limitações:
- ⚠️ Precisa de internet para abrir (igual ao web). O cache do navegador interno
  do app cobre re-aberturas curtas, mas não funciona 100% offline.
- ⚠️ APIs nativas (câmera, file system local, share menu) não estão expostas
  ao código web nesta configuração — se precisar disso, fala que eu adiciono.

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
npm install @capacitor/core @capacitor/cli @capacitor/android

# 4. Crie um dist/ vazio (Capacitor exige a pasta, mas ela não é usada
#    porque o app carrega a URL configurada em capacitor.config.ts)
mkdir -p dist
echo '<!doctype html><html><body></body></html>' > dist/index.html

# 5. Adicione a plataforma Android (cria a pasta android/)
npx cap add android

# 6. Sincronize a configuração com o projeto Android
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

**Você não precisa fazer nada no APK.** Basta publicar o site no Lovable
(`Publish` no canto superior direito) — o APK vai carregar a versão nova
automaticamente na próxima abertura.

Só precisa rebuildar o APK se mudar o `capacitor.config.ts` (ícone, nome,
appId, URL servidor) ou plugins nativos.

## Trocar a URL que o APK carrega

Edite `capacitor.config.ts`, campo `server.url`. Por padrão está apontando
para o domínio de produção (`https://maximusmagistral.digital`).

Para usar a URL de preview do Lovable em testes:

```ts
server: {
  url: "https://pristine-idea-launch.lovable.app",
  androidScheme: "https",
  cleartext: false,
},
```

Depois rode `npx cap sync android` e rebuild no Android Studio.

## Permissões

- ✅ **Internet** — Capacitor adiciona por padrão (necessária pra carregar o site)
- ✅ **Supabase auth** funciona normalmente (cookies persistem na WebView)

Se precisar de permissões nativas extras (câmera, notificações push, etc.),
elas precisam ser adicionadas em `android/app/src/main/AndroidManifest.xml`
**e** instaladas via plugins do Capacitor (`@capacitor/camera`, etc.).

## APK assinado pra produção (Play Store ou distribuição interna)

No Android Studio: **Build → Generate Signed Bundle / APK** → seguir o wizard
pra criar uma keystore. Sem assinatura, o APK debug funciona instalado direto,
mas não pode ir pra Play Store.

## Ícone e splash screen

Ícone padrão do Capacitor é genérico. Para personalizar:

```bash
npm install -D @capacitor/assets
# coloque um icon.png 1024x1024 e um splash.png 2732x2732 em assets/
npx capacitor-assets generate --android
npx cap sync android
```

## Troubleshooting

- **Tela branca ao abrir o APK**: verifique se a `server.url` está acessível
  pelo celular (testa abrir o link no Chrome do celular).
- **"Mixed content" / requests bloqueados**: confirme que a URL é `https://`
  e que `allowMixedContent: false` está ok.
- **Login do Supabase não persiste**: o domínio publicado precisa ser o mesmo
  configurado nas URLs de redirect do Supabase Auth.
