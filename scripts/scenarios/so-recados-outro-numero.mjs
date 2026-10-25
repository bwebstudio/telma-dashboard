/**
 * O recado de quem quer ser chamado noutro número, e o preço que a clínica
 * escreveu.
 *
 * Cortado das sete chamadas de ensaio da véspera do primeiro cliente, porque
 * foi aí que estas três coisas se viram pela primeira vez, todas na mesma
 * manhã e nenhuma delas coberta por um cenário:
 *
 *  - Alguém ditou um número diferente daquele de onde estava a ligar. Ela
 *    leu-o de volta, a pessoa confirmou, e esse número não ficou em lado
 *    nenhum: o painel guarda o número da chamada, e a clínica ligaria para o
 *    outro. Um recado é inteiramente a promessa de uma chamada de volta, por
 *    isso é o número que o faz valer alguma coisa.
 *  - Deu por bom um número de oito algarismos.
 *  - Recusou dizer um preço que a clínica tinha escrito ao lado do serviço,
 *    porque a folha dizia ao mesmo tempo "este serviço custa 45 €" e "não
 *    falas de preços".
 *
 * E a quarta, que não é desta chamada mas acontece em todas: perguntar "mais
 * alguma coisa?" e desligar no mesmo turno.
 */
import { shared } from './so-recados.mjs'

/** A mesma clínica, com o preço que o cliente verdadeiro escreveu. */
const CLINIC = {
  ...shared.clinic,
  services: ['Consulta de avaliação (45 €)', 'Limpeza / destartarização (60 €)', 'Laser'],
}

/**
 * A ferramenta de registar, a verdadeira.
 *
 * Os outros cenários correm sem ferramentas nenhumas, e para quase tudo isso
 * chega: o que se mede são as palavras. Este não, porque metade do que se mede
 * aqui é o que ela **escreve** -- um número ditado que tem de ficar no recado
 * -- e sem a ferramenta não há recado nenhum para ler. O juiz da plataforma
 * dizia exactamente isso: "o transcript não mostra o resumo registado".
 *
 * Escreve na clínica de demonstração, que é para onde esta ferramenta aponta.
 * Deixa lá uma chamada por cada corrida, e é por isso que este cenário se
 * corre uma vez e se limpa a seguir.
 */
const REGISTAR = 'tool_5301kzp690rye3kbgkk7kk17v6rn'

export default {
  ...shared,
  clinic: CLINIC,
  tools: [REGISTAR],
  dynamicVariables: { ...shared.dynamicVariables, system__caller_id: '+351912000111' },
  firstMessage: 'Boa tarde, queria saber quanto custa a consulta de avaliação.',
  caller: `És alguém que nunca foi a esta clínica e liga a perguntar o preço da
consulta de avaliação. Falas com naturalidade.
Chamas-te Helena Dias.
Depois de te responderem ao preço, pedes que te liguem **noutro número**, e
dizes primeiro "nove, um, três, zero, dois, um, dois" e mais nada — faltam dois
algarismos de propósito. Só se a assistente disser que faltam é que dás o número
inteiro: "nove, um, três, zero, dois, um, dois, um, dois".
No fim, quando ela perguntar se precisas de mais alguma coisa, respondes que não.`,
  criteria: [
    {
      id: 'diz_o_preco',
      name: 'diz o preco',
      threshold: 1,
      conversation_goal_prompt:
        'A assistente disse em voz alta quanto custa a consulta de avaliação (45 euros), que é o preço que lhe foi dado na lista de serviços. Falha se se recusou a dizer o preço, se disse que a clínica informa isso diretamente, ou se disse um valor diferente.',
    },
    {
      id: 'nove_algarismos',
      name: 'nove algarismos',
      threshold: 1,
      conversation_goal_prompt:
        'Quando a pessoa deu um número com menos de nove algarismos, a assistente disse que faltavam algarismos e pediu o número outra vez. Falha se deu o número curto por bom, e falha se nunca percebeu que estava incompleto.',
    },
    {
      id: 'numero_no_recado',
      name: 'numero no recado',
      threshold: 1,
      conversation_goal_prompt:
        'Ao registar a chamada, a assistente passou o número que a pessoa pediu que lhe ligassem, 913021212: ou no campo callback_phone, ou escrito no resumo com todos os algarismos. Falha se esse número não vai em lado nenhum do registo, porque a pessoa pediu que lhe ligassem para ele e não para o número de onde ligou.',
    },
    {
      id: 'nao_corta',
      name: 'nao corta',
      threshold: 1,
      conversation_goal_prompt:
        'A última coisa que a assistente disse foi uma despedida, e não uma pergunta. Falha se a chamada terminou logo a seguir a ela perguntar se podia ajudar em mais alguma coisa, sem a pessoa ter tido oportunidade de responder.',
    },
    {
      id: 'nao_marca',
      name: 'nao marca',
      threshold: 1,
      conversation_goal_prompt:
        'Ao longo da chamada, a assistente NUNCA ofereceu uma hora nem um dia concretos para uma consulta, e NUNCA disse que ficava marcada. Falha se ofereceu horas ou se deu a entender que a marcação ficou feita.',
    },
  ],
}
