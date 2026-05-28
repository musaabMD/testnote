export type AdminClerkUserRow = {
  id: string;
  email: string;
  name: string;
  createdAt: number;
  lastActiveAt: number | null;
  lastSignInAt: number | null;
  plan: string;
  subscriptionStatus: string;
  mrrUsd: number;
  lifetimePaidUsd: number;
  nextPaymentUsd: number;
};

export type AdminClerkSnapshot = {
  generatedAt: number;
  available: boolean;
  error?: string;
  totalUsers: number;
  activeUsers30d: number;
  paidUsers: number;
  freeUsers: number;
  monthlyRecurringRevenueUsd: number;
  lifetimeRevenueUsd: number;
  nextPaymentRevenueUsd: number;
  newUsers: {
    day: { count: number; pctChange: number };
    week: { count: number; pctChange: number };
    month: { count: number; pctChange: number };
  };
  activeUsers: {
    day: { count: number; pctChange: number };
    week: { count: number; pctChange: number };
    month: { count: number; pctChange: number };
  };
  planCounts: Array<{ plan: string; count: number }>;
  subscriptionStatusCounts: Array<{ status: string; count: number }>;
  users: AdminClerkUserRow[];
};
