'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/ui-store';
import { mainNavItems, bottomNavItems } from './sidebar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

// All nav items for checking exact matches
const allNavItems = [...mainNavItems, ...bottomNavItems];

// Helper to determine if a nav item is active
function isNavItemActive(pathname: string | null, itemHref: string): boolean {
    const hasExactNavMatch = allNavItems.some(nav => pathname === nav.href);
    return hasExactNavMatch
        ? pathname === itemHref
        : (pathname === itemHref || (itemHref !== '/' && (pathname?.startsWith(itemHref + '/') ?? false)));
}

export function MobileSidebar() {
    const pathname = usePathname();
    const { sidebarMobileOpen, setSidebarMobileOpen } = useUIStore();

    const closeSidebar = () => setSidebarMobileOpen(false);

    return (
        <AnimatePresence>
            {sidebarMobileOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={closeSidebar}
                        className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
                    />

                    {/* Sidebar */}
                    <motion.aside
                        initial={{ x: '-100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '-100%' }}
                        transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                        className="fixed inset-y-0 left-0 z-50 w-3/4 max-w-sm border-r bg-sidebar p-6 shadow-2xl md:hidden"
                    >
                        <div className="flex flex-col h-full">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-4">
                                <Link href="/" onClick={closeSidebar}>
                                    <Image
                                        src="/login.gif"
                                        alt="BotPbx"
                                        width={80}
                                        height={80}
                                        className="object-contain"
                                        unoptimized
                                    />
                                </Link>
                                <Button variant="ghost" size="icon" onClick={closeSidebar}>
                                    <X className="h-5 w-5" />
                                </Button>
                            </div>

                            {/* Navigation */}
                            <ScrollArea className="flex-1 -mx-6 px-6">
                                <nav className="flex flex-col gap-1">
                                    {mainNavItems.map((item) => {
                                        const isActive = isNavItemActive(pathname, item.href);

                                        return (
                                            <Link
                                                key={item.href}
                                                href={item.href}
                                                onClick={closeSidebar}
                                                className={cn(
                                                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                                                    isActive
                                                        ? 'bg-primary/10 text-primary'
                                                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                                )}
                                            >
                                                <item.icon className={cn('h-5 w-5', isActive && 'text-primary')} />
                                                {item.title}
                                                {item.badge && (
                                                    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                                                        {item.badge}
                                                    </span>
                                                )}
                                            </Link>
                                        );
                                    })}
                                </nav>
                            </ScrollArea>

                            {/* Bottom Nav */}
                            <div className="mt-auto pt-6 border-t">
                                <nav className="flex flex-col gap-1">
                                    {bottomNavItems.map((item) => {
                                        const isActive = isNavItemActive(pathname, item.href);

                                        return (
                                            <Link
                                                key={item.href}
                                                href={item.href}
                                                onClick={closeSidebar}
                                                className={cn(
                                                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                                                    isActive
                                                        ? 'bg-primary/10 text-primary'
                                                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                                )}
                                            >
                                                <item.icon className={cn('h-5 w-5', isActive && 'text-primary')} />
                                                {item.title}
                                            </Link>
                                        );
                                    })}
                                </nav>
                            </div>
                        </div>
                    </motion.aside>
                </>
            )}
        </AnimatePresence>
    );
}
