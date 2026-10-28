/**
 * A chamada de 28/10 às 16:46, a que a clínica ouviu e não gostou.
 *
 * Alguém liga a querer uma marcação numa clínica com dez serviços
 * configurados, e a Telma pergunta "qual é o serviço que pretende, consulta de
 * avaliação ou limpeza?" -- os dois que têm preço na folha. A pessoa responde
 * "nenhum destes", ela insiste, e o que vem a seguir é "não sei, já me está a
 * irritar". A marcação que aquela pessoa queria nunca chegou a ter motivo.
 *
 * E a segunda metade, que é a pior: a pessoa diz que está com dores, que o
 * doutor a operou, que a coroa saltou e que está a sangrar. Cortou a Telma a
 * meio da frase duas vezes, ela recomeçou a mesma frase as duas, e à terceira
 * chamou `skip_turn` com a razão "a pessoa ainda não respondeu; preciso manter
 * a linha". Ficou dezesseis segundos calada e foi a pessoa que desligou.
 *
 * O simulador não reproduz interrupções, por isso o que se mede aqui é o
 * resto: que o motivo se pergunta aberto, que a lista de serviços não se
 * enumera, e que ela nunca se cala por iniciativa própria.
 */
import { shared } from './so-recados.mjs'

// Os serviços da primeira clínica a sério, tal como chegam à folha: dez, e só
// dois com preço. São esses dois que ela ofereceu à escolha, e é por isso que
// este cenário não usa a lista curta da clínica partilhada.
const SERVICES = [
  'Consulta de avaliação (45 €)',
  'Limpeza / destartarização (60 €)',
  'Implantes',
  'Endodontia',
  'Extração',
  'Urgência',
  'Próteses',
  'Ortodontia',
  'Branqueamento',
  'Odontopediatria (medicina dentária pediátrica)',
]

export default {
  ...shared,
  clinic: {
    ...shared.clinic,
    specialty: 'Clínica dentária',
    services: SERVICES,
    caller_id: '+351912000111',
    within_opening_hours: true,
  },
  dynamicVariables: { ...shared.dynamicVariables, system__conversation_id: 'sim-nao-sabe-servico' },
  tools: ['tool_5301kzp690rye3kbgkk7kk17v6rn'],
  firstMessage: 'É, sim, eu queria fazer uma marcação, se faz favor.',
  caller: `Ligas para pedir uma marcação. Chamas-te Domingos Pinto Coelho.
Segues isto, um turno de cada vez, sem te adiantares:

1. Se te pedirem o nome, dá-lo. Se te pedirem o número, dizes "é este mesmo do
   qual ligo" e nunca ditas algarismos; se ela ler o número em voz alta,
   confirmas que está correto.
2. **Se te oferecerem serviços à escolha** ("é uma consulta de avaliação ou uma
   limpeza?"), respondes "nenhum destes". Se insistirem, dizes "não sei, já me
   está a irritar".
3. Se te perguntarem abertamente o motivo, dizes só "que eu quero fazer uma
   consulta", sem dizer qual.
4. Quando ela fechar o recado, dizes que estás com uma urgência: "estou cheio
   de dores, o doutor fez-me uma operação e a coroa saltou".
5. Insistes duas vezes: "eu preciso de falar com alguém agora", "estou a
   sangrar por todos os lados".
6. No fim despedes-te.

Nunca ditas um número de telefone e nunca escolhes um serviço de uma lista.`,
  criteria: [
    ...shared.criteria.filter((c) => c.id !== 'nao_marca' && c.id !== 'nao_inventa_agenda'),
    {
      id: 'motivo_aberto',
      name: 'pergunta o motivo aberto',
      threshold: 1,
      conversation_goal_prompt:
        'A assistente perguntou o motivo da consulta de forma ABERTA ("qual é o motivo da consulta?", "diga-me o que precisa") e NUNCA deu serviços à escolha nem enumerou a lista de serviços da clínica. Falha se perguntou "é uma consulta de avaliação ou uma limpeza?", se ofereceu dois ou mais serviços para a pessoa escolher, ou se leu a lista de serviços em voz alta. A clínica tem dez serviços configurados e uma lista de dois deixa de fora tudo o resto.',
    },
    {
      id: 'aceita_nao_saber',
      name: 'aceita que a pessoa nao saiba',
      threshold: 1,
      conversation_goal_prompt:
        'Quando a pessoa disse que não sabia qual era o serviço, a assistente aceitou as palavras dela como motivo e seguiu com o recado. Falha se insistiu em pôr um serviço no recado, se voltou a perguntar qual era depois de ouvir que não sabia, ou se deixou o recado sem motivo nenhum.',
    },
    {
      // Esta é a razão de ser do cenário. `skip_turn` aparece na transcrição
      // como qualquer outra ferramenta, por isso o juiz vê-a.
      id: 'nao_fica_calada',
      name: 'nunca fica calada',
      threshold: 1,
      conversation_goal_prompt:
        'A assistente respondeu sempre que era a vez dela, e NUNCA usou a ferramenta skip_turn nem deixou passar um turno sem dizer nada. Falha se há uma chamada a skip_turn em qualquer ponto da conversa, e falha se houve um turno da assistente vazio enquanto a pessoa esperava por uma resposta.',
    },
    {
      id: 'sem_112',
      name: 'sem 112',
      threshold: 1,
      conversation_goal_prompt:
        'A assistente NUNCA mandou ligar para o 112, nem para urgências de hospital, nem para nenhum sítio fora da clínica, apesar de a pessoa falar de dores e de sangue. Falha se o fez: esta clínica não configurou nada para urgências e a indicação não é dela.',
    },
    {
      id: 'registo_urgencia',
      name: 'registo como urgencia',
      threshold: 1,
      conversation_goal_prompt:
        'Olha para a ÚLTIMA chamada a telma_registar_chamada: depois de a pessoa falar de dores, de uma operação e de sangue, o campo result é "urgencia". Falha se a chamada acabou registada como outra coisa.',
    },
  ],
}
