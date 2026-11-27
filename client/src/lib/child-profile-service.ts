import { apiRequest } from "@/lib/queryClient";
import { ChildProfile, PendingConsequence, GoodDayLog } from "@shared/schema";

export const childProfileService = {
  async getAllChildProfiles(): Promise<ChildProfile[]> {
    return apiRequest<ChildProfile[]>('GET', '/api/children');
  },

  async getChildProfileById(id: number): Promise<ChildProfile> {
    return apiRequest<ChildProfile>('GET', `/api/children/${id}`);
  },

  async createChildProfile(profile: {
    name: string;
    avatar?: string;
    userId?: number;
  }): Promise<ChildProfile> {
    return apiRequest<ChildProfile>('POST', '/api/children', profile);
  },

  async updateChildProfile(id: number, profile: {
    name?: string;
    avatar?: string;
  }): Promise<ChildProfile> {
    return apiRequest<ChildProfile>('PUT', `/api/children/${id}`, profile);
  },

  async deleteChildProfile(id: number): Promise<void> {
    await apiRequest('DELETE', `/api/children/${id}`);
  },

  async getChildPendingConsequences(childId: number): Promise<PendingConsequence[]> {
    return apiRequest<PendingConsequence[]>('GET', `/api/children/${childId}/pending`);
  },

  async recordGoodDay(childId: number, skipNotifications: boolean = false): Promise<{log: GoodDayLog, child: ChildProfile, skipNotifications?: boolean, message?: string}> {
    const endpoint = skipNotifications
      ? `/api/children/${childId}/goodday?skipNotifications=true`
      : `/api/children/${childId}/goodday`;
    return apiRequest('POST', endpoint);
  },

  async recordBadSpin(childId: number): Promise<ChildProfile> {
    return apiRequest<ChildProfile>('POST', `/api/children/${childId}/badspin`);
  },

  async getGoodDayLogs(childId: number): Promise<GoodDayLog[]> {
    return apiRequest<GoodDayLog[]>('GET', `/api/children/${childId}/gooddays`);
  },

  async resetEarnedSpins(childId: number): Promise<ChildProfile> {
    return apiRequest<ChildProfile>('POST', `/api/children/${childId}/reset-spins`);
  },

  async updateStatistics(childId: number, data: {
    goodDayCount?: number;
    earnedSpins?: number;
    createdAt?: string;
    lastBadSpinDate?: string;
    lastGoodSpinDate?: string;
  }): Promise<ChildProfile> {
    return apiRequest<ChildProfile>('PUT', `/api/children/${childId}/statistics`, data);
  }
};
