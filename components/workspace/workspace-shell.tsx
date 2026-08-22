"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  Building2,
  BarChart3,
  Check,
  ChevronDown,
  CircleUserRound,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  UsersRound,
} from "lucide-react"

import { ThemeSwitcher } from "@/components/theme-switcher"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

import { CongregationMark } from "./congregation-mark"
import type { WorkspaceAccount, WorkspaceSummary } from "./types"

type WorkspaceShellProps = {
  activeWorkspace: WorkspaceSummary
  workspaces?: WorkspaceSummary[]
  account?: WorkspaceAccount
  children: React.ReactNode
}

const defaultAccount: WorkspaceAccount = {
  displayName: "Workspace member",
}

function WorkspaceNav({ slug, compact = false }: { slug: string; compact?: boolean }) {
  const pathname = usePathname()
  const searchHref = `/c/${slug}`
  const teamHref = `/c/${slug}/team`
  const isTeam = pathname === teamHref || pathname.startsWith(`${teamHref}/`)
  const isSearch = pathname === searchHref

  return (
    <nav
      aria-label="Workspace"
      className={cn(
        "flex rounded-xl bg-muted p-1",
        compact ? "w-full flex-col gap-1 bg-transparent p-0" : "items-center",
      )}
    >
      <Link
        href={searchHref}
        aria-current={isSearch ? "page" : undefined}
        className={cn(
          "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium text-muted-foreground transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          compact && "w-full justify-start",
          isSearch && "bg-background text-foreground shadow-sm",
        )}
      >
        <Search className="h-4 w-4" aria-hidden="true" />
        Search
      </Link>
      <Link
        href={teamHref}
        aria-current={isTeam ? "page" : undefined}
        className={cn(
          "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium text-muted-foreground transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          compact && "w-full justify-start",
          isTeam && "bg-background text-foreground shadow-sm",
        )}
      >
        <UsersRound className="h-4 w-4" aria-hidden="true" />
        Team Progress
      </Link>
    </nav>
  )
}

