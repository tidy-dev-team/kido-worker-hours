import { z } from 'zod';

// Throws a 400 error if validation fails, otherwise returns parsed (and defaulted) data
export function validate(schema, data) {
  const result = schema.safeParse(data || {});
  if (!result.success) {
    const message = result.error.errors
      .map(e => (e.path.length ? `${e.path.join('.')}: ` : '') + e.message)
      .join('; ');
    const err = new Error(message);
    err.statusCode = 400;
    throw err;
  }
  return result.data;
}

const monthKeyRe = /^\d{4}-\d{2}$/;

// ── Schemas ──────────────────────────────────────────────────────────────────

export const ClientCreateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'name is required'),
  type: z.enum(['retainer', 'project', 'internal']),
  active: z.boolean().optional().default(true),
  hoursBank: z.number().nullable().optional(),
  weeklyDay: z.union([z.array(z.number().int().min(0).max(6)), z.null()]).optional(),
});

export const ClientUpdateSchema = z.object({
  name: z.string().min(1, 'name is required'),
  type: z.enum(['retainer', 'project', 'internal']),
  active: z.boolean(),
  hoursBank: z.number().nullable().optional(),
  weeklyDay: z.union([z.array(z.number().int().min(0).max(6)), z.null()]).optional(),
});

export const HoursSchema = z.object({
  hours: z.number().min(0),
});

export const EmployeeCreateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'name is required'),
  role: z.string().optional().default(''),
  email: z.string().optional().default(''),
  slackWebhook: z.string().optional().default(''),
  scope: z.number().int().min(1).max(100).optional().default(100),
  visible: z.boolean().optional().default(true),
  preferredClients: z.array(z.string()).optional().default([]),
});

export const EmployeeUpdateSchema = z.object({
  name: z.string().min(1, 'name is required'),
  role: z.string().optional().default(''),
  email: z.string().optional().default(''),
  slackWebhook: z.string().optional().default(''),
  scope: z.number().int().min(1).max(100).optional().default(100),
  visible: z.boolean(),
  preferredClients: z.array(z.string()).optional().default([]),
});

export const MonthCreateSchema = z.object({
  monthKey: z.string().regex(monthKeyRe, 'monthKey must be YYYY-MM'),
  workDays: z.number().min(0).max(31).nullable().optional(),
  holidays: z.array(z.any()).optional().default([]),
});

export const MonthUpdateSchema = z.object({
  workDays: z.number().min(0).max(31).nullable().optional(),
  holidays: z.array(z.any()).optional().default([]),
});

export const VacationSchema = z.object({
  days: z.number().min(0),
});

export const MatrixBulkSchema = z.record(
  z.string(),
  z.record(z.string(), z.number().min(0))
);

export const MatrixCellSchema = z.object({
  hours: z.number().min(0),
});

export const WeeklyBulkSchema = z.record(
  z.string(),
  z.record(z.string(), z.array(z.string()))
);

export const WeeklyDaySchema = z.object({
  clientIds: z.array(z.string()),
});

export const InviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1, 'name is required'),
  role: z.enum(['admin', 'member']).optional().default('member'),
});

export const AcceptInviteSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, 'password must be at least 8 characters'),
});
