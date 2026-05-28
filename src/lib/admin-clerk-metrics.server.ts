import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import type { BillingMoneyAmount } from "@clerk/shared/types";
import type { BillingSubscription } from "@clerk/backend";
import type { User } from "@clerk/nextjs/server";

import type { AdminClerkSnapshot, AdminClerkUserRow } from "@/lib/admin-clerk-types";

const DAY_MS = 24 * 60 * 60 * 1000;
const CLERK_PAGE_SIZE = 100;
const MAX_CLERK_USERS_FOR_METRICS = 1000;

type BillingResult = {
  plan: string;
  status: string;
  mrrUsd: number;
  lifetimePaidUsd: number;
  nextPaymentUsd: number;
};

export async function getAdminClerkSnapshot(): Promise<AdminClerkSnapshot> {
  const generatedAt = Date.now();

  if (!process.env.CLERK_SECRET_KEY) {
    return unavailableSnapshot(generatedAt, "CLERK_SECRET_KEY is not configured.");
  }

  try {
    const client = await clerkClient();
    const { users, totalUsers } = await getClerkUsersForMetrics(client);
    const billingByUser = await getBillingByUser(users);
    const rows = users.map((user) => toUserRow(user, billingByUser.get(user.id)));
    const paidUsers = rows.filter((row) => isPaidStatus(row.subscriptionStatus)).length;

    return {
      generatedAt,
      available: true,
      totalUsers,
      activeUsers30d: countInCurrentWindow(users, (user) => user.lastActiveAt, generatedAt, 30),
      paidUsers,
      freeUsers: Math.max(0, totalUsers - paidUsers),
      monthlyRecurringRevenueUsd: sum(rows, (row) => row.mrrUsd),
      lifetimeRevenueUsd: sum(rows, (row) => row.lifetimePaidUsd),
      nextPaymentRevenueUsd: sum(rows, (row) => row.nextPaymentUsd),
      newUsers: {
        day: countWindow(users, (user) => user.createdAt, generatedAt, 1),
        week: countWindow(users, (user) => user.createdAt, generatedAt, 7),
        month: countWindow(users, (user) => user.createdAt, generatedAt, 30),
      },
      activeUsers: {
        day: countWindow(users, (user) => user.lastActiveAt, generatedAt, 1),
        week: countWindow(users, (user) => user.lastActiveAt, generatedAt, 7),
        month: countWindow(users, (user) => user.lastActiveAt, generatedAt, 30),
      },
      planCounts: countStrings(rows, (row) => row.plan).map(({ key, count }) => ({
        plan: key,
        count,
      })),
      subscriptionStatusCounts: countStrings(
        rows,
        (row) => row.subscriptionStatus,
      ).map(({ key, count }) => ({ status: key, count })),
      users: rows,
    };
  } catch (error) {
    return unavailableSnapshot(generatedAt, errorMessage(error));
  }
}

async function getClerkUsersForMetrics(client: Awaited<ReturnType<typeof clerkClient>>) {
  const users: User[] = [];
  let offset = 0;
  let totalUsers = 0;

  while (offset < MAX_CLERK_USERS_FOR_METRICS) {
    const page = await client.users.getUserList({
      limit: CLERK_PAGE_SIZE,
      offset,
      orderBy: "-created_at",
    });

    totalUsers = page.totalCount;
    users.push(...page.data);
    offset += page.data.length;

    if (page.data.length === 0 || users.length >= page.totalCount) break;
  }

  return { users, totalUsers };
}

async function getBillingByUser(users: User[]): Promise<Map<string, BillingResult>> {
  const client = await clerkClient();
  const entries = await Promise.all(
    users.map(async (user) => {
      try {
        const subscription = await client.billing.getUserBillingSubscription(user.id);
        return [user.id, normalizeBilling(subscription)] as const;
      } catch {
        return [user.id, freeBilling()] as const;
      }
    }),
  );

  return new Map(entries);
}

function toUserRow(user: User, billing = freeBilling()): AdminClerkUserRow {
  const email =
    user.emailAddresses.find((item) => item.id === user.primaryEmailAddressId)
      ?.emailAddress ??
    user.emailAddresses[0]?.emailAddress ??
    user.id;
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();

  return {
    id: user.id,
    email,
    name: name || user.username || email,
    createdAt: user.createdAt,
    lastActiveAt: user.lastActiveAt,
    lastSignInAt: user.lastSignInAt,
    plan: billing.plan,
    subscriptionStatus: billing.status,
    mrrUsd: billing.mrrUsd,
    lifetimePaidUsd: billing.lifetimePaidUsd,
    nextPaymentUsd: billing.nextPaymentUsd,
  };
}

