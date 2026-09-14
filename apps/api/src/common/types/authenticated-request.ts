import type { Request } from "express";

export interface AuthenticatedUser {
  id: string;
  email: string;
  isGlobalAdmin: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}
