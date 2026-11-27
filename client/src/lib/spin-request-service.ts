import { SpinRequest } from '@shared/schema';
import { apiRequest } from './queryClient';

export type SpinRequestWithDetails = SpinRequest & {
  childName?: string | null;
  consequenceText?: string | null;
};

export const spinRequestService = {
  /** Child: send the spin result (identified by its server-issued spin ID) for approval */
  async createSpinRequest(data: { spinId: string; description: string }): Promise<SpinRequest> {
    return apiRequest<SpinRequest>('POST', '/api/spinrequests', data);
  },

  /** Parent: pending requests from this parent's children */
  async getPendingRequests(): Promise<SpinRequestWithDetails[]> {
    return apiRequest<SpinRequestWithDetails[]>('GET', '/api/spinrequests/pending');
  },

  /** Child: own spin requests */
  async getMyRequests(): Promise<SpinRequest[]> {
    return apiRequest<SpinRequest[]>('GET', '/api/spinrequests/mine');
  },

  async approveRequest(id: number): Promise<SpinRequest> {
    return apiRequest<SpinRequest>('POST', `/api/spinrequests/${id}/approve`);
  },

  async rejectRequest(id: number): Promise<SpinRequest> {
    return apiRequest<SpinRequest>('POST', `/api/spinrequests/${id}/reject`);
  },
};
