"use client"

import Link from "next/link"
import {
  Send,
  UserCircle,
  RefreshCw,
  MoreHorizontal,
  FileSpreadsheet,
  FileJson,
  Import,
  Search,
  Globe,
  Copy,
  CheckCircle2,
  CircleSlash,
  Clock,
  StickyNote,
  AlertCircleIcon,
  Phone,
  MapPin,
  Keyboard,
  LayoutGrid,
  ChevronRight,
} from "lucide-react"

const sections = [
  {
    id: "identity",
    emoji: "👤",
    title: "Your Name & Identity",
    color: "blue",
    items: [
      {
        icon: <UserCircle className="h-5 w-5 text-blue-500" />,
        title: "Sign in with your name",
        desc: "On your first visit you'll be asked to enter your name or a unique ID. This name is attached to your work when you send it for review. You can change it anytime by clicking the green name badge in the top bar.",
      },
      {
        icon: <Clock className="h-5 w-5 text-blue-500" />,
        title: "Pick up where you left off",
        desc: "When you return to the site with saved work, a \"Welcome back!\" notification appears with a Resume button. Clicking it scrolls directly to the last contact you verified and highlights it briefly.",
      },
    ],
  },
  {
    id: "submit",
    emoji: "📤",
    title: "Sending Your Work for Review",
    color: "green",
    items: [
      {
        icon: <Send className="h-5 w-5 text-green-600" />,
        title: "Send for Review button",
        desc: "Once you've finished reviewing your contacts, click Send for Review in the toolbar. Your entire contact list — along with territory notes and zipcode — is sent directly to the admin. You must be signed in with a name before submitting.",
      },
      {
        icon: <RefreshCw className="h-5 w-5 text-green-600" />,
        title: "Start a new session after submitting",
        desc: "Right after a successful submission, a dialog asks if you'd like to start a fresh session and import a new Excel file. Choose Yes to clear everything and start over, or No to keep working on the current list.",
      },
    ],
  },
  {
    id: "menu",
    emoji: "☰",
    title: "More Menu (Burger Menu)",
    color: "slate",
    items: [
      {
        icon: <FileSpreadsheet className="h-5 w-5 text-green-600" />,
        title: "Export CSV",
        desc: "Exports only your Potentially French contacts to a CSV file. A dialog asks for the state name before downloading. The file includes contact name, parsed address fields, city, ZIP, phone, and state.",
      },
      {
        icon: <Import className="h-5 w-5 text-amber-600" />,
        title: "Import JSON",
        desc: "Restores a previously saved session from a JSON backup file. This brings back all your contacts, notes, territory info, and the last verified contact marker.",
      },
      {
        icon: <FileJson className="h-5 w-5 text-blue-600" />,
        title: "Export JSON (backup)",
        desc: "Saves your entire current session — all contacts, statuses, notes, territory fields, and progress — to a JSON file. Use this to back up your work or hand it off.",
      },
    ],
  },
  {
    id: "statuses",
    emoji: "🏷️",
    title: "Contact Statuses",
    color: "purple",
    items: [
      {
        icon: <CheckCircle2 className="h-5 w-5 text-green-500" />,
        title: "Potentially French",
        desc: "Mark a contact as Potentially French when you've confirmed they may be francophone. Rows turn green. These contacts are included in the CSV export.",
      },
      {
        icon: <CircleSlash className="h-5 w-5 text-red-500" />,
        title: "Not French",
        desc: "Mark a contact as Not French when verification shows they are not francophone. Rows turn red.",
      },
      {
        icon: <RefreshCw className="h-5 w-5 text-amber-500" />,
        title: "Duplicate",
        desc: "Automatically assigned when two or more contacts share the same address. The first occurrence stays unchanged; the rest are marked Duplicate. Amber row highlight.",
      },
      {
        icon: <Globe className="h-5 w-5 text-purple-500" />,
        title: "Detected",
        desc: "Automatically assigned by the French name detection tool when a contact's last name matches the French name dictionary. Purple row highlight.",
      },
      {
        icon: <CheckCircle2 className="h-5 w-5 text-blue-500" />,
        title: "Not checked",
        desc: "The default status for every newly imported contact. Indicates this contact still needs to be reviewed.",
      },
    ],
  },
  {
    id: "verification",
    emoji: "🔍",
    title: "Verification Tools",
    color: "indigo",
    items: [
      {
        icon: <Search className="h-5 w-5 text-indigo-500" />,
        title: "TruePeopleSearch",
        desc: "Opens TruePeopleSearch in a new tab pre-filled with the contact's name and ZIP code. The button turns green once clicked so you can track which contacts you've looked up.",
      },
      {
        icon: <Copy className="h-5 w-5 text-indigo-500" />,
        title: "OTM",
        desc: "Copies the contact's full name to your clipboard and opens the Online Territory Manager in a new tab, ready for you to paste and search. Button turns green once used.",
      },
      {
        icon: <Globe className="h-5 w-5 text-indigo-500" />,
        title: "Forebears.io",
        desc: "Opens Forebears.io in a new tab with the contact's surname searched automatically. Useful for looking up the origin and frequency of a family name. Button turns green once clicked.",
      },
    ],
  },
  {
    id: "automation",
    emoji: "⚡",
    title: "Automatic Detection",
    color: "yellow",
    items: [
      {
        icon: <Globe className="h-5 w-5 text-yellow-600" />,
        title: "French name detection",
        desc: "After importing an Excel file, the app automatically scans every contact's last name against a French name dictionary. Matching contacts are marked Detected (purple). You can also trigger this manually via batch operations on selected contacts.",
      },
      {
        icon: <RefreshCw className="h-5 w-5 text-yellow-600" />,
        title: "Duplicate address detection",
        desc: "Also runs automatically on import. Any contacts sharing the same street address, city, and ZIP code are flagged as Duplicate — keeping the first match clean and marking the rest.",
      },
    ],
  },
  {
    id: "batch",
    emoji: "☑️",
    title: "Selecting & Batch Actions",
    color: "teal",
    items: [
      {
        icon: <CheckCircle2 className="h-5 w-5 text-teal-600" />,
        title: "Select individual contacts",
        desc: "Tick the checkbox on any contact row or card to select it. A floating action bar appears at the bottom of the screen showing how many contacts are selected.",
      },
      {
        icon: <CheckCircle2 className="h-5 w-5 text-teal-600" />,
        title: "Select all visible contacts",
        desc: "Use the checkbox in the table header, or press Ctrl+A (Cmd+A on Mac), to select or deselect all contacts currently visible on screen (respects active filters).",
      },
      {
        icon: <CheckCircle2 className="h-5 w-5 text-teal-600" />,
        title: "Batch status update",
        desc: "With contacts selected, click any status button in the floating bar to apply that status to all selected contacts at once. A confirmation toast shows how many were updated.",
      },
    ],
  },
  {
    id: "views",
    emoji: "🗂️",
    title: "Views & Navigation",
    color: "orange",
    items: [
      {
        icon: <LayoutGrid className="h-5 w-5 text-orange-500" />,
        title: "List view & Grid view",
        desc: "Toggle between a compact table (list view) and a card-based layout (grid view) using the view buttons in the toolbar, or press Ctrl+G (Cmd+G on Mac). Your preference is saved automatically.",
      },
      {
        icon: <ChevronRight className="h-5 w-5 text-orange-500" />,
        title: "Expandable contact rows",
        desc: "Click the arrow on any contact row to expand it and see full editable details — first name, last name, address, city, ZIP, phone, notes, and status flags for address updated, phone updated, and different territory.",
      },
      {
        icon: <Clock className="h-5 w-5 text-orange-500" />,
        title: "Jump to most recent contact",
        desc: "A quick-access button in the toolbar scrolls and highlights the contact you most recently interacted with — useful when returning to a long list mid-session.",
      },
    ],
  },
  {
    id: "indicators",
    emoji: "🔔",
    title: "Row Indicators & Icons",
    color: "rose",
    items: [
      {
        icon: <AlertCircleIcon className="h-5 w-5 text-rose-500" />,
        title: "Address needs update",
        desc: "A yellow alert icon appears on a contact row when you've edited their address during the session, flagging it as changed.",
      },
      {
        icon: <Phone className="h-5 w-5 text-rose-500" />,
        title: "Phone needs update",
        desc: "A phone icon appears when a contact's phone number has been edited during the session.",
      },
      {
        icon: <StickyNote className="h-5 w-5 text-rose-500" />,
        title: "Has notes",
        desc: "A sticky note icon on a row shows that you've added personal notes to that contact.",
      },
      {
        icon: <MapPin className="h-5 w-5 text-rose-500" />,
        title: "Different territory",
        desc: "A map pin icon appears when a contact's address falls outside the known territory ZIP codes. A warning toast also appears when this is first detected.",
      },
      {
        icon: <Clock className="h-5 w-5 text-green-500" />,
        title: "Last verified marker",
        desc: "The contact you most recently verified gets a green left border so you can quickly see where you left off in a long list.",
      },
    ],
  },
  {
    id: "territory",
    emoji: "📍",
    title: "Territory & Notes",
    color: "sky",
    items: [
      {
        icon: <MapPin className="h-5 w-5 text-sky-600" />,
        title: "Territory ZIP code",
        desc: "Enter the primary ZIP code for your territory. This is saved automatically and included in your submission so the admin knows which area your work covers.",
      },
      {
        icon: <StickyNote className="h-5 w-5 text-sky-600" />,
        title: "Page range",
        desc: "Record the page range you're working on (e.g. 1–10). Saved automatically and sent with your submission.",
      },
      {
        icon: <StickyNote className="h-5 w-5 text-sky-600" />,
        title: "Global notes",
        desc: "A free-text area for any territory-level notes you want to pass along — observations, special cases, or instructions for the reviewer. Included in every submission and export.",
      },
    ],
  },
  {
    id: "shortcuts",
    emoji: "⌨️",
    title: "Keyboard Shortcuts",
    color: "gray",
    items: [
      {
        icon: <Keyboard className="h-5 w-5 text-gray-500" />,
        title: "Ctrl / Cmd + F",
        desc: "Focus the search box instantly.",
      },
      {
        icon: <Keyboard className="h-5 w-5 text-gray-500" />,
        title: "Ctrl / Cmd + A",
        desc: "Select or deselect all visible contacts.",
      },
      {
        icon: <Keyboard className="h-5 w-5 text-gray-500" />,
        title: "Ctrl / Cmd + G",
        desc: "Toggle between list view and grid view.",
      },
      {
        icon: <Keyboard className="h-5 w-5 text-gray-500" />,
        title: "Ctrl / Cmd + E",
        desc: "Open the Export CSV dialog.",
      },
      {
        icon: <Keyboard className="h-5 w-5 text-gray-500" />,
        title: "Ctrl / Cmd + J",
        desc: "Open the Add New Contact dialog.",
      },
      {
        icon: <Keyboard className="h-5 w-5 text-gray-500" />,
        title: "Ctrl / Cmd + 1 / 2 / 3",
        desc: "Set selected contacts to Not Checked (1), Potentially French (2), or Not French (3).",
      },
    ],
  },
]

