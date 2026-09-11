
'use client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlusCircle, Trash2, Wallet, CalendarCheck, ListChecks, GlassWater, Settings } from 'lucide-react';
import { P_HABITS } from '@/lib/placeholder-data';
import type { PlannerItem, TodoItem, Habit, Transaction } from '@/types';
import { useState, useEffect } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { format, isSameDay, parseISO, startOfMonth, parse } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/use-auth';
import { apiFetch } from '@/lib/api-client';

// --- Backend data shapes (mirrors the mapper/replace-all conventions already
// established in the migrated src/app/{habits,expenses,planner}/page.tsx) ---

// Habit as returned by the backend (Mongo `_id` instead of a client-generated `id`).
type ApiHabit = {
  _id: string;
  name: string;
  icon: string;
  target?: number;
  completions: Record<string, boolean | number>;
};

const mapApiHabit = (h: ApiHabit): Habit => ({
  id: h._id,
  name: h.name,
  icon: h.icon,
  target: h.target,
  completions: h.completions || {},
});

// Strips the client-side `id` before sending to the backend: `PATCH /habits`
// replaces the user's entire habit list on every call and its DTO doesn't
// accept an `id`/`_id` field.
const stripHabitForApi = (h: Habit) => ({
  name: h.name,
  icon: h.icon,
  ...(h.target !== undefined ? { target: h.target } : {}),
  completions: h.completions,
});

interface ApiTransaction {
  _id: string;
  date: string;
  description: string;
  category: string;
  amountCents: number;
  type: 'income' | 'expense';
}
interface ApiBudget {
  _id: string;
  amountCents: number;
}

// Amounts are stored server-side as integer cents; Transaction.amount is also
// a plain cent count, so the two line up without extra scaling.
function apiToTransaction(t: ApiTransaction): Transaction {
  return { id: t._id, date: t.date, description: t.description, category: t.category, amount: t.amountCents, type: t.type };
}

// Task as returned by the backend (`GET/POST/PATCH/DELETE /api/tasks` — normal
// per-item CRUD, unlike habits/planner which replace the whole document).
type ApiTask = {
  _id: string;
  text: string;
  completed: boolean;
  priority?: 'high' | 'medium' | 'low';
};

const mapApiTask = (t: ApiTask): TodoItem => ({
  id: t._id,
  text: t.text,
  completed: t.completed,
  priority: t.priority,
});

