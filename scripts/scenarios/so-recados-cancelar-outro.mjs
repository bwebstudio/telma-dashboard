/**
 * A cancellation where Telma knows neither who is speaking nor whose
 * appointment it is, and has to resist deciding both.
 *
 * so-recados-cancelar.mjs has the caller give her name in the first breath and
 * the appointment be her own, which is the easy shape and the one that was
 * measured. A real call did not look like that: a man rang about an
 * appointment, and the second sentence out of Telma was
 *
 *   "Percebo, senhora. [...] Esta consulta é para si, e pode dizer-me por
 *    favor o seu apelido [...]"
 *
 * Three things in one breath, and none of them had to be said. She guessed the
 * gender of somebody she had not been introduced to and guessed wrong, which is
 * the first thing a caller hears. She stated whose appointment it was instead
 * of asking, so the person has to contradict her to correct it, and plenty of
 * people do not. And she asked for the "apelido", a word that exists in the
 * sheet only to explain how to address somebody, never as a question.
 *
 * So this call withholds exactly what she was improvising: no name until she
 * asks for one, and the appointment belongs to somebody else.
 */
import { shared } from './so-recados.mjs'

export default {
  ...shared,
  firstMessage: 'Boa tarde, era para anular uma consulta que está marcada para quinta-feira.',
  caller: `Ligas para anular uma consulta que NÃO é tua: é da tua mãe.
Chamas-te Domingos Pinto Coelho e és um homem.
**Não dizes o teu nome nem de quem é a consulta até te perguntarem.** Se a
assistente der por assente que a consulta é tua, corriges: "não, não é para
mim". Se te pedirem o nome, dizes o teu nome completo e dizes que a consulta
está em nome de Maria Pinto Coelho. Se te pedirem o telefone, dizes
"nove, um, dois, zero, zero, zero, um, um, um". Despedes-te quando ela fechar.`,
  criteria: [
    ...shared.criteria.filter((c) => c.id !== 'nao_marca' && c.id !== 'recado_completo'),
    {
      id: 'nao_adivinha_tratamento',
      name: 'nao adivinha o tratamento',
      threshold: 1,
      conversation_goal_prompt:
        'Antes de a pessoa dizer o seu nome, a assistente NUNCA lhe chamou "senhora" nem "senhor". Falha se usou qualquer um dos dois antes de saber o nome: pela voz não se sabe com quem se fala, e neste caso quem liga é um homem.',
    },
    {
      id: 'pergunta_de_quem_e',
      name: 'pergunta de quem e a consulta',
      threshold: 1,
      conversation_goal_prompt:
        'A assistente PERGUNTOU em nome de quem está a consulta, em vez de afirmar de quem era. Falha se disse coisas como "esta consulta é para si" ou "a sua consulta" antes de a pessoa lhe ter dito de quem era.',
    },
    {
      id: 'nao_pede_apelido',
      name: 'pede o nome completo',
      threshold: 1,
      conversation_goal_prompt:
        'Ao pedir o nome, a assistente pediu o NOME COMPLETO. Falha se pediu "o apelido", "o sobrenome" ou "o nome próprio": essas são palavras das instruções dela, não perguntas que se fazem ao telefone.',
    },
    {
      id: 'recado_com_os_dois_nomes',
      name: 'recado com os dois nomes',
      threshold: 1,
      conversation_goal_prompt:
        'A assistente ficou com o nome de quem tem a consulta, e não só com o de quem ligou: pediu-o, ou repetiu-o depois de a pessoa o dizer. Falha se a chamada acabou sem que esse nome tenha chegado a ser pedido nem reconhecido, porque sem ele a clínica não sabe que consulta anular.',
    },
    {
      id: 'nao_anula',
      name: 'nao anula',
      threshold: 1,
      conversation_goal_prompt:
        'A assistente NUNCA disse que a consulta ficou anulada, cancelada ou desmarcada, nem que ela própria a tinha anulado. Falha se o disse, e falha também se deu a entender que já estava tratado.',
    },
  ],
}
