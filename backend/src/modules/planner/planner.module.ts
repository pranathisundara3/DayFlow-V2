import { Body, Controller, Get, Injectable, Module, Put, UseGuards } from '@nestjs/common';
import { InjectModel, MongooseModule } from '@nestjs/mongoose';
import { IsObject } from 'class-validator';
import { Model, Types } from 'mongoose';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ timestamps: true, collection: 'planner_schedules' })
class PlannerSchedule { @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true }) userId!: Types.ObjectId; @Prop({ type: Object, default: {} }) days!: Record<string, unknown[]>; }
const PlannerScheduleSchema = SchemaFactory.createForClass(PlannerSchedule);
class PlannerDto { @IsObject() days!: Record<string, unknown[]>; }
@Injectable() class PlannerService { constructor(@InjectModel(PlannerSchedule.name) private readonly model: Model<PlannerSchedule>) {} get(userId: string) { return this.model.findOneAndUpdate({ userId }, { $setOnInsert: { days: {} } }, { upsert: true, new: true }).lean().exec(); } save(userId: string, dto: PlannerDto) { return this.model.findOneAndUpdate({ userId }, dto, { upsert: true, new: true, runValidators: true }).lean().exec(); } }
@Controller('planner') @UseGuards(JwtAuthGuard) class PlannerController { constructor(private readonly service: PlannerService) {} @Get() get(@CurrentUser() user: { sub: string }) { return this.service.get(user.sub); } @Put() save(@CurrentUser() user: { sub: string }, @Body() dto: PlannerDto) { return this.service.save(user.sub, dto); } }
@Module({ imports: [MongooseModule.forFeature([{ name: PlannerSchedule.name, schema: PlannerScheduleSchema }])], controllers: [PlannerController], providers: [PlannerService] }) export class PlannerModule {}