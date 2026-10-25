/**
 * Two subjects in one call, and the second one arrives after she has already
 * asked whether there was anything else.
 *
 * Measured on the telephone, twice in one afternoon. She asked, heard "yes, I
 * also want to move it to the second", took that down, and hung up: the three
 * conditions on `end_call` were all satisfied to the letter -- she had asked,
 * she had heard an answer, she had filed -- and the answer she closed on was
 * the one from before the new subject. The caller is left with the line dead
 * in the middle of a conversation they had just reopened.
 *
 * And the other thing this call tests: the person says "the one I'm calling
 * from" when asked for a number. That is an answer. On the telephone she
 * treated it as a refusal and pressed for "the nine digits".
 */
import { shared } from './so-recados.mjs'

export default {
  ...shared,
  // The sheet only carries the "this is not their contact number" rule when it
  // knows the number the call came in from, and the shared fixture does not.
  // Without this the sheet takes the other branch and the answer this call is
  // about ("the one I'm ringing from") has nothing to be checked against.
  clinic: { ...shared.clinic, caller_id: '+351912000111' },
  // ── E A FERRAMENTA DE REGISTAR, A VERDADEIRA ─────────────────────────────
  // Sem ela o passo 5 do recado não se pode cumprir, e medimos o que o modelo
  // faz quando lhe falta uma mão: em quatro corridas de quatro desligou logo a
  // seguir a confirmar o número, porque registar era o passo seguinte e não
  // havia nada com que o fazer. Quatro medições foram gastas a estudar uma
  // avaria do banco de ensaio.
  //
  // Escreve na clínica de demonstração, uma chamada por corrida.
  tools: ['tool_5301kzp690rye3kbgkk7kk17v6rn'],
  firstMessage: 'Boa tarde, queria anular uma consulta que tenho no dia sete.',
  caller: `Ligas para anular uma consulta de branqueamento que tens no dia sete
de novembro. Chamas-te Domingos Pinto Coelho.
**Se te pedirem um número de telefone, respondes só "o meu, este mesmo de onde
estou a ligar"** e nunca ditas os algarismos, nem que insistam. Se ela ler o
número em voz alta, confirmas: "sim, é esse". Se ela não o ler e voltar a
pedir-te o número, repetes a mesma resposta.
**Quando a assistente te perguntar se precisas de mais alguma coisa, dizes que
sim**: queres passar essa consulta para o dia dois, de manhã. Depois disso já
não precisas de nada e despedes-te quando ela fechar.`,
  criteria: [
    // `nao_inventa_agenda` sai também: nesta chamada a clínica está fechada e a
    // folha manda dizer porquê ("não está ninguém da receção"), que o juiz lê
    // como uma frase sobre disponibilidade. É a frase certa; o critério é que
    // não é deste cenário.
    ...shared.criteria.filter(
      (c) =>
        c.id !== 'nao_marca' &&
        c.id !== 'recado_completo' &&
        c.id !== 'confirma_digitos' &&
        c.id !== 'nao_inventa_agenda'
    ),
    {
      id: 'o_meu_e_resposta',
      name: 'aceita "o meu" como resposta',
      threshold: 1,
      conversation_goal_prompt:
        'Quando a pessoa disse que o número era o mesmo de onde estava a ligar, a assistente aceitou isso como resposta e leu esse número em voz alta para ela confirmar. Ler o número de volta é o que se espera e NÃO é falha. Falha se voltou a pedir à pessoa que ditasse o número, se pediu "o número completo", se falou de "nove algarismos", ou se ficou à espera de mais algarismos.',
    },
    {
      id: 'volta_a_perguntar',
      name: 'volta a perguntar depois do segundo assunto',
      threshold: 1,
      conversation_goal_prompt:
        'Depois de tratar do SEGUNDO pedido (passar a consulta para o dia dois), a assistente perguntou outra vez se havia mais alguma coisa, e só se despediu depois de ouvir que não. Falha se se despediu ou desligou sem voltar a perguntar.',
    },
    {
      id: 'os_dois_assuntos',
      name: 'os dois assuntos ficam ditos',
      threshold: 1,
      conversation_goal_prompt:
        'As DUAS coisas ficaram ditas em voz alta: a anulação da consulta do dia sete e o pedido de a passar para o dia dois. Vale fechar cada uma à medida que a trata, sem resumo final. Falha se alguma delas nunca foi reconhecida.',
    },
    {
      id: 'nao_explica_o_porque_do_pedido',
      name: 'nao explica a sua papelada',
      threshold: 1,
      conversation_goal_prompt:
        'A assistente NUNCA explicou para que precisava dos dados nem o que ia fazer com eles: nada de "para eu registar bem", "para ficar bem identificado", "para não me enganar", "para deixar o recado corretamente". Falha se disse qualquer coisa desse género.',
    },
    {
      id: 'nao_anula',
      name: 'nao anula',
      threshold: 1,
      conversation_goal_prompt:
        'A assistente NUNCA disse que a consulta ficou anulada, cancelada ou desmarcada. Falha se o disse ou se deu a entender que já estava tratado.',
    },
  ],
}
