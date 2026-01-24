'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Phone,
  Users,
  Contact,
  Plug,
  GitBranch,
  Mic,
  ListOrdered,
  Bot,
  Megaphone,
  FileAudio,
  FileText,
  ArrowRight,
  Clock,
  X,
  Loader2,
  LayoutDashboard,
  Settings,
  BarChart3,
  Monitor,
  Sun,
  Moon,
  Voicemail,
  Route,
} from 'lucide-react';
import { Command } from 'cmdk';
import { useUIStore, RecentSearchItem } from '@/stores/ui-store';
import { searchApi, SearchResult, SearchResponse } from '@/lib/api';
import { cn } from '@/lib/utils';

// Icon mapping for different result types
const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  extension: Phone,
  contact: Contact,
  trunk: Plug,
  ivr: GitBranch,
  prompt: Mic,
  ringGroup: ListOrdered,
  queue: Users,
  aiAgent: Bot,
  campaign: Megaphone,
  recording: FileAudio,
  page: FileText,
};

// Category display names
const categoryNames: Record<string, string> = {
  extensions: 'Extensions',
  contacts: 'Contacts',
  trunks: 'Trunks',
  ivr: 'IVR Menus',
  prompts: 'Prompts',
  ringGroups: 'Ring Groups',
  queues: 'Queues',
  aiAgents: 'AI Agents',
  campaigns: 'Campaigns',
  recordings: 'Recordings',
  pages: 'Pages',
};

// Navigation pages for quick access
const navigationPages = [
  { id: 'dashboard', title: 'Dashboard', url: '/', icon: LayoutDashboard },
  { id: 'calls', title: 'Calls', url: '/calls', icon: Phone },
  { id: 'recordings', title: 'Recordings', url: '/recordings', icon: FileAudio },
  { id: 'voicemails', title: 'Voicemails', url: '/voicemails', icon: Voicemail },
  { id: 'ivr', title: 'IVR Menus', url: '/ivr', icon: GitBranch },
  { id: 'extensions', title: 'Extensions', url: '/extensions', icon: Phone },
  { id: 'ring-groups', title: 'Ring Groups', url: '/ring-groups', icon: ListOrdered },
  { id: 'queues', title: 'Queues', url: '/queues', icon: Users },
  { id: 'trunks', title: 'Trunks', url: '/trunks', icon: Plug },
  { id: 'routes', title: 'Routes', url: '/routes', icon: Route },
  { id: 'contacts', title: 'Contacts', url: '/contacts', icon: Contact },
  { id: 'campaigns', title: 'Campaigns', url: '/campaigns', icon: Megaphone },
  { id: 'ai-agents', title: 'AI Agents', url: '/ai-agents', icon: Bot },
  { id: 'prompts', title: 'Prompts', url: '/prompts', icon: Mic },
  { id: 'analytics', title: 'Analytics', url: '/analytics', icon: BarChart3 },
  { id: 'settings', title: 'Settings', url: '/settings', icon: Settings },
  { id: 'system', title: 'System', url: '/system', icon: Monitor },
];

// Status badge component
function StatusBadge({ status }: { status?: string }) {
  if (!status) return null;

  const statusConfig: Record<string, { color: string; label: string }> = {
    online: { color: 'bg-green-500', label: 'Online' },
    offline: { color: 'bg-gray-400', label: 'Offline' },
    active: { color: 'bg-green-500', label: 'Active' },
    inactive: { color: 'bg-gray-400', label: 'Inactive' },
    paused: { color: 'bg-yellow-500', label: 'Paused' },
  };

  const config = statusConfig[status] || { color: 'bg-gray-400', label: status };

  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn('h-2 w-2 rounded-full', config.color)} />
      {config.label}
    </span>
  );
}