function WaterIntakeWidget({ now }: { now: Date }) {
  const { user } = useAuth();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  const waterHabit = habits.find(h => h.icon === 'GlassWater');
  const [newTargetInput, setNewTargetInput] = useState(String(waterHabit?.target || 8));

  useEffect(() => {
    if (waterHabit) setNewTargetInput(String(waterHabit.target || 8));
  }, [waterHabit]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    apiFetch<ApiHabit[]>('/habits').then(async (docs) => {
        if (cancelled) return;
        if (docs.length === 0) {
            // Mirrors the seeding behavior already established in habits/page.tsx:
            // the Gym Tracker depends on the default (water/protein/pill/dumbbell)
            // habits existing, so a brand-new user's empty list is seeded once.
            const seeded = await apiFetch<ApiHabit[]>('/habits', {
                method: 'PATCH',
                body: JSON.stringify(P_HABITS.map(stripHabitForApi)),
            });
            if (!cancelled) setHabits(seeded.map(mapApiHabit));
        } else {
            setHabits(docs.map(mapApiHabit));
        }
    }).catch((err) => {
        console.error('Failed to load habits:', err);
    });
    return () => { cancelled = true; };
  }, [user]);

  const handleHabitsUpdate = async (updatedHabits: Habit[]) => {
      if (!user) return;
      const previous = habits;
      setHabits(updatedHabits);
      try {
          const saved = await apiFetch<ApiHabit[]>('/habits', {
              method: 'PATCH',
              body: JSON.stringify(updatedHabits.map(stripHabitForApi)),
          });
          setHabits(saved.map(mapApiHabit));
      } catch (err) {
          setHabits(previous);
          console.error('Failed to save habits:', err);
      }
  }

  const ML_PER_GLASS = 250;
  const TARGET_GLASSES = waterHabit?.target || 8;
  const WATER_TARGET_ML = TARGET_GLASSES * ML_PER_GLASS;

  const handleIntakeChange = () => {
    if (!waterHabit) return;
    const todayKey = format(now, 'yyyy-MM-dd');
    const updatedHabits = habits.map(h => {
      if (h.id === waterHabit.id) {
        const newCompletions = { ...h.completions };
        const currentCount = typeof newCompletions[todayKey] === 'number' ? (newCompletions[todayKey] as number) : 0;
        newCompletions[todayKey] = currentCount + 1;
        return { ...h, completions: newCompletions };
      }
      return h;
    });
    handleHabitsUpdate(updatedHabits);
  };
  
  const handleTargetSave = () => {
    if (!waterHabit) return;
    const newTarget = parseInt(newTargetInput, 10);
    if (!isNaN(newTarget) && newTarget > 0) {
        const updatedHabits = habits.map(h => h.id === waterHabit.id ? { ...h, target: newTarget } : h);
        handleHabitsUpdate(updatedHabits);
        setIsSettingsOpen(false);
    }
  };

  if (!waterHabit) return null;

  const todayKey = format(now, 'yyyy-MM-dd');
  const glassesToday = typeof waterHabit.completions[todayKey] === 'number' ? (waterHabit.completions[todayKey] as number) : 0;
  const mlToday = glassesToday * ML_PER_GLASS;
  
  return (
    <div className="w-full border rounded-xl shadow-sm flex items-center justify-between p-3 bg-card">
        <div className="flex items-center gap-3">
            <Button onClick={handleIntakeChange} variant="outline" size="icon" className="h-12 w-12 flex-shrink-0 rounded-lg">
                <GlassWater className="h-6 w-6 text-primary/70" />
            </Button>
            <div>
                <h3 className="font-headline text-sm font-semibold">Water Intake</h3>
                <p className="text-xl font-bold">{mlToday}ml <span className="text-base font-normal text-muted-foreground">/ {WATER_TARGET_ML}ml</span></p>
            </div>
        </div>
        <div className="flex items-center gap-1">
            <p className="text-sm text-muted-foreground"> {glassesToday} of {TARGET_GLASSES} glasses </p>
             <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
                <DialogTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><Settings className="h-4 w-4" /></Button></DialogTrigger>
                <DialogContent className="p-4 w-[270px] h-[210px] flex flex-col justify-between rounded-xl">
                    <DialogHeader>
                        <DialogTitle>Set Water Intake Goal</DialogTitle>
                        <DialogDescription> 1 glass is 250ml. Aim for 8+ glasses daily. </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                         <Label htmlFor="water-target">Daily Glasses Target</Label>
                         <Input id="water-target" type="number" value={newTargetInput} onChange={(e) => setNewTargetInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleTargetSave()} />
                    </div>
                    <DialogFooter><Button onClick={handleTargetSave}>Save Goal</Button></DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    </div>
  );
}

