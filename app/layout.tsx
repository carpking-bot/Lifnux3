import type { Metadata } from "next";
import "./globals.css";
import { MusicPlayerProvider } from "./(shared)/components/MusicPlayerProvider";
import { GlobalMusicPlayerOverlay } from "./(shared)/components/GlobalMusicPlayerOverlay";
import { TopMenu } from "./(shared)/components/TopMenu";
import { LifnuxStartupDataSync } from "./(shared)/components/LifnuxStartupDataSync";
import { GlobalBackgroundTheme } from "./(shared)/components/GlobalBackgroundTheme";

export const metadata: Metadata = {
  title: "Lifnux",
  description: "Life + Linux personal OS"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="relative">
        <MusicPlayerProvider>
          <GlobalBackgroundTheme />
          <div className="relative z-10">
            <LifnuxStartupDataSync />
            {children}
            <GlobalMusicPlayerOverlay />
            <TopMenu />
          </div>
        </MusicPlayerProvider>
      </body>
    </html>
  );
}
