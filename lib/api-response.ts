import type { ZodError } from "zod";

/**
 * The wire format for /api/mobile and /api/public.
 *
 * One shape for every failure — `{ error }`, plus `fieldErrors` on a validation
 * failure and `reason` when the client has to branch on the cause. It mirrors
 * the server-action states the web already returns, so the same validation
 * messages reach both front ends. See docs/API-CONTRACT.md §0.
 */

export type FieldErrors = Record<string, string>;

export type ApiErrorBody = {
  error: string;
  fieldErrors?: FieldErrors;
  /** Machine-readable cause, where the contract specifies one. */
  reason?: string;
  [key: string]: unknown;
};

/**
 * Thrown from anywhere inside a handler; `route()` turns it into a response.
 * Throwing rather than returning keeps the authorization helpers usable as
 * one-liners at the top of a handler, the way `requireMembership` reads in a
 * server component.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody;

  constructor(status: number, message: string, extra: Omit<ApiErrorBody, "error"> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = { error: message, ...extra };
  }

  toResponse(): Response {
    return Response.json(this.body, { status: this.status });
  }
}

export const badRequest = (message: string, extra?: Omit<ApiErrorBody, "error">) =>
  new ApiError(400, message, extra);

/** Missing, malformed, or expired credential. The app signs out on this. */
export const unauthorized = (message = "Sign in to continue.") =>
  new ApiError(401, message);

/**
 * Not a member, not a high enough role, the tenant is not ACTIVE, or there is no
 * such tenant.
 *
 * All four answer 403 with the same message *on purpose*. Distinguishing them —
 * or 404-ing the missing one, as the web deliberately does for a different
 * reason — would let anyone holding a token enumerate which organizations exist.
 */
export const forbidden = (message = "You don't have access to this organization.") =>
  new ApiError(403, message);

export const notFound = (message = "Not found.") => new ApiError(404, message);

export const conflict = (message: string, extra?: Omit<ApiErrorBody, "error">) =>
  new ApiError(409, message, extra);

export const tooManyRequests = (message: string) => new ApiError(429, message);

/**
 * Flatten a Zod error to one message per top-level field.
 *
 * First issue wins: the client renders a single message under each input, and
 * the first is the one that explains the value actually submitted.
 */
export function fieldErrorsFrom(error: ZodError): FieldErrors {
  const fields: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key !== "string" && typeof key !== "number") continue;
    const name = String(key);
    if (name in fields) continue;
    fields[name] = issue.message;
  }
  return fields;
}

/** A 400 carrying per-field messages, as the contract describes. */
export function validationFailed(error: ZodError, message = "Check the form and try again.") {
  return badRequest(message, { fieldErrors: fieldErrorsFrom(error) });
}

/** Parse a JSON body, treating anything unreadable as a validation failure. */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await request.json();
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw badRequest("Expected a JSON object.");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw badRequest("Expected a JSON object.");
  }
}

/**
 * Wrap a route handler so every thrown ApiError becomes its response, and
 * anything else becomes a 500 that says nothing about the failure.
 *
 * Without the catch-all, an unexpected throw inside a handler reaches the client
 * as Next's own error output — which, in development, is a stack trace.
 */
export function route<Ctx>(
  handler: (request: Request, context: Ctx) => Promise<Response>,
): (request: Request, context: Ctx) => Promise<Response> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      if (error instanceof ApiError) return error.toResponse();
      console.error("Unhandled error in API route", error);
      return Response.json({ error: "Something went wrong." }, { status: 500 });
    }
  };
}