function TodaysPlan({ now }: { now: Date }) {
  const { user } = useAuth();
  const [routineItems, setRoutineItems] = useState<PlannerItem[]>([]);
  const [displayedItems, setDisplayedItems] = useState<PlannerItem[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(1);
  
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    apiFetch<{ days: Record<string, PlannerItem[]> }>('/planner').then((data) => {
      if (cancelled) return;
      const dayName = format(now, 'EEEE');
      setRoutineItems((data.days || {})[dayName] || []);
    }).catch((err) => {
      console.error('Failed to load schedule:', err);
    });
    return () => { cancelled = true; };
  }, [user, now]);

  useEffect(() => {
    if (routineItems.length === 0) {
      setDisplayedItems([]);
      return;
    }
    // ... rest of the logic for calculating displayedItems ...
    const calculateDisplayedItems = () => {
      if (routineItems.length <= 3) {
        setDisplayedItems(routineItems);
        const currentIndex = routineItems.findLastIndex(item => {
            try { return parse(item.startTime, 'HH:mm', new Date()) <= now; } catch { return false; }
        });
        setHighlightedIndex(currentIndex);
        return;
      }

      let currentIndex = routineItems.findIndex(item => {
        try { return parse(item.startTime, 'HH:mm', new Date()) > now; } catch { return false; }
      });
      if (currentIndex === -1) currentIndex = routineItems.length - 1;

      let itemsToShow: PlannerItem[];
      if (currentIndex === 0) {
        itemsToShow = routineItems.slice(0, 3); setHighlightedIndex(0);
      } else if (currentIndex === routineItems.length - 1) {
        itemsToShow = routineItems.slice(routineItems.length - 3); setHighlightedIndex(2);
      } else {
        itemsToShow = routineItems.slice(currentIndex - 1, currentIndex + 2); setHighlightedIndex(1);
      }
      setDisplayedItems(itemsToShow);
    };
    calculateDisplayedItems();
  }, [routineItems, now]);

  return (
    <Card>
      <CardHeader className="py-4 sm:py-4">
        <CardTitle className="font-headline flex items-center gap-3 text-lg"><CalendarCheck className="h-6 w-6 text-primary" /><span>Today's Plan</span></CardTitle>
      </CardHeader>
      <CardContent className="pt-0 sm:pt-0">
        {displayedItems.length > 0 ? (
          <ul className="space-y-3">
            {displayedItems.map((item, index) => (
              <li key={item.id} className={cn('p-3 rounded-lg transition-all duration-500 ease-in-out', index === highlightedIndex ? 'bg-primary/10 transform scale-105 shadow-lg' : 'bg-muted opacity-60 scale-95')}>
                <p><span className={cn('font-bold', index === highlightedIndex ? "text-primary" : "")}>{item.startTime}:</span><span className="font-semibold ml-2 text-card-foreground">{item.title}</span></p>
                {item.tag && <p className="text-sm text-muted-foreground ml-2">{item.tag}</p>}
              </li>
            ))}
          </ul>
        ) : ( <div className="text-center py-8 text-muted-foreground"><p>No routine items for today.</p><p className="text-xs">Add items in the Daily Planner.</p></div> )}
      </CardContent>
       <CardFooter className="pt-0 sm:pt-0">
         <Dialog>
            <DialogTrigger asChild><Button variant="outline" className="w-full">View Full Planner</Button></DialogTrigger>
            <DialogContent className="w-[95vw] max-w-sm rounded-xl p-0">
                <DialogHeader className="p-4 pb-2"><DialogTitle>Full Plan for {format(now, 'EEEE')}</DialogTitle><DialogDescription>Here is your complete schedule for today.</DialogDescription></DialogHeader>
                <ScrollArea className="max-h-[60vh]">
                    <div className="space-y-3 p-4">
                    {routineItems.length > 0 ? (routineItems.map((item) => (
                        <div key={item.id} className="p-3 rounded-lg bg-muted">
                            <p><span className="font-bold text-primary">{item.startTime}:</span><span className="font-semibold ml-2 text-card-foreground">{item.title}</span></p>
                            {item.tag && <p className="text-sm text-muted-foreground ml-2">{item.tag}</p>}
                        </div>
                    ))) : ( <div className="text-center py-8 text-muted-foreground"><p>No routine items for today.</p></div> )}
                    </div>
                </ScrollArea>
            </DialogContent>
         </Dialog>
       </CardFooter>
    </Card>
  );
}

