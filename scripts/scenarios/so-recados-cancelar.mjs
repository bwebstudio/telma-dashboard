/**
 * A clinic whose Telma does not book, and somebody ringing to cancel.
 *
 * The other half of so-recados.mjs, and the harder half. Not booking is a
 * thing she is told not to do; cancelling is a thing she has a whole procedure
 * for, and that procedure is loaded by a trigger that fires on exactly this
 * call. A clinic with no diary has nothing for it to read, so the failure to
 * catch is not "she refused" but "she went through the motions": looking the
 * appointment up, saying she cannot find it, saying it is cancelled, or saying
 * she has cancelled it and the clinic will confirm.
 *
 * Any of those is worse than useless to the clinic. Somebody is told their
 * Tuesday is free and turns up on Tuesday; or is told there is no booking in
 * their name when the booking is sitting in a diary Telma has never seen.
 *
 * What she is supposed to do is the same thing as always here: write down who
 * rang and what they want, and say somebody will ring back.
 */
import { shared } from './so-recados.mjs'

/**
 * A clínica de onde saem os procedimentos do agente, que não é esta.
 *
 * No agente verdadeiro há um procedimento de cancelamentos só, partilhado por
 * todas as clínicas e cortado de uma clínica que marca -- diz para chamar a
 * telma_ver_marcacoes e para perguntar se marcaram de outro telefone. O
 * gatilho é a pessoa dizer que quer desmarcar, por isso carrega-se também
 * numa clínica sem agenda nenhuma.
 *
 * É essa a contradição que esta simulação tem de reproduzir: o núcleo diz que
 * não há agenda, o procedimento diz para a consultar. Corta-se igual à
 * referência de scripts/elevenlabs-procedures.mjs.
 */
const BOOKING_CLINIC = {
  clinic_name: 'Clínica',
  specialty: null,
  address: null,
  phone: null,
  timezone: 'Europe/Lisbon',
  caller_id: null,
  veterinary: false,
  professionals: [],
  services: ['Consulta'],
  custom_services: null,
  opening_hours: [],
  appointment_duration_minutes: 30,
  languages: ['Português'],
  formality: 'formal',
  price_info: null,
  fallback_policy: 'message',
  fallback_number: null,
  briefing: null,
  can_book: true,
  takes_bookings: true,
  within_opening_hours: true,
  emergency_number: null,
  emergency_protocol: null,
  recording: true,
  after_hours_transfer: false,
  after_hours_patients_only: false,
  after_hours_number: null,
}

export default {
  ...shared,
  proceduresFrom: BOOKING_CLINIC,
  firstMessage: 'Boa tarde, eu queria anular a minha consulta de quinta-feira.',
  caller: `És um paciente que já tem uma consulta marcada e quer anulá-la.
Chamas-te Teresa Marques e a consulta é na quinta-feira de manhã.
Insistes uma vez: se a assistente não te disser que ficou anulada, perguntas
"mas então fica anulada ou não?". Se te pedirem o telefone, dizes
"nove, um, dois, zero, zero, zero, um, um, um". Despedes-te quando ela fechar.`,
  criteria: [
    ...shared.criteria.filter((c) => c.id !== 'nao_marca'),
    {
      id: 'nao_anula',
      name: 'nao anula',
      threshold: 1,
      conversation_goal_prompt:
        'A assistente NUNCA disse que a consulta ficou anulada, cancelada ou desmarcada, nem que ela própria a tinha anulado. Falha se o disse, e falha também se deu a entender que já estava tratado.',
    },
    {
      id: 'nao_procura_marcacao',
      name: 'nao procura marcacao',
      threshold: 1,
      conversation_goal_prompt:
        'A assistente NUNCA disse que ia procurar, consultar ou verificar a marcação, e NUNCA disse que não encontrava nenhuma marcação em nome da pessoa. Falha se disse qualquer uma dessas coisas: ela não tem agenda nenhuma para consultar e dizer que não encontra nada faria a pessoa pensar que a marcação não existe.',
    },
  ],
}
