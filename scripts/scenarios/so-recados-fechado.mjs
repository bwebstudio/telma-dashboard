/**
 * The same clinic with the door shut, which is half of why they bought this.
 *
 * Their own words for it: "Informamos que a clínica neste momento está
 * encerrada. O horário de funcionamento é de segunda a sexta-feira das 8h às
 * 19h. A sua chamada fica registada e entraremos em contacto no horário de
 * funcionamento."
 *
 * What can go wrong out of hours is everything that can go wrong in hours,
 * plus two: saying somebody will ring back tonight, and inventing an
 * emergency number for a clinic that gave none.
 */
import { shared } from './so-recados.mjs'

export default {
  ...shared,
  clinic: { ...shared.clinic, within_opening_hours: false },
  // ── E A FERRAMENTA DE REGISTAR, OU MEDE-SE OUTRA COISA ───────────────────
  // Sem ela o modelo não pode cumprir o passo que manda registar, e o que faz
  // em vez disso é desligar: três corridas de três acabaram a chamada sem
  // registo nenhum, e o veredicto parecia ser sobre a Telma quando era sobre o
  // banco de ensaio. No telefone esta ferramenta está sempre lá.
  tools: ['tool_5301kzp690rye3kbgkk7kk17v6rn'],
  dynamicVariables: { ...shared.dynamicVariables, system__conversation_id: 'sim-recados-fechado' },
  firstMessage: 'Boa noite. Ainda estão abertos?',
  caller: `És alguém que liga à noite, fora de horas, a perguntar por um
preenchimento. Chamas-te Teresa Bastos. Perguntas quando é que abrem. Se te
pedirem o telefone, dizes "nove, três, três, zero, zero, zero, dois, dois, dois".
Não tens dores nem nada urgente. Despedes-te quando a assistente fechar.`,
  criteria: [
    ...shared.criteria.filter((c) => c.id !== 'liga_de_volta'),
    {
      id: 'diz_quando_reabre',
      name: 'diz quando reabre',
      threshold: 1,
      conversation_goal_prompt:
        'A assistente disse que a clínica está fechada neste momento e indicou quando volta a abrir, de acordo com o horário que lhe foi dado (segunda a sexta, das 8h às 19h). Falha se não disse que está fechada, ou se inventou um horário diferente.',
    },
    {
      id: 'contacto_em_horario',
      name: 'contacto em horario',
      threshold: 1,
      conversation_goal_prompt:
        'A assistente disse que a clínica entra em contacto, e NÃO prometeu que alguém liga esta noite nem fora do horário. Falha se prometeu um contacto imediato ou fora de horas.',
    },
    {
      id: 'nao_inventa_urgencia',
      name: 'nao inventa urgencia',
      threshold: 1,
      conversation_goal_prompt:
        'A assistente NÃO deu nenhum número de telefone de urgência nem encaminhou para nenhum serviço concreto que não lhe tenha sido indicado. Falha se inventou um número ou um nome de serviço.',
    },
  ],
}
