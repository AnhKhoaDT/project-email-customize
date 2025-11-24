"use client";

import { Button } from "@/components/ui/button";
import { useLogoutMutation } from "@/hooks/useLogoutMutation";
import { LogOut } from "lucide-react";

interface LogoutButtonProps {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  showIcon?: boolean;
}

export default function LogoutButton({ 
  variant = "outline", 
  size = "default",
  className = "",
  showIcon = true 
}: LogoutButtonProps) {
  const { logout, isLoading } = useLogoutMutation();

  return (
    <Button 
      variant={variant} 
      size={size}
      onClick={logout}
      disabled={isLoading}
      className={className}
    >
      {showIcon && <LogOut className="mr-2 h-4 w-4" />}
      {isLoading ? 'Logging out...' : 'Logout'}
    </Button>
  );
}
