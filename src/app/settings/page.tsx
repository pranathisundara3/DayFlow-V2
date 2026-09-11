
'use client';

import { useState, useEffect, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dumbbell, Save, Download, Upload, BellDot, Palette } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from '@/hooks/use-auth';
import { apiFetch } from '@/lib/api-client';

// Strips server-generated fields so a backed-up item can be POSTed back as a
// fresh create without the DTO rejecting unknown properties.
function stripServerFields<T extends Record<string, any>>(item: T): Record<string, any> {
    const { _id, userId, createdAt, updatedAt, __v, ...rest } = item;
    return rest;
}

function BackupAndRestore() {
    const { user } = useAuth();
    const { toast } = useToast();

    const handleBackup = async () => {
        if (!user) {
            toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in to back up data.' });
            return;
        }
        try {
            const [userProfile, tasks, transactions, budget, habits, gym, notes, credentials, notifications, planner] = await Promise.all([
                apiFetch<any>('/users/me'),
                apiFetch<any[]>('/tasks'),
                apiFetch<any[]>('/expenses/transactions'),
                apiFetch<any>('/expenses/budget'),
                apiFetch<any[]>('/habits'),
                apiFetch<any>('/habits/gym'),
                apiFetch<any[]>('/notes'),
                apiFetch<any[]>('/credentials'),
                apiFetch<any[]>('/notifications'),
                apiFetch<any>('/planner'),
            ]);

            const backupData = { userProfile, tasks, transactions, budget, habits, gym, notes, credentials, notifications, planner };
            const json = JSON.stringify(backupData, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `DayFlow_backup_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            toast({ title: 'Success', description: 'Your data has been downloaded.' });
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Backup Failed', description: 'Could not back up your data.' });
        }
    };

    const handleRestore = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!user) {
            toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in to restore data.' });
            return;
        }
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const json = e.target?.result as string;
                const backupData = JSON.parse(json);

                const restoreOps: Promise<any>[] = [];
                if (backupData.userProfile) {
                    const { username, theme, phoneNumber } = backupData.userProfile;
                    restoreOps.push(apiFetch('/users/me', { method: 'PATCH', body: JSON.stringify({ username, theme, phoneNumber }) }));
                }
                if (Array.isArray(backupData.tasks)) {
                    restoreOps.push(...backupData.tasks.map((t: any) => apiFetch('/tasks', { method: 'POST', body: JSON.stringify(stripServerFields(t)) })));
                }
                if (Array.isArray(backupData.transactions)) {
                    restoreOps.push(...backupData.transactions.map((t: any) => apiFetch('/expenses/transactions', { method: 'POST', body: JSON.stringify({ ...stripServerFields(t), date: (t.date as string).slice(0, 10) }) })));
                }
                if (backupData.budget) {
                    restoreOps.push(apiFetch('/expenses/budget', { method: 'PATCH', body: JSON.stringify({ amountCents: backupData.budget.amountCents }) }));
                }
                if (Array.isArray(backupData.habits) && backupData.habits.length > 0) {
                    restoreOps.push(apiFetch('/habits', { method: 'PATCH', body: JSON.stringify(backupData.habits.map(stripServerFields)) }));
                }
                if (backupData.gym) {
                    restoreOps.push(apiFetch('/habits/gym', { method: 'PATCH', body: JSON.stringify({ data: backupData.gym.data || {} }) }));
                }
                if (Array.isArray(backupData.notes)) {
                    restoreOps.push(...backupData.notes.map((n: any) => apiFetch('/notes', { method: 'POST', body: JSON.stringify(stripServerFields(n)) })));
                }
                if (Array.isArray(backupData.credentials)) {
                    restoreOps.push(...backupData.credentials.map((c: any) => apiFetch('/credentials', { method: 'POST', body: JSON.stringify(stripServerFields(c)) })));
                }
                if (Array.isArray(backupData.notifications)) {
                    restoreOps.push(...backupData.notifications.map((n: any) => apiFetch('/notifications', { method: 'POST', body: JSON.stringify({ ...stripServerFields(n), date: (n.date as string).slice(0, 10) }) })));
                }
                if (backupData.planner) {
                    restoreOps.push(apiFetch('/planner', { method: 'PUT', body: JSON.stringify({ days: backupData.planner.days || {} }) }));
                }

                await Promise.all(restoreOps);
                toast({ title: 'Success', description: 'Your data has been restored. The page will now reload.' });
                setTimeout(() => window.location.reload(), 2000);
            } catch (error) {
                console.error(error);
                toast({ variant: 'destructive', title: 'Restore Failed', description: 'The backup file is invalid or corrupt.' });
            }
        };
        reader.readAsText(file);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Backup &amp; Restore</CardTitle>
                <CardDescription>Download all your data to a file or restore from a previous backup.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col sm:flex-row gap-4">
                <Button onClick={handleBackup} className="w-full sm:w-auto"><Download className="mr-2 h-4 w-4" />Download Backup</Button>
                <div className="relative w-full sm:w-auto">
                    <Button className="w-full pointer-events-none"><Upload className="mr-2 h-4 w-4" />Restore from Backup</Button>
                    <Input type="file" accept=".json" onChange={handleRestore} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                </div>
            </CardContent>
        </Card>
    );
}

function PushNotificationManager() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [isSupported, setIsSupported] = useState(false);
    const [permission, setPermission] = useState<NotificationPermission>('default');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
            setIsSupported(true);
            setPermission(Notification.permission);
        } else {
            setIsSupported(false);
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        const checkSubscription = async () => {
            if (isSupported && Notification.permission === 'granted') {
                const registration = await navigator.serviceWorker.ready;
                const subscription = await registration.pushManager.getSubscription();
                setIsSubscribed(!!subscription);
            }
        };
        if(isSupported) {
            checkSubscription();
        }
    }, [isSupported, permission]);
    
    const urlBase64ToUint8Array = (base64String: string) => {
        const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    };

    const subscribeUser = async () => {
        if (!user || !isSupported) return;
        
        if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
            toast({ variant: 'destructive', title: 'Configuration Error', description: 'VAPID public key is not configured in the environment.' });
            return;
        }
        
        setIsLoading(true);
        try {
            const registration = await navigator.serviceWorker.ready;
            const applicationServerKey = urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey,
            });
            await apiFetch('/push/subscriptions', {
                method: 'POST',
                body: JSON.stringify(subscription),
            });
            setIsSubscribed(true);
            toast({ title: 'Subscribed!', description: 'You will now receive push notifications.' });
        } catch (error) {
            console.error('Failed to subscribe:', error);
            setPermission('default'); // Reset to allow retrying
            let description = 'Could not enable push notifications. Please try again.';
            if (error instanceof DOMException) {
                if (error.name === 'NotAllowedError') {
                    description = 'Notification permission was denied. Please enable it in your browser settings and try again.';
                } else {
                    description = 'Subscription failed. This is often due to an invalid VAPID key. Please verify your keys in the .env file and in your hosting provider settings.';
                }
            }
            toast({ variant: 'destructive', title: 'Subscription Failed', description });
        } finally {
            setIsLoading(false);
        }
    };
    
    const unsubscribeUser = async () => {
        if (!user || !isSupported) return;
        setIsLoading(true);
        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            if (subscription) {
                const endpoint = subscription.endpoint;
                await subscription.unsubscribe();
                await apiFetch('/push/subscriptions', {
                    method: 'DELETE',
                    body: JSON.stringify({ endpoint }),
                });
            }
            setIsSubscribed(false);
            toast({ title: 'Unsubscribed', description: 'Push notifications have been disabled.' });
        } catch (error) {
            console.error('Failed to unsubscribe:', error);
            toast({ variant: 'destructive', title: 'Failed to Unsubscribe', description: 'Could not disable push notifications.' });
        } finally {
            setIsLoading(false);
        }
    }
    
    const handleToggleSubscription = async () => {
        if (isSubscribed) {
            await unsubscribeUser();
            return;
        }

        if (permission === 'granted') {
            await subscribeUser();
        } else if (permission === 'default') {
            const newPermission = await Notification.requestPermission();
            setPermission(newPermission);
            if (newPermission === 'granted') {
                await subscribeUser();
            } else {
                toast({ variant: 'destructive', title: 'Permission Required', description: 'You need to grant permission to enable notifications.' });
            }
        } else { // 'denied'
            toast({ variant: 'destructive', title: 'Permission Denied', description: 'Please enable notifications for this site in your browser settings.' });
        }
    };

    const handleSendTest = async () => {
        if (!user) return;
        toast({ title: 'Sending...', description: 'Sending a test notification to your device.' });
        try {
            await apiFetch('/push/test', { method: 'POST' });
            toast({ title: 'Test Sent!', description: 'Check your device for a notification.' });
        } catch(e) {
             toast({ variant: 'destructive', title: 'Failed to Send', description: 'Could not send test notification.' });
        }
    }

    if (!isSupported) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><BellDot />Push Notifications</CardTitle>
                </CardHeader>
                <CardContent><p className="text-sm text-destructive">Your browser does not support push notifications.</p></CardContent>
            </Card>
        );
    }
    
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><BellDot />Push Notifications</CardTitle>
                <CardDescription>Receive reminders on supported desktop and mobile browsers, even when the app is closed.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                        <Label htmlFor="push-switch" className="text-base">Enable Notifications</Label>
                        <p className="text-sm text-muted-foreground">
                            {permission === 'denied' && "You have blocked notifications."}
                            {permission === 'granted' && isSubscribed && "Notifications are enabled on this device."}
                            {permission === 'granted' && !isSubscribed && "Click to finalize subscription."}
                            {permission === 'default' && "Allow notifications to stay updated."}
                        </p>
                    </div>
                    <Switch id="push-switch" checked={isSubscribed} onCheckedChange={handleToggleSubscription} disabled={isLoading || permission === 'denied'} />
                </div>
                {permission === 'denied' && (
                    <p className="text-xs text-destructive px-1">You must enable notification permissions in your browser or system settings to use this feature.</p>
                )}
            </CardContent>
            {isSubscribed && (
                <CardFooter>
                    <Button onClick={handleSendTest} variant="secondary">Send Test Notification</Button>
                </CardFooter>
            )}
        </Card>
    )
}

export default function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = useState({ gymTracking: true, theme: 'default-green' });
  const [isLoading, setIsLoading] = useState(true);
  // Holds the full gym-settings blob (workout plan, nutrition logs, etc. — owned
  // by habits/page.tsx) so toggling gymTracking here never clobbers the rest of
  // it: `PATCH /habits/gym` replaces the whole blob on every call.
  const gymDataRef = useRef<Record<string, unknown>>({});

  useEffect(() => {
    if (!user) {
        setIsLoading(false);
        return;
    };
    setIsLoading(true);
    let cancelled = false;
    Promise.all([
        apiFetch<{ theme?: string }>('/users/me'),
        apiFetch<{ data: Record<string, unknown> }>('/habits/gym'),
    ]).then(([userDoc, gymDoc]) => {
        if (cancelled) return;
        gymDataRef.current = gymDoc.data || {};
        const gymSettings = gymDataRef.current.settings as { gymTracking?: boolean } | undefined;
        setSettings({
            theme: userDoc.theme || 'default-green',
            gymTracking: gymSettings?.gymTracking !== false,
        });
    }).catch((err) => {
        console.error('Failed to load settings:', err);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not load your settings.' });
    }).finally(() => {
        if (!cancelled) setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [user, toast]);

  const handleThemeChange = async (value: string) => {
    if (!user) return;
    const previous = settings.theme;
    setSettings((prev) => ({ ...prev, theme: value }));
    try {
        await apiFetch('/users/me', { method: 'PATCH', body: JSON.stringify({ theme: value }) });
    } catch (err) {
        setSettings((prev) => ({ ...prev, theme: previous }));
        toast({ variant: 'destructive', title: 'Error', description: 'Could not save theme.' });
    }
  };

  const handleGymTrackingChange = async (checked: boolean) => {
    if (!user) return;
    const previous = settings.gymTracking;
    setSettings((prev) => ({ ...prev, gymTracking: checked }));
    const currentGymSettings = (gymDataRef.current.settings as { gymTracking?: boolean } | undefined) || {};
    gymDataRef.current = { ...gymDataRef.current, settings: { ...currentGymSettings, gymTracking: checked } };
    try {
        await apiFetch('/habits/gym', { method: 'PATCH', body: JSON.stringify({ data: gymDataRef.current }) });
    } catch (err) {
        setSettings((prev) => ({ ...prev, gymTracking: previous }));
        toast({ variant: 'destructive', title: 'Error', description: 'Could not save gym tracking setting.' });
    }
  };

  return (
    <AppLayout>
        <div className="space-y-6">
            <header>
              <h1 className="text-2xl font-bold font-headline">Settings</h1>
              <p className="text-muted-foreground">Manage your application settings here.</p>
            </header>
            
            <Card>
                <CardHeader><CardTitle>Appearance</CardTitle><CardDescription>Customize the look and feel of the app.</CardDescription></CardHeader>
                <CardContent>
                    {isLoading ? ( <Skeleton className="h-10 w-full" /> ) : (
                        <div className="flex items-center justify-between rounded-lg border p-4">
                             <div className="space-y-0.5">
                                <Label className="text-base flex items-center gap-2"><Palette className="h-5 w-5" />App Theme</Label>
                                <p className="text-sm text-muted-foreground">Select a visual theme for the application.</p>
                            </div>
                            <Select value={settings.theme} onValueChange={handleThemeChange}>
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Select theme" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="default-green">Default Green</SelectItem>
                                    <SelectItem value="indigo">Soft Indigo</SelectItem>
                                    <SelectItem value="charcoal-yellow">Charcoal &amp; Yellow</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle>Feature Management</CardTitle><CardDescription>Enable or disable optional features to customize your experience.</CardDescription></CardHeader>
                <CardContent>
                    {isLoading ? ( <Skeleton className="h-20 w-full" /> ) : (
                        <div className="flex items-center justify-between rounded-lg border p-4">
                            <div className="space-y-0.5">
                                <Label htmlFor="gym-tracking-switch" className="text-base flex items-center gap-2"><Dumbbell className="h-5 w-5" />Gym &amp; Fitness Tracking</Label>
                                <p className="text-sm text-muted-foreground">Show trackers for workouts, protein, and overload.</p>
                            </div>
                            <Switch id="gym-tracking-switch" checked={settings.gymTracking} onCheckedChange={handleGymTrackingChange} />
                        </div>
                    )}
                </CardContent>
            </Card>
            
            <PushNotificationManager />

            <BackupAndRestore />
            
      </div>
    </AppLayout>
  );
}