const colorMap: Record<string, { bg: string; border: string; badge: string }> = {
  blue:   { bg: "bg-blue-50 dark:bg-blue-950/20",     border: "border-blue-100 dark:border-blue-900",   badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  green:  { bg: "bg-green-50 dark:bg-green-950/20",   border: "border-green-100 dark:border-green-900", badge: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  slate:  { bg: "bg-slate-50 dark:bg-slate-900/30",   border: "border-slate-100 dark:border-slate-800", badge: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  purple: { bg: "bg-purple-50 dark:bg-purple-950/20", border: "border-purple-100 dark:border-purple-900", badge: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
  indigo: { bg: "bg-indigo-50 dark:bg-indigo-950/20", border: "border-indigo-100 dark:border-indigo-900", badge: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" },
  yellow: { bg: "bg-yellow-50 dark:bg-yellow-950/20", border: "border-yellow-100 dark:border-yellow-900", badge: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300" },
  teal:   { bg: "bg-teal-50 dark:bg-teal-950/20",     border: "border-teal-100 dark:border-teal-900",   badge: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300" },
  orange: { bg: "bg-orange-50 dark:bg-orange-950/20", border: "border-orange-100 dark:border-orange-900", badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  rose:   { bg: "bg-rose-50 dark:bg-rose-950/20",     border: "border-rose-100 dark:border-rose-900",   badge: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" },
  sky:    { bg: "bg-sky-50 dark:bg-sky-950/20",       border: "border-sky-100 dark:border-sky-900",     badge: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" },
  gray:   { bg: "bg-gray-50 dark:bg-gray-900/40",     border: "border-gray-100 dark:border-gray-800",   badge: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
}

export default function OverviewPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">

      {/* Hero */}
      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white">
        <div className="max-w-4xl mx-auto px-6 py-16">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl">📋</span>
            <span className="text-sm font-semibold uppercase tracking-widest opacity-75">OTM Helper</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-4">
            What's new & how it works
          </h1>
          <p className="text-lg text-blue-100 max-w-2xl">
            A complete guide to every feature available to you — from importing your contact list
            to sending your finished work for review.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 bg-white text-blue-700 font-semibold text-sm rounded-full px-5 py-2.5 hover:bg-blue-50 transition-colors"
            >
              ← Back to the app
            </Link>
          </div>
        </div>
      </div>

      {/* Table of contents */}
      <div className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 sticky top-0 z-10 overflow-x-auto">
        <div className="max-w-4xl mx-auto px-6">
          <nav className="flex gap-1 py-3 text-xs font-medium whitespace-nowrap">
            {sections.map(s => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="px-3 py-1.5 rounded-full text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
              >
                {s.emoji} {s.title}
              </a>
            ))}
          </nav>
        </div>
      </div>

      {/* Sections */}
      <div className="max-w-4xl mx-auto px-6 py-12 flex flex-col gap-14">
        {sections.map(section => {
          const c = colorMap[section.color]
          return (
            <section key={section.id} id={section.id}>
              {/* Section heading */}
              <div className="flex items-center gap-3 mb-5">
                <span className="text-2xl">{section.emoji}</span>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">{section.title}</h2>
                <span className={`text-xs font-semibold rounded-full px-2.5 py-0.5 ${c.badge}`}>
                  {section.items.length} feature{section.items.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Feature cards */}
              <div className="flex flex-col gap-3">
                {section.items.map((item, i) => (
                  <div
                    key={i}
                    className={`rounded-xl border p-5 flex gap-4 ${c.bg} ${c.border}`}
                  >
                    <div className="mt-0.5 shrink-0">{item.icon}</div>
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white text-sm mb-1">{item.title}</p>
                      <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )
        })}

        {/* Footer CTA */}
        <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-8 text-center">
          <p className="text-lg font-bold mb-2">Ready to get started?</p>
          <p className="text-blue-100 text-sm mb-6">Import your Excel file and start verifying contacts.</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 bg-white text-blue-700 font-semibold text-sm rounded-full px-6 py-3 hover:bg-blue-50 transition-colors"
          >
            ← Open the app
          </Link>
        </div>
      </div>
    </div>
  )
}
