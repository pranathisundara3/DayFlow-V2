
'use client';

import { useState, useEffect, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import type { Credential } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { KeySquare, Loader2, ShieldCheck, Landmark, Globe, Users, PlusSquare, Eye, EyeOff, Copy, Trash2, Edit, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';

// Shape of a credential document as returned by the backend
// (`backend/src/modules/credentials/credentials.module.ts`). The
// `encryptedData` bag holds whatever category-specific fields the UI
// collected (username/password/website, or the banking fields) — the
// backend does not encrypt it, it is just a generic string map.
interface ApiCredential {
  _id: string;
  name: string;
  category: 'Website' | 'Banking' | 'Social Media' | 'Other';
  lastUpdated: string;
  encryptedData: Record<string, string>;
}

function apiToCredential(doc: ApiCredential): Credential {
  return {
    id: doc._id,
    name: doc.name,
    category: doc.category,
    lastUpdated: doc.lastUpdated ? doc.lastUpdated.slice(0, 10) : '',
    ...doc.encryptedData,
  } as Credential;
}


function SensitiveInput({ id, fieldName, value, onToggle, onCopy, isVisible }: { id: string; fieldName: string; value: string | number; onToggle: (id: string, fieldName: string) => void; onCopy: (value: string | number, fieldName: string) => void; isVisible: boolean; }) {
  return (
    <div className="flex items-center gap-0.5">
      <Input type={isVisible ? 'text' : 'password'} value={isVisible ? String(value) : '••••••••••'} readOnly className="text-xs bg-muted/50 h-7 px-1 py-0.5" />
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => onToggle(id, fieldName)}>{isVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</Button>
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => onCopy(value, fieldName)}><Copy className="h-3.5 w-3.5" /></Button>
    </div>
  );
}

function CredentialDialog({ isOpen, onOpenChange, onSave, credential }: { isOpen: boolean; onOpenChange: (open: boolean) => void; onSave: (data: Omit<Credential, 'id' | 'lastUpdated'>, id?: string) => void; credential: Credential | null; }) {
    const [name, setName] = useState('');
    const [category, setCategory] = useState<'Website' | 'Banking' | 'Social Media' | 'Other'>('Website');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [website, setWebsite] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [ifscCode, setIfscCode] = useState('');
    const [upiPin, setUpiPin] = useState('');
    const [netbankingId, setNetbankingId] = useState('');
    const [mpin, setMpin] = useState('');
    const [netbankingPassword, setNetbankingPassword] = useState('');
    const [transactionPassword, setTransactionPassword] = useState('');

    useEffect(() => {
        if (isOpen) {
            if (credential) {
                setName(credential.name); setCategory(credential.category); setUsername(credential.username || ''); setPassword(credential.password || ''); setWebsite(credential.website || ''); setAccountNumber(String(credential.accountNumber || '')); setIfscCode(credential.ifscCode || ''); setUpiPin(String(credential.upiPin || '')); setNetbankingId(credential.netbankingId || ''); setMpin(String(credential.mpin || '')); setNetbankingPassword(credential.netbankingPassword || ''); setTransactionPassword(credential.transactionPassword || '');
            } else {
                setName(''); setCategory('Website'); setUsername(''); setPassword(''); setWebsite(''); setAccountNumber(''); setIfscCode(''); setUpiPin(''); setNetbankingId(''); setMpin(''); setNetbankingPassword(''); setTransactionPassword('');
            }
        }
    }, [credential, isOpen]);
    
    const handleSaveClick = () => {
        if (!name) return;
        const credData: Omit<Credential, 'id' | 'lastUpdated'> = { name, category, ...(category === 'Banking' ? { accountNumber, ifscCode, upiPin, netbankingId, mpin, netbankingPassword, transactionPassword } : { username, password, website }) };
        onSave(credData, credential?.id);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px] p-3">
                <DialogHeader className="p-2 pb-0"><DialogTitle>{credential ? 'Edit Credential' : 'Add New Credential'}</DialogTitle><DialogDescription>{credential ? `Updating details for ${credential.name}.` : 'Fill in the details for the new credential.'}</DialogDescription></DialogHeader>
                <div className="space-y-2 py-1 px-2">
                     <div className="grid grid-cols-2 gap-1">
                        <div><Label htmlFor="newAccountName" className="text-xs">Account Name</Label><Input id="newAccountName" value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Netflix" className="h-8" /></div>
                        <div>
                            <Label htmlFor="newAccountCategory" className="text-xs">Category</Label>
                            <Select value={category} onValueChange={(v) => setCategory(v as any)}>
                                <SelectTrigger id="newAccountCategory" className="h-8"><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="Website">Website</SelectItem><SelectItem value="Banking">Banking</SelectItem><SelectItem value="Social Media">Social Media</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent>
                            </Select>
                        </div>
                    </div>
                    {category === 'Banking' ? (
                        <div className="border-t pt-2 mt-2 space-y-1">
                            <h3 className="text-sm font-semibold flex items-center gap-2"><Landmark className="h-4 w-4 text-primary" /> Banking Details</h3>
                             <ScrollArea className="h-56 rounded-md border p-2">
                                <div className="space-y-2 pr-2">
                                    <div><Label htmlFor="accNum" className="text-xs">Account Number</Label><Input id="accNum" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} className="h-8" /></div>
                                    <div><Label htmlFor="ifsc" className="text-xs">IFSC Code</Label><Input id="ifsc" value={ifscCode} onChange={e => setIfscCode(e.target.value)} className="h-8" /></div>
                                    <div><Label htmlFor="upi" className="text-xs">UPI PIN</Label><Input type="password" id="upi" value={upiPin} onChange={e => setUpiPin(e.target.value)} className="h-8" /></div>
                                    <div><Label htmlFor="nbid" className="text-xs">Netbanking ID</Label><Input id="nbid" value={netbankingId} onChange={e => setNetbankingId(e.target.value)} className="h-8" /></div>
                                    <div><Label htmlFor="mpin" className="text-xs">MPIN</Label><Input type="password" id="mpin" value={mpin} onChange={e => setMpin(e.target.value)} className="h-8" /></div>
                                    <div><Label htmlFor="nbpass" className="text-xs">Netbanking Password</Label><Input type="password" id="nbpass" value={netbankingPassword} onChange={e => setNetbankingPassword(e.target.value)} className="h-8" /></div>
                                    <div><Label htmlFor="txpass" className="text-xs">Transaction Password</Label><Input type="password" id="txpass" value={transactionPassword} onChange={e => setTransactionPassword(e.target.value)} className="h-8" /></div>
                                </div>
                            </ScrollArea>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <div><Label htmlFor="username" className="text-xs">Username / Email</Label><Input id="username" value={username} onChange={e => setUsername(e.target.value)} className="h-8" /></div>
                            <div><Label htmlFor="password" className="text-xs">Password</Label><Input type="password" id="password" value={password} onChange={e => setPassword(e.target.value)} className="h-8" /></div>
                            {category === 'Website' && <div><Label htmlFor="website" className="text-xs">Website URL</Label><Input id="website" value={website} onChange={e => setWebsite(e.target.value)} className="h-8" /></div>}
                        </div>
                    )}
                </div>
                <DialogFooter className="p-2 pt-0"><Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button><Button size="sm" onClick={handleSaveClick}><Save className="mr-1 h-3.5 w-3.5" /> Save</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export default function PasswordManagerPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCredential, setEditingCredential] = useState<Credential | null>(null);
  const [visibilities, setVisibilities] = useState<Record<string, Record<string, boolean>>>({});
  const [expandedCardIds, setExpandedCardIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setIsLoading(true);
    apiFetch<ApiCredential[]>('/credentials')
      .then((docs) => {
        if (cancelled) return;
        setCredentials(docs.map(apiToCredential));
      })
      .catch((err) => {
        if (cancelled) return;
        toast({ variant: 'destructive', title: 'Error', description: err instanceof ApiError ? err.message : 'Failed to load credentials.' });
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [user, toast]);

  const handleSaveCredential = async (data: Omit<Credential, 'id' | 'lastUpdated'>, id?: string) => {
    const { name, category, ...fields } = data;
    const encryptedData: Record<string, string> = {};
    Object.entries(fields).forEach(([key, value]) => {
      if (value !== undefined) encryptedData[key] = String(value);
    });
    const lastUpdated = new Date().toISOString().split('T')[0];
    try {
      if (id) {
        const updated = await apiFetch<ApiCredential>(`/credentials/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name, category, lastUpdated, encryptedData }),
        });
        setCredentials(prev => prev.map(c => c.id === id ? apiToCredential(updated) : c));
      } else {
        const created = await apiFetch<ApiCredential>('/credentials', {
          method: 'POST',
          body: JSON.stringify({ name, category, lastUpdated, encryptedData }),
        });
        setCredentials(prev => [apiToCredential(created), ...prev]);
      }
      setIsFormOpen(false);
      setEditingCredential(null);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err instanceof ApiError ? err.message : 'Failed to save credential.' });
    }
  };

  const handleDeleteCredential = async (id: string) => {
    const previous = credentials;
    setCredentials(prev => prev.filter(c => c.id !== id));
    try {
      await apiFetch(`/credentials/${id}`, { method: 'DELETE' });
    } catch (err) {
      setCredentials(previous);
      toast({ variant: 'destructive', title: 'Error', description: err instanceof ApiError ? err.message : 'Failed to delete credential.' });
    }
  };

  const handleToggleVisibility = (id: string, fieldName: string) => {
    setVisibilities(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [fieldName]: !prev[id]?.[fieldName] } }));
  };

  const toggleCardExpansion = (id: string) => {
    setExpandedCardIds(prev => { const newSet = new Set(prev); newSet.has(id) ? newSet.delete(id) : newSet.add(id); return newSet; });
  };

  const handleCopy = (text: string | number, fieldName: string) => {
    if (text === undefined || text === null || String(text).trim() === '') return;
    navigator.clipboard.writeText(String(text));
  };

  const groupedCredentials = useMemo(() => {
    return credentials.reduce((acc, cred) => {
      if (cred && cred.category) (acc[cred.category] = acc[cred.category] || []).push(cred);
      return acc;
    }, {} as Record<string, Credential[]>);
  }, [credentials]);

  const categoryIcons: Record<string, React.ElementType> = { 'Banking': Landmark, 'Website': Globe, 'Social Media': Users, 'Other': KeySquare };
  
  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading Vault...</p></div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-1.5">
        <header className="flex items-center justify-between">
            <div><h1 className="text-xl font-bold font-headline">Password Vault</h1></div>
            <Button size="sm" onClick={() => { setEditingCredential(null); setIsFormOpen(true); }}><PlusSquare className="mr-1 h-3.5 w-3.5" /> Add Credential</Button>
        </header>

        <div className="space-y-2">
            {Object.entries(groupedCredentials).map(([cat, items]) => {
                if (items.length === 0) return null;
                const Icon = categoryIcons[cat] || KeySquare;
                return (
                    <section key={cat}>
                        <h2 className="text-lg font-bold font-headline flex items-center gap-2 mb-1 pb-0.5 border-b"><Icon className="h-5 w-5 text-primary" /> {cat}</h2>
                        <ScrollArea className="w-full">
                            <div className="flex space-x-1 pb-1">
                                {items.map(cred => {
                                    const isExpanded = expandedCardIds.has(cred.id);
                                    return (
                                        <Card key={cred.id} className="w-[260px] flex-shrink-0 flex flex-col">
                                            <CardHeader className="p-1.5 sm:p-2">
                                                <CardTitle className="truncate text-sm">{cred.name}</CardTitle>
                                                <CardDescription className="text-xs">{isExpanded ? `Last updated: ${cred.lastUpdated}` : cred.category === 'Banking' ? `Account No: ${cred.accountNumber ? `••••${String(cred.accountNumber).slice(-4)}` : 'N/A'}` : `Username: ${cred.username || 'N/A'}`}</CardDescription>
                                            </CardHeader>
                                            {isExpanded && (
                                                <CardContent className="space-y-1 flex-grow p-1.5 pt-0 sm:p-2 sm:pt-0">
                                                  {cred.category === 'Banking' ? ( <> {cred.accountNumber && <p className="text-xs"><strong>Acc No:</strong> {cred.accountNumber}</p>} {cred.ifscCode && <p className="text-xs"><strong>IFSC:</strong> {cred.ifscCode}</p>} {cred.netbankingId && <p className="text-xs"><strong>Netbanking ID:</strong> {cred.netbankingId}</p>} {cred.upiPin && <div><strong className="text-xs">UPI PIN:</strong><SensitiveInput id={cred.id} fieldName="upiPin" value={cred.upiPin} isVisible={!!visibilities[cred.id]?.upiPin} onToggle={handleToggleVisibility} onCopy={handleCopy} /></div>} {cred.mpin && <div><strong className="text-xs">MPIN:</strong><SensitiveInput id={cred.id} fieldName="mpin" value={cred.mpin} isVisible={!!visibilities[cred.id]?.mpin} onToggle={handleToggleVisibility} onCopy={handleCopy} /></div>} {cred.netbankingPassword && <div><strong className="text-xs">NB Pass:</strong><SensitiveInput id={cred.id} fieldName="netbankingPassword" value={cred.netbankingPassword} isVisible={!!visibilities[cred.id]?.netbankingPassword} onToggle={handleToggleVisibility} onCopy={handleCopy} /></div>} {cred.transactionPassword && <div><strong className="text-xs">Txn Pass:</strong><SensitiveInput id={cred.id} fieldName="transactionPassword" value={cred.transactionPassword} isVisible={!!visibilities[cred.id]?.transactionPassword} onToggle={handleToggleVisibility} onCopy={handleCopy} /></div>} </>
                                                  ) : ( <> {cred.username && <p className="text-xs"><strong>Username:</strong> {cred.username}</p>} {cred.website && <p className="text-xs"><strong>Website:</strong> <a href={cred.website} target="_blank" rel="noreferrer" className="text-primary hover:underline truncate block">{cred.website}</a></p>} {cred.password && <div><strong className="text-xs">Password:</strong><SensitiveInput id={cred.id} fieldName="password" value={cred.password} isVisible={!!visibilities[cred.id]?.password} onToggle={handleToggleVisibility} onCopy={handleCopy} /></div>} </>)}
                                                </CardContent>
                                            )}
                                            <CardFooter className="justify-end gap-0.5 p-1.5 pt-0 sm:p-2 sm:pt-0 mt-auto">
                                                {isExpanded && ( <> <Button variant="outline" size="sm" className="h-6 px-1.5" onClick={() => { setEditingCredential(cred); setIsFormOpen(true); }}><Edit className="mr-1 h-3 w-3" /> Edit</Button> <Button variant="destructive" size="sm" className="h-6 px-1.5" onClick={() => handleDeleteCredential(cred.id)}><Trash2 className="mr-1 h-3 w-3" /> Delete</Button> </> )}
                                                <Button variant="secondary" size="sm" className="h-6 px-1.5" onClick={() => toggleCardExpansion(cred.id)}>{isExpanded ? <EyeOff className="mr-1 h-3 w-3" /> : <Eye className="mr-1 h-3 w-3" />}{isExpanded ? 'Hide' : 'View'}</Button>
                                            </CardFooter>
                                        </Card>
                                    )
                                })}
                            </div>
                            <ScrollBar orientation="horizontal" />
                        </ScrollArea>
                    </section>
                )
            })}
        </div>
        <CredentialDialog isOpen={isFormOpen} onOpenChange={setIsFormOpen} onSave={handleSaveCredential} credential={editingCredential} />
      </div>
    </AppLayout>
  );
}