function normalizeBilling(subscription: BillingSubscription): BillingResult {
  const activeItems = subscription.subscriptionItems.filter((item) =>
    isPaidStatus(item.status),
  );
  const primaryItem = activeItems[0] ?? subscription.subscriptionItems[0];
  const status = primaryItem?.status ?? subscription.status ?? "none";
  const plan = primaryItem?.plan?.slug ?? primaryItem?.plan?.name ?? "free";
  const subscriptionNextPaymentUsd = moneyToUsd(subscription.nextPayment?.amount);
  const itemNextPaymentUsd = sum(subscription.subscriptionItems, (item) =>
    typeof item.nextPayment?.amount === "number"
      ? minorUnitToUsd(item.nextPayment.amount)
      : 0,
  );

  return {
    plan,
    status,
    mrrUsd: sum(activeItems, (item) => {
      const amountUsd = moneyToUsd(item.amount);
      return item.planPeriod === "annual" ? amountUsd / 12 : amountUsd;
    }),
    lifetimePaidUsd: sum(subscription.subscriptionItems, (item) =>
      moneyToUsd(item.lifetimePaid),
    ),
    nextPaymentUsd:
      subscriptionNextPaymentUsd > 0 ? subscriptionNextPaymentUsd : itemNextPaymentUsd,
  };
}

function freeBilling(): BillingResult {
  return {
    plan: "free",
    status: "none",
    mrrUsd: 0,
    lifetimePaidUsd: 0,
    nextPaymentUsd: 0,
  };
}

function moneyToUsd(value: BillingMoneyAmount | null | undefined): number {
  if (!value || value.currency.toUpperCase() !== "USD") return 0;
  return minorUnitToUsd(value.amount);
}

function minorUnitToUsd(value: number): number {
  return value / 100;
}

function isPaidStatus(status: string): boolean {
  return status === "active" || status === "upcoming";
}

function countStrings<T>(rows: T[], getKey: (row: T) => string) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = getKey(row) || "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function countWindow<T>(
  rows: T[],
  getTimestamp: (row: T) => number | null,
  to: number,
  days: number,
) {
  const count = countInCurrentWindow(rows, getTimestamp, to, days);
  const previousCount = rows.filter((row) =>
    inPreviousWindow(getTimestamp(row), to, days),
  ).length;
  return {
    count,
    pctChange: percentChange(count, previousCount),
  };
}

function countInCurrentWindow<T>(
  rows: T[],
  getTimestamp: (row: T) => number | null,
  to: number,
  days: number,
): number {
  return rows.filter((row) => inWindow(getTimestamp(row), to, days)).length;
}

function inWindow(timestamp: number | null, to: number, days: number): boolean {
  return typeof timestamp === "number" && timestamp > to - days * DAY_MS && timestamp <= to;
}

function inPreviousWindow(timestamp: number | null, to: number, days: number): boolean {
  const windowMs = days * DAY_MS;
  return typeof timestamp === "number" && timestamp > to - 2 * windowMs && timestamp <= to - windowMs;
}

function percentChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function sum<T>(rows: T[], getValue: (row: T) => number | undefined): number {
  return rows.reduce((total, row) => total + (getValue(row) ?? 0), 0);
}

function unavailableSnapshot(generatedAt: number, error: string): AdminClerkSnapshot {
  return {
    generatedAt,
    available: false,
    error,
    totalUsers: 0,
    activeUsers30d: 0,
    paidUsers: 0,
    freeUsers: 0,
    monthlyRecurringRevenueUsd: 0,
    lifetimeRevenueUsd: 0,
    nextPaymentRevenueUsd: 0,
    newUsers: {
      day: { count: 0, pctChange: 0 },
      week: { count: 0, pctChange: 0 },
      month: { count: 0, pctChange: 0 },
    },
    activeUsers: {
      day: { count: 0, pctChange: 0 },
      week: { count: 0, pctChange: 0 },
      month: { count: 0, pctChange: 0 },
    },
    planCounts: [],
    subscriptionStatusCounts: [],
    users: [],
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unable to load Clerk metrics.";
}
