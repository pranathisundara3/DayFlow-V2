
'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  Wallet,
  CheckCircle2,
  StickyNote,
  LogOut,
  Moon,
  Sun,
  KeyRound,
  Settings as SettingsIcon,
  UserCog,
  CalendarDays,
  Bell,
  Loader2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { format, parseISO, isSameDay, isFuture } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Notification } from '@/types';
import { useAuth, type AppUser } from '@/hooks/use-auth';
import { apiFetch } from '@/lib/api-client';

type ApiNotification = {
  _id: string;
  title: string;
  date: string;
  message: string;
  read: boolean;
};

function toNotification(n: ApiNotification): Notification {
  return {
    id: n._id,
    title: n.title,
    date: n.date.slice(0, 10),
    message: n.message,
    read: n.read,
  };
}


const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/expenses', icon: Wallet, label: 'Expenses' },
  { href: '/habits', icon: CheckCircle2, label: 'Habits' },
  { href: '/notes', icon: StickyNote, label: 'Notes' },
];

function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur-sm">
      <div className="flex justify-around h-16 items-center">
        {navItems.map((item) => (
          <Link
            href={item.href}
            key={item.href}
            className={cn(
              'flex flex-col items-center justify-center gap-1 text-sm transition-colors',
              pathname === item.href
                ? 'text-primary font-medium'
                : 'text-muted-foreground hover:text-primary'
            )}
          >
            <item.icon className="h-5 w-5" />
            <span>{item.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    setTheme(isDark ? 'dark' : 'light');
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  return (
      <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
          <div className="flex items-center justify-between w-full">
              <div className="flex items-center">
                  {theme === 'light' ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
                  <span>Dark Mode</span>
              </div>
              <Switch checked={theme === 'dark'} onCheckedChange={toggleTheme} aria-label="Toggle dark mode" />
          </div>
      </DropdownMenuItem>
  );
}

function UserNav({ user, username, photoURL, onLogout }: { user: AppUser, username: string | null, photoURL: string | null, onLogout: () => void }) {
  const router = useRouter();
  
  if (!user) return <Skeleton className="h-8 w-8 rounded-full" />;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
          <Avatar className="h-8 w-8">
            <AvatarImage src={photoURL || undefined} alt="User Avatar" />
            <AvatarFallback>{username ? username.charAt(0).toUpperCase() : 'U'}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-2">
            <p className="text-sm font-medium leading-none">{username || user.email}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {user.isAnonymous ? "Guest account (data is temporary)" : "Welcome back!"}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
           {!user.isAnonymous && (
             <DropdownMenuItem onSelect={() => router.push('/profile')}>
              <UserCog className="mr-2 h-4 w-4" />
              <span>Edit Profile</span>
            </DropdownMenuItem>
           )}
           <DropdownMenuItem onSelect={() => router.push('/planner')}>
            <CalendarDays className="mr-2 h-4 w-4" />
            <span>Daily Planner</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push('/password-manager')}>
            <KeyRound className="mr-2 h-4 w-4" />
            <span>Password Manager</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => router.push('/settings')}>
            <SettingsIcon className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <ThemeToggle />
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NotificationBell() {
  const router = useRouter();
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    const fetchNotifications = async () => {
      try {
        const data = await apiFetch<ApiNotification[]>('/notifications');
        if (!cancelled) setNotifications(data.map(toNotification));
      } catch (error) {
        console.error('Failed to load notifications:', error);
      }
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user]);

  const todaysUnreadNotifications = notifications.filter(n => {
    if (!n.read) {
        try {
            return isSameDay(parseISO(n.date), new Date());
        } catch (e) {
            console.error("Invalid date format for notification:", n);
            return false;
        }
    }
    return false;
  });

  const unreadCount = todaysUnreadNotifications.length;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute top-0 right-0 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
          )}
          <span className="sr-only">Open notifications</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <ScrollArea className="max-h-80">
            <div className="p-2 space-y-2">
                {unreadCount > 0 ? (
                    <>
                        {todaysUnreadNotifications.slice(0, 5).map(n => (
                            <div key={n.id} className="text-sm p-2 rounded-md hover:bg-accent cursor-pointer" onClick={() => {
                                setIsOpen(false);
                                router.push('/notifications');
                            }}>
                                <p className="font-semibold">{n.title}</p>
                                <p className="text-muted-foreground truncate">{n.message}</p>
                            </div>
                        ))}
                    </>
                ) : (
                    <p className="text-sm text-center text-muted-foreground py-8">No new reminders today.</p>
                )}
            </div>
        </ScrollArea>
        <div className="p-1 border-t bg-muted/50">
            <Button variant="link" className="w-full h-8 text-xs" onClick={() => {
                setIsOpen(false);
                router.push('/notifications');
            }}>
                View all notifications
            </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function HeaderCalendar() {
  const { user } = useAuth();
  const [date, setDate] = useState<Date>();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const handleAddReminder = async () => {
    if (!date || !title.trim() || !message.trim() || !user) {
        return;
    }

    try {
        await apiFetch('/notifications', {
          method: 'POST',
          body: JSON.stringify({
            title,
            message,
            date: format(date, 'yyyy-MM-dd'),
          }),
        });

        setDate(undefined);
        setTitle('');
        setMessage('');
        setIsPopoverOpen(false);

    } catch (error) {
      console.error("Failed to add reminder:", error);
    }
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <CalendarDays className="h-4 w-4" />
          <span className="sr-only">Open calendar</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="single"
          selected={date}
          onSelect={setDate}
          disabled={(d) => d < today}
          initialFocus
        />
        {date && (isFuture(date) || isSameDay(date, today)) && (
            <div className="p-2 border-t space-y-2">
                <h4 className="font-semibold text-xs text-center">Add Reminder for {format(date, 'MMM d')}</h4>
                <div className="space-y-1">
                    <Label htmlFor="reminder-title" className="text-xs px-1">Title</Label>
                    <Input id="reminder-title" placeholder="e.g., Mom's Birthday" value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 text-xs" />
                </div>
                 <div className="space-y-1">
                    <Label htmlFor="reminder-message" className="text-xs px-1">Message</Label>
                    <Textarea id="reminder-message" placeholder="e.g., Call her in the morning" value={message} onChange={(e) => setMessage(e.target.value)} className="text-xs min-h-[60px]"/>
                </div>
                <Button size="sm" className="w-full h-8 text-xs" onClick={handleAddReminder} disabled={!user}>
                    Set Reminder
                </Button>
            </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * This component reads the user's theme preference from the backend and
 * applies the corresponding CSS class to the HTML element.
 */
function ThemeController() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    apiFetch<{ theme?: string }>('/users/me').then((data) => {
      if (cancelled) return;
      const themeClasses = ['theme-indigo', 'theme-charcoal-yellow'];
      document.documentElement.classList.remove(...themeClasses);
      const theme = data.theme || 'default-green';
      if (theme !== 'default-green') {
        document.documentElement.classList.add(`theme-${theme}`);
      }
    }).catch((err) => {
      console.error('Failed to load theme:', err);
    });

    return () => { cancelled = true; };
  }, [user]);

  return null; // This component does not render anything
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading, signOutUser } = useAuth();
  const [username, setUsername] = useState<string | null>(null);
  const [photoURL, setPhotoURL] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }

    // `user.displayName`/`photoURL` are already populated by useAuth() (from the backend's `/users/me`).
    setUsername(user.isAnonymous ? 'Guest User' : user.displayName);
    setPhotoURL(user.photoURL);
  }, [user, loading, router]);

  const handleLogout = async () => {
    await signOutUser();
    router.push('/login');
  };
  
  if (loading || !user) {
    // AuthProvider now shows a loading screen, but this is a safeguard.
    return (
      <div className="flex h-screen w-screen items-center justify-center p-4">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <ThemeController />
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-4 border-b bg-background/95 px-4 sm:px-6 backdrop-blur-sm">
        <h1 className="font-headline text-lg font-bold text-primary">DayFlow</h1>
        <div className="flex-1" />
        <NotificationBell />
        <HeaderCalendar />
        <UserNav user={user} username={username} photoURL={photoURL} onLogout={handleLogout} />
      </header>
      <main className="flex-1 p-4 md:p-6 pb-24">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
