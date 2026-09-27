import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { jobsInApi } from "./jobs/jobs.constants";
import { startJobs } from "./jobs/start-jobs";
import { SyncServer } from "./sync/sync.server";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { toNodeHandler } from "better-auth/node";
import type { Express } from "express";
import { AppModule } from "./app.module";
import { getAuth } from "./auth/better-auth";

async function bootstrap() {
  const webUrl = process.env.WEB_URL ?? "http://localhost:3000";
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Above Express's 100kb default: a songbook catalogue file is imported as
  // JSON text (see ImportCatalogEntriesDto's own 10 MB cap).
  app.useBodyParser("json", { limit: "12mb" });

  // Registered via `app.enableCors()` rather than `NestFactory.create`'s
  // `cors` option: the option only takes effect once Nest actually
  // initializes (normally deferred until `app.listen()`), which would put
  // it AFTER the raw auth handler mounted below in Express's middleware
  // stack, so every OPTIONS preflight would hit BetterAuth first and 404
  // (better-call has no OPTIONS route). `enableCors()` instead registers
  // the `cors` middleware on the Express instance immediately, so it runs
  // before anything mounted after this line - including the auth handler.
  //
  // Explicit origin + credentials (not the `cors: true` shorthand) -
  // BetterAuth's session cookie is cross-origin (web and API are separate
  // apps/domains), and browsers only send/accept cookies on a cross-origin
  // request when Access-Control-Allow-Origin names the exact origin and
  // Access-Control-Allow-Credentials is true; a wildcard origin can't be
  // combined with credentials at all.
  app.enableCors({ origin: webUrl, credentials: true });

  // Mounted directly on the underlying Express app rather than as a Nest
  // controller: BetterAuth's handler wants to own the raw request/response
  // itself. It's compatible with Nest's own global body-parser running
  // first regardless of registration order here (better-call's Node
  // adapter falls back to re-serializing an already-parsed `req.body`),
  // and it never passes through JwtAuthGuard/GlobalAdminGuard (those are
  // registered as Nest's APP_GUARD, which only runs for Nest-routed
  // requests) - BetterAuth handles its own endpoint-level authorization.
  //
  // getAuth() is resolved per request, not once at boot: it rebuilds the
  // instance when Admin > Auth settings change (e.g. Google credentials),
  // and a handler bound to the boot-time instance would keep serving the
  // old config until a restart.
  const expressApp = app.getHttpAdapter().getInstance() as Express;
  expressApp.all("/api/auth/*", (req, res, next) => {
    getAuth()
      .then((auth) => toNodeHandler(auth)(req, res))
      .catch(next);
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle("Songverse API")
    .setDescription("Song library, arrangement, and performance API for Songverse.")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/docs", app, document);

  // Sync play's WebSocket (issue #13), on the same port.
  app.get(SyncServer).attach(app.getHttpServer());

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port);
  console.log(`Songverse API listening on :${port} (docs at /api/docs)`);
  // Background jobs are the Worker's (issue #92); the API runs them too only with JOBS_IN_API (by default, out of production).
  if (jobsInApi()) startJobs(app, "api");
}

void bootstrap();
