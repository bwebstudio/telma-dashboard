/**
 * Does Telma know what the clinic told us?
 *
 * Not a safety scenario and not a booking one: the diary is out of reach here,
 * by design. This asks the five questions whose answers the clinic typed into
 * the sign-up and the panel -- the hours, the services, the price, the address
 * and what happens in an emergency -- and checks that what comes back is what
 * was typed, rather than something plausible.
 *
 * The clinic is a real row: the essencial plan, a Porto dentist with a lunch
 * break, four services plus one written by hand, and a price for the first
 * appointment. The break is the point. A clinic whose week is two spans had
 * them collapsed into one before this, and Telma answered "nine to seven" to
 * the one question a receptionist is asked every day.
 */
export default {
  language: 'pt',
  clinic: {
    clinic_name: 'Clínica Dentária Aurora',
    specialty: 'Clínica dentária',
    address: 'Rua de Cedofeita 220, 4050-174 Porto',
    phone: '+351221999001',
    timezone: 'Europe/Lisbon',
    professionals: [],
    caller_id: null,
    veterinary: false,
    services: ['Consulta de avaliação', 'Limpeza / destartarização', 'Implantes', 'Urgência'],
    custom_services: 'Branqueamento LED',
    opening_hours: [
      'Segunda: 09:00-13:00, 14:00-19:00',
      'Terça: 09:00-13:00, 14:00-19:00',
      'Quarta: 09:00-13:00, 14:00-19:00',
      'Quinta: 09:00-13:00, 14:00-19:00',
      'Sexta: 09:00-13:00, 14:00-19:00',
      'Sábado: 09:00-13:00',
    ],
    appointment_duration_minutes: 30,
    languages: ['Português'],
    formality: 'formal',
    price_info: 'Primeira consulta 40 €. Raio-X incluído.',
    fallback_policy: 'message',
    fallback_number: null,
    briefing: null,
    can_book: true,
    within_opening_hours: true,
    emergency_number: '+351221999002',
    emergency_protocol: 'Fora de horas, encaminhar para a urgência do Hospital de Santo António.',
    recording: true,
    after_hours_transfer: false,
    after_hours_patients_only: true,
    after_hours_number: null,
    appointments_auto_confirmed: false,
  },

  firstMessage: 'Boa tarde, queria saber a que horas é que vocês estão abertos.',

  caller: `És alguém a ligar para uma clínica dentária em Portugal pela primeira vez.
Segues EXACTAMENTE este guião, uma mensagem por turno, sem te adiantares:

1. "Boa tarde, queria saber a que horas é que vocês estão abertos."
2. "E à hora de almoço estão? Eu só posso lá ir por volta da uma e meia."
3. "Está bem. E fazem ortodontia? É que o meu filho precisa de aparelho."
4. "Ah, ok. E quanto custa a primeira consulta?"
5. "E vocês ficam onde exactamente?"
6. "Obrigado. Última coisa: se eu tiver uma dor forte a meio da noite, para onde ligo?"

Depois do turno 6 despedes-te com normalidade. Chamas-te Rui Almeida. Não
inventes perguntas novas nem saias do guião.`,

  criteria: [
    {
      id: 'horario_certo',
      name: 'horário certo',
      conversation_goal_prompt:
        'A agente disse o horário da clínica correctamente? Success apenas se disse que abre às 9 e fecha às 19, E mencionou que fecha ao almoço (entre as 13 e as 14). Falha se disse "das 9 às 19" sem mencionar a pausa.',
    },
    {
      id: 'almoco_fechado',
      name: 'à uma e meia está fechada',
      conversation_goal_prompt:
        'Quando o cliente disse que só podia ir por volta da uma e meia, a agente disse-lhe que a essa hora a clínica está fechada ou em pausa? Success apenas se o avisou. Falha se disse que sim, que podia, ou se ignorou a questão.',
    },
    {
      id: 'nao_inventa_servico',
      name: 'não inventa ortodontia',
      conversation_goal_prompt:
        'A clínica NÃO faz ortodontia. A agente recusou marcar ortodontia? Success se disse que não fazem isso. Falha se disse que sim, se marcou, ou se deixou a pessoa com a ideia de que fazem.',
    },
    {
      id: 'preco_certo',
      name: 'preço certo',
      conversation_goal_prompt:
        'A agente disse que a primeira consulta custa 40 euros? Success apenas com esse valor. Falha se disse outro valor, se inventou um preço, ou se disse que não sabe quando a informação lhe foi dada.',
    },
    {
      id: 'morada_certa',
      name: 'morada certa',
      conversation_goal_prompt:
        'A agente deu a morada da clínica: Rua de Cedofeita 220, no Porto? Success se a disse correctamente. Falha se inventou uma morada ou disse a errada.',
    },
    {
      id: 'urgencia_numero',
      name: 'número de urgência',
      conversation_goal_prompt:
        'Para uma dor forte de madrugada, a agente encaminhou para o número de urgências da clínica (+351 221 999 002) ou para a urgência do hospital, conforme as instruções da clínica? Success se deu uma dessas duas respostas. Falha se inventou um número ou se não soube responder.',
    },
  ],
}
