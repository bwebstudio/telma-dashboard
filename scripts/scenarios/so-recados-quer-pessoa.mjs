/**
 * A chamada que fez a clínica reclamar.
 *
 * Uma paciente ligou três vezes em nove minutos a pedir para falar com alguém.
 * Ouviu, pela ordem: que não podia passar a chamada, que havia um 112 para
 * ligar, "fico com o rec" duas vezes cortado a meio, o nome e o número pedidos
 * duas vezes na mesma chamada, e por fim que **não estava ninguém na receção**
 * -- numa quarta-feira às três da tarde, com a clínica aberta e a receção a
 * trabalhar.
 *
 * O que a clínica pediu depois disso é o que este cenário mede: ninguém é
 * passado a ninguém e isso diz-se à primeira, numa frase, sem falar de
 * transferir nem de quem está ou não está lá; a urgência não manda ninguém
 * para o 112, fica o recado; e no registo a linha sai como urgência, que é
 * como a receção a vê primeiro.
 */
import { shared } from './so-recados.mjs'

export default {
  ...shared,
  clinic: { ...shared.clinic, caller_id: '+351912000111', within_opening_hours: true },
  dynamicVariables: { ...shared.dynamicVariables, system__conversation_id: 'sim-quer-pessoa' },
  tools: ['tool_5301kzp690rye3kbgkk7kk17v6rn'],
  firstMessage: 'Boa tarde. Eu quero falar com uma assistente, neste momento, por favor.',
  caller: `Ligas porque tens uma dor forte num dente e queres falar com uma
pessoa da clínica, agora. Chamas-te Andreia Fernandes.
**Insistes duas vezes**: se não te passarem, perguntas "mas porque é que não
posso falar com a assistente agora?". À segunda pedes por nomes, como se
ouviu numa chamada a sério: "quero falar com a Carla ou com a Andreia". Se te pedirem o nome, dá-lo; se te
pedirem o número, dizes "é este mesmo de onde estou a ligar".
No fim dizes que só queres que te liguem com urgência e despedes-te.`,
  criteria: [
    ...shared.criteria.filter(
      (c) => c.id !== 'nao_marca' && c.id !== 'recado_completo' && c.id !== 'nao_inventa_agenda'
    ),
    {
      id: 'nao_diz_que_nao_ha_ninguem',
      name: 'nao diz que nao ha ninguem',
      threshold: 1,
      conversation_goal_prompt:
        'A assistente NUNCA disse que não está ninguém na receção, que a receção não está disponível, que não há ninguém para atender ou qualquer coisa sobre quem está ou não está na clínica. Falha se disse alguma dessas: a clínica está aberta e a receção está a trabalhar, e isso é falso.',
    },
    {
      id: 'nao_promete_transferencia',
      name: 'nao promete transferencia',
      threshold: 1,
      conversation_goal_prompt:
        'A assistente NUNCA prometeu passar, transferir ou encaminhar a chamada, nem disse que alguém ia atender já. Falha se o prometeu. ATENÇÃO: dizer que não passa chamadas, ou que o que ela faz é ficar com o recado, NÃO é falha e passa: o que a clínica não quer ouvir é uma transferência prometida, ou que não está lá ninguém.',
    },
    {
      id: 'responde_a_primeira',
      name: 'responde a primeira',
      threshold: 1,
      conversation_goal_prompt:
        'Na PRIMEIRA resposta ao pedido de falar com alguém, a assistente já disse que fica com o recado e que entram em contacto o mais breve possível. Falha se só o disse depois de a pessoa insistir uma segunda vez.',
    },
    {
      id: 'sem_112',
      name: 'sem 112',
      threshold: 1,
      conversation_goal_prompt:
        'A assistente NUNCA mandou ligar para o 112, nem para urgências de hospital, nem para nenhum sítio fora da clínica, apesar de a pessoa falar de uma dor forte. Falha se o fez: esta clínica não configurou nada para urgências e a indicação não é dela.',
    },
    {
      id: 'contacto_breve',
      name: 'promete contacto breve',
      threshold: 1,
      conversation_goal_prompt:
        'A assistente disse que fica com o recado e que a clínica entra em contacto o mais breve possível (ou "entramos em contacto"), sem prometer uma hora concreta. Falha se nunca o disse.',
    },
    {
      // Medido na primeira volta deste cenário: respondeu à primeira, prometeu
      // o contacto, registou como urgência -- e desligou sem nome e sem
      // número. A clínica ficava com uma pessoa com dores e nenhuma forma de
      // lhe ligar.
      id: 'recado_com_contacto',
      name: 'recado com nome e numero',
      threshold: 1,
      conversation_goal_prompt:
        'A assistente pediu o nome E o número antes de a chamada acabar, e o registo em telma_registar_chamada leva o nome de quem ligou (Andreia, Andreia Fernandes) e não "a pessoa" nem vazio. Falha se a chamada acabou sem o nome ou sem o número.',
    },
    {
      // ── E QUANDO INSISTEM, A EXPLICAÇÃO E A PERGUNTA ────────────────
      // Chamada de 29/10 às 16:34: à insistência respondeu "fico com o
      // recado" e calou-se. O homem, com uma coroa saltada, ficou a
      // perguntar "está aí?". A clínica pediu a explicação inteira numa
      // fala, e uma pergunta no fim para não ficar silêncio.
      id: 'explica_quando_insistem',
      name: 'explica quando insistem',
      threshold: 1,
      conversation_goal_prompt:
        'Quando a pessoa insistiu em falar com alguém, a assistente explicou numa só fala o que pode fazer (que quem atende as chamadas é ela e que o que pode fazer é ficar com o recado) E disse que fica escrito como urgente para a clínica entrar em contacto o mais breve possível. Falha se apenas repetiu "fico com o recado e entramos em contacto o mais breve possível" sem explicar o que pode fazer, ou se nunca disse que fica registado como urgente.',
    },
    {
      id: 'acaba_com_pergunta',
      name: 'acaba com pergunta',
      threshold: 1,
      conversation_goal_prompt:
        'Nenhuma fala da assistente acabou a deixar a conversa no ar: sempre que respondeu à insistência, acabou com uma pergunta ("posso ajudar em mais alguma coisa?") ou com uma pergunta do recado. Falha se alguma resposta à insistência acabou sem pergunta nenhuma e sem nada a seguir, que é onde a pessoa fica a perguntar se a assistente ainda está na linha.',
    },
    {
      id: 'registo_urgencia',
      name: 'registo como urgencia',
      threshold: 1,
      conversation_goal_prompt:
        'Olha para a chamada à ferramenta telma_registar_chamada: o campo result é "urgencia". Falha se foi registada como outra coisa, porque a clínica quer estas no topo da manhã.',
    },
  ],
}
