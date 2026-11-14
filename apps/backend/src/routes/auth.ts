import { Router, type Request, type Response } from "express"
import {
  IdParam,
  LoginInput,
  OTP_COOKIE,
  OtpVerifyInput,
  PasswordChangeInput,
  REGISTRATION_COOKIE,
  RegisterRequestInput,
  RegisterVerifyInput,
  SESSION_COOKIE,
  type Env,
} from "@casarenous/shared"
import type { Database } from "../db/client.js"
import { appendSetCookie, cookieName, readCookie, serializeCookie } from "../lib/cookies.js"
import { ApiError } from "../lib/errors.js"
import { asyncHandler, parseBody, parseParams } from "../lib/http.js"
import type { Mailer } from "../lib/mailer.js"
import { writeAudit } from "../lib/audit.js"
import type { RateLimiters } from "../middleware/rate-limit.js"
import { requireAuth, type AuthLocals } from "../middleware/require-auth.js"
import {
  changePassword,
  listSessions,
  login,
  revokeSession,
  verifyOtp,
} from "../services/auth.js"
import { resendOtp } from "../services/otp.js"
import {
  requestRegistration,
  resendRegistrationOtp,
  verifyRegistration,
} from "../services/registration.js"

export interface AuthRouteDeps {
  db: Database
  env: Env
  mailer: Mailer
  limiters: RateLimiters
}

