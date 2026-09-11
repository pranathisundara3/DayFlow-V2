
'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import type { Habit, Exercise, WorkoutDay, CyclicalWorkoutSplit, CycleConfig, ProteinIntake, LoggedFoodItem, CompletedWorkouts, ExerciseSession } from '@/types';
import { P_HABITS } from '@/lib/placeholder-data';
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
    PlusCircle, Flame, List, Dumbbell, CalendarDays, Edit, Beef, Apple, Settings, Trash2, Check, 
    AlertTriangle, Droplets, Plus, Minus, BookOpenCheck, Pill, Bed, Footprints, 
    Sunrise, Guitar, Code, Leaf, CheckCircle2, GlassWater, CalendarIcon, TrendingUp, BarChart2, ChevronDown
} from 'lucide-react';
import { subDays, format, isSameDay, parseISO, startOfMonth, differenceInCalendarDays } from 'date-fns';
import { calculateStreak, cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import { useAuth } from '@/hooks/use-auth';
import { apiFetch } from '@/lib/api-client';


const iconMap: Record<string, React.ElementType> = {
    PlusCircle, Flame, List, Dumbbell, CalendarDays, Edit, Beef, Apple, Settings, Trash2, Check, 
    AlertTriangle, Droplets, Plus, Minus, BookOpenCheck, Pill, Bed, Footprints, 
    Sunrise, Guitar, Code, Leaf, CheckCircle2, GlassWater, TrendingUp
};

// --- Augment initial data with IDs and overload properties ---
const augmentWorkoutSplit = (split: CyclicalWorkoutSplit): CyclicalWorkoutSplit => {
    if (!split) return {};
    const newSplit: CyclicalWorkoutSplit = {};
    Object.entries(split).forEach(([dayKey, dayData]) => {
        newSplit[dayKey] = {
            ...dayData,
            exercises: dayData.exercises.map(ex => ({
                id: ex.id || crypto.randomUUID(),
                name: ex.name,
                sets: ex.sets,
                kValue: ex.kValue ?? 0.5,
                baselineWeight: ex.baselineWeight ?? 0,
                baselineReps: ex.baselineReps ?? 0,
                targetWeight: ex.targetWeight ?? 0,
                targetReps: ex.targetReps ?? 0,
                sessionHistory: ex.sessionHistory || [],
            }))
        };
    });
    return newSplit;
};

// --- Initial Data for Gym Tracker ---
const initialWorkoutSplitRaw: CyclicalWorkoutSplit = {
  "Day 1": { title: "Push Day (Chest, Shoulders, Triceps)", exercises: [{ id: 'ex-1', name: "Bench Press", sets: "3-4" }, { id: 'ex-2', name: "Overhead Press", sets: "3" }, { id: 'ex-3', name: "Incline Dumbbell Press", sets: "3" }, { id: 'ex-4', name: "Tricep Dips/Pushdowns", sets: "3" }, { id: 'ex-5', name: "Lateral Raises", sets: "3" }] },
  "Day 2": { title: "Pull Day (Back, Biceps)", exercises: [{ id: 'ex-6', name: "Pull-ups/Lat Pulldowns", sets: "3-4" }, { id: 'ex-7', name: "Bent-over Rows", sets: "3" }, { id: 'ex-8', name: "Seated Cable Rows", sets: "3" }, { id: 'ex-9', name: "Barbell Curls", sets: "3" }, { id: 'ex-10', name: "Face Pulls", sets: "3" }] },
  "Day 3": { title: "Leg Day (Quads, Hamstrings, Calves)", exercises: [{ id: 'ex-11', name: "Squats", sets: "3-4" }, { id: 'ex-12', name: "Romanian Deadlifts", sets: "3" }, { id: 'ex-13', name: "Leg Press", sets: "3" }, { id: 'ex-14', name: "Leg Curls", sets: "3" }, { id: 'ex-15', name: "Calf Raises", sets: "3" }] },
  "Day 4": { title: "Rest Day", exercises: [] },
};
const initialWorkoutSplit = augmentWorkoutSplit(initialWorkoutSplitRaw);
const initialCustomFoodItems = ["Protein Powder", "Creatine", "Oatmeal", "Eggs", "Chicken Breast", "Greek Yogurt"];
const SPECIAL_HABIT_ICONS = ['GlassWater', 'Dumbbell', 'Beef', 'Pill'];

// --- Backend data shapes ---
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
// accept an `id`/`_id` field (extra unknown fields are rejected/erroring).
const stripHabitForApi = (h: Habit) => ({
    name: h.name,
    icon: h.icon,
    ...(h.target !== undefined ? { target: h.target } : {}),
    completions: h.completions,
});

// All non-habit data for this page (gym plan, nutrition logs, cycle config, the
// gym-tracking feature flag) is consolidated into a single `GymSettings.data`
// blob on the backend. `PATCH /habits/gym` replaces that whole blob on every
// call, so we always send the full merged object, never a partial patch.
type GymData = {
    settings: { gymTracking: boolean };
    gym_protein_intakes: ProteinIntake[];
    gym_logged_foods: LoggedFoodItem[];
    gym_protein_target: number;
    gym_custom_foods: string[];
    gym_workout_split: CyclicalWorkoutSplit;
    gym_cycle_config: CycleConfig;
};

const defaultGymData: GymData = {
    settings: { gymTracking: true },
    gym_protein_intakes: [],
    gym_logged_foods: [],
    gym_protein_target: 150,
    gym_custom_foods: initialCustomFoodItems,
    gym_workout_split: initialWorkoutSplit,
    gym_cycle_config: { startDate: format(new Date(), 'yyyy-MM-dd'), startDayKey: 'Day 1' },
};

const useWorkoutDayInfo = (cyclicalWorkoutSplit: CyclicalWorkoutSplit, cycleConfig: CycleConfig) => {
    return useCallback((date: Date) => {
        const cycleWorkoutKeys = Object.keys(cyclicalWorkoutSplit).sort((a, b) => {
            const numA = parseInt(a.split(' ')[1], 10);
            const numB = parseInt(b.split(' ')[1], 10);
            if (isNaN(numA) || isNaN(numB)) {
                return a.localeCompare(b);
            }
            return numA - numB;
        });
        const cycleLength = cycleWorkoutKeys.length;
        if (!cycleConfig.startDate || !cycleConfig.startDayKey || cycleLength === 0) {
            return { key: "N/A", title: "Cycle Not Configured", exercises: [], isRestDay: false };
        }
        
        const normalizedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const normalizedStartDate = new Date(parseISO(cycleConfig.startDate));
        
        const daysSinceStart = differenceInCalendarDays(normalizedDate, normalizedStartDate);

        if (daysSinceStart < 0) {
            return { key: "N/A", title: "Cycle Starts in Future", exercises: [], isRestDay: true };
        }

        let startIndexInCycle = cycleWorkoutKeys.indexOf(cycleConfig.startDayKey);
        if (startIndexInCycle === -1) {
             startIndexInCycle = 0;
        }
        const currentDayIndexInCycle = (startIndexInCycle + daysSinceStart) % cycleLength;
        const workoutKey = cycleWorkoutKeys[currentDayIndexInCycle];
        const workoutData = cyclicalWorkoutSplit[workoutKey] || { title: "Undefined Workout", exercises: [] };
        const isRestDay = workoutData.exercises.length === 0;

        return { key: workoutKey, ...workoutData, isRestDay };
    }, [cyclicalWorkoutSplit, cycleConfig]);
};


type GymTrackerProps = {
  proteinIntakes: ProteinIntake[];
  onProteinIntakesChange: (intakes: ProteinIntake[]) => void;
  loggedFoodItems: LoggedFoodItem[];
  onLoggedFoodItemsChange: (items: LoggedFoodItem[]) => void;
  proteinTarget: number;
  onProteinTargetChange: (target: number) => void;
  customFoodItems: string[];
  onManageCustomFoodItems: () => void;
  onManagePlan: () => void;
  onToggleWorkoutCompletion: () => void;
  isTodayCompleted: boolean;
  todaysWorkoutInfo: ReturnType<ReturnType<typeof useWorkoutDayInfo>>;
  onOpenOverloadTracker: () => void;
};


function GymTracker({ 
    proteinIntakes, onProteinIntakesChange,
    loggedFoodItems, onLoggedFoodItemsChange,
    proteinTarget, onProteinTargetChange,
    customFoodItems,
    onManageCustomFoodItems,
    onManagePlan,
    onToggleWorkoutCompletion,
    isTodayCompleted,
    todaysWorkoutInfo,
    onOpenOverloadTracker,
}: GymTrackerProps) {
    
    return (
        <div className="space-y-4">
            <header className="flex items-center justify-between -mb-2">
                <h2 className="text-base font-bold font-headline flex items-center gap-2">
                    <Dumbbell className="h-4 w-4 text-primary" />
                    <span>Gym Tracker</span>
                </h2>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onManagePlan}>
                    <Settings className="h-4 w-4" />
                </Button>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card className={cn("lg:col-span-3", isTodayCompleted && "bg-muted/50")}>
                    <CardHeader className="p-2">
                        <div className="flex items-start justify-between">
                            <CardTitle className="font-headline flex items-center gap-2 text-sm">
                                <span>{todaysWorkoutInfo.key}: {todaysWorkoutInfo.title}</span>
                            </CardTitle>
                        </div>
                         <CardDescription className="text-xs">
                            Today's Plan ({format(new Date(), 'MMM d')})
                         </CardDescription>
                    </CardHeader>
                    <CardContent className="p-2 pt-0">
                        {todaysWorkoutInfo.exercises.length > 0 ? (
                            <ul className="space-y-1.5">
                                {todaysWorkoutInfo.exercises.map((ex, i) => (
                                    <li key={ex.id || i} className="flex justify-between items-center p-1.5 rounded-md bg-muted/30 text-xs">
                                        <span className="font-medium">{ex.name}</span>
                                        <span className="text-xxs text-muted-foreground">Sets: {ex.sets}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                             <p className="text-center text-muted-foreground py-4 text-xs">{todaysWorkoutInfo.title}</p>
                        )}
                    </CardContent>
                    {!todaysWorkoutInfo.isRestDay && (
                        <CardFooter className="p-2">
                            <Button size="sm" className="w-full h-8" onClick={onToggleWorkoutCompletion} variant={isTodayCompleted ? 'secondary' : 'default'}>
                                <Check className="mr-2 h-4 w-4"/>
                                {isTodayCompleted ? 'Workout Completed!' : "Mark Today's Workout as Done"}
                            </Button>
                        </CardFooter>
                    )}
                </Card>

                <Card>
                    <CardHeader className="p-2">
                        <CardTitle className="font-headline flex items-center gap-2 text-sm">
                            <TrendingUp className="h-4 w-4 text-primary" />
                            <span>Overload Tracker</span>
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Analyze and visualize your strength progression for key exercises.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-2 pt-0">
                        <Button size="sm" className="h-8" onClick={onOpenOverloadTracker}>
                            <BarChart2 className="mr-2 h-4 w-4" />
                            Track Progress
                        </Button>
                    </CardContent>
                </Card>
                 
                <div className="lg:col-span-2 grid md:grid-cols-2 gap-4">
                    <ProteinTrackerCard 
                      intakes={proteinIntakes}
                      onIntakesChange={onProteinIntakesChange}
                      target={proteinTarget}
                      onTargetChange={onProteinTargetChange}
                    />

                    <FoodLogCard 
                      loggedItems={loggedFoodItems}
                      onLoggedItemsChange={onLoggedFoodItemsChange}
                      customItems={customFoodItems}
                      onManageItems={onManageCustomFoodItems}
                    />
                </div>
            </div>
        </div>
    )
}

function ProteinTrackerCard({ intakes, onIntakesChange, target, onTargetChange }: {
    intakes: ProteinIntake[],
    onIntakesChange: (intakes: ProteinIntake[]) => void,
    target: number,
    onTargetChange: (target: number) => void
}) {
    const [amount, setAmount] = useState('');
    const todayKey = format(new Date(), 'yyyy-MM-dd');

    const todaysIntakes = useMemo(() => {
        return intakes.filter((intake: ProteinIntake) => format(parseISO(intake.timestamp), 'yyyy-MM-dd') === todayKey);
    }, [intakes, todayKey]);

    const totalProtein = useMemo(() => todaysIntakes.reduce((sum: number, intake: ProteinIntake) => sum + intake.amount, 0), [todaysIntakes]);
    const progress = useMemo(() => (target > 0 ? Math.min(100, (totalProtein / target) * 100) : 0), [totalProtein, target]);

    const handleLogProtein = () => {
        const numAmount = parseInt(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            return;
        }
        const newIntake: ProteinIntake = { id: `p-${Date.now()}`, amount: numAmount, timestamp: new Date().toISOString() };
        onIntakesChange([...intakes, newIntake]);
        setAmount('');
    };

    const handleDelete = (id: string) => {
        onIntakesChange(intakes.filter((i: ProteinIntake) => i.id !== id));
    };

    return (
        <Card>
            <CardHeader className="p-2">
                <CardTitle className="font-headline flex items-center gap-2 text-sm"><Beef className="h-4 w-4 text-primary" /> <span>Protein Intake</span></CardTitle>
                <CardDescription className="text-xs">Today's Total: {totalProtein}g / {target}g</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 p-2 pt-0">
                 <div>
                    <Label htmlFor="proteinTarget" className="text-xs">Daily Protein Target (g)</Label>
                    <Input id="proteinTarget" type="number" value={target} onChange={e => onTargetChange(Number(e.target.value))} placeholder="e.g., 150" className="h-8 text-xs" />
                </div>
                <Progress value={progress} />
                 <div className="flex gap-2">
                    <Input type="number" placeholder="Log Protein (g)" value={amount} onChange={e => setAmount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLogProtein()} className="h-8 text-xs" />
                    <Button onClick={handleLogProtein} size="sm" className="h-8"><PlusCircle className="h-4 w-4" /></Button>
                </div>
                <div className="max-h-24 overflow-y-auto space-y-1 pr-2">
                    {todaysIntakes.length > 0 ? [...todaysIntakes].reverse().map((intake: ProteinIntake) => (
                        <div key={intake.id} className="flex justify-between items-center text-xs bg-muted p-1.5 rounded-md">
                           <span>{intake.amount}g at {format(parseISO(intake.timestamp), 'h:mm a')}</span>
                           <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDelete(intake.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                        </div>
                    )) : <p className="text-xs text-muted-foreground text-center pt-4">No protein logged today.</p>}
                </div>
            </CardContent>
        </Card>
    );
}

function FoodLogCard({ loggedItems, onLoggedItemsChange, customItems, onManageItems }: {
    loggedItems: LoggedFoodItem[],
    onLoggedItemsChange: (items: LoggedFoodItem[]) => void,
    customItems: string[],
    onManageItems: () => void
}) {
    const todayKey = format(new Date(), 'yyyy-MM-dd');

    const handleLogItem = (name: string) => {
        const newItem: LoggedFoodItem = { id: `f-${Date.now()}`, name, timestamp: new Date().toISOString() };
        onLoggedItemsChange([...loggedItems, newItem]);
    };
    
    const handleDelete = (id: string) => {
        onLoggedItemsChange(loggedItems.filter((i: LoggedFoodItem) => i.id !== id));
    };

    const todaysLoggedItems = loggedItems.filter((i: LoggedFoodItem) => format(parseISO(i.timestamp), 'yyyy-MM-dd') === todayKey);

    return (
        <Card>
            <CardHeader className="flex flex-row justify-between items-start p-2">
                <div>
                    <CardTitle className="font-headline flex items-center gap-2 text-sm"><Apple className="h-4 w-4 text-primary" /> <span>Food & Supplement Log</span></CardTitle>
                    <CardDescription className="text-xs">Quick log common items for today.</CardDescription>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onManageItems}><Settings className="h-4 w-4" /></Button>
            </CardHeader>
            <CardContent className="space-y-2 p-2 pt-0">
                <div className="grid grid-cols-2 gap-1.5">
                    {customItems.map((item: string) => {
                        const isLogged = todaysLoggedItems.some((li: LoggedFoodItem) => li.name === item);
                        return (
                            <Button key={item} variant="outline" size="sm" onClick={() => handleLogItem(item)} disabled={isLogged} className="justify-between text-xs h-7">
                                {item} {isLogged && <Check className="h-4 w-4" />}
                            </Button>
                        );
                    })}
                </div>
                <Separator/>
                <div className="max-h-24 overflow-y-auto space-y-1 pr-2">
                     {todaysLoggedItems.length > 0 ? [...todaysLoggedItems].reverse().map((item: LoggedFoodItem) => (
                        <div key={item.id} className="flex justify-between items-center text-xs bg-muted p-1.5 rounded-md">
                           <span>{item.name} at {format(parseISO(item.timestamp), 'h:mm a')}</span>
                           <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDelete(item.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                        </div>
                    )) : <p className="text-xs text-muted-foreground text-center pt-4">No items logged yet today.</p>}
                </div>
            </CardContent>
        </Card>
    );
}

function HabitGrid({ habit, onToggle, proteinIntakes, proteinTarget }: {
    habit: Habit;
    onToggle: (habitId: string, date: string) => void;
    proteinIntakes?: ProteinIntake[];
    proteinTarget?: number;
}) {
    const [selectedDayInfo, setSelectedDayInfo] = useState<{ date: string, text: string } | null>(null);
    const today = new Date();
    const days = Array.from({ length: 30 }).map((_, i) => subDays(today, i)).reverse();
    const isSyncedHabit = SPECIAL_HABIT_ICONS.includes(habit.icon);
    const isWaterHabit = habit.icon === 'GlassWater';
    const isProteinHabit = habit.icon === 'Beef';

    const getIsCompleted = (dateString: string) => {
        const completion = habit.completions[dateString];
        if (isWaterHabit) {
            const target = habit.target || 8;
            return typeof completion === 'number' && completion >= target;
        }
        return !!completion;
    };

    const handleDayClick = (date: Date) => {
        const dateString = format(date, 'yyyy-MM-dd');
        const isTodayFlag = isSameDay(date, today);

        // If it's a normal habit and it's today, then toggle it.
        if (!isSyncedHabit && isTodayFlag) {
            onToggle(habit.id, dateString);
            setSelectedDayInfo(null);
            return;
        }

        // For any other case (synced habits, or past days), show info.
        if (selectedDayInfo?.date === dateString) {
            setSelectedDayInfo(null);
            return;
        }

        let infoText = '';
        const formattedDate = format(date, 'MMM d');

        if (isWaterHabit) {
            const count = typeof habit.completions[dateString] === 'number' ? habit.completions[dateString] : 0;
            infoText = `Drank ${count} glasses on ${formattedDate}.`;
        } else if (isProteinHabit && proteinIntakes) {
            const dailyProteinIntake = proteinIntakes
                .filter(intake => format(parseISO(intake.timestamp), 'yyyy-MM-dd') === dateString)
                .reduce((sum, intake) => sum + intake.amount, 0);
            infoText = `Consumed ${dailyProteinIntake}g protein on ${formattedDate}.`;
        } else {
            const isCompleted = getIsCompleted(dateString);
            infoText = `Habit was ${isCompleted ? 'completed' : 'not completed'} on ${formattedDate}.`;
        }
        
        if (infoText) {
            setSelectedDayInfo({ date: dateString, text: infoText });
        }
    };

    return (
        <>
            <TooltipProvider>
                <div className="mx-auto grid w-fit grid-cols-6 gap-1 p-2">
                    {days.map((day) => {
                        const dateString = format(day, 'yyyy-MM-dd');
                        const isCompleted = getIsCompleted(dateString);
                        const isTodayFlag = isSameDay(day, today);
                        
                        const canBeToggled = !isSyncedHabit && isTodayFlag;

                        let dailyProteinIntake: number | null = null;
                        if (isProteinHabit && proteinIntakes) {
                            dailyProteinIntake = proteinIntakes
                                .filter(intake => format(parseISO(intake.timestamp), 'yyyy-MM-dd') === dateString)
                                .reduce((sum, intake) => sum + intake.amount, 0);
                        }

                        return (
                            <Tooltip key={dateString} delayDuration={0}>
                                <TooltipTrigger asChild>
                                    <button
                                        onClick={() => handleDayClick(day)}
                                        aria-label={`Habit status for ${format(day, 'PPP')}`}
                                        className={cn(
                                            'h-5 w-5 rounded-sm transition-colors',
                                            isCompleted ? 'bg-primary' : 'bg-secondary',
                                            canBeToggled && (isCompleted ? 'hover:bg-primary/90' : 'hover:bg-accent'),
                                            isTodayFlag && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                                            !canBeToggled && 'opacity-70',
                                            selectedDayInfo?.date === dateString && 'ring-2 ring-foreground ring-offset-2 ring-offset-background'
                                        )}
                                    />
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>{format(day, 'MMM d, yyyy')}</p>
                                    {isWaterHabit && typeof habit.completions[dateString] === 'number' && (
                                        <p className="text-xs text-muted-foreground">{habit.completions[dateString]} glasses</p>
                                    )}
                                    {isProteinHabit && dailyProteinIntake !== null && (
                                        <p className="text-xs text-muted-foreground">{dailyProteinIntake}g / {proteinTarget || 150}g</p>
                                    )}
                                </TooltipContent>
                            </Tooltip>
                        );
                    })}
                </div>
            </TooltipProvider>
            {selectedDayInfo && (
                <div className="mt-2 text-center text-sm text-muted-foreground bg-secondary p-2 rounded-md mx-2">
                    {selectedDayInfo.text}
                </div>
            )}
        </>
    );
}

function EditHabitDialog({
  habit,
  isOpen,
  onOpenChange,
  onSave,
}: {
  habit: Habit | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (habitId: string, newName: string) => void;
}) {
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (habit) {
      setNewName(habit.name);
    }
  }, [habit]);

  const handleSave = () => {
    if (!newName.trim()) {
      return;
    }
    if (habit) {
      onSave(habit.id, newName.trim());
      onOpenChange(false);
    }
  };

  if (!habit) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Habit</DialogTitle>
          <DialogDescription>
            Change the name of your habit. This won't affect your streak.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="habit-name" className="text-right">
              Name
            </Label>
            <Input
              id="habit-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="col-span-3"
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OverloadSetup({ exercise, onExerciseChange }: { exercise: Exercise, onExerciseChange: (field: keyof Exercise, value: any) => void }) {
    return (
        <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="overload-setup" className="border-none">
                <AccordionTrigger className="py-1 hover:no-underline justify-end text-xs font-semibold text-black dark:text-white">
                    <Settings className="h-4 w-4 text-muted-foreground" />
                </AccordionTrigger>
                <AccordionContent className="space-y-1.5 pt-1">
                    <div>
                        <Label htmlFor={`k-value-${exercise.id}`} className="text-xs">Exercise Type (k-Value)</Label>
                        <Select value={String(exercise.kValue || 0.5)} onValueChange={(v) => onExerciseChange('kValue', parseFloat(v))}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="0.3" className="text-xs">Isolation (e.g., Curl)</SelectItem>
                                <SelectItem value="0.5" className="text-xs">Compound (e.g., Bench Press)</SelectItem>
                                <SelectItem value="0.6" className="text-xs">Heavy Compound (e.g., Squat)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                        <div><Label htmlFor={`base-weight-${exercise.id}`} className="text-xs">Baseline Weight (kg)</Label><Input id={`base-weight-${exercise.id}`} type="number" value={exercise.baselineWeight || ''} onChange={(e) => onExerciseChange('baselineWeight', parseFloat(e.target.value))} className="h-7 text-xs" /></div>
                        <div><Label htmlFor={`base-reps-${exercise.id}`} className="text-xs">Baseline Reps</Label><Input id={`base-reps-${exercise.id}`} type="number" value={exercise.baselineReps || ''} onChange={(e) => onExerciseChange('baselineReps', parseFloat(e.target.value))} className="h-7 text-xs" /></div>
                        <div><Label htmlFor={`target-weight-${exercise.id}`} className="text-xs">Target Weight (kg)</Label><Input id={`target-weight-${exercise.id}`} type="number" value={exercise.targetWeight || ''} onChange={(e) => onExerciseChange('targetWeight', parseFloat(e.target.value))} className="h-7 text-xs" /></div>
                        <div><Label htmlFor={`target-reps-${exercise.id}`} className="text-xs">Target Reps</Label><Input id={`target-reps-${exercise.id}`} type="number" value={exercise.targetReps || ''} onChange={(e) => onExerciseChange('targetReps', parseFloat(e.target.value))} className="h-7 text-xs" /></div>
                    </div>
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    )
}

function GymSettingsDialog({
  isOpen,
  onOpenChange,
  workoutSplit,
  cycleConfig,
  onSave,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  workoutSplit: CyclicalWorkoutSplit;
  cycleConfig: CycleConfig;
  onSave: (newSplit: CyclicalWorkoutSplit, newConfig: CycleConfig) => void;
}) {
  const [editedSplit, setEditedSplit] = useState<CyclicalWorkoutSplit>({});
  const [editedConfig, setEditedConfig] = useState<CycleConfig>({
    startDate: '',
    startDayKey: '',
  });

  useEffect(() => {
    if (isOpen) {
      setEditedSplit(JSON.parse(JSON.stringify(workoutSplit)));
      setEditedConfig(JSON.parse(JSON.stringify(cycleConfig)));
    }
  }, [isOpen, workoutSplit, cycleConfig]);
  
  const sortedEntries = useMemo(() => Object.entries(editedSplit).sort((a, b) => {
    const numA = parseInt(a[0].split(' ')[1], 10);
    const numB = parseInt(b[0].split(' ')[1], 10);
    if (isNaN(numA) || isNaN(numB)) {
        return a[0].localeCompare(b[0]);
    }
    return numA - numB;
  }), [editedSplit]);

  const handleDayTitleChange = (dayKey: string, newTitle: string) => {
    setEditedSplit((prev) => ({
      ...prev,
      [dayKey]: { ...prev[dayKey], title: newTitle },
    }));
  };

  const handleExerciseChange = (
    dayKey: string,
    exIndex: number,
    field: keyof Exercise,
    value: any
  ) => {
    setEditedSplit((prev) => {
      const newSplit = JSON.parse(JSON.stringify(prev));
      const exercise = newSplit[dayKey].exercises[exIndex];
      if (typeof value === 'number' && isNaN(value)) {
        exercise[field] = undefined;
      } else {
        exercise[field] = value;
      }
      return newSplit;
    });
  };

  const handleAddExercise = (dayKey: string) => {
    setEditedSplit((prev) => {
      const newSplit = { ...prev };
      const newExercise: Exercise = {
        id: `ex-${crypto.randomUUID()}`,
        name: 'New Exercise',
        sets: '3-4',
        kValue: 0.5,
        baselineWeight: 0,
        baselineReps: 0,
        targetWeight: 0,
        targetReps: 0,
        sessionHistory: [],
      };
      newSplit[dayKey].exercises.push(newExercise);
      return newSplit;
    });
  };

  const handleDeleteExercise = (dayKey: string, exIndex: number) => {
    setEditedSplit((prev) => {
      const newSplit = { ...prev };
      newSplit[dayKey].exercises.splice(exIndex, 1);
      return newSplit;
    });
  };

  const handleAddDay = () => {
    setEditedSplit((prev) => {
      const newDayKey = `Day ${Object.keys(prev).length + 1}`;
      return { ...prev, [newDayKey]: { title: 'New Workout Day', exercises: [] } };
    });
  };

  const handleDeleteDay = (dayKey: string) => {
    setEditedSplit((prev) => {
      const newSplit = { ...prev };
      delete newSplit[dayKey];
      // Also unset startDayKey if it was the deleted day
      if (editedConfig.startDayKey === dayKey) {
        setEditedConfig((c) => ({ ...c, startDayKey: '' }));
      }
      return newSplit;
    });
  };

  const handleSaveChanges = () => {
    onSave(editedSplit, editedConfig);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg rounded-lg flex flex-col h-[80vh] p-0">
        <DialogHeader className="p-2 border-b flex-shrink-0">
          <DialogTitle className="text-base">Manage Gym Plan</DialogTitle>
          <DialogDescription className="text-xs">
            Edit your workout plan and cycle configuration.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-grow overflow-y-auto">
          <div className="p-2">
            <Tabs defaultValue="plan" className="w-full">
              <TabsList className="grid w-full grid-cols-2 h-8">
                <TabsTrigger value="plan" className="text-xs px-2 py-1">
                  Workout Plan
                </TabsTrigger>
                <TabsTrigger value="cycle" className="text-xs px-2 py-1">
                  Cycle Configuration
                </TabsTrigger>
              </TabsList>
              <TabsContent value="plan" className="mt-2">
                <Accordion type="multiple" className="w-full space-y-1">
                  {sortedEntries.map(([dayKey, dayData]) => (
                    <AccordionItem
                      value={dayKey}
                      key={dayKey}
                      className="border rounded-md px-2"
                    >
                      <AccordionTrigger className="py-1.5 hover:no-underline">
                        <div className="flex justify-between items-center w-full">
                          <span className="text-xs font-medium">
                            {dayKey}: {dayData.title}
                          </span>
                           <Button
                                asChild
                                variant="ghost"
                                size="icon"
                                className="mr-2 h-6 w-6"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteDay(dayKey);
                                }}
                              >
                                <span role="button" aria-label={`Delete ${dayKey}`}>
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </span>
                            </Button>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-2 pb-2">
                        <div>
                          <Label
                            htmlFor={`title-${dayKey}`}
                            className="text-xs"
                          >
                            Day Title
                          </Label>
                          <Input
                            id={`title-${dayKey}`}
                            value={dayData.title}
                            onChange={(e) =>
                              handleDayTitleChange(dayKey, e.target.value)
                            }
                            className="h-7 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <h4 className="font-medium text-xs">Exercises</h4>
                           <ScrollArea className="h-48 rounded-md border p-1.5">
                            <div className="space-y-2 pr-2">
                              {dayData.exercises.map((ex, exIndex) => (
                                <div key={ex.id || crypto.randomUUID()} className="border-t pt-2 first:border-t-0 first:pt-0">
                                  <div className="flex items-center gap-1">
                                    <Input
                                      placeholder="Name"
                                      value={ex.name}
                                      onChange={(e) =>
                                        handleExerciseChange(
                                          dayKey,
                                          exIndex,
                                          'name',
                                          e.target.value
                                        )
                                      }
                                      className="flex-grow h-7 text-xs"
                                    />
                                    <Input
                                      placeholder="Sets"
                                      value={ex.sets}
                                      onChange={(e) =>
                                        handleExerciseChange(
                                          dayKey,
                                          exIndex,
                                          'sets',
                                          e.target.value
                                        )
                                      }
                                      className="w-16 h-7 text-xs"
                                    />
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() =>
                                        handleDeleteExercise(dayKey, exIndex)
                                      }
                                    >
                                      <Trash2 className="h-3 w-3 text-destructive" />
                                    </Button>
                                  </div>
                                  <OverloadSetup
                                    exercise={ex}
                                    onExerciseChange={(field, value) =>
                                      handleExerciseChange(
                                        dayKey,
                                        exIndex,
                                        field,
                                        value
                                      )
                                    }
                                  />
                                </div>
                              ))}
                            </div>
                           </ScrollArea>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs mt-2"
                            onClick={() => handleAddExercise(dayKey)}
                          >
                            Add Exercise
                          </Button>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2 h-7 px-2 text-xs"
                  onClick={handleAddDay}
                >
                  Add Workout Day
                </Button>
              </TabsContent>
              <TabsContent value="cycle" className="mt-2">
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs">Cycle Start Date</Label>
                    <p className="text-xs text-muted-foreground">
                      Select the date your cycle begins.
                    </p>
                    <Calendar
                      mode="single"
                      selected={
                        editedConfig.startDate
                          ? parseISO(editedConfig.startDate)
                          : new Date()
                      }
                      onSelect={(date) =>
                        date &&
                        setEditedConfig((prev) => ({
                          ...prev,
                          startDate: format(date, 'yyyy-MM-dd'),
                        }))
                      }
                      className="rounded-md border p-0"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">
                      Starting Day of Cycle
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Select which workout corresponds to the start date.
                    </p>
                    <Select
                      value={editedConfig.startDayKey}
                      onValueChange={(value) =>
                        setEditedConfig((prev) => ({
                          ...prev,
                          startDayKey: value,
                        }))
                      }
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue placeholder="Select a day" />
                      </SelectTrigger>
                      <SelectContent>
                        {sortedEntries.map(([dayKey, dayData]) => (
                          <SelectItem
                            key={dayKey}
                            value={dayKey}
                            className="text-xs"
                          >
                            {dayKey}: {dayData.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
        <DialogFooter className="p-2 border-t flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={handleSaveChanges}
          >
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FoodManagerDialog({
    isOpen,
    onOpenChange,
    customItems,
    onSave,
}: {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    customItems: string[];
    onSave: (items: string[]) => void;
}) {
    const [editedItems, setEditedItems] = useState(customItems);
    const [newItem, setNewItem] = useState('');

    useEffect(() => {
        if(isOpen) {
            setEditedItems(customItems);
        }
    }, [isOpen, customItems]);

    const handleAddItem = () => {
        if (!newItem.trim()) {
            return;
        }
        if (editedItems.map(i => i.toLowerCase()).includes(newItem.trim().toLowerCase())) {
            return;
        }
        setEditedItems([...editedItems, newItem.trim()]);
        setNewItem('');
    };

    const handleDeleteItem = (itemToDelete: string) => {
        setEditedItems(editedItems.filter(item => item !== itemToDelete));
    };

    const handleSave = () => {
        onSave(editedItems);
        onOpenChange(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Manage Quick-Log Items</DialogTitle>
                    <DialogDescription>
                        Add or remove food and supplement items for quick logging.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="flex gap-2">
                        <Input
                            placeholder="e.g., Creatine"
                            value={newItem}
                            onChange={(e) => setNewItem(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleAddItem();
                            }}
                        />
                        <Button onClick={handleAddItem}><Plus className="h-4 w-4" /> Add</Button>
                    </div>
                    <Separator />
                    <ScrollArea className="h-64">
                        <div className="space-y-2 pr-4">
                            {editedItems.length > 0 ? (
                                editedItems.map(item => (
                                    <div key={item} className="flex items-center justify-between rounded-md bg-muted p-2">
                                        <span className="text-sm font-medium">{item}</span>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-destructive"
                                            onClick={() => handleDeleteItem(item)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))
                            ) : (
                                <p className="text-center text-sm text-muted-foreground pt-8">
                                    No custom items yet.
                                </p>
                            )}
                        </div>
                    </ScrollArea>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave}>Save Changes</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function OverloadTrackerDialog({
    isOpen, onOpenChange, workoutSplit, onWorkoutSplitChange, todaysExercises
}: {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    workoutSplit: CyclicalWorkoutSplit;
    onWorkoutSplitChange: (split: CyclicalWorkoutSplit) => void;
    todaysExercises: Exercise[];
}) {
    const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
    const [sessionWeight, setSessionWeight] = useState('');
    const [sessionReps, setSessionReps] = useState('');

    const allExercises = useMemo(() => {
        return Object.values(workoutSplit).flatMap(day => day.exercises);
    }, [workoutSplit]);

    const selectedExercise = useMemo(() => {
        if (!selectedExerciseId) return null;
        return allExercises.find(ex => ex.id === selectedExerciseId) || null;
    }, [selectedExerciseId, allExercises]);

    useEffect(() => {
        if (!isOpen) {
            setSelectedExerciseId(null);
            setSessionWeight('');
            setSessionReps('');
        }
    }, [isOpen]);

    // --- Core Logic Engine ---
    const calculateE1RM = (weight: number, reps: number) => weight * (1 + reps / 30);

    const calculateProgressiveOverload = useCallback((
        sessionHistory: ExerciseSession[], 
        baseline: { weight: number; reps: number }, 
        target: { weight: number; reps: number }, 
        k: number
    ) => {
        const { weight: WL, reps: RL } = baseline;
        const { weight: WT, reps: RT } = target;
        const e1RM_L = calculateE1RM(WL, RL);
        const e1RM_T = calculateE1RM(WT, RT);
        const intensityRange = e1RM_T - e1RM_L;
        const weightRange = WT - WL;
        const repRange = RT - RL;
        let lastScore = 0;
        
        const results = [{ session: 1, weight: WL, reps: RL, score: 0, scoreDelta: 0 }];
        
        sessionHistory.forEach((session, index) => {
            const { weight: Wi, reps: Ri } = session;
            const e1RM_i = calculateE1RM(Wi, Ri);
            
            let intensityScore = (intensityRange > 0) ? (e1RM_i - e1RM_L) / intensityRange : (e1RM_i >= e1RM_L ? 1 : 0);
            intensityScore = Math.max(0, intensityScore);
            
            let weightProgress = (weightRange !== 0) ? (Wi - WL) / weightRange : (Wi >= WL ? 1 : 0);
            let repProgress = (repRange !== 0) ? (Ri - RL) / repRange : (Ri >= RL ? 1 : 0);
            
            weightProgress = Math.max(0, weightProgress);
            repProgress = Math.max(0, repProgress);
            
            const synergyScore = Math.sqrt(weightProgress * repProgress);
            const currentScore = (k * intensityScore) + ((1 - k) * synergyScore);
            const scoreDelta = currentScore - lastScore;
            
            results.push({ session: index + 2, weight: Wi, reps: Ri, score: currentScore, scoreDelta: scoreDelta });
            lastScore = currentScore;
        });
        
        return results;
    }, []);

    const overloadResults = useMemo(() => {
        if (!selectedExercise || !selectedExercise.sessionHistory) return [];
        const settings = {
            baseline: { weight: selectedExercise.baselineWeight || 0, reps: selectedExercise.baselineReps || 0 },
            target: { weight: selectedExercise.targetWeight || 0, reps: selectedExercise.targetReps || 0 },
            k: selectedExercise.kValue || 0.5
        };
        if (!settings.baseline.weight) return [];
        return calculateProgressiveOverload(selectedExercise.sessionHistory, settings.baseline, settings.target, settings.k);
    }, [selectedExercise, calculateProgressiveOverload]);

    const handleAddSession = () => {
        const weight = parseFloat(sessionWeight);
        const reps = parseInt(sessionReps);

        if (!selectedExerciseId || isNaN(weight) || isNaN(reps) || weight <= 0 || reps <= 0) {
            return;
        }

        const newSession: ExerciseSession = { weight, reps };
        const newSplit = JSON.parse(JSON.stringify(workoutSplit));
        
        let exerciseFound = false;
        for (const dayKey in newSplit) {
            const day = newSplit[dayKey];
            const exIndex = day.exercises.findIndex((ex: Exercise) => ex.id === selectedExerciseId);
            if (exIndex !== -1) {
                if (!day.exercises[exIndex].sessionHistory) {
                    day.exercises[exIndex].sessionHistory = [];
                }
                day.exercises[exIndex].sessionHistory.push(newSession);
                exerciseFound = true;
                break;
            }
        }

        if (exerciseFound) {
            onWorkoutSplitChange(newSplit);
            setSessionWeight('');
            setSessionReps('');
        }
    };
    
    const latestResult = overloadResults[overloadResults.length - 1];
    let feedbackText = "Log a session to see feedback.";
    let feedbackClass = "";
    if (latestResult && latestResult.session > 1) {
        if (latestResult.scoreDelta > 0.02) { feedbackText = "Great Progress! ▲"; feedbackClass = 'text-green-600'; } 
        else if (latestResult.scoreDelta > 0) { feedbackText = "Solid Improvement ▲"; feedbackClass = 'text-green-500'; } 
        else if (latestResult.scoreDelta === 0) { feedbackText = "Stable Performance –"; } 
        else { feedbackText = "Slight Dip ▼"; feedbackClass = 'text-red-500'; }
    }


    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="w-[95vw] sm:max-w-2xl h-[90vh] md:h-[85vh] flex flex-col p-0">
                <DialogHeader className="p-2 sm:p-4 border-b">
                    <DialogTitle>Progressive Overload Tracker</DialogTitle>
                </DialogHeader>
                <div className="flex-grow grid md:grid-cols-2 gap-2 sm:gap-4 p-2 sm:p-4 overflow-y-auto">
                    {/* Left Column: Controls & Feedback */}
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Select Exercise to Track</Label>
                             <Select onValueChange={setSelectedExerciseId} value={selectedExerciseId || ""}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Choose an exercise..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {todaysExercises.length > 0 ? (
                                        todaysExercises.map(ex => (
                                            <SelectItem key={ex.id} value={ex.id}>{ex.name}</SelectItem>
                                        ))
                                    ) : (
                                        <div className="p-2 text-sm text-center text-muted-foreground">No exercises scheduled for today.</div>
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                        
                        {selectedExercise && (
                            <>
                                <Card>
                                    <CardHeader className="p-2 sm:p-4">
                                        <CardTitle className="text-lg">Log New Session for {selectedExercise.name}</CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-2 sm:p-4 pt-0 space-y-2">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div><Label htmlFor="session-weight">Weight (kg)</Label><Input id="session-weight" type="number" placeholder="e.g., 65" value={sessionWeight} onChange={e => setSessionWeight(e.target.value)} /></div>
                                            <div><Label htmlFor="session-reps">Reps</Label><Input id="session-reps" type="number" placeholder="e.g., 8" value={sessionReps} onChange={e => setSessionReps(e.target.value)} /></div>
                                        </div>
                                        <Button onClick={handleAddSession} className="w-full"><PlusCircle className="mr-2 h-4 w-4"/> Add Session</Button>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader className="p-2 sm:p-4">
                                        <CardTitle className="text-lg">Latest Session Feedback</CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-2 sm:p-4 pt-0 text-center">
                                       {latestResult && latestResult.session > 1 ? (
                                           <>
                                            <div className="text-3xl font-bold text-primary">{latestResult.weight}kg x {latestResult.reps}</div>
                                            <div className={`text-lg font-semibold ${feedbackClass}`}>{feedbackText}</div>
                                           </>
                                       ) : <p className="text-muted-foreground">Log a session to see feedback, or check setup.</p>}
                                    </CardContent>
                                </Card>
                            </>
                        )}
                    </div>
                    {/* Right Column: Chart & History */}
                     <div className="space-y-4">
                       {selectedExercise ? (
                            overloadResults.length > 0 ? (
                                <>
                                     <Card>
                                        <CardHeader className="p-2 sm:p-4"><CardTitle className="text-lg">Progress Trend</CardTitle></CardHeader>
                                        <CardContent className="p-2 sm:p-4 pt-0 h-64">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <LineChart data={overloadResults} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                                    <CartesianGrid strokeDasharray="3 3" />
                                                    <XAxis dataKey="session" tickFormatter={(val) => `S${val}`} />
                                                    <YAxis domain={[0, 'dataMax + 0.1']} />
                                                    <RechartsTooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}/>
                                                    <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2} activeDot={{ r: 8 }} />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </CardContent>
                                    </Card>
                                     <Card>
                                        <CardHeader className="p-2 sm:p-4"><CardTitle className="text-lg">Session History</CardTitle></CardHeader>
                                        <CardContent className="p-2 sm:p-4 pt-0">
                                            <ScrollArea className="h-64">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>Session</TableHead>
                                                            <TableHead>Weight</TableHead>
                                                            <TableHead>Reps</TableHead>
                                                            <TableHead>Trend</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {overloadResults.map((r, i) => (
                                                            <TableRow key={i}>
                                                                <TableCell>{r.session}</TableCell>
                                                                <TableCell>{r.weight}kg</TableCell>
                                                                <TableCell>{r.reps}</TableCell>
                                                                <TableCell className={cn(r.scoreDelta > 0 && 'text-green-500', r.scoreDelta < 0 && 'text-red-500')}>
                                                                    {i > 0 ? (r.scoreDelta > 0 ? '▲' : r.scoreDelta < 0 ? '▼' : '–') : '–'}
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </ScrollArea>
                                        </CardContent>
                                    </Card>
                                </>
                            ) : (
                                <div className="flex items-center justify-center h-full text-muted-foreground text-center p-4">
                                    Log a session to see your progress for {selectedExercise.name}.
                                </div>
                            )
                       ) : (
                            <div className="flex items-center justify-center h-full text-muted-foreground text-center p-4">
                                {todaysExercises.length > 0
                                    ? "Please select an exercise to view its data."
                                    : "No exercises scheduled for today to track."
                                }
                            </div>
                       )}
                    </div>
                </div>
                <DialogFooter className="p-2 sm:p-4 border-t">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export default function HabitsPage() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);

  // Core State
  const [habits, setHabits] = useState<Habit[]>([]);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [isEditHabitDialogOpen, setIsEditHabitDialogOpen] = useState(false);
  const [isAddHabitDialogOpen, setIsAddHabitDialogOpen] = useState(false);
  const [habitToDelete, setHabitToDelete] = useState<Habit | null>(null);
  
  // Gym & Nutrition State
  const [proteinIntakes, setProteinIntakes] = useState<ProteinIntake[]>([]);
  const [loggedFoodItems, setLoggedFoodItems] = useState<LoggedFoodItem[]>([]);
  const [proteinTarget, setProteinTarget] = useState(150);
  const [customFoodItems, setCustomFoodItems] = useState<string[]>(initialCustomFoodItems);
  const [cyclicalWorkoutSplit, setCyclicalWorkoutSplit] = useState<CyclicalWorkoutSplit>({});
  const [cycleConfig, setCycleConfig] = useState<CycleConfig>({ startDate: format(new Date(), 'yyyy-MM-dd'), startDayKey: "Day 1" });

  // Dialog states
  const [isGymSettingsOpen, setIsGymSettingsOpen] = useState(false);
  const [isFoodManagerOpen, setIsFoodManagerOpen] = useState(false);
  const [isOverloadTrackerOpen, setIsOverloadTrackerOpen] = useState(false);
  
  // Feature flag state
  const [gymTrackingEnabled, setGymTrackingEnabled] = useState(true);
  
  // Derived state
  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const todaysProteinIntake = useMemo(() => {
    return proteinIntakes
      .filter(intake => format(parseISO(intake.timestamp), 'yyyy-MM-dd') === todayKey)
      .reduce((sum, intake) => sum + intake.amount, 0);
  }, [proteinIntakes, todayKey]);


  // --- Backend Data Sync ---
  // Holds the full, current gym-data blob so every save can PATCH the complete
  // object (the backend replaces the whole blob on each call).
  const gymDataRef = useRef<GymData>(defaultGymData);

  useEffect(() => {
    if (!user) {
        setIsLoading(false);
        return;
    }

    let cancelled = false;
    setIsLoading(true);

    (async () => {
        try {
            const [habitsRes, gymRes] = await Promise.all([
                apiFetch<ApiHabit[]>('/habits'),
                apiFetch<{ data: Partial<GymData> }>('/habits/gym'),
            ]);

            if (cancelled) return;

            let loadedHabits = habitsRes.map(mapApiHabit);
            if (loadedHabits.length === 0) {
                // First-time user: seed the default habit set (this also creates the
                // special synced habits the Gym Tracker relies on).
                loadedHabits = P_HABITS;
                apiFetch<ApiHabit[]>('/habits', {
                    method: 'PATCH',
                    body: JSON.stringify(loadedHabits.map(stripHabitForApi)),
                }).then((saved) => {
                    if (!cancelled) setHabits(saved.map(mapApiHabit));
                }).catch((err) => console.error('Failed to seed default habits', err));
            }
            setHabits(loadedHabits);

            const rawGym = gymRes?.data || {};
            const merged: GymData = {
                settings: rawGym.settings ?? defaultGymData.settings,
                gym_protein_intakes: rawGym.gym_protein_intakes ?? defaultGymData.gym_protein_intakes,
                gym_logged_foods: rawGym.gym_logged_foods ?? defaultGymData.gym_logged_foods,
                gym_protein_target: rawGym.gym_protein_target ?? defaultGymData.gym_protein_target,
                gym_custom_foods: rawGym.gym_custom_foods ?? defaultGymData.gym_custom_foods,
                gym_workout_split: rawGym.gym_workout_split ?? defaultGymData.gym_workout_split,
                gym_cycle_config: rawGym.gym_cycle_config ?? defaultGymData.gym_cycle_config,
            };

            gymDataRef.current = merged;
            setGymTrackingEnabled(merged.settings.gymTracking !== false);
            setProteinIntakes(merged.gym_protein_intakes);
            setLoggedFoodItems(merged.gym_logged_foods);
            setProteinTarget(merged.gym_protein_target);
            setCustomFoodItems(merged.gym_custom_foods);
            setCyclicalWorkoutSplit(augmentWorkoutSplit(merged.gym_workout_split || {}));
            setCycleConfig(merged.gym_cycle_config);

            // Persist defaults for any keys that were missing from the stored blob
            // (e.g. a brand new user), mirroring the old "seed on first load" behavior.
            const isMissingAnyGymKey = (Object.keys(defaultGymData) as (keyof GymData)[]).some((key) => rawGym[key] === undefined);
            if (isMissingAnyGymKey) {
                apiFetch('/habits/gym', {
                    method: 'PATCH',
                    body: JSON.stringify({ data: merged }),
                }).catch((err) => console.error('Failed to seed default gym data', err));
            }
        } catch (err) {
            console.error('Failed to load habits data', err);
        } finally {
            if (!cancelled) setIsLoading(false);
        }
    })();

    return () => {
        cancelled = true;
    };
  }, [user]);

  // Merges a partial change into the current gym-data blob and PATCHes the
  // full object (the endpoint replaces the entire blob on every call).
  const persistGymData = useCallback((patch: Partial<GymData>) => {
    gymDataRef.current = { ...gymDataRef.current, ...patch };
    apiFetch('/habits/gym', {
        method: 'PATCH',
        body: JSON.stringify({ data: gymDataRef.current }),
    }).catch((err) => console.error('Failed to save gym data', err));
  }, []);

  // --- Handlers that save to the backend ---
  const handleHabitsUpdate = useCallback((updatedHabits: Habit[]) => {
      setHabits(updatedHabits);
      apiFetch<ApiHabit[]>('/habits', {
          method: 'PATCH',
          body: JSON.stringify(updatedHabits.map(stripHabitForApi)),
      }).then((saved) => {
          setHabits(saved.map(mapApiHabit));
      }).catch((err) => console.error('Failed to save habits', err));
  }, []);

  // --- Habit Syncing Logic ---
  useEffect(() => {
    if (isLoading || !gymTrackingEnabled || !habits.length) return;

    const todayKey = format(new Date(), 'yyyy-MM-dd');
    let habitsChanged = false;

    const newHabits = habits.map(habit => {
        if (!habit) return habit;
        let newCompletions = { ...habit.completions };
        let changedInThisHabit = false;

        if (habit.icon === 'Beef') {
            const isCompleted = todaysProteinIntake >= proteinTarget;
            if (!!newCompletions[todayKey] !== isCompleted) {
                if (isCompleted) newCompletions[todayKey] = true; else delete newCompletions[todayKey];
                changedInThisHabit = true;
            }
        }

        if (habit.icon === 'Pill') {
            const todaysLogs = loggedFoodItems.filter(i => format(parseISO(i.timestamp), 'yyyy-MM-dd') === todayKey);
            const todaysLoggedNames = new Set(todaysLogs.map(log => log.name));
            const isCompleted = customFoodItems.length > 0 && customFoodItems.every(item => todaysLoggedNames.has(item));
            if (!!newCompletions[todayKey] !== isCompleted) {
                if (isCompleted) newCompletions[todayKey] = true; else delete newCompletions[todayKey];
                changedInThisHabit = true;
            }
        }

        if (changedInThisHabit) {
            habitsChanged = true;
            return { ...habit, completions: newCompletions };
        }
        return habit;
    });

    if (habitsChanged) {
        handleHabitsUpdate(newHabits);
    }
  }, [todaysProteinIntake, proteinTarget, loggedFoodItems, customFoodItems, habits, isLoading, gymTrackingEnabled, handleHabitsUpdate]);

  const handleProteinIntakesUpdate = useCallback((updatedIntakes: ProteinIntake[]) => {
      setProteinIntakes(updatedIntakes);
      persistGymData({ gym_protein_intakes: updatedIntakes });
  }, [persistGymData]);

  const handleLoggedFoodItemsUpdate = useCallback((updatedItems: LoggedFoodItem[]) => {
      setLoggedFoodItems(updatedItems);
      persistGymData({ gym_logged_foods: updatedItems });
  }, [persistGymData]);

  const handleProteinTargetUpdate = useCallback((newTarget: number) => {
      setProteinTarget(newTarget);
      persistGymData({ gym_protein_target: newTarget });
  }, [persistGymData]);

  const handleCustomFoodItemsUpdate = useCallback((newItems: string[]) => {
      setCustomFoodItems(newItems);
      persistGymData({ gym_custom_foods: newItems });
  }, [persistGymData]);

  const handleWorkoutSplitUpdate = useCallback((newSplit: CyclicalWorkoutSplit) => {
    setCyclicalWorkoutSplit(newSplit);
    persistGymData({ gym_workout_split: newSplit });
  }, [persistGymData]);

  const handleCycleConfigUpdate = useCallback((newConfig: CycleConfig) => {
    setCycleConfig(newConfig);
    persistGymData({ gym_cycle_config: newConfig });
  }, [persistGymData]);

  const handleToggleCompletion = (habitId: string, date: string) => {
    if (!isSameDay(parseISO(date), new Date())) return;
    const newHabits = habits.map(h => {
        if (h.id === habitId && !SPECIAL_HABIT_ICONS.includes(h.icon)) {
            const newCompletions = {...h.completions};
            if(newCompletions[date]) delete newCompletions[date];
            else newCompletions[date] = true;
            return {...h, completions: newCompletions};
        }
        return h;
    });
    handleHabitsUpdate(newHabits);
  }

  const handleSaveHabitName = (habitId: string, newName: string) => {
    const newHabits = habits.map((h) => h.id === habitId ? { ...h, name: newName } : h);
    handleHabitsUpdate(newHabits);
  };
  
  const handleDeleteHabit = () => {
    if (!habitToDelete) return;
    const newHabits = habits.filter(h => h.id !== habitToDelete.id);
    handleHabitsUpdate(newHabits);
    setHabitToDelete(null);
  };

  const handleAddHabit = (name: string, icon: string) => {
    const newHabit: Habit = {
        id: `habit-${Date.now()}`, name, icon, completions: {},
    };
    handleHabitsUpdate([...habits, newHabit]);
  };

  const getWorkoutDayInfo = useWorkoutDayInfo(cyclicalWorkoutSplit, cycleConfig);
  const todaysWorkoutInfo = useMemo(() => getWorkoutDayInfo(new Date()), [getWorkoutDayInfo]);
  
  const workoutHabit = habits.find(h => h.icon === 'Dumbbell');
  const isTodayWorkoutCompleted = workoutHabit ? !!workoutHabit.completions[todayKey] : false;

  const handleToggleWorkoutCompletion = () => {
    if (!workoutHabit) return;
    const newHabits = habits.map(h => {
        if (h.id === workoutHabit.id) {
            const newCompletions = { ...h.completions };
            if (isTodayWorkoutCompleted) delete newCompletions[todayKey];
            else newCompletions[todayKey] = true;
            return { ...h, completions: newCompletions };
        }
        return h;
    });
    handleHabitsUpdate(newHabits);
  };
  
  const filteredHabits = gymTrackingEnabled ? habits : habits.filter(h => !['Dumbbell', 'Beef', 'Pill'].includes(h.icon));


  if (isLoading) {
    return (
        <AppLayout>
            <div className="space-y-6">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-64 w-full" />
                <div className="grid md:grid-cols-2 gap-6">
                    <Skeleton className="h-80 w-full" />
                    <Skeleton className="h-80 w-full" />
                </div>
            </div>
        </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <header>
          <h1 className="text-xl font-bold font-headline">Habit Tracker</h1>
        </header>
        
        {gymTrackingEnabled && (
            <Card>
                <CardContent className="p-2 sm:p-4">
                  <GymTracker 
                      proteinIntakes={proteinIntakes}
                      onProteinIntakesChange={handleProteinIntakesUpdate}
                      loggedFoodItems={loggedFoodItems}
                      onLoggedFoodItemsChange={handleLoggedFoodItemsUpdate}
                      proteinTarget={proteinTarget}
                      onProteinTargetChange={handleProteinTargetUpdate}
                      customFoodItems={customFoodItems}
                      onManageCustomFoodItems={() => setIsFoodManagerOpen(true)}
                      onManagePlan={() => setIsGymSettingsOpen(true)}
                      onToggleWorkoutCompletion={handleToggleWorkoutCompletion}
                      isTodayCompleted={isTodayWorkoutCompleted}
                      todaysWorkoutInfo={todaysWorkoutInfo}
                      onOpenOverloadTracker={() => setIsOverloadTrackerOpen(true)}
                  />
                </CardContent>
            </Card>
        )}

        <div className="space-y-4">
            <header className="flex items-center justify-between">
                <h2 className="text-xl font-bold font-headline flex items-center gap-2">
                    <BookOpenCheck className="h-6 w-6 text-primary" />
                    <span>Streak Book</span>
                </h2>
                <Button variant="ghost" size="icon" onClick={() => setIsAddHabitDialogOpen(true)}>
                    <PlusCircle className="h-5 w-5" />
                </Button>
            </header>
            <Accordion type="single" collapsible className="w-full space-y-4">
                {filteredHabits.map((habit) => {
                    if (!habit) return null;
                    const Icon = iconMap[habit.icon] || iconMap.CheckCircle2;
                    const isWaterHabit = habit.icon === 'GlassWater';
                    const isProteinHabit = habit.icon === 'Beef';
                    const isSyncedHabit = SPECIAL_HABIT_ICONS.includes(habit.icon);
                    const streak = calculateStreak(
                        habit.completions,
                        isWaterHabit ? (habit.target || 8) : 1
                    );
                    
                    const waterToday = (isWaterHabit && typeof habit.completions[todayKey] === 'number') ? habit.completions[todayKey] as number : 0;
                    const waterTarget = habit.target || 8;

                    return (
                        <Card key={habit.id} className="group">
                            <AccordionItem value={habit.id} className="border-b-0">
                                <AccordionTrigger className="p-2 hover:no-underline">
                                    <div className="flex items-center justify-between w-full">
                                        <div className="flex items-center gap-2">
                                            <Icon className="h-5 w-5 text-muted-foreground" />
                                            <span className="font-semibold text-sm">{habit.name}</span>
                                            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                <div
                                                    role="button"
                                                    aria-label="Edit habit"
                                                    className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-accent cursor-pointer"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setEditingHabit(habit);
                                                        setIsEditHabitDialogOpen(true);
                                                    }}
                                                >
                                                    <Edit className="h-3 w-3" />
                                                </div>
                                                {!isSyncedHabit && (
                                                    <div
                                                        role="button"
                                                        aria-label="Delete habit"
                                                        className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-destructive/10 text-destructive cursor-pointer"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setHabitToDelete(habit);
                                                        }}
                                                    >
                                                        <Trash2 className="h-3 w-3" />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            {isWaterHabit && (
                                                <span className="text-sm font-semibold text-muted-foreground">
                                                    {waterToday} / {waterTarget} glasses
                                                </span>
                                            )}
                                            {isProteinHabit && (
                                                <span className="text-sm font-semibold text-muted-foreground">
                                                    {todaysProteinIntake} / {proteinTarget} g
                                                </span>
                                            )}
                                            <div className="flex items-center gap-1 text-orange-500">
                                                <Flame className="h-4 w-4" />
                                                <span className="font-bold text-base">{streak} Day{streak !== 1 ? 's' : ''}</span>
                                            </div>
                                        </div>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent>
                                    <HabitGrid 
                                        habit={habit} 
                                        onToggle={handleToggleCompletion} 
                                        proteinIntakes={proteinIntakes}
                                        proteinTarget={proteinTarget}
                                    />
                                </AccordionContent>
                            </AccordionItem>
                        </Card>
                    );
                })}
            </Accordion>
        </div>
      </div>
      <EditHabitDialog
        habit={editingHabit}
        isOpen={isEditHabitDialogOpen}
        onOpenChange={setIsEditHabitDialogOpen}
        onSave={handleSaveHabitName}
      />
      <AddHabitDialog
        isOpen={isAddHabitDialogOpen}
        onOpenChange={setIsAddHabitDialogOpen}
        onSave={handleAddHabit}
       />
      <GymSettingsDialog
        isOpen={isGymSettingsOpen}
        onOpenChange={setIsGymSettingsOpen}
        workoutSplit={cyclicalWorkoutSplit}
        cycleConfig={cycleConfig}
        onSave={(newSplit, newConfig) => {
            handleWorkoutSplitUpdate(newSplit);
            handleCycleConfigUpdate(newConfig);
            setIsGymSettingsOpen(false);
        }}
      />
       <FoodManagerDialog
        isOpen={isFoodManagerOpen}
        onOpenChange={setIsFoodManagerOpen}
        customItems={customFoodItems}
        onSave={(newItems) => {
          handleCustomFoodItemsUpdate(newItems);
          setIsFoodManagerOpen(false);
        }}
       />
       <OverloadTrackerDialog
         isOpen={isOverloadTrackerOpen}
         onOpenChange={setIsOverloadTrackerOpen}
         workoutSplit={cyclicalWorkoutSplit}
         onWorkoutSplitChange={handleWorkoutSplitUpdate}
         todaysExercises={todaysWorkoutInfo.exercises}
       />
       <AlertDialog open={!!habitToDelete} onOpenChange={() => setHabitToDelete(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the "{habitToDelete?.name}" habit and all its data.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setHabitToDelete(null)}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteHabit}>Delete</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
       </AlertDialog>
    </AppLayout>
  );
}

const availableIcons = [
  { name: 'CheckCircle2', label: 'Check Circle' },
  { name: 'Bed', label: 'Bed' },
  { name: 'Footprints', label: 'Activity' },
  { name: 'Sunrise', label: 'Sunrise' },
  { name: 'Guitar', label: 'Guitar' },
  { name: 'Code', label: 'Coding' },
  { name: 'Leaf', label: 'Nature' },
];

function AddHabitDialog({
  isOpen,
  onOpenChange,
  onSave,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string, icon: string) => void;
}) {
    const [name, setName] = useState('');
    const [icon, setIcon] = useState(availableIcons[0].name);

    const handleSave = () => {
        if (!name.trim()) {
            return;
        }
        onSave(name, icon);
        onOpenChange(false);
        setName('');
        setIcon(availableIcons[0].name);
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => {
            if (!open) {
                setName('');
                setIcon(availableIcons[0].name);
            }
            onOpenChange(open);
        }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Create a New Habit</DialogTitle>
                    <DialogDescription>
                        Give your new habit a name and an icon to get started.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="new-habit-name">Habit Name</Label>
                        <Input
                            id="new-habit-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g., Read for 15 minutes"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="new-habit-icon">Icon</Label>
                        <Select value={icon} onValueChange={setIcon}>
                            <SelectTrigger id="new-habit-icon">
                                <SelectValue placeholder="Select an icon" />
                            </SelectTrigger>
                            <SelectContent>
                                {availableIcons.map(iconInfo => {
                                    const IconComponent = iconMap[iconInfo.name];
                                    if (!IconComponent) return null;
                                    return (
                                        <SelectItem key={iconInfo.name} value={iconInfo.name}>
                                            <div className="flex items-center gap-2">
                                                <IconComponent className="h-4 w-4" />
                                                <span>{iconInfo.label}</span>
                                            </div>
                                        </SelectItem>
                                    )
                                })}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave}>Create Habit</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
