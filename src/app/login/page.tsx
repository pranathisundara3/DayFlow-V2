
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Users, KeyRound, UserPlus } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { ApiError, requestPasswordReset } from '@/lib/api-client';
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function LoginPage() {
  const { user, loading: authLoading, signInWithEmail, signUpWithEmail, signInAsGuest } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [uiLoading, setUiLoading] = useState(false);

  // Sign-in state
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');

  // Sign-up state
  const [signUpUsername, setSignUpUsername] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');

  // Forgot-password state
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [isResetLoading, setIsResetLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      router.replace('/dashboard');
    }
  }, [user, authLoading, router]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signInEmail.trim() || !signInPassword.trim()) {
      toast({ variant: "destructive", title: "Missing fields", description: "Please enter both email and password." });
      return;
    }
    setUiLoading(true);
    try {
      await signInWithEmail(signInEmail, signInPassword);
      toast({ title: 'Welcome back!' });
    } catch (error) {
      console.error(error);
      let description = "Invalid email or password. Please try again.";
      if (error instanceof ApiError && error.status === 401) {
        description = "Invalid credentials. Please check your email and password.";
      }
      toast({ variant: "destructive", title: "Sign-In Failed", description });
    } finally {
      setUiLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signUpEmail.trim() || !signUpPassword.trim() || !signUpUsername.trim()) {
        toast({ variant: "destructive", title: "Missing fields", description: "Please fill out all fields to create an account." });
        return;
    }
    if (signUpPassword.length < 6) {
        toast({ variant: "destructive", title: "Password too short", description: "Password must be at least 6 characters long." });
        return;
    }
    setUiLoading(true);
    try {
        await signUpWithEmail(signUpEmail, signUpPassword, signUpUsername);
        toast({ title: 'Account Created!', description: "You've been signed in." });
    } catch (error) {
      console.error(error);
      if (error instanceof ApiError && error.status === 409) {
          toast({ variant: "destructive", title: "Sign-Up Failed", description: "This email is already associated with an account." });
      } else {
          toast({ variant: "destructive", title: "Sign-Up Failed", description: "Could not create your account. Please try again." });
      }
    } finally {
      setUiLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!resetEmail.trim()) {
      toast({ variant: "destructive", title: "Email required", description: "Please enter your email address." });
      return;
    }
    setIsResetLoading(true);
    try {
      await requestPasswordReset(resetEmail.trim());
      toast({ title: 'Check your inbox', description: "If an account exists for that email, we've sent a link to reset your password." });
      setIsResetDialogOpen(false);
      setResetEmail('');
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Request Failed", description: "Could not send the reset email. Please try again later." });
    } finally {
      setIsResetLoading(false);
    }
  };

  const handleAnonymousSignIn = async () => {
    setUiLoading(true);
    try {
      await signInAsGuest();
      toast({ title: 'Welcome!', description: 'You are signed in as a guest.' });
    } catch (error) {
      console.error("Guest sign-in failed", error);
      toast({ variant: "destructive", title: "Guest Sign-in Failed", description: "Could not sign you in as a guest. Please try again." });
    } finally {
      setUiLoading(false);
    }
  }

  if (authLoading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p>Loading...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-headline">Welcome to DayFlow</CardTitle>
          <CardDescription>
            Sign in, create an account, or continue as a guest.
          </CardDescription>
        </CardHeader>
        <CardContent>
           <Tabs defaultValue="signin" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="signin"><KeyRound className="mr-2 h-4 w-4"/>Sign In</TabsTrigger>
                <TabsTrigger value="signup"><UserPlus className="mr-2 h-4 w-4"/>Sign Up</TabsTrigger>
                <TabsTrigger value="guest"><Users className="mr-2 h-4 w-4"/>Guest</TabsTrigger>
              </TabsList>

              <TabsContent value="signin" className="pt-4">
                  <form onSubmit={handleSignIn} className="space-y-4">
                      <div className="space-y-1.5">
                          <Label htmlFor="signin-email">Email Address</Label>
                          <Input id="signin-email" type="email" placeholder="name@example.com" value={signInEmail} onChange={(e) => setSignInEmail(e.target.value)} disabled={uiLoading} autoComplete="email" />
                      </div>
                      <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label htmlFor="signin-password">Password</Label>
                            <Button variant="link" type="button" onClick={() => { setIsResetDialogOpen(true); setResetEmail(signInEmail); }} className="h-auto p-0 text-xs">Forgot Password?</Button>
                          </div>
                          <Input id="signin-password" type="password" placeholder="••••••••" value={signInPassword} onChange={(e) => setSignInPassword(e.target.value)} disabled={uiLoading} autoComplete="current-password" />
                      </div>
                      <Button className="w-full" type="submit" disabled={uiLoading}>
                          {uiLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Sign In"}
                      </Button>
                  </form>
              </TabsContent>

              <TabsContent value="signup" className="pt-4">
                  <form onSubmit={handleSignUp} className="space-y-4">
                      <div className="space-y-1.5">
                          <Label htmlFor="signup-username">Username</Label>
                          <Input id="signup-username" type="text" placeholder="Your Name" value={signUpUsername} onChange={(e) => setSignUpUsername(e.target.value)} disabled={uiLoading} autoComplete="username" />
                      </div>
                      <div className="space-y-1.5">
                          <Label htmlFor="signup-email">Email Address</Label>
                          <Input id="signup-email" type="email" placeholder="name@example.com" value={signUpEmail} onChange={(e) => setSignUpEmail(e.target.value)} disabled={uiLoading} autoComplete="email" />
                      </div>
                      <div className="space-y-1.5">
                          <Label htmlFor="signup-password">Password</Label>
                          <Input id="signup-password" type="password" placeholder="6+ characters" value={signUpPassword} onChange={(e) => setSignUpPassword(e.target.value)} disabled={uiLoading} autoComplete="new-password" />
                      </div>
                      <Button className="w-full" type="submit" disabled={uiLoading}>
                          {uiLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Create Account"}
                      </Button>
                  </form>
              </TabsContent>

              <TabsContent value="guest" className="pt-4">
                 <div className="text-center text-sm text-muted-foreground mb-4">
                    <p>Continue without creating an account. Your data is still saved, but there's no way to recover access if you lose this session.</p>
                 </div>
                 <Button className="w-full" onClick={handleAnonymousSignIn} disabled={uiLoading}>
                    {uiLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Continue as Guest"}
                 </Button>
              </TabsContent>
           </Tabs>
        </CardContent>
      </Card>

      <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
        <DialogContent className="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>Reset Password</DialogTitle>
                <DialogDescription>
                    Enter your email address and we'll send you a link to reset your password.
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="space-y-1.5">
                    <Label htmlFor="reset-email">Email Address</Label>
                    <Input id="reset-email" type="email" placeholder="name@example.com" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} disabled={isResetLoading} onKeyDown={(e) => e.key === 'Enter' && handlePasswordReset()} />
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsResetDialogOpen(false)} disabled={isResetLoading}>Cancel</Button>
                <Button onClick={handlePasswordReset} disabled={isResetLoading}>
                    {isResetLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Send Reset Link"}
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
