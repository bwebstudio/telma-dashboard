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

export default {
  ...shared,
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
