import { User } from '@shared/schema';
import { apiRequest } from './queryClient';

export type LoginCredentials = {
  username: string;
  password: string;
};

export type RegisterData = {
  username: string;
  password: string;
  role?: 'parent' | 'child';
  parentCode?: string;
  childProfileId?: string;
  email?: string | null;
  notifyOnSpin?: boolean | null;
  notifyOnPending?: boolean | null;
};

export interface UserWithoutPassword extends Omit<User, 'password'> {}

// Login state lives in a server session cookie (stored in Postgres),
// so nothing needs to be kept in localStorage.
export const authService = {
  async register(data: RegisterData): Promise<UserWithoutPassword> {
    localStorage.removeItem('authToken');
    return apiRequest<UserWithoutPassword>('POST', '/api/auth/register', data);
  },

  async login(username: string, password: string): Promise<UserWithoutPassword> {
    localStorage.removeItem('authToken');
    return apiRequest<UserWithoutPassword>('POST', '/api/auth/login', { username, password });
  },

  async logout(): Promise<void> {
    await apiRequest('POST', '/api/auth/logout');
    localStorage.removeItem('authToken');
  },

  async getCurrentUser(): Promise<UserWithoutPassword | null> {
    try {
      return await apiRequest<UserWithoutPassword>('GET', '/api/auth/me');
    } catch (error) {
      if (error instanceof Error && error.message.includes('401')) {
        return null;
      }
      throw error;
    }
  },

  async isLoggedIn(): Promise<boolean> {
    try {
      return !!(await this.getCurrentUser());
    } catch {
      return false;
    }
  },

  async isParent(): Promise<boolean> {
    try {
      const user = await this.getCurrentUser();
      return !!user && user.role === 'parent';
    } catch {
      return false;
    }
  },

  async isChild(): Promise<boolean> {
    try {
      const user = await this.getCurrentUser();
      return !!user && user.role === 'child';
    } catch {
      return false;
    }
  },
};
