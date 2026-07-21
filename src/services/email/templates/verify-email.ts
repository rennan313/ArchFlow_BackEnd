export function verifyEmailTemplate(params: {
  name:       string
  verifyUrl:  string
  expiresIn:  string
}): { html: string; text: string } {
  const { name, verifyUrl, expiresIn } = params

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Confirme seu e-mail — Vincel Studio</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 16px;">
    <tr>
      <td align="center">

        <!-- Card -->
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#09090b;padding:32px 40px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="background:#7c3aed;border-radius:10px;width:36px;height:36px;text-align:center;vertical-align:middle;">
                          <span style="color:#ffffff;font-size:18px;font-weight:700;line-height:36px;">A</span>
                        </td>
                        <td style="padding-left:10px;">
                          <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.3px;">Vincel Studio</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">

              <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#09090b;letter-spacing:-0.4px;">
                Confirme seu e-mail
              </p>
              <p style="margin:0 0 28px;font-size:15px;color:#71717a;line-height:1.6;">
                Olá, <strong style="color:#3f3f46;">${name}</strong>. Confirme seu endereço de e-mail para ativar sua conta Vincel Studio.
              </p>

              <!-- Button -->
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="padding-bottom:28px;">
                    <a href="${verifyUrl}"
                       style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 28px;border-radius:10px;letter-spacing:-0.1px;">
                      Confirmar e-mail
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Link fallback -->
              <p style="margin:0 0 6px;font-size:13px;color:#a1a1aa;">
                Se o botão não funcionar, copie e cole o link abaixo no navegador:
              </p>
              <p style="margin:0 0 28px;font-size:12px;word-break:break-all;">
                <a href="${verifyUrl}" style="color:#7c3aed;text-decoration:none;">${verifyUrl}</a>
              </p>

              <!-- Divider -->
              <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
                <tr>
                  <td style="border-top:1px solid #f4f4f5;"></td>
                </tr>
              </table>

              <!-- Expiry warning -->
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="background:#fef9f0;border:1px solid #fed7aa;border-radius:8px;padding:14px 16px;">
                    <p style="margin:0;font-size:13px;color:#92400e;line-height:1.5;">
                      ⏳ Este link expira em <strong>${expiresIn}</strong>. Após esse prazo, você precisará solicitar um novo link de confirmação.
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Security notice -->
          <tr>
            <td style="background:#fafafa;padding:20px 40px;border-top:1px solid #f4f4f5;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;line-height:1.6;">
                Se você não criou uma conta na Vincel Studio, ignore este e-mail.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #f4f4f5;">
              <p style="margin:0;font-size:12px;color:#d4d4d8;text-align:center;">
                © ${new Date().getFullYear()} Vincel Studio · Todos os direitos reservados
              </p>
            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>

</body>
</html>`

  const text = `Confirme seu e-mail — Vincel Studio

Olá, ${name}.

Confirme seu endereço de e-mail para ativar sua conta Vincel Studio.

Clique no link abaixo para confirmar:
${verifyUrl}

Este link expira em ${expiresIn}.

Se você não criou uma conta na Vincel Studio, ignore este e-mail.

© ${new Date().getFullYear()} Vincel Studio`

  return { html, text }
}
