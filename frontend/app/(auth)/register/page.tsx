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

// Define a schema for form validation
const registerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  birthday: z.string().optional(), // Assuming date as string for now
})

// Define the form data type based on the schema
type RegisterData = z.infer<typeof registerSchema>;

export default function Register() {
  // Use custom hook for register logic
  const { register: registerUser, isLoading, error: registerError, success } = useRegisterMutation();

  // Set up the form with react-hook-form and zod validation
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterData>({
    resolver: zodResolver(registerSchema),
  });

  // Define the form submission handler
  const onSubmit = async (data: RegisterData) => {
    try {
      // Convert birthday string to Date if provided
      const registerData = {
        ...data,
        birthday: data.birthday ? new Date(data.birthday) : undefined,
      };
      
      await registerUser(registerData);
      // Navigation handled by hook after 2 seconds
    } catch (error) {
      // Error handled by hook
    }
  };

  return (
    <div className="flex w-full min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-zinc-900">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create an account</CardTitle>
          <CardDescription>
            Enter your details below to create your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)}>
            {/* Error Message */}
            {registerError && (
              <div className="mb-4 p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p className="text-red-600 dark:text-red-400 text-sm">{registerError}</p>
              </div>
            )}
            
            {/* Success Message */}
            {success && (
              <div className="mb-4 p-3 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                <p className="text-green-600 dark:text-green-400 text-sm">
                  Registration successful! Redirecting to login...
                </p>
              </div>
            )}
            
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="your name"
                  {...register("name")}
                  disabled={isLoading || success}
                  required
                />
                {errors.name && <p className="text-red-500 text-sm">{errors.name.message}</p>}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="abc@example.com"
                  {...register("email")}
                  disabled={isLoading || success}
                  required
                />
                {errors.email && <p className="text-red-500 text-sm">{errors.email.message}</p>}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input 
                  id="password" 
                  type="password" 
                  placeholder="your password" 
                  {...register("password")} 
                  disabled={isLoading || success}
                  required 
                />
                {errors.password && <p className="text-red-500 text-sm">{errors.password.message}</p>}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="birthday">Birthday (Optional)</Label>
                <Input 
                  id="birthday" 
                  type="date" 
                  {...register("birthday")} 
                  disabled={isLoading || success}
                />
              </div>
            </div>
            <Button type="submit" className="w-full mt-4" disabled={isLoading || success}>
              {isLoading ? 'Creating account...' : 'Register'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <Button variant="link" asChild>
            <Link href="/login">Already have an account? Login</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