export function WorkspaceShell({
  activeWorkspace,
  workspaces = [activeWorkspace],
  account = defaultAccount,
  children,
}: WorkspaceShellProps) {
  const router = useRouter()
  const canAdmin = activeWorkspace.role === "admin" || account.isPlatformAdmin
  const workspaceHref = (workspace: WorkspaceSummary) => {
    const suffix = account.defaultWorkspaceView === "team" ? "/team" : ""
    return `/c/${workspace.slug}${suffix}`
  }

  async function signOut() {
    await fetch("/api/auth/sign-out", { method: "POST" }).catch(() => undefined)
    router.push("/auth/sign-in")
    router.refresh()
  }

  return (
    <div className="admin-shell min-h-screen bg-background text-foreground">
      <TooltipProvider delayDuration={300}>
        <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-xl supports-[backdrop-filter]:bg-background/75">
          <div className="mx-auto flex h-16 max-w-screen-2xl items-center gap-3 px-4 sm:px-6">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex min-h-11 min-w-0 items-center gap-3 rounded-xl px-2 text-left transition-all duration-150 ease-out hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label={`Switch congregation. Current congregation: ${activeWorkspace.name}`}
                >
                  <CongregationMark name={activeWorkspace.name} />
                  <span className="hidden min-w-0 sm:block">
                    <span className="block max-w-64 truncate text-sm font-semibold">
                      {activeWorkspace.name}
                    </span>
                    <span className="block text-xs font-normal text-muted-foreground">
                      {activeWorkspace.role === "admin" ? "Congregation admin" : "Member"}
                    </span>
                  </span>
                  <ChevronDown className="hidden h-4 w-4 text-muted-foreground sm:block" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72 rounded-xl p-2">
                <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Congregations
                </DropdownMenuLabel>
                {workspaces.map((workspace) => (
                  <DropdownMenuItem key={workspace.slug} asChild className="min-h-11 rounded-lg px-3">
                    <Link href={workspaceHref(workspace)} className="flex min-w-0 items-center gap-3">
                      <CongregationMark name={workspace.name} className="h-8 w-8 rounded-lg" />
                      <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                      {workspace.slug === activeWorkspace.slug ? (
                        <Check className="h-4 w-4 text-primary" aria-label="Current congregation" />
                      ) : null}
                    </Link>
                  </DropdownMenuItem>
                ))}
                {account.isPlatformAdmin ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild className="min-h-11 rounded-lg px-3">
                      <Link href="/workspaces">
                        <Building2 aria-hidden="true" />
                        All congregations
                      </Link>
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="mx-auto hidden lg:block">
              <WorkspaceNav slug={activeWorkspace.slug} />
            </div>

            <div className="ml-auto flex items-center gap-1">
              {canAdmin ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button asChild variant="ghost" size="icon" className="hidden h-11 w-11 rounded-xl sm:inline-flex">
                      <Link href={`/c/${activeWorkspace.slug}/admin`} aria-label="Open submissions review">
                        <ShieldCheck aria-hidden="true" />
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Submissions review</TooltipContent>
                </Tooltip>
              ) : null}
              <ThemeSwitcher className="h-11 w-11 rounded-xl shadow-none hover:translate-y-0 hover:bg-muted" />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="hidden h-11 max-w-48 rounded-xl px-3 sm:inline-flex">
                    <CircleUserRound aria-hidden="true" />
                    <span className="truncate">{account.displayName}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 rounded-xl p-2">
                  <DropdownMenuLabel className="min-w-0 px-3 py-2">
                    <span className="block truncate text-sm font-semibold">{account.displayName}</span>
                    {account.email ? (
                      <span className="block truncate text-xs font-normal text-muted-foreground">{account.email}</span>
                    ) : null}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild className="min-h-11 rounded-lg px-3">
                    <Link href={`/c/${activeWorkspace.slug}/settings`}>
                      <Settings aria-hidden="true" />
                      My settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="min-h-11 rounded-lg px-3">
                    <Link href={`/c/${activeWorkspace.slug}/stats`}>
                      <BarChart3 aria-hidden="true" />
                      My stats
                    </Link>
                  </DropdownMenuItem>
                  {canAdmin ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild className="min-h-11 rounded-lg px-3">
                        <Link href={`/c/${activeWorkspace.slug}/congregation-settings`}>
                          <Building2 aria-hidden="true" />
                          Congregation settings
                        </Link>
                      </DropdownMenuItem>
                    </>
                  ) : null}
                  {account.isPlatformAdmin ? (
                    <DropdownMenuItem asChild className="min-h-11 rounded-lg px-3">
                      <Link href="/platform">
                        <ShieldCheck aria-hidden="true" />
                        Platform portal
                      </Link>
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={signOut} className="min-h-11 rounded-lg px-3 text-destructive focus:text-destructive">
                    <LogOut aria-hidden="true" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-11 w-11 rounded-xl lg:hidden" aria-label="Open workspace menu">
                    <Menu aria-hidden="true" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[min(90vw,22rem)] p-6">
                  <SheetHeader className="pr-8 text-left">
                    <div className="flex items-center gap-3">
                      <CongregationMark name={activeWorkspace.name} />
                      <div className="min-w-0">
                        <SheetTitle className="truncate text-base font-semibold">{activeWorkspace.name}</SheetTitle>
                        <SheetDescription>{activeWorkspace.role === "admin" ? "Congregation admin" : "Member"}</SheetDescription>
                      </div>
                    </div>
                  </SheetHeader>
                  <div className="mt-8 space-y-6">
                    <SheetClose asChild>
                      <div>
                        <WorkspaceNav slug={activeWorkspace.slug} compact />
                      </div>
                    </SheetClose>
                    <div className="border-t pt-4">
                      {canAdmin ? (
                        <SheetClose asChild>
                          <Link href={`/c/${activeWorkspace.slug}/admin`} className="flex min-h-11 items-center gap-3 rounded-lg px-4 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                            Submissions review
                          </Link>
                        </SheetClose>
                      ) : null}
                      <SheetClose asChild>
                        <Link href={`/c/${activeWorkspace.slug}/settings`} className="flex min-h-11 items-center gap-3 rounded-lg px-4 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <Settings className="h-4 w-4" aria-hidden="true" />
                          My settings
                        </Link>
                      </SheetClose>
                      <SheetClose asChild>
                        <Link href={`/c/${activeWorkspace.slug}/stats`} className="flex min-h-11 items-center gap-3 rounded-lg px-4 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <BarChart3 className="h-4 w-4" aria-hidden="true" />
                          My stats
                        </Link>
                      </SheetClose>
                      {canAdmin ? (
                        <div className="mt-2 border-t pt-2">
                          <SheetClose asChild>
                            <Link href={`/c/${activeWorkspace.slug}/congregation-settings`} className="flex min-h-11 items-center gap-3 rounded-lg px-4 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                              <Building2 className="h-4 w-4" aria-hidden="true" />
                              Congregation settings
                            </Link>
                          </SheetClose>
                        </div>
                      ) : null}
                      <button type="button" onClick={signOut} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-4 text-sm font-medium text-destructive transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <LogOut className="h-4 w-4" aria-hidden="true" />
                        Sign out
                      </button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </header>
      </TooltipProvider>

      <div className="workspace-legacy-content [&>div>header:first-child]:hidden [&>div>nav:first-of-type]:hidden">
        {children}
      </div>
    </div>
  )
}
