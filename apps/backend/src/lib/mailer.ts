import nodemailer, { type Transporter } from "nodemailer"
import type { Logger } from "pino"
import type { Env } from "@casarenous/shared"

export interface OtpMailInput {
  to: string
  code: string
  displayName: string
  purpose: "login" | "password" | "register"
}

export interface InvitationMailInput {
  to: string
  displayName: string
  code: string
  role: "admin" | "invites"
  expiresAt: Date
}

export interface Mailer {
  sendOtp(input: OtpMailInput): Promise<void>
  sendInvitation(input: InvitationMailInput): Promise<void>
}

function otpSubject(input: OtpMailInput): string {
  return input.purpose === "register"
    ? "Votre code de création de compte CasaRenous"
    : "Votre code de connexion CasaRenous"
}

function otpText(input: OtpMailInput): string {
  const intro =
    input.purpose === "register"
      ? "Votre code pour créer votre compte CasaRenous est :"
      : "Votre code de connexion CasaRenous est :"
  return [
    `Bonjour ${input.displayName},`,
    "",
    intro,
    input.code,
    "",
    "Ce code est valable 10 minutes et ne peut être utilisé qu'une seule fois.",
    "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
    "",
    "— CasaRenous",
  ].join("\n")
}

function invitationText(input: InvitationMailInput, origin: string): string {
  return [
    `Bonjour ${input.displayName},`,
    "",
    "Vous êtes invité(e) à rejoindre CasaRenous, le carnet de chantier privé de la maison Sévin–Renous.",
    "",
    `Votre code d'invitation est : ${input.code}`,
    "",
    `Ouvrez ${origin}, choisissez « J'ai une invitation », puis renseignez :`,
    `- votre adresse email : ${input.to}`,
    `- votre nom : ${input.displayName}`,
    `- ce code d'invitation`,
    "- un mot de passe de 12 caractères minimum.",
    "",
    `Le code est valable jusqu'au ${input.expiresAt.toLocaleDateString("fr-FR")}.`,
    input.role === "admin"
      ? "Votre compte aura les droits d'administration."
      : "Votre compte aura un accès invité (lecture + journal, photos, réserves).",
    "",
    "— CasaRenous",
  ].join("\n")
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function createMailer(env: Env, logger: Logger): Mailer {
  if (env.MAIL_TRANSPORT === "console") {
    return {
      async sendOtp(input) {
        logger.warn(
          {
            to: input.to,
            purpose: input.purpose,
            devCode: input.code,
          },
          "[mailer:console] code OTP (développement uniquement)",
        )
      },
      async sendInvitation(input) {
        logger.warn(
          {
            to: input.to,
            role: input.role,
            expiresAt: input.expiresAt.toISOString(),
            devCode: input.code,
          },
          "[mailer:console] invitation (développement uniquement)",
        )
      },
    }
  }

  const transport: Transporter = nodemailer.createTransport(env.SMTP_URL)
  return {
    async sendOtp(input) {
      await transport.sendMail({
        from: env.MAIL_FROM,
        to: input.to,
        subject: otpSubject(input),
        text: otpText(input),
        html: `<p>Bonjour ${escapeHtml(input.displayName)},</p>
<p>${input.purpose === "register" ? "Votre code pour créer votre compte CasaRenous est :" : "Votre code de connexion CasaRenous est :"}</p>
<p style="font-size:28px;letter-spacing:6px;font-weight:700">${input.code}</p>
<p>Ce code est valable 10 minutes et ne peut être utilisé qu'une seule fois.</p>
<p>Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>
<p>— CasaRenous</p>`,
      })
    },
    async sendInvitation(input) {
      const text = invitationText(input, env.APP_ORIGIN)
      await transport.sendMail({
        from: env.MAIL_FROM,
        to: input.to,
        subject: "Votre invitation CasaRenous",
        text,
        html: text
          .split("\n")
          .map((line) => (line ? `<p>${escapeHtml(line)}</p>` : ""))
          .join(""),
      })
    },
  }
}
