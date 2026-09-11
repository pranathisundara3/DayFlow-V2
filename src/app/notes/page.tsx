
'use client';

import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import type { Note } from '@/types';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlusCircle, Search, LayoutGrid, List, Trash2, X, Save, Edit, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { format, parseISO } from 'date-fns';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/use-auth';
import { apiFetch } from '@/lib/api-client';

type Layout = 'grid' | 'list';

// Shape returned by the backend `/notes` endpoints (Mongo document with `_id`).
type NoteApiResponse = {
  _id: string;
  title: string;
  content: string | { text: string; completed: boolean }[];
  type: 'text' | 'checklist';
  createdAt: string;
};

function toNote(doc: NoteApiResponse): Note {
  return { id: doc._id, title: doc.title, content: doc.content, type: doc.type, createdAt: doc.createdAt };
}

function ViewNoteDialog({ note, isOpen, onOpenChange }: { note: Note | null, isOpen: boolean, onOpenChange: (open: boolean) => void }) {
    if (!note) return null;
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader><DialogTitle className="text-2xl font-headline">{note.title}</DialogTitle></DialogHeader>
                <ScrollArea className="max-h-[70vh] pr-6">
                    <div className="py-4 text-base leading-relaxed">
                        {note.type === 'text' && ( <p className="whitespace-pre-wrap">{String(note.content)}</p> )}
                        {note.type === 'checklist' && Array.isArray(note.content) && (
                            <ul className="space-y-3">
                                {note.content.map((item, index) => (
                                    <li key={index} className="flex items-start gap-3">
                                        <Checkbox checked={item.completed} disabled className="mt-1" />
                                        <span className={cn("flex-1", item.completed && 'line-through text-muted-foreground')}>{item.text}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    )
}

function NewNoteCard({ onSave, onCancel }: { onSave: (note: Omit<Note, 'id' | 'createdAt'>) => void; onCancel: () => void; }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'text' | 'checklist'>('text');
  const [textContent, setTextContent] = useState('');
  const [checklistItems, setChecklistItems] = useState<{ text: string; completed: boolean }[]>([{ text: '', completed: false }]);

  const handleAddItem = () => setChecklistItems([...checklistItems, { text: '', completed: false }]);
  const handleItemChange = (index: number, newText: string) => {
    const newItems = [...checklistItems]; newItems[index].text = newText; setChecklistItems(newItems);
  };
  const handleRemoveItem = (index: number) => {
    if (checklistItems.length > 1) setChecklistItems(checklistItems.filter((_, i) => i !== index));
  };
  const handleSaveClick = () => {
    if (!title.trim()) return;
    const content = type === 'text' ? textContent : checklistItems.filter(item => item.text.trim() !== '');
    if ((type === 'text' && (content as string).trim() === '') || (type === 'checklist' && (content as any[]).length === 0)) return;
    onSave({ title, content, type });
  };

  return (
    <Card className="flex flex-col h-full border-primary border-2 shadow-lg">
      <CardHeader>
        <div className="flex justify-between items-center gap-2">
            <Input placeholder="Note Title..." value={title} onChange={(e) => setTitle(e.target.value)} className="text-lg font-headline font-bold border-0 shadow-none focus-visible:ring-0 p-0 h-auto" />
            <Button variant="ghost" size="icon" onClick={onCancel} className="h-8 w-8"><X className="h-4 w-4" /></Button>
        </div>
        <Select value={type} onValueChange={(v) => setType(v as 'text' | 'checklist')}>
            <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue placeholder="Note Type" /></SelectTrigger>
            <SelectContent><SelectItem value="text">Text Note</SelectItem><SelectItem value="checklist">Checklist</SelectItem></SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="flex-grow flex flex-col">
        {type === 'text' ? (
          <Textarea placeholder="Type your note here..." className="flex-grow resize-none border-0 focus-visible:ring-0 p-0" value={textContent} onChange={(e) => setTextContent(e.target.value)} />
        ) : (
          <ScrollArea className="flex-grow h-48 pr-4">
            <div className="space-y-2">
              {checklistItems.map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Checkbox disabled />
                  <Input value={item.text} onChange={(e) => handleItemChange(index, e.target.value)} placeholder={`List item ${index + 1}`} className="h-8"/>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive flex-shrink-0" onClick={() => handleRemoveItem(index)} disabled={checklistItems.length <= 1}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={handleAddItem} className="mt-2"><PlusCircle className="mr-2 h-4 w-4" /> Add Item</Button>
            </div>
          </ScrollArea>
        )}
      </CardContent>
      <CardFooter><Button onClick={handleSaveClick} className="w-full"><Save className="mr-2 h-4 w-4"/>Save Note</Button></CardFooter>
    </Card>
  );
}

function EditNoteCard({ note, onSave, onCancel, onDelete }: { note: Note; onSave: (note: Note) => void; onCancel: () => void; onDelete: (noteId: string) => void; }) {
  const [title, setTitle] = useState(note.title);
  const [textContent, setTextContent] = useState(typeof note.content === 'string' ? note.content : '');
  const [checklistItems, setChecklistItems] = useState(Array.isArray(note.content) ? [...note.content] : [{ text: '', completed: false }]);

  const handleAddItem = () => setChecklistItems([...checklistItems, { text: '', completed: false }]);
  const handleItemTextChange = (index: number, newText: string) => { const newItems = [...checklistItems]; newItems[index].text = newText; setChecklistItems(newItems); };
  const handleItemCompletionChange = (index: number, isChecked: boolean) => { const newItems = [...checklistItems]; newItems[index].completed = isChecked; setChecklistItems(newItems); };
  const handleRemoveItem = (index: number) => { if (checklistItems.length > 1) setChecklistItems(checklistItems.filter((_, i) => i !== index)); };
  const handleSaveClick = () => {
    if (!title.trim()) return;
    const content = note.type === 'text' ? textContent : checklistItems.filter(item => item.text.trim() !== '');
    if ((note.type === 'text' && (content as string).trim() === '') || (note.type === 'checklist' && (content as any[]).length === 0)) return;
    const updatedNote: Note = { ...note, title, content, type: note.type, };
    onSave(updatedNote);
  };

  return (
    <Card className="flex flex-col h-full border-primary border-2 shadow-lg">
      <CardHeader>
        <div className="flex justify-between items-center gap-2"><Input placeholder="Note Title..." value={title} onChange={(e) => setTitle(e.target.value)} className="text-lg font-headline font-bold border-0 shadow-none focus-visible:ring-0 p-0 h-auto" /></div>
        <Badge variant="outline" className="capitalize w-fit">{note.type}</Badge>
      </CardHeader>
      <CardContent className="flex-grow flex flex-col min-h-0">
        {note.type === 'text' ? (
           <ScrollArea className="flex-grow pr-4"><Textarea placeholder="Type your note here..." className="flex-grow resize-none w-full min-h-[200px] rounded-md border border-input bg-transparent px-3 py-2 text-base md:text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" value={textContent} onChange={(e) => setTextContent(e.target.value)} /></ScrollArea>
        ) : (
          <ScrollArea className="flex-grow h-48 pr-4">
            <div className="space-y-2">
              {checklistItems.map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Checkbox checked={item.completed} onCheckedChange={(checked) => handleItemCompletionChange(index, !!checked)} />
                  <Input value={item.text} onChange={(e) => handleItemTextChange(index, e.target.value)} placeholder={`List item ${index + 1}`} />
                  <Button variant="ghost" size="icon" className="h-10 w-10 text-destructive flex-shrink-0" onClick={() => handleRemoveItem(index)} disabled={checklistItems.length <= 1}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={handleAddItem} className="mt-2"><PlusCircle className="mr-2 h-4 w-4" /> Add Item</Button>
            </div>
          </ScrollArea>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap items-center justify-between gap-2">
        <div><Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => onDelete(note.id)}><Trash2 className="mr-2 h-4 w-4"/> Delete</Button></div>
        <div className="flex gap-2"><Button variant="outline" onClick={onCancel}>Cancel</Button><Button onClick={handleSaveClick}><Save className="mr-2 h-4 w-4"/>Save</Button></div>
      </CardFooter>
    </Card>
  );
}

function NoteCard({ note, onEdit, onView }: { note: Note; onEdit: () => void; onView: () => void }) {
  return (
    <Card className="flex flex-col group-[.is-grid]:h-96 hover:shadow-lg transition-shadow duration-300 group-[.is-list]:flex-row group-[.is-list]:items-center group-[.is-list]:p-3">
      <div onClick={onView} className="cursor-pointer flex-grow flex flex-col min-h-0">
          <CardHeader className="group-[.is-list]:p-0">
            <CardTitle className="font-headline text-lg group-[.is-list]:text-base">{note.title}</CardTitle>
            <div className="text-xs text-muted-foreground pt-1 flex items-center gap-2 group-[.is-list]:hidden"><span>{format(parseISO(note.createdAt), 'MMM d, yyyy')}</span><Badge variant="outline" className="capitalize">{note.type}</Badge></div>
          </CardHeader>
          <CardContent className="flex-grow flex flex-col min-h-0 p-4 pt-0 group-[.is-list]:hidden">
            <ScrollArea className="flex-grow pr-4">
                {note.type === 'text' && ( <p className="text-sm text-muted-foreground whitespace-pre-wrap">{String(note.content)}</p> )}
                {note.type === 'checklist' && Array.isArray(note.content) && (
                  <ul className="space-y-2">{note.content.map((item, index) => (<li key={index} className="flex items-center gap-2"><Checkbox checked={item.completed} disabled /><span className={cn(item.completed && 'line-through text-muted-foreground')}>{item.text}</span></li>))}</ul>
                )}
            </ScrollArea>
          </CardContent>
      </div>
      <CardFooter className="pt-4 flex-shrink-0 group-[.is-list]:p-0 group-[.is-list]:ml-4">
          <Button variant="outline" size="sm" className="w-full group-[.is-list]:w-auto group-[.is-list]:size-8 group-[.is-list]:p-0" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
            <Edit className="h-4 w-4 group-[.is-grid]:mr-2" /><span className="group-[.is-list]:hidden">Edit Note</span>
          </Button>
      </CardFooter>
    </Card>
  );
}

export default function NotesPage() {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [layout, setLayout] = useState<Layout>('grid');
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [viewingNote, setViewingNote] = useState<Note | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setIsLoading(true);
    apiFetch<NoteApiResponse[]>('/notes')
      .then((fetchedNotes) => {
        if (!cancelled) setNotes(fetchedNotes.map(toNote));
      })
      .catch((err) => {
        console.error('Failed to load notes:', err);
        if (!cancelled) setNotes([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [user]);

  const handleSaveNote = async (newNoteData: Omit<Note, 'id' | 'createdAt'>) => {
    try {
      const createdNote = await apiFetch<NoteApiResponse>('/notes', {
        method: 'POST',
        body: JSON.stringify(newNoteData),
      });
      setNotes((prev) => [toNote(createdNote), ...prev]);
      setIsAddingNote(false);
    } catch (err) {
      console.error('Failed to create note:', err);
    }
  };

  const handleUpdateNote = async (updatedNote: Note) => {
    try {
      const savedNote = await apiFetch<NoteApiResponse>(`/notes/${updatedNote.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: updatedNote.title, content: updatedNote.content, type: updatedNote.type }),
      });
      setNotes((prev) => prev.map(n => n.id === updatedNote.id ? toNote(savedNote) : n));
      setEditingNoteId(null);
    } catch (err) {
      console.error('Failed to update note:', err);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await apiFetch(`/notes/${noteId}`, { method: 'DELETE' });
      setNotes((prev) => prev.filter(note => note.id !== noteId));
      setEditingNoteId(null);
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  };
  
  const handleCancelNewNote = () => setIsAddingNote(false);

  const filteredNotes = notes.filter(note => {
    const titleMatch = note.title.toLowerCase().includes(searchTerm.toLowerCase());
    let contentMatch = false;
    if (typeof note.content === 'string') contentMatch = note.content.toLowerCase().includes(searchTerm.toLowerCase());
    else if (Array.isArray(note.content)) contentMatch = note.content.some(item => item.text.toLowerCase().includes(searchTerm.toLowerCase()));
    return titleMatch || contentMatch;
  });
  
  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading notes...</p></div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <header>
          <div className="flex items-center justify-between">
            <div><h1 className="text-2xl font-bold font-headline">Personal Notes</h1></div>
            <Button onClick={() => { setIsAddingNote(true); setEditingNoteId(null); }} disabled={isAddingNote || !!editingNoteId}><PlusCircle className="mr-2 h-4 w-4" />New Note</Button>
          </div>
          <div className="mt-4 flex gap-2">
            <div className="relative flex-grow"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search notes..." className="pl-10" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}/></div>
            <Button variant={layout === 'grid' ? 'default' : 'outline'} size="icon" onClick={() => setLayout('grid')}><LayoutGrid className="h-4 w-4" /></Button>
            <Button variant={layout === 'list' ? 'default' : 'outline'} size="icon" onClick={() => setLayout('list')}><List className="h-4 w-4" /></Button>
          </div>
        </header>

        <div className={cn('grid group', layout === 'grid' ? 'gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 is-grid' : 'gap-4 grid-cols-1 is-list')}>
          {isAddingNote && ( <NewNoteCard onSave={handleSaveNote} onCancel={handleCancelNewNote} /> )}
          {filteredNotes.map((note) => (
            editingNoteId === note.id ? (
              <EditNoteCard key={note.id} note={note} onSave={handleUpdateNote} onCancel={() => setEditingNoteId(null)} onDelete={handleDeleteNote} />
            ) : (
              <NoteCard key={note.id} note={note} onView={() => { if (isAddingNote || editingNoteId) return; setViewingNote(note) }} onEdit={() => { if (isAddingNote) setIsAddingNote(false); setEditingNoteId(note.id); }} />
            )
          ))}
        </div>
        {!isAddingNote && !editingNoteId && filteredNotes.length === 0 && (
            <div className="text-center py-16 text-muted-foreground"><p>No notes found.</p><p className="text-sm">Click "New Note" to get started.</p></div>
        )}
      </div>
      <ViewNoteDialog note={viewingNote} isOpen={!!viewingNote} onOpenChange={(open) => !open && setViewingNote(null)} />
    </AppLayout>
  );
}
