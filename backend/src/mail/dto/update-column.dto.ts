import { IsString, IsNotEmpty, Length, IsOptional } from 'class-validator';

export class UpdateColumnDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 100, { message: 'Column name must be between 1 and 100 characters' })
  name: string;

  @IsString()
  @IsOptional()
  @Length(7, 7, { message: 'Color must be a valid hex color (7 characters including #)' })
  color?: string;
}