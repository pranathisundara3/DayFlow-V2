import { Body, Controller, Get, Injectable, Module, Patch, UseGuards } from '@nestjs/common';
import { InjectModel, MongooseModule } from '@nestjs/mongoose';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { Model, Types } from 'mongoose';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ timestamps: true, collection: 'habits' }) export class Habit { @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true }) userId!: Types.ObjectId; @Prop({ required: true, maxlength: 100 }) name!: string; @Prop({ required: true }) icon!: string; @Prop() target?: number; @Prop({ type: Object, default: {} }) completions!: Record<string, boolean | number>; }
export const HabitSchema = SchemaFactory.createForClass(Habit);
@Schema({ timestamps: true, collection: 'gym_settings' }) class GymSettings { @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true }) userId!: Types.ObjectId; @Prop({ type: Object, default: {} }) data!: Record<string, unknown>; }
const GymSettingsSchema = SchemaFactory.createForClass(GymSettings);
class HabitDto { @IsString() @MaxLength(100) name!: string; @IsString() icon!: string; @IsOptional() target?: number; @IsObject() completions!: Record<string, boolean | number>; }
class GymSettingsDto { @IsObject() data!: Record<string, unknown>; }
@Injectable() class HabitsService { constructor(@InjectModel(Habit.name) private readonly habits: Model<Habit>, @InjectModel(GymSettings.name) private readonly gym: Model<GymSettings>) {} list(userId: string) { return this.habits.find({ userId }).sort({ createdAt: 1 }).lean().exec(); } save(userId: string, dto: HabitDto[]) { return this.habits.deleteMany({ userId }).then(() => this.habits.insertMany(dto.map(item => ({ ...item, userId })))); } gymSettings(userId: string) { return this.gym.findOneAndUpdate({ userId }, { $setOnInsert: { data: {} } }, { upsert: true, new: true }).lean().exec(); } saveGym(userId: string, dto: GymSettingsDto) { return this.gym.findOneAndUpdate({ userId }, dto, { upsert: true, new: true }).lean().exec(); } }
@Controller('habits') @UseGuards(JwtAuthGuard) class HabitsController { constructor(private readonly service: HabitsService) {} @Get() list(@CurrentUser() user: { sub: string }) { return this.service.list(user.sub); } @Patch() save(@CurrentUser() user: { sub: string }, @Body() dto: HabitDto[]) { return this.service.save(user.sub, dto); } @Get('gym') gym(@CurrentUser() user: { sub: string }) { return this.service.gymSettings(user.sub); } @Patch('gym') saveGym(@CurrentUser() user: { sub: string }, @Body() dto: GymSettingsDto) { return this.service.saveGym(user.sub, dto); } }
@Module({ imports: [MongooseModule.forFeature([{ name: Habit.name, schema: HabitSchema }, { name: GymSettings.name, schema: GymSettingsSchema }])], controllers: [HabitsController], providers: [HabitsService] }) export class HabitsModule {}