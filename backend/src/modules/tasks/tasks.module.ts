import { Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { InjectModel, MongooseModule } from '@nestjs/mongoose';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { Model, Types } from 'mongoose';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ timestamps: true, collection: 'tasks' })
class Task { @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true }) userId!: Types.ObjectId; @Prop({ required: true, trim: true, maxlength: 500 }) text!: string; @Prop({ default: false }) completed!: boolean; @Prop({ enum: ['high', 'medium', 'low'] }) priority?: string; }
const TaskSchema = SchemaFactory.createForClass(Task);
class TaskDto { @IsString() @MaxLength(500) text!: string; @IsOptional() @IsBoolean() completed?: boolean; @IsOptional() @IsIn(['high', 'medium', 'low']) priority?: string; }
@Injectable()
class TasksService { constructor(@InjectModel(Task.name) private readonly model: Model<Task>) {} findAll(userId: string) { return this.model.find({ userId }).sort({ createdAt: -1 }).lean().exec(); } create(userId: string, dto: TaskDto) { return this.model.create({ ...dto, userId }); } update(userId: string, id: string, dto: TaskDto) { return this.model.findOneAndUpdate({ _id: id, userId }, dto, { new: true, runValidators: true }).exec(); } remove(userId: string, id: string) { return this.model.deleteOne({ _id: id, userId }).exec(); } }
@Controller('tasks') @UseGuards(JwtAuthGuard)
class TasksController { constructor(private readonly service: TasksService) {} @Get() all(@CurrentUser() user: { sub: string }) { return this.service.findAll(user.sub); } @Post() create(@CurrentUser() user: { sub: string }, @Body() dto: TaskDto) { return this.service.create(user.sub, dto); } @Patch(':id') update(@CurrentUser() user: { sub: string }, @Param('id') id: string, @Body() dto: TaskDto) { return this.service.update(user.sub, id, dto); } @Delete(':id') remove(@CurrentUser() user: { sub: string }, @Param('id') id: string) { return this.service.remove(user.sub, id); } }
@Module({ imports: [MongooseModule.forFeature([{ name: Task.name, schema: TaskSchema }])], controllers: [TasksController], providers: [TasksService] }) export class TasksModule {}