function FinancialSnapshot({ now }: { now: Date }) {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [monthlyBudget, setMonthlyBudget] = useState(5000000);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all([
        apiFetch<ApiTransaction[]>('/expenses/transactions'),
        apiFetch<ApiBudget>('/expenses/budget'),
    ]).then(([txnDocs, budgetDoc]) => {
        if (cancelled) return;
        setTransactions(txnDocs.map(apiToTransaction));
        setMonthlyBudget(budgetDoc.amountCents);
    }).catch((err) => {
        console.error('Failed to load financial snapshot:', err);
    });
    return () => { cancelled = true; };
  }, [user]);

  const todaysExpenses = transactions.filter(t => t.type === 'expense' && isSameDay(parseISO(t.date), now)).reduce((sum, t) => sum + t.amount, 0);
  const totalIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const totalExpenses = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const netBalance = totalIncome - totalExpenses;
  const startOfCurrentMonth = startOfMonth(now);
  const monthlyExpenses = transactions.filter(t => t.type === 'expense' && parseISO(t.date) >= startOfCurrentMonth).reduce((sum, t) => sum + t.amount, 0);
  const budgetUsagePercent = monthlyBudget > 0 ? (monthlyExpenses / monthlyBudget) * 100 : 0;

  return (
    <Card>
      <CardHeader className="py-4 sm:py-4"><CardTitle className="font-headline flex items-center gap-3 text-lg"><Wallet className="h-6 w-6 text-primary" /><span>Financial Snapshot</span></CardTitle></CardHeader>
      <CardContent className="space-y-4 pt-0 sm:pt-0">
        <div className="flex justify-between items-center"><span className="text-muted-foreground">Today's Expenses</span><span className="font-semibold text-lg">{(todaysExpenses / 100).toFixed(2)}</span></div>
        <div className="flex justify-between items-center"><span className="text-muted-foreground">Net Balance</span><span className="font-bold text-2xl">{(netBalance / 100).toFixed(2)}</span></div>
        <div>
          <div className="flex justify-between text-sm text-muted-foreground mb-1"><span>Monthly Budget</span><span>{(monthlyExpenses / 100).toFixed(2)} / {(monthlyBudget / 100).toFixed(2)}</span></div>
          <Progress value={budgetUsagePercent} />
        </div>
      </CardContent>
    </Card>
  );
}

