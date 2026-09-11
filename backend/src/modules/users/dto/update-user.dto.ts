import { IsOptional, IsString, MaxLength, MinLength, IsEmail } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  username?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3_000_000)
  photoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  theme?: string;
}