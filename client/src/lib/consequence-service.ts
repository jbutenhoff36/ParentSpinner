import { apiRequest } from "@/lib/queryClient";
import { Consequence, PendingConsequence } from "@shared/schema";

export const consequenceService = {
  async getAllConsequences(): Promise<Consequence[]> {
    return apiRequest<Consequence[]>('GET', '/api/consequences');
  },

  async getConsequencesByType(type: string): Promise<Consequence[]> {
    return apiRequest<Consequence[]>('GET', `/api/consequences?type=${type}`);
  },

  async createConsequence(consequence: Omit<Consequence, 'id'>): Promise<Consequence> {
    return apiRequest<Consequence>('POST', '/api/consequences', consequence);
  },

  async updateConsequence(id: number, consequence: Partial<Consequence>): Promise<Consequence> {
    return apiRequest<Consequence>('PUT', `/api/consequences/${id}`, consequence);
  },

  async deleteConsequence(id: number): Promise<void> {
    await apiRequest('DELETE', `/api/consequences/${id}`);
  },

  async getPendingConsequences(): Promise<PendingConsequence[]> {
    return apiRequest<PendingConsequence[]>('GET', '/api/pending');
  },

  async addToPending(consequence: Consequence): Promise<PendingConsequence> {
    return apiRequest<PendingConsequence>('POST', '/api/pending', {
      consequenceId: consequence.id,
      text: consequence.text,
      type: consequence.type,
      section: consequence.section,
      userId: consequence.userId
    });
  },

  async completePendingConsequence(id: number): Promise<void> {
    await apiRequest('POST', `/api/pending/${id}/complete`, {});
  },

  async deletePendingConsequence(id: number): Promise<void> {
    await apiRequest('DELETE', `/api/pending/${id}`);
  },

  async clearAllPendingConsequences(): Promise<void> {
    await apiRequest('DELETE', '/api/pending');
  },

  async getConfiguration(): Promise<any> {
    return apiRequest<any>('GET', '/api/config');
  },

  async saveConfiguration(config: any): Promise<any> {
    return apiRequest<any>('POST', '/api/config', config);
  }
};