function TodoList() {
    const { user } = useAuth();
    const [todos, setTodos] = useState<TodoItem[]>([]);
    const [isAddTodoDialogOpen, setIsAddTodoDialogOpen] = useState(false);
    const [newTodoText, setNewTodoText] = useState('');
    const [newTodoPriority, setNewTodoPriority] = useState<'high' | 'medium' | 'low'>('low');

    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        apiFetch<ApiTask[]>('/tasks').then((docs) => {
            if (!cancelled) setTodos(docs.map(mapApiTask));
        }).catch((err) => {
            console.error('Failed to load tasks:', err);
        });
        return () => { cancelled = true; };
    }, [user]);

    // Unlike habits/planner, /api/tasks is normal per-item CRUD (no replace-all),
    // and its PATCH DTO requires the full `text` field on every update.
    const toggleTodo = async (id: string) => {
        if (!user) return;
        const target = todos.find(todo => todo.id === id);
        if (!target) return;
        const previous = todos;
        setTodos(todos.map(todo => todo.id === id ? { ...todo, completed: !todo.completed } : todo));
        try {
            await apiFetch(`/tasks/${id}`, {
                method: 'PATCH',
                body: JSON.stringify({ text: target.text, completed: !target.completed, priority: target.priority }),
            });
        } catch (err) {
            setTodos(previous);
            console.error('Failed to update task:', err);
        }
    };

    const deleteTodo = async (id: string) => {
        if (!user) return;
        const previous = todos;
        setTodos(todos.filter(todo => todo.id !== id));
        try {
            await apiFetch(`/tasks/${id}`, { method: 'DELETE' });
        } catch (err) {
            setTodos(previous);
            console.error('Failed to delete task:', err);
        }
    };

    const addTodo = async () => {
        if (!user || newTodoText.trim() === '') return;
        try {
            const created = await apiFetch<ApiTask>('/tasks', {
                method: 'POST',
                body: JSON.stringify({ text: newTodoText.trim(), completed: false, priority: newTodoPriority }),
            });
            setTodos([mapApiTask(created), ...todos]);
            setNewTodoText(''); setNewTodoPriority('low'); setIsAddTodoDialogOpen(false);
        } catch (err) {
            console.error('Failed to add task:', err);
        }
    };

    const getPriorityBadgeVariant = (priority?: 'high' | 'medium' | 'low') => {
        switch (priority) { case 'high': return 'destructive'; case 'medium': return 'secondary'; default: return 'outline'; }
    }

  return (
     <Card>
      <CardHeader className="py-4 sm:py-4">
        <CardTitle className="font-headline flex items-center justify-between text-lg">
            <div className="flex items-center gap-3"><ListChecks className="h-6 w-6 text-primary" /><span>Today's To-Do List</span></div>
             <Dialog open={isAddTodoDialogOpen} onOpenChange={setIsAddTodoDialogOpen}>
                <DialogTrigger asChild><Button variant="ghost" size="icon"><PlusCircle className="h-5 w-5" /></Button></DialogTrigger>
                <DialogContent>
                    <DialogHeader><DialogTitle>Add a new task</DialogTitle><DialogDescription>What do you need to get done?</DialogDescription></DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2"><Label htmlFor="new-todo-input">Task</Label><Input id="new-todo-input" value={newTodoText} onChange={(e) => setNewTodoText(e.target.value)} placeholder="e.g., Finish Q3 report" onKeyDown={(e) => e.key === 'Enter' && addTodo()} /></div>
                        <div className="space-y-2">
                            <Label htmlFor="new-todo-priority">Priority</Label>
                            <Select value={newTodoPriority} onValueChange={(value) => setNewTodoPriority(value as 'high' | 'medium' | 'low')}>
                                <SelectTrigger id="new-todo-priority"><SelectValue placeholder="Select priority" /></SelectTrigger>
                                <SelectContent><SelectItem value="high">High</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="low">Low</SelectItem></SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter><Button onClick={addTodo}>Add Task</Button></DialogFooter>
                </DialogContent>
            </Dialog>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 sm:pt-0">
        <ul className="space-y-3">
            {todos.map(todo => (
                 <li key={todo.id} className="flex items-center space-x-3 border-b pb-3">
                    <Checkbox id={`todo-${todo.id}`} checked={todo.completed} onCheckedChange={() => toggleTodo(todo.id)} />
                    <label htmlFor={`todo-${todo.id}`} className={cn("flex-1 text-sm", todo.completed && "line-through text-muted-foreground")}>{todo.text}</label>
                    {todo.priority && ( <Badge variant={getPriorityBadgeVariant(todo.priority)} className="capitalize">{todo.priority}</Badge> )}
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteTodo(todo.id)}><Trash2 className="h-4 w-4" /></Button>
                 </li>
            ))}
        </ul>
        {todos.length === 0 && ( <div className="text-center py-8 text-muted-foreground"><p>No tasks yet. Add one to get started!</p></div> )}
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [username, setUsername] = useState<string | null>(null);
  const [greeting, setGreeting] = useState('');
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    if (!user) return;
    // `user.displayName` is already populated by useAuth() (from the backend's
    // `/users/me`, "Guest User" for a guest session) — no separate fetch needed here.
    setUsername(user.isAnonymous ? 'Guest User' : user.displayName);
  }, [user]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const hour = now.getHours();
    if (hour < 12) setGreeting('Good Morning');
    else if (hour < 18) setGreeting('Good Afternoon');
    else setGreeting('Good Evening');
  }, [now]);

  return (
    <AppLayout>
      <div className="space-y-4">
        <header>
          {username ? (
            <>
              <h1 className="text-2xl font-bold font-headline">{greeting}, {username}!</h1>
              <p className="text-muted-foreground">Here's your life at a glance.</p>
            </>
          ) : ( <> <Skeleton className="h-8 w-3/5 mb-2" /> <Skeleton className="h-5 w-4/5" /> </> )}
        </header>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-3"><WaterIntakeWidget now={now} /></div>
            <div className="lg:col-span-2"><TodaysPlan now={now} /></div>
            <div className="lg:col-span-1"><FinancialSnapshot now={now} /></div>
            <div className="lg:col-span-3"><TodoList /></div>
        </div>
      </div>
    </AppLayout>
  );
}
