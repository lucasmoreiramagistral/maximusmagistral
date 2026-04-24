// build: force-republish 2026-04-24T13:00
import { Outlet, Link, createRootRoute, HeadContent, Scripts, useRouterState } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { useConnectionStatus } from "@/hooks/use-connection-status";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página que você procura não existe ou foi movida.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Checklist Operacional — Linha 3 Enchedora 3" },
      {
        name: "description",
        content:
          "Aplicativo de checklist operacional digital para a Enchedora 3 da Linha 3 — Magistral Manaus.",
      },
      { name: "author", content: "Magistral Manaus" },
      { property: "og:title", content: "Checklist Operacional — Linha 3 Enchedora 3" },
      {
        property: "og:description",
        content: "Checklist digital para operação industrial.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "Checklist Operacional — Linha 3 Enchedora 3" },
      { name: "description", content: "Blank Canvas is a web application for creating and managing checklists, with Supabase integration for data storage." },
      { property: "og:description", content: "Blank Canvas is a web application for creating and managing checklists, with Supabase integration for data storage." },
      { name: "twitter:description", content: "Blank Canvas is a web application for creating and managing checklists, with Supabase integration for data storage." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/0dab3f47-b6b3-46ba-9763-bcc96b533de6/id-preview-efcc7704--6376b0f9-ac30-49e3-af42-537d32e8c5fa.lovable.app-1776694199936.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/0dab3f47-b6b3-46ba-9763-bcc96b533de6/id-preview-efcc7704--6376b0f9-ac30-49e3-af42-537d32e8c5fa.lovable.app-1776694199936.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" },
      { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const isNavigating = useRouterState({ select: (s) => s.isLoading });
  // Inicializa o store global de conexão (singleton).
  // O próprio store dispara sincronização automática ao voltar online.
  useConnectionStatus();

  return (
    <>
      <Outlet />
      <Toaster position="top-center" richColors closeButton />
      {isNavigating && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background/70 backdrop-blur-sm"
          aria-live="polite"
          aria-busy="true"
        >
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium text-foreground">Carregando...</p>
        </div>
      )}
    </>
  );
}
