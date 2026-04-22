import { z } from 'zod';

// ===== Primitivos =====

export const idSchema = z.string().cuid();

// RUT chileno (formato: 12345678-9 o 1234567-K)
export const rutSchema = z
  .string()
  .regex(/^\d{7,8}-[\dkK]$/, 'RUT inválido (formato: 12345678-9)');

// CLP como entero no negativo
export const clpAmountSchema = z.number().int().nonnegative();

// Email estándar
export const emailSchema = z.string().email();

// ===== Paginación =====

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export type Paginated<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

// ===== Tipos auxiliares =====

export type Id = z.infer<typeof idSchema>;
export type CLPAmount = z.infer<typeof clpAmountSchema>;
