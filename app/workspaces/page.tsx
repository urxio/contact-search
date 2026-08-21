import { ThemeSwitcher } from "@/components/theme-switcher"
import { PageFrame } from "@/components/workspace/page-frame"
import { WorkspacesList } from "@/components/workspace/workspaces-list"

export default function WorkspacesPage() {
  return (
    <div className="admin-shell min-h-screen">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between border-b px-4 sm:px-6">
        <span className="text-base font-semibold">Search Helper</span>
        <ThemeSwitcher className="h-11 w-11 rounded-xl shadow-none hover:translate-y-0 hover:bg-muted" />
      </div>
      <PageFrame title="Your congregations" description="Choose a private workspace to continue with Search Helper or Team Progress.">
        <WorkspacesList />
      </PageFrame>
    </div>
  )
}
