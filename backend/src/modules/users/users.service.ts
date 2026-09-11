import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserDocument } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly userModel: Model<UserDocument>) {}

  async findById(id: string): Promise<UserDocument> {
    const user = await this.userModel.findById(id).exec();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  findByEmail(email: string) {
    return this.userModel.findOne({ email: email.toLowerCase() }).select('+passwordHash').exec();
  }

  async findByIdWithPassword(id: string): Promise<UserDocument> {
    const user = await this.userModel.findById(id).select('+passwordHash').exec();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updatePasswordHash(id: string, passwordHash: string) {
    const user = await this.userModel.findByIdAndUpdate(new Types.ObjectId(id), { passwordHash }, { new: true }).exec();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  create(data: Pick<User, 'email' | 'username' | 'passwordHash' | 'isAnonymous'>) {
    return this.userModel.create(data);
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.userModel.findByIdAndUpdate(new Types.ObjectId(id), dto, { new: true, runValidators: true }).exec();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  toPublic(user: UserDocument) {
    return { id: user._id.toString(), email: user.email, username: user.username, phoneNumber: user.phoneNumber, photoUrl: user.photoUrl, theme: user.theme, isAnonymous: user.isAnonymous };
  }
}