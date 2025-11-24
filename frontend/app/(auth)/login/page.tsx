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
import { useLoginMutation } from "@/hooks/useLoginMutation"

// Define a schema for form validation
const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
})

// Define the form data type based on the schema
type LoginData = z.infer<typeof loginSchema>;

export default function Login() {
  // Use custom hook for login logic
  const { login, isLoading, error: loginError } = useLoginMutation();

  // Set up the form with react-hook-form and zod validation
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginData>({
    resolver: zodResolver(loginSchema),
  });

  // Define the form submission handler
  const onSubmit = async (data: LoginData) => {
    try {
      await login(data);
      // Navigation handled by hook
    } catch (error) {
      // Error handled by hook
    }
  };

  return (
    <div className="flex w-full min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-zinc-900">
      <div></div>

      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Login to your account</CardTitle>
          <CardDescription>
            Enter your email below to login to your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)}>
            {/* Server Error Message */}
            {loginError && (
              <div className="mb-4 p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p className="text-red-600 dark:text-red-400 text-sm">{loginError}</p>
              </div>
            )}
            
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="abc@example.com"
                  {...register("email")}
                  disabled={isLoading}
                  required
                />
                {errors.email && <p className="text-red-500 text-sm">{errors.email.message}</p>}
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="password">Password</Label>
                </div>
                <Input 
                  id="password" 
                  type="password" 
                  placeholder="your password" 
                  {...register("password")} 
                  disabled={isLoading}
                  required 
                />
                {errors.password && <p className="text-red-500 text-sm">{errors.password.message}</p>}
                <a
                  href="#"
                  className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                >
                  Forgot your password?
                </a>
              </div>
            </div>
            <Button type="submit" className="w-full mt-4" disabled={isLoading}>
              {isLoading ? 'Logging in...' : 'Login'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex-col gap-2">
          <Button variant="outline" className="w-full" disabled={isLoading}>
            Login with Google
          </Button>
          <div className="text-sm text-muted-foreground">
            <Button variant="link" asChild>
              <Link href="/register">Don&apos;t have an account yet? Sign Up</Link>
            </Button>
          </div>
        </CardFooter>
      </Card>

    </div>

  );
}
