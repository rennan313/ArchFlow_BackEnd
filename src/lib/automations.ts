import type { AutomationKey } from "@prisma/client"

/**
 * Fixed catalogue of the 10 Fase 5 automations. Pure business rules — no
 * LLM/AI involved. Each workspace gets its own enable/disable toggle + run
 * log, seeded lazily from this registry via automationService.ensureDefaults().
 */
export const AUTOMATION_DEFINITIONS: Record<AutomationKey, { name: string; description: string; trigger: string }> = {
  AUTO_CREATE_PROJECT_ON_APPROVED: {
    name: "Criar Projeto ao Aprovar Proposta",
    description: "Quando uma oportunidade é aprovada, cria automaticamente o Projeto vinculado ao cliente e à proposta, com fase inicial Briefing.",
    trigger: "Opportunity.stage = APPROVED",
  },
  TASK_PRELIMINARY_DESIGN: {
    name: "Tarefa: Desenvolver Anteprojeto",
    description: "Quando um projeto entra na fase de Anteprojeto, cria a tarefa 'Desenvolver Anteprojeto' para o responsável pelo projeto.",
    trigger: "Project.phase = PRELIMINARY_DESIGN",
  },
  TASK_EXECUTIVE_DESIGN: {
    name: "Tarefa: Desenvolver Projeto Executivo",
    description: "Quando um projeto entra na fase de Projeto Executivo, cria a tarefa correspondente para o responsável.",
    trigger: "Project.phase = EXECUTIVE_DESIGN",
  },
  TASK_COMPATIBILIZATION: {
    name: "Tarefa: Compatibilizar Disciplinas",
    description: "Quando um projeto entra na fase de Compatibilização, cria a tarefa 'Compatibilizar disciplinas'.",
    trigger: "Project.phase = COMPATIBILIZATION",
  },
  TASK_APPROVAL: {
    name: "Tarefa: Protocolar Aprovação",
    description: "Quando um projeto entra na fase de Aprovação, cria a tarefa 'Protocolar aprovação'.",
    trigger: "Project.phase = APPROVAL",
  },
  PROJECT_OVERDUE_ALERT: {
    name: "Alerta de Projeto Atrasado",
    description: "Sinaliza projetos cujo prazo estimado já passou e que ainda não chegaram à fase de Entrega.",
    trigger: "Project.estimatedEndDate < hoje e phase != DELIVERY",
  },
  PROPOSAL_STALE_FOLLOWUP: {
    name: "Follow-up de Proposta Parada",
    description: "Cria um follow-up 'Entrar em contato com cliente' quando uma proposta enviada fica 7 dias sem movimentação.",
    trigger: "Proposal.status = SENT por 7+ dias sem mudança",
  },
  MEETING_AGENDA_SYNC: {
    name: "Sincronização com Agenda",
    description: "Confirma que toda reunião criada aparece automaticamente na Agenda do escritório.",
    trigger: "Meeting criada",
  },
  CLIENT_TIMELINE_INIT: {
    name: "Timeline Inicial do Cliente",
    description: "Inicializa a timeline de relacionamento (Cliente → Reunião → Briefing → Proposta → Projeto) ao cadastrar um cliente.",
    trigger: "Client criado",
  },
  POST_DELIVERY_FOLLOWUP: {
    name: "Follow-up Pós-Entrega",
    description: "Cria um follow-up 'Satisfação do Cliente' com prazo de 30 dias quando um projeto chega à fase de Entrega.",
    trigger: "Project.phase = DELIVERY",
  },
}

export const AUTOMATION_KEYS = Object.keys(AUTOMATION_DEFINITIONS) as AutomationKey[]
