/**
 * A chamada das 17:42 de 28/10: um recado feito, e uma urgência a seguir.
 *
 * Foi a primeira com as regras novas e mostrou duas coisas que elas trouxeram
 * com elas.
 *
 * A primeira: "diga-me o seu primeiro e último nome, por favor, e qual é o
 * motivo da consulta?". O motivo passou a ser a primeira pergunta e saiu
 * colado ao nome, que são duas perguntas numa, e a folha já proibia isso num
 * parágrafo acima.
 *
 * A segunda, pior: tratado o recado, com o nome e o número tomados e lidos de
 * volta, a pessoa disse que estava com dores e que lhe tinha saltado uma
 * coroa. A resposta foi "entramos em contacto o mais breve possível. Diga-me o
 * seu primeiro e último nome, por favor" -- o nome que ela já tinha, pedido
 * outra vez, que é precisamente o que a clínica pediu para não acontecer. A
 * cola da pergunta do nome é para quem ainda não deu nada.
 *
 * Do que correu bem nessa chamada, e que este cenário também vigia: cortaram-na
 * a meio e não se calou, perguntou "está aí?".
 */
import { shared } from './so-recados.mjs'

export default {
  ...shared,
  clinic: { ...shared.clinic, caller_id: '+351912000111', within_opening_hours: true },
  dynamicVariables: { ...shared.dynamicVariables, system__conversation_id: 'sim-urgencia-depois' },
  tools: ['tool_5301kzp690rye3kbgkk7kk17v6rn'],
  firstMessage: 'Olá, eu queria fazer uma marcação, se faz favor.',
  caller: `Ligas para pedir uma marcação e chamas-te Domingos Pinto Coelho.
Segues isto, um turno de cada vez:

1. Se te perguntarem o motivo, dizes "é um branqueamento".
2. Se te pedirem o nome, dá-lo.
3. Se te pedirem o número, dizes "é este mesmo de onde lhe ligo" e nunca ditas
   algarismos. Se ela ler o número em voz alta, confirmas que é esse.
4. **Quando ela te perguntar se precisas de mais alguma coisa, dizes que sim**:
   "estou com uma urgência, saiu-me uma coroa da operação que fiz aí, estou
   cheio de dores e cheio de sangue".
5. Insistes uma vez: "eu preciso de falar com uma pessoa agora".
6. Depois disso despedes-te.

Se ela te pedir o nome ou o número uma segunda vez, respondes "já lhe dei isso"
e não repetes nada.`,
  criteria: [
    ...shared.criteria.filter((c) => c.id !== 'nao_marca' && c.id !== 'nao_inventa_agenda'),
    {
      id: 'uma_pergunta_de_cada_vez',
      name: 'uma pergunta de cada vez',
      threshold: 1,
      conversation_goal_prompt:
        'Cada pergunta da assistente pede UMA coisa só. Falha se alguma fala juntou duas perguntas, por exemplo "diga-me o seu nome e qual é o motivo da consulta?" ou "diga-me o nome e o melhor número". ATENÇÃO: uma frase de contexto seguida de uma pergunta ("a clínica está fechada. Diga-me o seu nome") é uma pergunta só e passa.',
    },
    {
      // A razão de ser deste cenário.
      id: 'nao_repete_o_contacto',
      name: 'nao repete o contacto na urgencia',
      threshold: 1,
      conversation_goal_prompt:
        'Depois de a pessoa falar da urgência, a assistente NÃO voltou a pedir o nome nem o número nem a ler o número de volta: já os tinha desta mesma chamada e usou-os. Falha se pediu outra vez qualquer um dos dois. ATENÇÃO: perguntar se a urgência é para a mesma pessoa ou para outra NÃO é pedir o contacto e passa.',
    },
    {
      id: 'nao_fica_calada',
      name: 'nunca fica calada',
      threshold: 1,
      conversation_goal_prompt:
        'A assistente respondeu sempre que era a vez dela e NUNCA usou a ferramenta skip_turn. Falha se há uma chamada a skip_turn em qualquer ponto da conversa, ou se deixou passar um turno sem dizer nada com a pessoa à espera de resposta.',
    },
    {
      id: 'sem_112',
      name: 'sem 112',
      threshold: 1,
      conversation_goal_prompt:
        'A assistente NUNCA mandou ligar para o 112 nem para urgências de hospital nem para nenhum sítio fora da clínica, apesar de a pessoa falar de dores e de sangue. Falha se o fez.',
    },
    {
      id: 'registo_urgencia',
      name: 'registo como urgencia',
      threshold: 1,
      conversation_goal_prompt:
        'Olha para a ÚLTIMA chamada a telma_registar_chamada: depois de a pessoa falar da coroa, das dores e do sangue, o campo result é "urgencia". Falha se o último registo ficou como pedido de marcação ou como outra coisa qualquer: a clínica quer ver esta linha primeiro.',
    },
    {
      // Medido na mesma situação: registou a urgência e desligou no mesmo
      // turno, sem deixar o homem responder.
      id: 'nao_desliga_na_urgencia',
      name: 'nao desliga na urgencia',
      threshold: 1,
      conversation_goal_prompt:
        'Depois de a pessoa falar da urgência, a assistente NÃO desligou por iniciativa própria: perguntou se havia mais alguma coisa e esperou. Falha se usou a ferramenta end_call no mesmo turno em que tratou da urgência, ou em qualquer momento antes de a pessoa dizer que não precisava de mais nada.',
    },
    {
      id: 'fala_de_si_no_feminino',
      name: 'fala de si no feminino',
      threshold: 1,
      conversation_goal_prompt:
        'A assistente é uma mulher e fala de si no feminino em toda a chamada. Falha se disse "obrigado" em vez de "obrigada", ou qualquer outra palavra sobre si própria em masculino. Repara sobretudo no momento em que agradece o nome.',
    },
  ],
}
