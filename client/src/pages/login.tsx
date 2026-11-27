import { useState } from 'react';
import { useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { authService, UserWithoutPassword } from '@/lib/auth-service';
import { FamilyStarLogo } from '@/components/ui/family-star-logo';
import { Loader2 } from 'lucide-react';

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

const registerSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['parent', 'child']),
  parentCode: z.string().optional(),
  childProfileId: z.string().optional(),
  email: z.string().email('Invalid email').optional().nullable().or(z.literal('')),
  notifyOnSpin: z.boolean().optional().nullable(),
  notifyOnPending: z.boolean().optional().nullable(),
});

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const [showParentCodeField, setShowParentCodeField] = useState(false);
  const [unlinkedChildProfiles, setUnlinkedChildProfiles] = useState<any[]>([]);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const [selectedChildProfileId, setSelectedChildProfileId] = useState<string>('');
  const [parentCodeMessage, setParentCodeMessage] = useState<string>('');

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  });

  const registerForm = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: '',
      password: '',
      role: 'parent',
      parentCode: '',
      email: '',
      notifyOnSpin: true,
      notifyOnPending: true,
    },
  });

  // After login or signup, drop everything cached for the previous (or no) user.
  const startSession = (user: UserWithoutPassword) => {
    queryClient.clear();
    queryClient.setQueryData(['currentUser'], user);
    setLocation('/');
  };

  const handleRoleChange = (role: string) => {
    setShowParentCodeField(role === 'child');
    registerForm.setValue('role', role as 'parent' | 'child');
    setUnlinkedChildProfiles([]);
    setSelectedChildProfileId('');
    setParentCodeMessage('');
    registerForm.setValue('parentCode', '');
  };

  const handleParentCodeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const parentCode = e.target.value;
    registerForm.setValue('parentCode', parentCode);

    if (!parentCode.trim()) {
      setUnlinkedChildProfiles([]);
      setSelectedChildProfileId('');
      setParentCodeMessage('');
      return;
    }

    try {
      setIsLoadingProfiles(true);
      setParentCodeMessage('');
      const parentResponse = await fetch(`/api/auth/verify-parent-code?code=${encodeURIComponent(parentCode)}`);
      if (!parentResponse.ok) {
        setParentCodeMessage('✗ Invalid parent code');
        setUnlinkedChildProfiles([]);
        setSelectedChildProfileId('');
        return;
      }
      const parentData = await parentResponse.json();
      setUnlinkedChildProfiles(parentData.unlinkedChildProfiles || []);
      setParentCodeMessage(parentData.unlinkedChildProfiles?.length > 0
        ? `✓ Found ${parentData.unlinkedChildProfiles.length} available profile(s)`
        : '✓ Valid parent, but no unlinked profiles');
    } catch {
      setParentCodeMessage('Error verifying parent code');
      setUnlinkedChildProfiles([]);
    } finally {
      setIsLoadingProfiles(false);
    }
  };

  const loginMutation = useMutation({
    mutationFn: (data: z.infer<typeof loginSchema>) => authService.login(data.username, data.password),
    onSuccess: (user) => {
      toast({ title: "Login successful", description: "Welcome back!" });
      startSession(user);
    },
    onError: (error: any) => {
      toast({ title: "Login failed", description: error.message || "Invalid credentials", variant: "destructive" });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: z.infer<typeof registerSchema>) => {
      if (data.role === 'child') {
        if (!data.parentCode) throw new Error('Parent code is required for child accounts');
        if (!selectedChildProfileId) throw new Error('Please select a child profile');
        data.childProfileId = selectedChildProfileId;
      }
      return authService.register(data);
    },
    onSuccess: (user) => {
      toast({ title: "Registration successful", description: "Welcome to the app!" });
      startSession(user);
    },
    onError: (error: any) => {
      toast({ title: "Registration failed", description: error.message || "Registration failed", variant: "destructive" });
    },
  });

  const onLoginSubmit = (data: z.infer<typeof loginSchema>) => loginMutation.mutate(data);

  const onRegisterSubmit = (data: z.infer<typeof registerSchema>) => {
    if (data.role === 'child') {
      if (!selectedChildProfileId) {
        toast({
          title: "Profile required",
          description: "Please select a child profile to link your account to.",
          variant: "destructive",
        });
        return;
      }
      data.childProfileId = selectedChildProfileId;
    }
    registerMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
        <div className="text-center lg:text-left space-y-6">
          <div className="flex justify-center lg:justify-start">
            <FamilyStarLogo className="w-16 h-16" />
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold text-gray-900">
            Family Behavior
            <span className="block text-indigo-600">Tracker</span>
          </h1>
          <p className="text-xl text-gray-600 leading-relaxed">
            Transform behavior management into an engaging, gamified experience.
            Track good days, earn rewards, and build positive habits together.
          </p>
          <div className="space-y-4 text-left">
            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 bg-indigo-500 rounded-full mt-2"></div>
              <div>
                <h3 className="font-semibold text-gray-800">Interactive Spinning Wheel</h3>
                <p className="text-gray-600">Physics-based rewards and consequences system</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 bg-indigo-500 rounded-full mt-2"></div>
              <div>
                <h3 className="font-semibold text-gray-800">Real-time Notifications</h3>
                <p className="text-gray-600">Stay connected with instant updates and achievements</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 bg-indigo-500 rounded-full mt-2"></div>
              <div>
                <h3 className="font-semibold text-gray-800">Parent-Child Connection</h3>
                <p className="text-gray-600">Secure linking system with unique parent codes</p>
              </div>
            </div>
          </div>
        </div>

        <div className="w-full max-w-md mx-auto">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'login' | 'register')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <Card>
                <CardHeader>
                  <CardTitle>Welcome Back</CardTitle>
                  <CardDescription>Sign in to your account to continue</CardDescription>
                </CardHeader>
                <form onSubmit={loginForm.handleSubmit(onLoginSubmit)}>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-username">Username</Label>
                      <Input id="login-username" type="text" placeholder="Enter your username" {...loginForm.register('username')} />
                      {loginForm.formState.errors.username && (
                        <p className="text-sm text-red-600">{loginForm.formState.errors.username.message}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="login-password">Password</Label>
                      <Input id="login-password" type="password" placeholder="Enter your password" {...loginForm.register('password')} />
                      {loginForm.formState.errors.password && (
                        <p className="text-sm text-red-600">{loginForm.formState.errors.password.message}</p>
                      )}
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button type="submit" className="w-full" disabled={loginMutation.isPending} data-testid="button-login">
                      {loginMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Signing in...
                        </>
                      ) : (
                        'Sign In'
                      )}
                    </Button>
                  </CardFooter>
                </form>
              </Card>
            </TabsContent>

            <TabsContent value="register">
              <Card>
                <CardHeader>
                  <CardTitle>Create Account</CardTitle>
                  <CardDescription>Join the family behavior tracking system</CardDescription>
                </CardHeader>
                <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)}>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="register-username">Username</Label>
                      <Input id="register-username" type="text" placeholder="Choose a username" {...registerForm.register('username')} />
                      {registerForm.formState.errors.username && (
                        <p className="text-sm text-red-600">{registerForm.formState.errors.username.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="register-password">Password</Label>
                      <Input id="register-password" type="password" placeholder="Create a password" {...registerForm.register('password')} />
                      {registerForm.formState.errors.password && (
                        <p className="text-sm text-red-600">{registerForm.formState.errors.password.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="register-role">Account Type</Label>
                      <Select value={registerForm.watch('role')} onValueChange={handleRoleChange}>
                        <SelectTrigger id="register-role" data-testid="select-role">
                          <SelectValue placeholder="Select account type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="parent">Parent</SelectItem>
                          <SelectItem value="child">Child</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {showParentCodeField && (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="parent-code">Parent Code</Label>
                          <Input
                            id="parent-code"
                            type="text"
                            placeholder="Enter your parent's code"
                            onChange={handleParentCodeChange}
                          />
                          {isLoadingProfiles && (
                            <div className="flex items-center text-sm text-gray-500">
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Loading profiles...
                            </div>
                          )}
                          {parentCodeMessage && <p className="text-sm text-blue-600">{parentCodeMessage}</p>}
                        </div>

                        {unlinkedChildProfiles.length > 0 && (
                          <div className="space-y-2">
                            <Label htmlFor="child-profile">Select Your Profile</Label>
                            <Select value={selectedChildProfileId} onValueChange={setSelectedChildProfileId}>
                              <SelectTrigger id="child-profile" data-testid="select-child-profile">
                                <SelectValue placeholder="Choose your profile" />
                              </SelectTrigger>
                              <SelectContent>
                                {unlinkedChildProfiles.map((profile) => (
                                  <SelectItem key={profile.id} value={profile.id.toString()}>
                                    {profile.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="register-email">Email (Optional)</Label>
                      <Input id="register-email" type="email" placeholder="your@email.com" {...registerForm.register('email')} />
                      {registerForm.formState.errors.email && (
                        <p className="text-sm text-red-600">{registerForm.formState.errors.email.message}</p>
                      )}
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button type="submit" className="w-full" disabled={registerMutation.isPending} data-testid="button-register">
                      {registerMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating account...
                        </>
                      ) : (
                        'Create Account'
                      )}
                    </Button>
                  </CardFooter>
                </form>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
