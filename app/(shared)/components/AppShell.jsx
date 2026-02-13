import { TopNav } from "./TopNav";
export function AppShell({ title = "", showTitle = true, children }) {
    return (<main className="min-h-screen">
      {showTitle ? <TopNav title={title}/> : null}
      <div className="px-8 pb-10">{children}</div>
    </main>);
}
