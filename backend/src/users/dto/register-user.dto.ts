export class RegisterUserDto {
  email: string;
  password: string;
  name?: string;
  phone?: string;
  address?: string;
  dateOfBirth?: string; // ISO date string
}