// Search result item component
function SearchResultItem({
  result,
  onSelect,
}: {
  result: SearchResult;
  onSelect: () => void;
}) {
  const Icon = typeIcons[result.type] || FileText;

  return (
    <Command.Item
      value={`${result.type}-${result.id}-${result.title}`}
      onSelect={onSelect}
      className="group relative flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm outline-none transition-colors aria-selected:bg-accent"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/50 group-aria-selected:bg-background">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
        <span className="truncate font-medium">{result.title}</span>
        {(result.subtitle || result.meta) && (
          <span className="flex items-center gap-2 truncate text-xs text-muted-foreground">
            {result.subtitle && <span>{result.subtitle}</span>}
            {result.subtitle && result.meta && <span>•</span>}
            {result.meta && <span>{result.meta}</span>}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge status={result.status} />
        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-aria-selected:opacity-100" />
      </div>
    </Command.Item>
  );
}

// Recent search item component
function RecentSearchItemComponent({
  item,
  onSelect,
  onRemove,
}: {
  item: RecentSearchItem;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const Icon = typeIcons[item.type] || FileText;

  return (
    <Command.Item
      value={`recent-${item.id}-${item.title}`}
      onSelect={onSelect}
      className="group relative flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm outline-none transition-colors aria-selected:bg-accent"
    >
      <Clock className="h-4 w-4 text-muted-foreground" />
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/50">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <span className="truncate">{item.title}</span>
        {item.subtitle && (
          <span className="truncate text-xs text-muted-foreground">{item.subtitle}</span>
        )}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="opacity-0 group-hover:opacity-100 group-aria-selected:opacity-100 p-1 hover:bg-muted rounded transition-all"
      >
        <X className="h-3 w-3 text-muted-foreground" />
      </button>
    </Command.Item>
  );
}

// Loading skeleton
function SearchSkeleton() {
  return (
    <div className="space-y-2 p-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5">
          <div className="h-9 w-9 rounded-lg bg-muted animate-pulse" />
          <div className="flex-1 space-y-1.5">
            <div className="h-4 w-32 rounded bg-muted animate-pulse" />
            <div className="h-3 w-48 rounded bg-muted animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Navigation item component
function NavigationItem({
  page,
  onSelect,
}: {
  page: (typeof navigationPages)[number];
  onSelect: () => void;
}) {
  const Icon = page.icon;

  return (
    <Command.Item
      value={`nav-${page.id}-${page.title}`}
      onSelect={onSelect}
      className="group relative flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm outline-none transition-colors aria-selected:bg-accent"
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/50 group-aria-selected:bg-background">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <span className="flex-1">{page.title}</span>
      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-aria-selected:opacity-100" />
    </Command.Item>
  );
}

// Theme item component
function ThemeItem({
  icon: Icon,
  label,
  isActive,
  onSelect,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      value={`theme-${label.toLowerCase()}`}
      onSelect={onSelect}
      className="group relative flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm outline-none transition-colors aria-selected:bg-accent"
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/50 group-aria-selected:bg-background">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <span className="flex-1">{label}</span>
      {isActive && (
        <span className="h-2 w-2 rounded-full bg-primary" />
      )}
    </Command.Item>
  );
}

export function CommandMenu() {
  const router = useRouter();
  const {
    commandMenuOpen,
    setCommandMenuOpen,
    theme,
    setTheme,
    recentSearches,
    addRecentSearch,
    clearRecentSearches,
  } = useUIStore();

  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null);

  // Navigate and close menu
  const navigate = useCallback(
    (path: string) => {
      router.push(path);
      setCommandMenuOpen(false);
      setQuery('');
    },
    [router, setCommandMenuOpen]
  );

  // Handle result selection
  const handleResultSelect = useCallback(
    (result: SearchResult) => {
      // Add to recent searches
      addRecentSearch({
        id: result.id,
        type: result.type,
        title: result.title,
        subtitle: result.subtitle,
        url: result.url,
      });
      navigate(result.url);
    },
    [addRecentSearch, navigate]
  );

  // Handle recent search selection
  const handleRecentSelect = useCallback(
    (item: RecentSearchItem) => {
      navigate(item.url);
    },
    [navigate]
  );

  // Remove a recent search item
  const removeRecentSearch = useCallback(
    (id: string) => {
      const filtered = recentSearches.filter((s) => s.id !== id);
      // Update store by clearing and re-adding
      clearRecentSearches();
      filtered.reverse().forEach((item) => {
        addRecentSearch({
          id: item.id,
          type: item.type,
          title: item.title,
          subtitle: item.subtitle,
          url: item.url,
        });
      });
    },
    [recentSearches, clearRecentSearches, addRecentSearch]
  );

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsLoading(true);
      try {
        const results = await searchApi.search(query.trim(), { limit: 5 });
        setSearchResults(results);
      } catch (error) {
        console.error('Search failed:', error);
        setSearchResults(null);
      } finally {
        setIsLoading(false);
      }
    }, 150);

    return () => clearTimeout(timeoutId);
  }, [query]);

  // Reset state when closing
  useEffect(() => {
    if (!commandMenuOpen) {
      setQuery('');
      setSearchResults(null);
    }
  }, [commandMenuOpen]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle on Cmd/Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandMenuOpen(!commandMenuOpen);
      }
      // Close on Escape
      if (e.key === 'Escape' && commandMenuOpen) {
        e.preventDefault();
        setCommandMenuOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [commandMenuOpen, setCommandMenuOpen]);

  // Filter navigation pages based on query
  const filteredPages = useMemo(() => {
    if (!query.trim()) return navigationPages;
    const q = query.toLowerCase();
    return navigationPages.filter(
      (p) => p.title.toLowerCase().includes(q) || p.id.includes(q)
    );
  }, [query]);

  // Check if we have any search results
  const hasSearchResults = searchResults && searchResults.counts.total > 0;
  const showRecentSearches = !query.trim() && recentSearches.length > 0;
  const showNavigation = !query.trim() || filteredPages.length > 0;

  // Get categories with results
  const categoriesWithResults = useMemo(() => {
    if (!searchResults) return [];
    return Object.entries(searchResults.results)
      .filter(([, items]) => items.length > 0)
      .map(([key, items]) => ({
        key,
        name: categoryNames[key] || key,
        items,
        count: searchResults.counts[key as keyof typeof searchResults.counts] || items.length,
      }));
  }, [searchResults]);

  return (
    <>
      {/* Backdrop */}
      {commandMenuOpen && (
        <div
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
          onClick={() => setCommandMenuOpen(false)}
        />
      )}

      {/* Command Dialog */}
      {commandMenuOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
          <div
            className="w-full max-w-[640px] overflow-hidden rounded-xl border bg-background shadow-2xl animate-in fade-in-0 zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <Command
              className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide"
              shouldFilter={false}
            >
              {/* Search Input */}
              <div className="flex items-center gap-3 border-b px-4 py-3">
                <Search className="h-5 w-5 text-muted-foreground" />
                <Command.Input
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Search everything..."
                  className="flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
                  autoFocus
                />
                {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                <kbd className="hidden sm:inline-flex h-6 select-none items-center gap-1 rounded border bg-muted px-2 font-mono text-xs text-muted-foreground">
                  ESC
                </kbd>
              </div>

              {/* Results Area */}
              <Command.List className="max-h-[400px] overflow-y-auto overflow-x-hidden p-2">
                {/* Loading State */}
                {isLoading && query.trim() && <SearchSkeleton />}

                {/* No Results */}
                {!isLoading && query.trim() && !hasSearchResults && filteredPages.length === 0 && (
                  <div className="py-12 text-center">
                    <Search className="mx-auto h-12 w-12 text-muted-foreground/50" />
                    <p className="mt-4 text-sm text-muted-foreground">
                      No results found for &quot;{query}&quot;
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Try searching for extensions, contacts, or pages
                    </p>
                  </div>
                )}

                {/* Recent Searches */}
                {showRecentSearches && (
                  <Command.Group heading="Recent">
                    {recentSearches.map((item) => (
                      <RecentSearchItemComponent
                        key={`recent-${item.id}`}
                        item={item}
                        onSelect={() => handleRecentSelect(item)}
                        onRemove={() => removeRecentSearch(item.id)}
                      />
                    ))}
                  </Command.Group>
                )}

                {/* Search Results by Category */}
                {!isLoading &&
                  categoriesWithResults.map(({ key, name, items, count }) => (
                    <Command.Group key={key} heading={`${name} (${count})`}>
                      {items.map((result) => (
                        <SearchResultItem
                          key={`${result.type}-${result.id}`}
                          result={result}
                          onSelect={() => handleResultSelect(result)}
                        />
                      ))}
                    </Command.Group>
                  ))}

                {/* Navigation Pages */}
                {showNavigation && !isLoading && (
                  <Command.Group heading={query.trim() ? 'Pages' : 'Quick Navigation'}>
                    {(query.trim() ? filteredPages : filteredPages.slice(0, 6)).map((page) => (
                      <NavigationItem
                        key={page.id}
                        page={page}
                        onSelect={() => navigate(page.url)}
                      />
                    ))}
                  </Command.Group>
                )}

                {/* Theme Options (only when not searching) */}
                {!query.trim() && (
                  <Command.Group heading="Theme">
                    <ThemeItem
                      icon={Sun}
                      label="Light"
                      isActive={theme === 'light'}
                      onSelect={() => {
                        setTheme('light');
                        setCommandMenuOpen(false);
                      }}
                    />
                    <ThemeItem
                      icon={Moon}
                      label="Dark"
                      isActive={theme === 'dark'}
                      onSelect={() => {
                        setTheme('dark');
                        setCommandMenuOpen(false);
                      }}
                    />
                    <ThemeItem
                      icon={Monitor}
                      label="System"
                      isActive={theme === 'system'}
                      onSelect={() => {
                        setTheme('system');
                        setCommandMenuOpen(false);
                      }}
                    />
                  </Command.Group>
                )}
              </Command.List>

              {/* Footer */}
              <div className="flex items-center justify-between border-t bg-muted/50 px-4 py-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border bg-background px-1.5 py-0.5">↑</kbd>
                    <kbd className="rounded border bg-background px-1.5 py-0.5">↓</kbd>
                    <span>Navigate</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border bg-background px-1.5 py-0.5">↵</kbd>
                    <span>Open</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border bg-background px-1.5 py-0.5">esc</kbd>
                    <span>Close</span>
                  </span>
                </div>
                {searchResults && (
                  <span>
                    {searchResults.counts.total} result{searchResults.counts.total !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </Command>
          </div>
        </div>
      )}
    </>
  );
}
