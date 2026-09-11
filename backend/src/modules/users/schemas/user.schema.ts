import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true, collection: 'users' })
export class User {
  // Optional + sparse: guest accounts have no email at all.
  @Prop({ unique: true, lowercase: true, trim: true, sparse: true })
  email?: string;

  @Prop({ required: true, trim: true, maxlength: 100 })
  username!: string;

  @Prop({ select: false })
  passwordHash?: string;

  @Prop()
  phoneNumber?: string;

  // Stores the avatar as a data: URI directly (no external object storage), so
  // this needs to comfortably fit a small compressed image.
  @Prop({ maxlength: 3_000_000 })
  photoUrl?: string;

  @Prop()
  theme?: string;

  @Prop({ default: false })
  isAnonymous!: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);