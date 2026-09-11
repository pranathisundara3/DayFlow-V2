import { Body, Controller, Delete, Injectable, Module, Post, UseGuards } from '@nestjs/common';
import { InjectModel, MongooseModule } from '@nestjs/mongoose';
import { IsObject, IsString, IsOptional } from 'class-validator';
import { Model, Types } from 'mongoose';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ timestamps: true, collection: 'push_subscriptions' }) export class PushSubscription { @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true }) userId!: Types.ObjectId; @Prop({ required: true, unique: true }) endpoint!: string; @Prop({ type: Object, required: true }) keys!: Record<string, string>; @Prop() expirationTime?: number; }
export const PushSubscriptionSchema = SchemaFactory.createForClass(PushSubscription); PushSubscriptionSchema.index({ userId: 1, endpoint: 1 }, { unique: true });
class PushSubscriptionDto { @IsString() endpoint!: string; @IsObject() keys!: Record<string, string>; @IsOptional() expirationTime?: number; }
@Injectable() class PushService { constructor(@InjectModel(PushSubscription.name) private readonly model: Model<PushSubscription>) {} save(userId: string, dto: PushSubscriptionDto) { return this.model.findOneAndUpdate({ userId, endpoint: dto.endpoint }, { ...dto, userId }, { upsert: true, new: true, runValidators: true }).lean().exec(); } remove(userId: string, endpoint: string) { return this.model.deleteOne({ userId, endpoint }).exec(); } }
@Controller('push') @UseGuards(JwtAuthGuard) class PushController { constructor(private readonly service: PushService) {} @Post('subscriptions') save(@CurrentUser() user: { sub: string }, @Body() dto: PushSubscriptionDto) { return this.service.save(user.sub, dto); } @Delete('subscriptions') remove(@CurrentUser() user: { sub: string }, @Body() dto: Pick<PushSubscriptionDto, 'endpoint'>) { return this.service.remove(user.sub, dto.endpoint); } @Post('test') test() { return { success: true, message: 'Push delivery will be wired to the web-push provider in the job implementation.' }; } }
@Module({ imports: [MongooseModule.forFeature([{ name: PushSubscription.name, schema: PushSubscriptionSchema }])], controllers: [PushController], providers: [PushService], exports: [PushService] }) export class PushModule {}