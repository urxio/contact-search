# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Application Overview

OTMRT Helper is a Next.js 14 web application designed for managing and verifying French contacts in territory management. The application allows users to:

- Import contact data from Excel files
- Automatically detect potentially French names using heuristics and dictionary matching
- Search external services (TruePeopleSearch, OTM, Forebears.io) for contact verification
- Export verified French contacts to Excel format
- Track verification progress and manage contact statuses

## Architecture

### Tech Stack
- **Frontend**: Next.js 14 (App Directory) with React 18
- **Styling**: Tailwind CSS + shadcn/ui components 
- **UI Library**: Radix UI primitives via shadcn/ui
- **Data Persistence**: Browser localStorage (client-side only)
- **Excel Processing**: XLSX library for import/export
- **Icons**: Lucide React
- **Theme**: next-themes for dark/light mode

### Directory Structure
```
app/                    # Next.js app directory
├── globals.css         # Global styles and CSS variables
├── layout.tsx          # Root layout with theme providers
├── loading.tsx         # Loading UI
└── page.tsx           # Main application page (single-page app)

components/             # React components
├── ui/                # shadcn/ui component library
├── theme-provider.tsx # Theme context provider
├── theme-switcher.tsx # Dark/light mode toggle
└── enhanced-theme-provider.tsx

utils/                  # Utility functions
└── french-name-detection.ts # Core name detection logic

actions/                # Client-side actions
└── contact-actions.ts  # localStorage operations

public/                 # Static assets
├── name-dictionary-cleaned-suggestion.txt # French names dictionary
└── placeholder images

hooks/                  # Custom React hooks
├── use-mobile.tsx     # Mobile detection
└── use-toast.ts       # Toast notifications

lib/                    # Utility libraries
└── utils.ts           # shadcn/ui utilities (cn function)

types/                  # TypeScript type definitions
└── react-window.d.ts  # react-window type declarations
```

### Core Data Models

**EnhancedContact Interface:**
- Basic contact info (firstName, lastName, address, city, zipcode, phone)
- Status tracking ("Not checked" | "Potentially French" | "Not French" | "Duplicate" | "Detected")
- Verification flags (checkedOnTPS, checkedOnOTM, checkedOnForebears)
- Update flags (needAddressUpdate, needPhoneUpdate, territoryStatus)
- Metadata (notes, lastInteraction timestamp, isExpanded for UI)

### French Name Detection System

The application uses a two-tier detection system:

1. **Dictionary Matching**: Loads `name-dictionary-cleaned-suggestion.txt` containing known French surnames
2. **Heuristic Patterns**: Fallback rules for common French name patterns (le/la/du/de prefixes, -eau/-eux/-ier suffixes)

Detection runs automatically after Excel import and can be triggered manually on selected contacts.

## Development Commands

### Core Commands
```bash
# Install dependencies
npm install
# or
pnpm install

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linting
npm run lint
```

### Development Workflow
- The app runs entirely client-side with no backend API
- All data is stored in browser localStorage
- Hot reload works seamlessly during development
- No environment variables are required

## Key Files to Understand

### `/app/page.tsx`
- Main application logic (1000+ lines)
- Contains all state management and business logic
- Handles Excel import/export functionality
- Implements contact verification workflows
- Manages keyboard shortcuts and UI interactions

### `/utils/french-name-detection.ts`
- Core name detection algorithm
- Dictionary loading and caching logic
- Heuristic pattern matching rules
- Used throughout the app for automated classification

### `/components.json`
- shadcn/ui configuration
- Defines component aliases and paths
- Configured for TypeScript with CSS variables

## Important Implementation Details

### Data Persistence
- All data stored in localStorage using debounced writes (500ms delay)
- Contacts are automatically saved whenever the contacts array changes
- Global notes, territory settings, and UI preferences persist across sessions

### Excel Import Format
Expected column order (fixed positions):
1. First Name (column 0)
2. Last Name (column 1) 
3. Address (column 2)
4. City (column 3)
5. Zipcode (column 4)
6. Phone (column 5)

### Search Integration
- **TruePeopleSearch**: `fullName + zipcode` query parameters
- **OTM**: Copies contact name to clipboard, opens mobile.onlineterritorymanager.com
- **Forebears**: Searches by `lastName` on forebears.io

### Keyboard Shortcuts
- `Ctrl+F`: Focus search input
- `Ctrl+A`: Toggle select all contacts
- `Ctrl+G`: Toggle between grid/list view
- `Ctrl+E`: Export French contacts to Excel
- `Ctrl+J`: Open Add Contact dialog (create new contact)
- `Ctrl+1/2/3`: Bulk status updates for selected contacts

## Testing and Quality

### Manual Testing Focus Areas
1. Excel import with various file formats and edge cases
2. French name detection accuracy across different name patterns
3. localStorage persistence and recovery
4. External search integrations (ensure URLs open correctly)
5. Keyboard shortcuts across different browsers
6. Theme switching and dark mode compatibility
7. Mobile responsiveness (grid/list views)

### Common Issues to Watch For
- Excel files with unexpected column orders
- Names with special characters or diacritics
- Large datasets causing performance issues
- localStorage quota limits (5-10MB typically)
- Browser compatibility with Clipboard API

## Performance Considerations

- Uses React.useMemo for filtered contacts and statistics calculations
- Debounced search queries to avoid excessive re-filtering
- Debounced localStorage writes to prevent performance degradation
- react-window integration for virtualized large lists (if needed)

## Browser Compatibility

Requires modern browser features:
- ES6+ support (destructuring, arrow functions, async/await)
- Clipboard API for copy functionality
- localStorage support
- CSS Grid and Flexbox
- File API for Excel import

## External Dependencies

Key production dependencies to be aware of:
- `@radix-ui/*`: Accessible UI primitives
- `xlsx`: Excel file processing
- `next-themes`: Theme management
- `lucide-react`: Icon system
- `tailwind-merge`: Dynamic class name handling
- `react-hook-form` + `zod`: Form validation (if extended)

<citations>
<document>
<document_type>WARP_DOCUMENTATION</document_type>
<document_id>getting-started/quickstart-guide/coding-in-warp</document_id>
</document>
</citations>