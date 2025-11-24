import Link from "next/link";
import { Mail, Shield, Zap, Users, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import ThemeSwitcher from "@/components/theme-switcher";

export default function Welcome() {
  return (
    <div className="min-h-screen bg-linear-to-b from-zinc-50 to-white dark:from-zinc-950 dark:to-zinc-900">
      {/* Header / Navigation */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="h-6 w-6 text-blue-600 dark:text-blue-500" />
              <span className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
                Email Customize
              </span>
            </div>
            <div className="flex items-center gap-4">
              <ThemeSwitcher />
              <Link href="/login">
                <Button variant="outline" size="sm">
                  Sign in
                </Button>
              </Link>
              <Link href="/register">
                <Button size="sm" className="hidden sm:flex">
                  Sign up
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16 md:pt-32 md:pb-24">
        <div className="flex flex-col items-center text-center gap-8 max-w-4xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
            <Zap className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
              AI-Powered Email Management
            </span>
          </div>

          {/* Main Heading */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Email Management
            <span className="block text-blue-600 dark:text-blue-500 mt-2">
              Made Simple
            </span>
          </h1>

          {/* Description */}
          <p className="text-lg sm:text-xl text-zinc-600 dark:text-zinc-400 max-w-2xl leading-relaxed">
            Organize, customize, and manage your emails with our powerful dashboard. 
            Built with modern technology to save you time and boost productivity.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 mt-4">
            <Link href="/login">
              <Button size="lg" className="text-base px-8">
                Get Started
              </Button>
            </Link>
          </div>

        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-zinc-900 dark:text-zinc-50 mb-4">
            Everything you need to manage emails
          </h2>
          <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">
            Powerful features to help you organize, customize, and streamline your email workflow.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {/* Feature 1 */}
          <div className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:shadow-lg transition-shadow">
            <div className="h-12 w-12 rounded-lg bg-blue-100 dark:bg-blue-950/30 flex items-center justify-center mb-4">
              <Mail className="h-6 w-6 text-blue-600 dark:text-blue-500" />
            </div>
            <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
              Smart Inbox
            </h3>
            <p className="text-zinc-600 dark:text-zinc-400">
              Organize your emails with intelligent folders, filters, and custom labels for better productivity.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:shadow-lg transition-shadow">
            <div className="h-12 w-12 rounded-lg bg-green-100 dark:bg-green-950/30 flex items-center justify-center mb-4">
              <Shield className="h-6 w-6 text-green-600 dark:text-green-500" />
            </div>
            <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
              Secure Authentication
            </h3>
            <p className="text-zinc-600 dark:text-zinc-400">
              Login with email/password or Google Sign-In. Your data is protected with enterprise-grade security.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:shadow-lg transition-shadow">
            <div className="h-12 w-12 rounded-lg bg-purple-100 dark:bg-purple-950/30 flex items-center justify-center mb-4">
              <Zap className="h-6 w-6 text-purple-600 dark:text-purple-500" />
            </div>
            <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
              Lightning Fast
            </h3>
            <p className="text-zinc-600 dark:text-zinc-400">
              Built with Next.js 16 for blazing-fast performance and seamless user experience.
            </p>
          </div>

          {/* Feature 4 */}
          <div className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:shadow-lg transition-shadow">
            <div className="h-12 w-12 rounded-lg bg-orange-100 dark:bg-orange-950/30 flex items-center justify-center mb-4">
              <Users className="h-6 w-6 text-orange-600 dark:text-orange-500" />
            </div>
            <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
              Collaboration
            </h3>
            <p className="text-zinc-600 dark:text-zinc-400">
              Share and collaborate on emails with your team members efficiently.
            </p>
          </div>

          {/* Feature 5 */}
          <div className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:shadow-lg transition-shadow">
            <div className="h-12 w-12 rounded-lg bg-pink-100 dark:bg-pink-950/30 flex items-center justify-center mb-4">
              <svg className="h-6 w-6 text-pink-600 dark:text-pink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
              Customizable
            </h3>
            <p className="text-zinc-600 dark:text-zinc-400">
              Personalize your email dashboard with themes, layouts, and custom settings.
            </p>
          </div>

          {/* Feature 6 */}
          <div className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:shadow-lg transition-shadow">
            <div className="h-12 w-12 rounded-lg bg-indigo-100 dark:bg-indigo-950/30 flex items-center justify-center mb-4">
              <svg className="h-6 w-6 text-indigo-600 dark:text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
              Responsive Design
            </h3>
            <p className="text-zinc-600 dark:text-zinc-400">
              Works seamlessly on desktop, tablet, and mobile devices with adaptive layouts.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-blue-600 dark:text-blue-500" />
              <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                Email Customize
              </span>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              © 2025 Email Customize. All rights reserved.
            </p>
            <div className="flex gap-6 text-sm text-zinc-600 dark:text-zinc-400">
              <a href="#" className="hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors">
                Privacy
              </a>
              <a href="#" className="hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors">
                Terms
              </a>
              <a href="#" className="hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors">
                Contact
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
