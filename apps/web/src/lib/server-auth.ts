import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { prisma } from "@songverse/db";
import { auth } from "./auth";

export interface AppSession {
  userId: string;
  email: string;
  displayName: string;
  isGlobalAdmin: boolean;
}

async function loadSession(): Promise<AppSession | null> {
  const session = await auth.api.getSession({ headers: getRequest().headers });
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, displayName: true, isGlobalAdmin: true },
  });
  if (!user) return null;

  return {
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    isGlobalAdmin: user.isGlobalAdmin,
  };
}

/** Returns the current session, or null when signed out. Safe to call anywhere. */
export const getSession = createServerFn({ method: "GET" }).handler(loadSession);

/** Throws if the caller isn't authenticated; otherwise returns a typed session. */
export const ensureSession = createServerFn({ method: "GET" }).handler(async () => {
  const session = await loadSession();
  if (!session) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return session;
});

/** Mints a short-lived JWT for the current session, for calling the NestJS API. */
export const getApiToken = createServerFn({ method: "GET" }).handler(async () => {
  const headers = getRequest().headers;
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  const { token } = await auth.api.getToken({ headers });
  return token;
});

export const ensureTeamMember = createServerFn({ method: "GET" })
  .validator((teamId: string) => teamId)
  .handler(async ({ data: teamId }) => {
    const session = await loadSession();
    if (!session) throw new Response("Unauthorized", { status: 401 });
    if (session.isGlobalAdmin) return session;

    const membership = await prisma.teamMembership.findUnique({
      where: { teamId_userId: { teamId, userId: session.userId } },
    });
    if (!membership) throw new Response("Forbidden: not a member of this team", { status: 403 });
    return session;
  });

export const ensureTeamAdmin = createServerFn({ method: "GET" })
  .validator((teamId: string) => teamId)
  .handler(async ({ data: teamId }) => {
    const session = await loadSession();
    if (!session) throw new Response("Unauthorized", { status: 401 });
    if (session.isGlobalAdmin) return session;

    const membership = await prisma.teamMembership.findUnique({
      where: { teamId_userId: { teamId, userId: session.userId } },
    });
    if (!membership || membership.role !== "ADMIN") {
      throw new Response("Forbidden: team admin role required", { status: 403 });
    }
    return session;
  });

export const ensureGlobalAdmin = createServerFn({ method: "GET" }).handler(async () => {
  const session = await loadSession();
  if (!session) throw new Response("Unauthorized", { status: 401 });
  if (!session.isGlobalAdmin) throw new Response("Forbidden: global admin role required", { status: 403 });
  return session;
});
