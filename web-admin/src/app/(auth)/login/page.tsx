'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Phone, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { login, error, clearError } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    clearError();
    setIsSubmitting(true);
    try {
      await login(data.username, data.password);
      router.push('/');
    } catch {
      // Error is handled by the store
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden bg-background">
      {/* Background Image */}
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: 'url(/login-bg.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />

      {/* Gradient Overlay for readability */}
      <div className="absolute inset-0 z-0 bg-black/40 backdrop-blur-[1px]" />

      <Card className="relative z-10 w-full max-w-md border-white/20 bg-white/70 dark:bg-black/40 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in duration-500 hover:shadow-primary/20 hover:border-primary/30 transition-all">
        <CardHeader className="space-y-4 text-center pb-2">
          <div className="mx-auto w-40 h-40 relative group cursor-pointer">
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl group-hover:blur-2xl transition-all duration-500" />
            <div className="relative w-full h-full overflow-hidden rounded-2xl shadow-lg transform group-hover:scale-105 transition-transform duration-300">
              <Image
                src="/login.gif"
                alt="BotPbx"
                fill
                className="object-contain"
                unoptimized
              />
            </div>
          </div>
          <div>
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
              BotPbx
            </CardTitle>
            <CardDescription className="mt-2 text-lg font-medium text-foreground/80">
              Enterprise VoIP Administration
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="pt-4">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 rounded-lg animate-in slide-in-from-top-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter your username"
                  autoComplete="username"
                  className="bg-background/50 border-input/50 focus:bg-background transition-colors"
                  error={!!errors.username}
                  {...register('username')}
                />
                {errors.username && (
                  <p className="text-xs text-destructive">{errors.username.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    className="pr-10 bg-background/50 border-input/50 focus:bg-background transition-colors"
                    error={!!errors.password}
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-destructive">{errors.password.message}</p>
                )}
              </div>
            </div>

            <Button
              type="submit"
              className="w-full text-lg font-semibold shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all duration-300"
              size="lg"
              loading={isSubmitting}
            >
              Sign In
            </Button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-xs text-muted-foreground/60">
              BotPbx Admin Panel v1.0
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Decorative footer gradient */}
      <div className="fixed bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent pointer-events-none" />
    </div>
  );
}
