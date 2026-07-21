export function demoRequestTemplate(params: {
  name:    string
  email:   string
  company: string
  phone?:  string
  message?: string
}): { html: string; text: string } {
  const { name, email, company, phone, message } = params

  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:6px 0;font-size:13px;color:#a1a1aa;width:120px;vertical-align:top;">${label}</td>
      <td style="padding:6px 0;font-size:14px;color:#09090b;">${value}</td>
    </tr>`

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nova solicitação de demonstração — Vincel Studio</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 16px;">
    <tr>
      <td align="center">

        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

          <tr>
            <td style="background:#09090b;padding:32px 40px;">
              <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.3px;">Vincel Studio · Novo lead Enterprise</span>
            </td>
          </tr>

          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 20px;font-size:15px;color:#3f3f46;line-height:1.6;">
                Alguém solicitou uma demonstração pela página de preços.
              </p>

              <table cellpadding="0" cellspacing="0" width="100%" style="border-top:1px solid #f4f4f5;padding-top:16px;">
                ${row("Nome", name)}
                ${row("E-mail", `<a href="mailto:${email}" style="color:#7c3aed;text-decoration:none;">${email}</a>`)}
                ${row("Escritório", company)}
                ${phone ? row("Telefone", phone) : ""}
              </table>

              ${message ? `
              <table cellpadding="0" cellspacing="0" width="100%" style="margin-top:20px;">
                <tr>
                  <td style="background:#fafafa;border-radius:8px;padding:14px 16px;">
                    <p style="margin:0 0 4px;font-size:12px;color:#a1a1aa;">Mensagem</p>
                    <p style="margin:0;font-size:13px;color:#3f3f46;line-height:1.5;white-space:pre-wrap;">${message}</p>
                  </td>
                </tr>
              </table>` : ""}
            </td>
          </tr>

          <tr>
            <td style="padding:20px 40px;border-top:1px solid #f4f4f5;">
              <p style="margin:0;font-size:12px;color:#d4d4d8;text-align:center;">
                © ${new Date().getFullYear()} Vincel Studio · Formulário de demonstração (/pricing)
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>`

  const text = `Novo lead Enterprise — Vincel Studio

Nome: ${name}
E-mail: ${email}
Escritório: ${company}
${phone ? `Telefone: ${phone}\n` : ""}${message ? `\nMensagem:\n${message}\n` : ""}
Origem: formulário de demonstração (/pricing)`

  return { html, text }
}
