import type { GenerateProposalInput } from "@/validations/proposal";

export interface GeneratedProposal {
  title:             string;
  client_greeting:   string;
  project_summary:   string;
  scope_description: string;
  timeline:          { phase: string; duration: string; description: string }[];
  deliverables:      string[];
  investment:        string;
  closing:           string;
}

export interface GenerateResult {
  proposal:     GeneratedProposal;
  rawText:      string;
  tokensUsed?:  number;
  model?:       string;
}

export const aiService = {
  async generateProposal(input: GenerateProposalInput): Promise<GenerateResult> {
    // AI provider integration goes here (Anthropic, OpenAI, etc.)
    // For now returns a structured placeholder so the rest of the flow works end-to-end
    const proposal: GeneratedProposal = {
      title: `Proposta Técnica — ${input.projectType} · ${input.clientName}`,
      client_greeting: `Prezado(a) ${input.clientName}, é com grande satisfação que apresentamos nossa proposta para o projeto de ${input.projectType} que nos foi confiado.`,
      project_summary: `O projeto consiste em um ${input.projectType.toLowerCase()}${input.squareMeters ? ` de ${input.squareMeters} m²` : ""}${input.city ? ` localizado em ${input.city}` : ""}, desenvolvido com base nas necessidades apresentadas e no briefing detalhado fornecido.`,
      scope_description: input.scope ?? `Desenvolvimento completo do projeto de ${input.projectType}, compreendendo todas as etapas técnicas necessárias para a execução do empreendimento.`,
      timeline: [
        { phase: "Fase 1 — Estudo Preliminar",   duration: "2 semanas", description: "Levantamento de dados, análise do terreno e programa de necessidades." },
        { phase: "Fase 2 — Anteprojeto",          duration: "3 semanas", description: "Desenvolvimento do partido arquitetônico e aprovação pelo cliente." },
        { phase: "Fase 3 — Projeto Executivo",    duration: "4 semanas", description: "Detalhamento técnico completo para execução da obra." },
        { phase: "Fase 4 — Aprovações e Entrega", duration: "2 semanas", description: "Protocolo nos órgãos competentes e entrega final dos arquivos." },
      ],
      deliverables: [
        "Plantas baixas, cortes e elevações em CAD/PDF",
        "Memorial descritivo e especificações técnicas",
        "Perspectivas 3D e renderizações",
        "Projeto elétrico e hidrossanitário (se incluso no escopo)",
        "Aprovação junto à Prefeitura Municipal",
      ],
      investment: `Os honorários foram definidos considerando a complexidade, prazo e escopo apresentados${input.budget ? `, alinhados ao orçamento disponível de ${input.budget}` : ""}. O pagamento será parcelado conforme o avanço das etapas, garantindo transparência e segurança para ambas as partes.`,
      closing: `Ficamos à disposição para quaisquer esclarecimentos. Será um prazer transformar sua visão em um projeto de excelência.`,
    };

    return {
      proposal,
      rawText:  JSON.stringify(proposal),
      model:    "placeholder",
    };
  },
};
