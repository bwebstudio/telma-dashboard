/**
 * Quer falar com uma pessoa, e não tem urgência nenhuma.
 *
 * A clínica corrigiu-nos nisto em 30/10, e a correção era minha para fazer:
 * eu tinha escrito, na folha e na descrição do campo do registo, que **quem
 * pede para falar com alguém fica etiquetado como urgência**. Não é isso que
 * a clínica quer. Urgência é o que a pessoa descreve; quem só quer falar com
 * alguém leva o recado que o pedido é, e no resumo fica dito que pediu para
 * falar com alguém da clínica.
 *
 * Importa porque o painel pinta a urgência a vermelho: vermelho que não é
 * urgência ensina a receção a não olhar para a cor, e a urgência a sério
 * deixa de se ver.
 *
 * O outro lado desta moeda está em so-recados-quer-pessoa.mjs, onde a pessoa
 * descreve uma dor forte e aí a etiqueta é urgência. Os dois cenários medem a
 * mesma regra pelas duas pontas.
 */
import { shared } from './so-recados.mjs'

export default {
  ...shared,
  clinic: { ...shared.clinic, caller_id: '+351912000111', within_opening_hours: true },
  dynamicVariables: {
    ...shared.dynamicVariables,
    system__conversation_id: 'sim-quer-pessoa-sem-urgencia',
  },
  tools: ['tool_5301kzp690rye3kbgkk7kk17v6rn'],
  firstMessage: 'Boa tarde, eu queria falar com a Dona Carla da receção, por favor.',
  caller: `Chamas-te Teresa Marques e ligas para falar com a Dona Carla, da
receção, por causa de um recibo da consulta do mês passado que precisas para
o seguro. **Não tens dores, não tens nenhuma urgência e não falas de nada
clínico.** Segues isto, um turno de cada vez:

1. Pedes para falar com a Dona Carla.
2. Se te disserem que ficam com o recado, insistes: "mas eu queria falar com
   ela directamente, é mais fácil".
3. Insistes uma segunda vez: "não consigo mesmo falar com ninguém?".
4. Se te pedirem o nome, dá-lo. Se te pedirem o número, dizes "é este mesmo de
   onde estou a ligar" e nunca ditas algarismos; se ela ler o número em voz
   alta e perguntar se está certo, confirmas que sim.
5. Quando ela perguntar se precisas de mais alguma coisa, dizes que não e
   despedes-te.`,
  criteria: [
    ...shared.criteria.filter((c) => c.id !== 'nao_marca' && c.id !== 'nao_inventa_agenda'),
    {
      // A razão de ser do cenário.
      id: 'nao_e_urgencia',
      name: 'nao fica como urgencia',
      threshold: 1,
      conversation_goal_prompt:
        'Olha para as chamadas a telma_registar_chamada: o campo result NÃO é "urgencia". Esta pessoa não descreveu dores nem nada clínico, só quis falar com alguém da receção, por isso a etiqueta certa é "informacao" (ou um pedido, se tivesse pedido consulta). Falha se ficou registada como urgência: o painel pinta a urgência a vermelho e vermelho que não é urgência ensina a receção a não olhar para a cor.',
    },
    {
      id: 'nao_promete_urgente',
      name: 'nao promete marcar como urgente',
      threshold: 1,
      conversation_goal_prompt:
        'A assistente NUNCA disse que ia deixar isto escrito como urgente, nem que o ia marcar como urgência. Falha se o disse: não há urgência nenhuma nesta chamada e prometer essa etiqueta é prometer uma coisa que a chamada não leva.',
    },
    {
      id: 'resumo_diz_o_que_queria',
      name: 'o resumo diz que queria falar com alguem',
      threshold: 1,
      conversation_goal_prompt:
        'No último registo, o campo summary diz que a pessoa pediu para falar com alguém da clínica (a Dona Carla, ou a receção) e para que era. Falha se o resumo não diz que ela queria falar com alguém: é isso que a receção precisa de ler para saber o que fazer com a chamada.',
    },
    {
      id: 'explica_o_que_pode_fazer',
      name: 'explica o que pode fazer',
      threshold: 1,
      conversation_goal_prompt:
        'Quando a pessoa insistiu, a assistente explicou o que pode fazer: que quem atende as chamadas é ela, ou que o que ela faz é ficar com o recado e a clínica liga de volta. Falha se só repetiu a mesma frase sem explicar nada. ATENÇÃO: dizer que não passa chamadas é uma explicação válida e passa; o que não pode dizer é que não está lá ninguém.',
    },
    {
      id: 'nao_diz_que_nao_ha_ninguem',
      name: 'nao diz que nao ha ninguem',
      threshold: 1,
      conversation_goal_prompt:
        'A assistente NUNCA disse que não está ninguém na receção, que a Dona Carla não está, que não há ninguém disponível, nem nada sobre quem está ou não está na clínica. Falha se disse alguma dessas: a clínica está aberta e a receção está a trabalhar, e isso é falso.',
    },
  ],
}
