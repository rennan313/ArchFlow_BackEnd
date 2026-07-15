// Billing transactional emails (Story 11). One shared chrome (renderBillingEmail)
// matching the existing reset-password/verify-email visual standard, with seven
// thin content builders on top — so the layout lives in exactly one place.

interface BillingEmailContent {
  title:       string        // <title> + preheader
  heading:     string        // big headline
  paragraphs:  string[]      // body paragraphs (may contain <strong>)
  highlight?:  string        // optional highlighted box (amount / warning)
  cta?:        { label: string; url: string }
}

function renderBillingEmail(c: BillingEmailContent): { html: string; text: string } {
  const year = new Date().getFullYear()

  const bodyParas = c.paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;color:#71717a;line-height:1.6;">${p}</p>`)
    .join("\n")

  const highlightBlock = c.highlight
    ? `<table cellpadding="0" cellspacing="0" width="100%" style="margin:8px 0 24px;">
         <tr><td style="background:#fafafa;border:1px solid #f4f4f5;border-radius:8px;padding:14px 16px;">
           <p style="margin:0;font-size:14px;color:#3f3f46;line-height:1.5;">${c.highlight}</p>
         </td></tr>
       </table>`
    : ""

  const ctaBlock = c.cta
    ? `<table cellpadding="0" cellspacing="0" width="100%"><tr>
         <td style="padding:8px 0 28px;">
           <a href="${c.cta.url}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 28px;border-radius:10px;letter-spacing:-0.1px;">${c.cta.label}</a>
         </td>
       </tr></table>`
    : ""

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${c.title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

        <tr><td style="background:#09090b;padding:32px 40px;">
          <table cellpadding="0" cellspacing="0"><tr><td>
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="background:#7c3aed;border-radius:10px;width:36px;height:36px;text-align:center;vertical-align:middle;">
                <span style="color:#ffffff;font-size:18px;font-weight:700;line-height:36px;">A</span>
              </td>
              <td style="padding-left:10px;"><span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.3px;">ArchFlow</span></td>
            </tr></table>
          </td></tr></table>
        </td></tr>

        <tr><td style="padding:40px 40px 32px;">
          <p style="margin:0 0 20px;font-size:22px;font-weight:700;color:#09090b;letter-spacing:-0.4px;">${c.heading}</p>
          ${bodyParas}
          ${highlightBlock}
          ${ctaBlock}
        </td></tr>

        <tr><td style="padding:20px 40px;border-top:1px solid #f4f4f5;">
          <p style="margin:0;font-size:12px;color:#d4d4d8;text-align:center;">© ${year} ArchFlow · Todos os direitos reservados</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

  const text = [
    c.heading,
    "",
    ...c.paragraphs.map(stripTags),
    c.highlight ? `\n${stripTags(c.highlight)}` : "",
    c.cta ? `\n${c.cta.label}: ${c.cta.url}` : "",
    `\n© ${year} ArchFlow`,
  ].filter(Boolean).join("\n")

  return { html, text }
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "")
}

// ─── The seven billing emails ────────────────────────────────────────────────

export function subscriptionCreatedTemplate(p: { name: string; planName: string; cycleLabel: string; amount: string; nextBilling: string; portalUrl: string }) {
  return renderBillingEmail({
    title:    "Assinatura confirmada — ArchFlow",
    heading:  "Sua assinatura está ativa 🎉",
    paragraphs: [
      `Olá, <strong style="color:#3f3f46;">${p.name}</strong>. Seu plano <strong>${p.planName}</strong> (${p.cycleLabel}) foi ativado com sucesso.`,
      "Todos os recursos do seu plano já estão liberados no workspace.",
    ],
    highlight: `Valor: <strong>${p.amount}</strong> · Próxima cobrança: <strong>${p.nextBilling}</strong>`,
    cta: { label: "Ver minha assinatura", url: p.portalUrl },
  })
}

