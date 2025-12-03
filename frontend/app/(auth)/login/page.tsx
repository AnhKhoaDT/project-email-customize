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
import { useGoogleLoginMutation } from "@/hooks/useGoogleLoginMutation"
import { useGoogleLogin as useGoogleOAuth } from '@react-oauth/google'
import { Mail, Eye, EyeOff } from "lucide-react"
import { useState } from "react"

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
  const { loginWithGoogle, isLoading: isGoogleLoading, error: googleError } = useGoogleLoginMutation();
  const [googleCode, setGoogleCode] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

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

  // Google OAuth (client-side request for Authorization Code)
  const googleOAuth = useGoogleOAuth({
    flow: 'auth-code',
    scope: 'openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send',
    onSuccess: async (resp: any) => {
      try {
        const code = resp?.code;
        if (!code) throw new Error('No authorization code received from Google');
        // Save code to state for debugging/verification in dev
        setGoogleCode(code);
        await loginWithGoogle(code);
      } catch (err) {
        // error state is handled by the mutation hook; console for debugging
        console.error('Google login failed:', err);
      }
    },
    onError: (err: any) => {
      console.error('Google SDK error', err);
    }
  });

  // Google OAuth redirect handler
  // const handleGoogleLogin = () => {
  //   // Redirect to backend OAuth endpoint
  //   const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:5000';
  //   window.location.href = `${backendUrl}/auth/google`;
  // };

  const isAnyLoading = isLoading;
  const displayError = loginError;

  return (
    // THAY ĐỔI 1: Nền tổng thể chuyển sang gray-50 ở Light mode để tạo độ tương phản với Card trắng
    <div className="relative w-full min-h-screen flex flex-col items-center justify-center overflow-hidden bg-gray-50 dark:bg-zinc-950 transition-colors duration-300">

      {/* --- LỚP NỀN (BACKGROUND DECOR) --- */}
      <div className="absolute inset-0 z-0 h-full w-full">
        {/* THAY ĐỔI 2: Grid Pattern đậm hơn ở Light mode (#0000000p - độ trong suốt cao hơn) */}
        <div className="absolute h-full w-full bg-[linear-gradient(to_right,#00000008_1px,transparent_1px),linear-gradient(to_bottom,#00000008_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px]"></div>

        {/* THAY ĐỔI 3: Glow Effect - Light mode dùng màu Cyan/Blue đậm hơn một chút để thấy rõ trên nền trắng */}
        <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[350px] w-[350px] rounded-full bg-blue-400/20 blur-[80px] dark:bg-blue-600/20 dark:blur-[100px]"></div>
      </div>

      {/* --- HEADER --- */}
      <header className="absolute top-0 z-50 w-full">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="h-6 w-6 text-blue-600 dark:text-blue-500 align-middle" />
              {/* Text color tự động chuyển đổi */}
              <Link href="/" className="text-xl font-bold text-zinc-900 dark:text-zinc-50 leading-none">
                Email Customize
              </Link>
            </div>
          </div>
        </div>
      </header>



      {/* --- CARD LOGIN CHÍNH --- */}
      <div className="z-10 w-full px-4 flex justify-center">
        {/* THAY ĐỔI 4: Card Style
            - Light: bg-white (ko trong suốt) + shadow lớn để tách biệt hẳn với nền
            - Dark: bg-white/5 (trong suốt) + backdrop-blur
        */}
        <Card className="w-full max-w-md 
          bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] border-zinc-100 
          dark:bg-zinc-900/60 dark:backdrop-blur-xl dark:border-zinc-800 dark:shadow-2xl">

          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center text-zinc-900 dark:text-zinc-50">Login</CardTitle>
            <CardDescription className="text-center text-zinc-500 dark:text-zinc-400">
              Hi, Enter your email and password to access your account
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)}>
              {/* Error Alert */}
              {displayError && (
                <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-100 dark:bg-red-900/20 dark:border-red-800 flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
                  <p className="text-red-600 dark:text-red-400 text-sm font-medium">{displayError}</p>
                </div>
              )}

              <div className="flex flex-col gap-5">
                <div className="grid gap-2">
                  <Label htmlFor="email" className="text-zinc-700 dark:text-zinc-300">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@example.com"
                    {...register("email")}
                    disabled={isAnyLoading}
                    // Input ở Light mode cần border rõ hơn một chút
                    className="bg-zinc-50 border-zinc-200 focus:bg-white transition-all dark:bg-zinc-950/50 dark:border-zinc-800"
                    required
                  />
                  {errors.email && <p className="text-red-500 text-sm">{errors.email.message}</p>}
                </div>

                <div className="grid gap-2">
                  <div className="flex items-center">
                    <Label htmlFor="password" className="text-zinc-700 dark:text-zinc-300">Password</Label>
                    <a
                      href="#"
                      className="ml-auto text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
                    >
                      Forgot password?
                    </a>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      placeholder="••••••••"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      {...register("password")}
                      disabled={isAnyLoading}
                      className="bg-zinc-50 border-zinc-200 focus:bg-white transition-all dark:bg-zinc-950/50 dark:border-zinc-800 pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password && <p className="text-red-500 text-sm">{errors.password.message}</p>}
                </div>
              </div>

              <Button type="submit" className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm dark:shadow-blue-900/20" disabled={isAnyLoading}>
                {isLoading ? 'Logging in...' : 'Sign In'}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex-col gap-4 pt-0">
            <div className="relative w-full my-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-zinc-200 dark:border-zinc-800" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white dark:bg-zinc-900/60 px-2 text-zinc-400 dark:text-zinc-500">
                  Or continue with
                </span>
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50 dark:bg-transparent dark:text-zinc-300 dark:border-zinc-800 dark:hover:bg-zinc-800 transition-colors"
              disabled={isAnyLoading || isGoogleLoading}
              onClick={() => googleOAuth()}
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Google
            </Button>

            <div className="text-sm text-center">
              <span className="text-zinc-500 dark:text-zinc-400">Don&apos;t have an account? </span>
              <Link href="/register" className="text-blue-600 hover:text-blue-500 font-medium dark:text-blue-400 hover:underline">
                Register
              </Link>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
