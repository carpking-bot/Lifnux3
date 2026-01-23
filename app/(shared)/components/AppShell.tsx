import { ReactNode } from "react";
import { TopNav } from "./TopNav";

type AppShellProps = {
  title?: string;
  showTitle?: boolean;
  children: ReactNode;
};

export function AppShell({ title = "", showTitle = true, children }: AppShellProps) {
  return (
    <main className="min-h-screen">
      {showTitle ? <TopNav title={title} /> : null}
      <div className="px-8 pb-10">{children}</div>
    </main>
  );
}