export function paymentApprovedTemplate(p: { name: string; planName: string; amount: string; receiptUrl?: string; portalUrl: string }) {
  return renderBillingEmail({
    title:    "Pagamento aprovado — ArchFlow",
    heading:  "Pagamento aprovado ✅",
    paragraphs: [
      `Olá, <strong style="color:#3f3f46;">${p.name}</strong>. Recebemos o pagamento do seu plano <strong>${p.planName}</strong>.`,
      p.receiptUrl ? `Você pode acessar o comprovante <a href="${p.receiptUrl}" style="color:#7c3aed;">aqui</a>.` : "Obrigado por assinar o ArchFlow.",
    ],
    highlight: `Valor pago: <strong>${p.amount}</strong>`,
    cta: { label: "Ver histórico", url: p.portalUrl },
  })
}

export function paymentRejectedTemplate(p: { name: string; planName: string; portalUrl: string }) {
  return renderBillingEmail({
    title:    "Pagamento recusado — ArchFlow",
    heading:  "Não conseguimos processar seu pagamento",
    paragraphs: [
      `Olá, <strong style="color:#3f3f46;">${p.name}</strong>. O pagamento do seu plano <strong>${p.planName}</strong> foi recusado.`,
      "Seu workspace ficará em modo somente-leitura até que a cobrança seja regularizada. Atualize seu método de pagamento para continuar.",
    ],
    cta: { label: "Regularizar pagamento", url: p.portalUrl },
  })
}

export function subscriptionRenewedTemplate(p: { name: string; planName: string; amount: string; nextBilling: string; receiptUrl?: string; portalUrl: string }) {
  return renderBillingEmail({
    title:    "Assinatura renovada — ArchFlow",
    heading:  "Sua assinatura foi renovada 🔄",
    paragraphs: [
      `Olá, <strong style="color:#3f3f46;">${p.name}</strong>. Seu plano <strong>${p.planName}</strong> foi renovado automaticamente.`,
      p.receiptUrl ? `Comprovante disponível <a href="${p.receiptUrl}" style="color:#7c3aed;">aqui</a>.` : "Obrigado por continuar com o ArchFlow.",
    ],
    highlight: `Valor: <strong>${p.amount}</strong> · Próxima cobrança: <strong>${p.nextBilling}</strong>`,
    cta: { label: "Ver minha assinatura", url: p.portalUrl },
  })
}

export function subscriptionCanceledTemplate(p: { name: string; planName: string; accessUntil: string; plansUrl: string }) {
  return renderBillingEmail({
    title:    "Assinatura cancelada — ArchFlow",
    heading:  "Sua assinatura foi cancelada",
    paragraphs: [
      `Olá, <strong style="color:#3f3f46;">${p.name}</strong>. Seu plano <strong>${p.planName}</strong> foi cancelado.`,
      `Você mantém o acesso até <strong>${p.accessUntil}</strong>. Depois disso, o workspace entrará em modo somente-leitura.`,
      "Mudou de ideia? Você pode reativar quando quiser.",
    ],
    cta: { label: "Reativar assinatura", url: p.plansUrl },
  })
}

export function trialEndingTemplate(p: { name: string; daysLeft: number; plansUrl: string }) {
  return renderBillingEmail({
    title:    "Seu período de avaliação está acabando — ArchFlow",
    heading:  "Seu teste está acabando ⏳",
    paragraphs: [
      `Olá, <strong style="color:#3f3f46;">${p.name}</strong>. Seu período de avaliação termina em <strong>${p.daysLeft} ${p.daysLeft === 1 ? "dia" : "dias"}</strong>.`,
      "Assine um plano para continuar criando propostas, projetos e clientes sem interrupção.",
    ],
    cta: { label: "Escolher um plano", url: p.plansUrl },
  })
}

export function trialExpiredTemplate(p: { name: string; plansUrl: string }) {
  return renderBillingEmail({
    title:    "Seu período de avaliação terminou — ArchFlow",
    heading:  "Seu teste terminou",
    paragraphs: [
      `Olá, <strong style="color:#3f3f46;">${p.name}</strong>. Seu período de avaliação chegou ao fim e o workspace está em modo somente-leitura.`,
      "Assine um plano para voltar a criar, editar e excluir. Seus dados continuam salvos.",
    ],
    cta: { label: "Assinar um plano", url: p.plansUrl },
  })
}