export function authRouter({ db, env, mailer, limiters }: AuthRouteDeps): Router {
  const router = Router()
  const auth = requireAuth(db, env)
  const sessionCookie = cookieName(SESSION_COOKIE, env.NODE_ENV === "production")
  const otpCookie = cookieName(OTP_COOKIE, env.NODE_ENV === "production")
  const registrationCookie = cookieName(
    REGISTRATION_COOKIE,
    env.NODE_ENV === "production",
  )

  const context = (req: Request) => ({
    ip: req.ip ?? null,
    userAgent: req.header("user-agent")?.slice(0, 500) ?? null,
  })

  function setSessionCookie(res: Response, token: string) {
    appendSetCookie(
      res,
      serializeCookie(sessionCookie, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: env.COOKIE_SECURE,
        maxAgeSeconds: env.SESSION_TTL_SECONDS,
      }),
    )
  }

  function clearSessionCookie(res: Response) {
    appendSetCookie(
      res,
      serializeCookie(sessionCookie, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: env.COOKIE_SECURE,
        maxAgeSeconds: 0,
      }),
    )
  }

  function setOtpCookie(res: Response, token: string) {
    appendSetCookie(
      res,
      serializeCookie(otpCookie, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: env.COOKIE_SECURE,
        maxAgeSeconds: env.OTP_TTL_SECONDS,
      }),
    )
  }

  function clearOtpCookie(res: Response) {
    appendSetCookie(
      res,
      serializeCookie(otpCookie, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: env.COOKIE_SECURE,
        maxAgeSeconds: 0,
      }),
    )
  }

  function setRegistrationCookie(res: Response, token: string) {
    appendSetCookie(
      res,
      serializeCookie(registrationCookie, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: env.COOKIE_SECURE,
        maxAgeSeconds: env.OTP_TTL_SECONDS,
      }),
    )
  }

  function clearRegistrationCookie(res: Response) {
    appendSetCookie(
      res,
      serializeCookie(registrationCookie, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: env.COOKIE_SECURE,
        maxAgeSeconds: 0,
      }),
    )
  }

  router.post(
    "/login",
    limiters.login,
    asyncHandler(async (req, res) => {
      const input = parseBody(LoginInput, req.body)
      const result = await login(db, env, mailer, input, context(req))
      setOtpCookie(res, result.challengeToken)
      res.json({
        needsOtp: true,
        emailMasked: result.emailMasked,
        ...(result.devCode ? { devCode: result.devCode } : {}),
      })
    }),
  )

  router.post(
    "/otp",
    limiters.otp,
    asyncHandler(async (req, res) => {
      const challenge = readCookie(req.header("cookie"), otpCookie)
      if (!challenge) {
        throw ApiError.unauthorized("Session de connexion expirée, reconnecte-toi", "otp_expired")
      }
      const input = parseBody(OtpVerifyInput, req.body)
      const result = await verifyOtp(db, env, challenge, input.code, context(req))
      clearOtpCookie(res)
      setSessionCookie(res, result.token)
      res.json({ user: result.user })
    }),
  )

  router.post(
    "/otp/resend",
    limiters.otpResend,
    asyncHandler(async (req, res) => {
      const challenge = readCookie(req.header("cookie"), otpCookie)
      if (!challenge) {
        throw ApiError.unauthorized("Session de connexion expirée, reconnecte-toi", "otp_expired")
      }
      const result = await resendOtp(db, env, mailer, challenge, context(req))
      res.json({
        ok: true,
        retryAfterSeconds: result.retryAfterSeconds,
        ...(result.devCode ? { devCode: result.devCode } : {}),
      })
    }),
  )

  /* ── Inscription sur invitation + OTP ────────────────────────────────── */

  router.post(
    "/register",
    limiters.login,
    asyncHandler(async (req, res) => {
      const input = parseBody(RegisterRequestInput, req.body)
      const result = await requestRegistration(db, env, mailer, input, context(req))
      setRegistrationCookie(res, result.challengeToken)
      res.json({
        needsOtp: true,
        emailMasked: result.emailMasked,
        ...(result.devCode ? { devCode: result.devCode } : {}),
      })
    }),
  )

  router.post(
    "/register/otp",
    limiters.otp,
    asyncHandler(async (req, res) => {
      const challenge = readCookie(req.header("cookie"), registrationCookie)
      if (!challenge) {
        throw ApiError.unauthorized(
          "Inscription expirée, recommence avec ton invitation",
          "registration_expired",
        )
      }
      const input = parseBody(RegisterVerifyInput, req.body)
      const result = await verifyRegistration(db, env, challenge, input.code, context(req))
      clearRegistrationCookie(res)
      setSessionCookie(res, result.token)
      res.status(201).json({ user: result.user })
    }),
  )

  router.post(
    "/register/resend",
    limiters.otpResend,
    asyncHandler(async (req, res) => {
      const challenge = readCookie(req.header("cookie"), registrationCookie)
      if (!challenge) {
        throw ApiError.unauthorized(
          "Inscription expirée, recommence avec ton invitation",
          "registration_expired",
        )
      }
      const result = await resendRegistrationOtp(db, env, mailer, challenge, context(req))
      res.json({
        ok: true,
        retryAfterSeconds: result.retryAfterSeconds,
        ...(result.devCode ? { devCode: result.devCode } : {}),
      })
    }),
  )

  router.post(
    "/logout",
    auth,
    asyncHandler(async (req, res) => {
      const { user, sessionId } = res.locals.auth as AuthLocals
      await revokeSession(db, sessionId)
      await writeAudit(db, {
        actorId: user.id,
        action: "auth.logout",
        entity: "session",
        entityId: sessionId,
        ip: req.ip ?? null,
        userAgent: req.header("user-agent") ?? null,
      })
      clearSessionCookie(res)
      res.json({ ok: true })
    }),
  )

  router.get(
    "/me",
    auth,
    asyncHandler(async (_req, res) => {
      const { user } = res.locals.auth as AuthLocals
      res.json({ user })
    }),
  )

  router.post(
    "/password",
    auth,
    asyncHandler(async (req, res) => {
      const { user } = res.locals.auth as AuthLocals
      const input = parseBody(PasswordChangeInput, req.body)
      await changePassword(db, user.id, input.currentPassword, input.newPassword)
      await writeAudit(db, {
        actorId: user.id,
        action: "auth.password.changed",
        entity: "user",
        entityId: user.id,
        ip: req.ip ?? null,
        userAgent: req.header("user-agent") ?? null,
      })
      clearSessionCookie(res)
      res.json({ ok: true })
    }),
  )

  router.get(
    "/sessions",
    auth,
    asyncHandler(async (_req, res) => {
      const { user, sessionId } = res.locals.auth as AuthLocals
      res.json(await listSessions(db, user.id, sessionId))
    }),
  )

  router.delete(
    "/sessions/:id",
    auth,
    asyncHandler(async (req, res) => {
      const { id } = parseParams(IdParam, req.params)
      const { user, sessionId } = res.locals.auth as AuthLocals
      const items = await listSessions(db, user.id, sessionId)
      if (!items.some((item) => item.id === id)) {
        throw ApiError.notFound("Session introuvable", "session_not_found")
      }
      await revokeSession(db, id)
      if (id === sessionId) clearSessionCookie(res)
      await writeAudit(db, {
        actorId: user.id,
        action: "auth.session.revoked",
        entity: "session",
        entityId: id,
        ip: req.ip ?? null,
        userAgent: req.header("user-agent") ?? null,
      })
      res.json({ ok: true })
    }),
  )

  return router
}
