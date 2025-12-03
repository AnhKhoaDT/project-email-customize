"use client"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import Link from "next/link"
import { useRegisterMutation } from "@/hooks/useRegisterMutation"
import { Mail } from "lucide-react"

// Define a schema for form validation
const registerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  birthday: z.string().optional(),
})

// Define the form data type based on the schema
type RegisterData = z.infer<typeof registerSchema>;

export default function Register() {
  const { register: registerUser, isLoading, error: registerError, success } = useRegisterMutation();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterData>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterData) => {
    try {
      const registerData = {
        ...data,
        birthday: data.birthday ? new Date(data.birthday) : undefined,
      };
      await registerUser(registerData);
    } catch (error) {
      // Error handled by hook
    }
  };

  return (
    // WRAPPER CHÍNH: Giữ nguyên cấu trúc background như trang Login
    <div className="relative w-full min-h-screen flex flex-col items-center justify-center overflow-hidden bg-gray-50 dark:bg-zinc-950 transition-colors duration-300">
      
      {/* --- LỚP NỀN (BACKGROUND DECOR) --- */}
      <div className="absolute inset-0 z-0 h-full w-full">
        {/* Grid Pattern */}
        <div className="absolute h-full w-full bg-[linear-gradient(to_right,#00000008_1px,transparent_1px),linear-gradient(to_bottom,#00000008_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        
        {/* Glow Effect */}
        <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[350px] w-[350px] rounded-full bg-blue-400/20 blur-[80px] dark:bg-blue-600/20 dark:blur-[100px]"></div>
      </div>

      {/* --- HEADER --- */}
      <header className="absolute top-0 z-50 w-full">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="h-6 w-6 text-blue-600 dark:text-blue-500 align-middle" />
              <Link href="/" className="text-xl font-bold text-zinc-900 dark:text-zinc-50 leading-none align-middle">
                Email Customize
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* --- CARD REGISTER --- */}
      <div className="z-10 w-full px-4 flex justify-center mt-10 mb-10">
        <Card className="w-full max-w-md bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] border-zinc-100 dark:bg-zinc-900/60 dark:backdrop-blur-xl dark:border-zinc-800 dark:shadow-2xl">
          
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center text-zinc-900 dark:text-zinc-50">Register</CardTitle>
            <CardDescription className="text-center text-zinc-500 dark:text-zinc-400">
              Hi, Enter your details to create an account
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)}>
              {/* Error Message */}
              {registerError && (
                <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-100 dark:bg-red-900/20 dark:border-red-800 flex items-center gap-2">
                   <div className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
                   <p className="text-red-600 dark:text-red-400 text-sm font-medium">{registerError}</p>
                </div>
              )}

              {/* Success Message */}
              {success && (
                <div className="mb-4 p-3 rounded-md bg-green-50 border border-green-100 dark:bg-green-900/20 dark:border-green-800 flex items-center gap-2">
                   <div className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
                   <p className="text-green-600 dark:text-green-400 text-sm font-medium">
                     Registration successful! Redirecting...
                   </p>
                </div>
              )}

              <div className="flex flex-col gap-5">
                {/* Name Input */}
                <div className="grid gap-2">
                  <Label htmlFor="name" className="text-zinc-700 dark:text-zinc-300">Name</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="John Doe"
                    {...register("name")}
                    disabled={isLoading || success}
                    className="bg-zinc-50 border-zinc-200 focus:bg-white transition-all dark:bg-zinc-950/50 dark:border-zinc-800"
                    required
                  />
                  {errors.name && <p className="text-red-500 text-sm">{errors.name.message}</p>}
                </div>

                {/* Email Input */}
                <div className="grid gap-2">
                  <Label htmlFor="email" className="text-zinc-700 dark:text-zinc-300">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@example.com"
                    {...register("email")}
                    disabled={isLoading || success}
                    className="bg-zinc-50 border-zinc-200 focus:bg-white transition-all dark:bg-zinc-950/50 dark:border-zinc-800"
                    required
                  />
                  {errors.email && <p className="text-red-500 text-sm">{errors.email.message}</p>}
                </div>

                {/* Password Input */}
                <div className="grid gap-2">
                  <Label htmlFor="password" className="text-zinc-700 dark:text-zinc-300">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    {...register("password")}
                    disabled={isLoading || success}
                    className="bg-zinc-50 border-zinc-200 focus:bg-white transition-all dark:bg-zinc-950/50 dark:border-zinc-800"
                    required
                  />
                  {errors.password && <p className="text-red-500 text-sm">{errors.password.message}</p>}
                </div>

                {/* Birthday Input */}
                <div className="grid gap-2">
                  <Label htmlFor="birthday" className="text-zinc-700 dark:text-zinc-300">Birthday</Label>
                  <Input
                    id="birthday"
                    type="date"
                    {...register("birthday")}
                    disabled={isLoading || success}
                    className="bg-zinc-50 border-zinc-200 focus:bg-white transition-all dark:bg-zinc-950/50 dark:border-zinc-800 block w-full"
                  />
                </div>
              </div>

              <Button type="submit" className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm dark:shadow-blue-900/20" disabled={isLoading || success}>
                {isLoading ? 'Creating account...' : 'Create Account'}
              </Button>
            </form>
          </CardContent>
          
          <CardFooter className="justify-center pt-0 pb-6">
            <div className="text-sm text-center">
              <span className="text-zinc-500 dark:text-zinc-400">Already have an account? </span>
              <Link href="/login" className="text-blue-600 hover:text-blue-500 font-medium dark:text-blue-400 hover:underline">
                Login
              </Link>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}