
'use client';

import { useState, useEffect, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Save, Loader2, Edit, ShieldCheck } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { apiFetch, ApiError } from '@/lib/api-client';

const MAX_AVATAR_BYTES = 1024 * 1024; // 1MB, matches the UI copy below

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  
  // Profile state
  const [username, setUsername] = useState('');
  const [photoURL, setPhotoURL] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Security state
  const [isSecurityLoading, setIsSecurityLoading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');


  useEffect(() => {
    if (!user) return;
    setIsLoading(true);
    let cancelled = false;
    apiFetch<{ username: string; photoUrl: string | null }>('/users/me').then((data) => {
      if (cancelled) return;
      setUsername(data.username || '');
      setPhotoURL(data.photoUrl || null);
    }).catch((error) => {
      console.error('Failed to load profile:', error);
    }).finally(() => {
      if (!cancelled) setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [user]);

  const handleSaveUsername = async () => {
    if (!user || !username.trim()) return;
    setIsLoading(true);
    const finalUsername = username.trim();
    try {
        await apiFetch('/users/me', { method: 'PATCH', body: JSON.stringify({ username: finalUsername }) });
        await refreshUser();
        toast({ title: "Success", description: `Your username has been updated to ${finalUsername}.` });
    } catch(e) {
        toast({ variant: 'destructive', title: "Error", description: "Could not save your username." });
    } finally {
        setIsLoading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !user) return;
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > MAX_AVATAR_BYTES) {
      toast({ variant: 'destructive', title: 'Image too large', description: 'Please choose an image under 1MB.' });
      e.target.value = '';
      return;
    }

    setIsUploading(true);
    try {
        // Stored directly on the user document as a data: URI — no separate
        // file/object storage in this backend.
        const dataUrl = await readFileAsDataUrl(file);
        await apiFetch('/users/me', { method: 'PATCH', body: JSON.stringify({ photoUrl: dataUrl }) });
        await refreshUser();

        setPhotoURL(dataUrl);
        toast({ title: 'Success!', description: 'Your profile picture has been updated.' });
    } catch (error) {
        console.error("Error uploading image:", error);
        toast({ variant: 'destructive', title: 'Upload Failed', description: 'Could not upload your image. Please try again.' });
    } finally {
        setIsUploading(false);
        e.target.value = '';
    }
  };

  const handleEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newEmail || !currentPassword) {
      toast({ variant: 'destructive', title: 'Missing fields', description: 'Please fill in all fields.' });
      return;
    }
    if (!user.email) {
      toast({ variant: 'destructive', title: 'Error', description: 'Cannot change email for accounts without an initial email.' });
      return;
    }
    setIsSecurityLoading(true);
    try {
      await apiFetch('/auth/change-email', {
        method: 'PATCH',
        body: JSON.stringify({ currentPassword, newEmail }),
      });
      await refreshUser();
      toast({ title: 'Email updated!', description: `Your email address has been successfully changed to ${newEmail}.` });
      setNewEmail('');
      setCurrentPassword('');
    } catch (error) {
      let description = "An error occurred while updating your email.";
      if (error instanceof ApiError && error.status === 401) {
        description = 'Incorrect password. Please verify your current password and try again.';
      } else if (error instanceof ApiError && error.status === 409) {
        description = 'The new email address is already in use by another account.';
      }
      toast({ variant: 'destructive', title: 'Email Change Failed', description });
    } finally {
      setIsSecurityLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newPassword || !currentPassword || !confirmNewPassword) {
      toast({ variant: 'destructive', title: 'Missing fields', description: 'Please fill in all fields.' });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast({ variant: 'destructive', title: 'Passwords do not match', description: 'The new passwords you entered do not match.' });
      return;
    }
    if (newPassword.length < 6) {
      toast({ variant: 'destructive', title: 'Password too short', description: 'Your new password must be at least 6 characters long.' });
      return;
    }
     if (!user.email) {
      toast({ variant: 'destructive', title: 'Error', description: 'Cannot change password for accounts without an email.' });
      return;
    }
    setIsSecurityLoading(true);
    try {
      await apiFetch('/auth/change-password', {
        method: 'PATCH',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      toast({ title: 'Password updated!', description: 'Your password has been successfully changed.' });
      setNewPassword('');
      setConfirmNewPassword('');
      setCurrentPassword('');
    } catch (error) {
      let description = "An error occurred while updating your password.";
      if (error instanceof ApiError && error.status === 401) {
        description = 'Incorrect password. Please verify your current password and try again.';
      }
      toast({ variant: 'destructive', title: 'Password Change Failed', description });
    } finally {
      setIsSecurityLoading(false);
    }
  };

  if (isLoading || !user) {
    return (
        <AppLayout>
            <div className="space-y-4">
                <header>
                  <h1 className="text-2xl font-bold font-headline">Edit Profile</h1>
                  <p className="text-muted-foreground">Manage your profile settings here.</p>
                </header>
                <Card>
                    <CardHeader><Skeleton className="h-6 w-1/4" /></CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex items-center gap-4">
                           <Skeleton className="h-20 w-20 rounded-full" />
                           <div className="space-y-2"><Skeleton className="h-4 w-48" /><Skeleton className="h-4 w-32" /></div>
                        </div>
                        <div className="space-y-2"><Skeleton className="h-4 w-1/6 mb-2" /><Skeleton className="h-10 w-full" /></div>
                    </CardContent>
                    <CardFooter><Skeleton className="h-10 w-24" /></CardFooter>
                </Card>
            </div>
        </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold font-headline">Edit Profile</h1>
          <p className="text-muted-foreground">Manage your profile settings here.</p>
        </header>
        <Card>
            <CardHeader><CardTitle>Your Information</CardTitle><CardDescription>Update your username and profile picture.</CardDescription></CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-2">
                    <Label>Your Avatar</Label>
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <Avatar className="h-20 w-20">
                                <AvatarImage src={photoURL || undefined} alt="User Avatar" />
                                <AvatarFallback>{username ? username.charAt(0).toUpperCase() : 'U'}</AvatarFallback>
                            </Avatar>
                            <Button onClick={() => fileInputRef.current?.click()} disabled={isUploading} variant="secondary" size="icon" className="absolute bottom-0 right-0 h-7 w-7 rounded-full">
                                {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Edit className="h-4 w-4" />}
                            </Button>
                            <Input 
                                type="file" 
                                ref={fileInputRef} 
                                onChange={handleImageUpload}
                                hidden 
                                accept="image/png, image/jpeg" 
                            />
                        </div>
                        <p className="text-sm text-muted-foreground">Click the edit icon on your avatar to upload a new image.<br/>(Max 1MB)</p>
                    </div>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} disabled={isLoading} />
                </div>
            </CardContent>
            <CardFooter><Button onClick={handleSaveUsername} disabled={isLoading}><Save className="mr-2 h-4 w-4" /> Save Username</Button></CardFooter>
        </Card>

        {!user.isAnonymous && (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><ShieldCheck/>Security Settings</CardTitle>
                    <CardDescription>Update your email or password. You will need to provide your current password to make changes.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue="email" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="email">Change Email</TabsTrigger>
                            <TabsTrigger value="password">Change Password</TabsTrigger>
                        </TabsList>
                        <TabsContent value="email" className="pt-4">
                            <form onSubmit={handleEmailChange} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="new-email">New Email Address</Label>
                                    <Input id="new-email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="new.email@example.com" disabled={isSecurityLoading} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="current-password-email">Current Password</Label>
                                    <Input id="current-password-email" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="••••••••" disabled={isSecurityLoading} />
                                </div>
                                <Button type="submit" disabled={isSecurityLoading}>
                                    {isSecurityLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                    Update Email
                                </Button>
                            </form>
                        </TabsContent>
                        <TabsContent value="password" className="pt-4">
                            <form onSubmit={handlePasswordChange} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="current-password-pw">Current Password</Label>
                                    <Input id="current-password-pw" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="••••••••" disabled={isSecurityLoading} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="new-password">New Password</Label>
                                    <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="6+ characters" disabled={isSecurityLoading} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="confirm-password">Confirm New Password</Label>
                                    <Input id="confirm-password" type="password" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} placeholder="6+ characters" disabled={isSecurityLoading} />
                                </div>
                                <Button type="submit" disabled={isSecurityLoading}>
                                    {isSecurityLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                    Update Password
                                </Button>
                            </form>
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        )}
      </div>
    </AppLayout>
  );
}
