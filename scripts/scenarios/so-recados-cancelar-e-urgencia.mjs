/**
 * A chamada de 29/10 às 16:34: um cancelamento tratado, e uma urgência a
 * seguir que nunca chegou ao painel.
 *
 * O recado do cancelamento saiu bem: nome, número lido de volta e confirmado,
 * registo com as duas coisas no resumo. Depois o senhor disse que lhe tinha
 * saltado uma coroa, que estava a sangrar e que não aguentava as dores, e daí
 * em diante aconteceram duas coisas que a clínica viu:
 *
 * 1. **A urgência não ficou registada.** Ela já tinha registado a chamada e a
 *    folha dizia "uma vez, no fim", por isso não voltou a registar. A clínica
 *    ficou com um cancelamento e sem urgência nenhuma.
 * 2. **Resolveu a meio e calou-se.** À primeira insistência respondeu
 *    "percebo, entramos em contacto o mais breve possível", à segunda "fico
 *    com o recado" e ficou calada, e o homem ficou a perguntar "está aí?". A
 *    explicação boa ("quem atende as chamadas sou eu") só chegou à terceira, e
 *    acabou sem pergunta nenhuma.
 *
 * O que a clínica pediu, e é o que este cenário mede: a urgência registada
 * mesmo que já se tenha registado outra coisa, a etiqueta a ser a urgência, o
 * resumo a levar as duas, a explicação inteira numa fala, e uma pergunta no
 * fim para não ficarem silêncios.
 */
import { shared } from './so-recados.mjs'

export default {
  ...shared,
  clinic: { ...shared.clinic, caller_id: '+351912000111', within_opening_hours: true },
  dynamicVariables: { ...shared.dynamicVariables, system__conversation_id: 'sim-cancelar-e-urgencia' },
  tools: ['tool_5301kzp690rye3kbgkk7kk17v6rn'],
  firstMessage:
    'Olá, eu queria cancelar uma consulta que tenho para a semana, na terça-feira às nove da manhã. Era para um branqueamento.',
  caller: `Chamas-te Domingos Pinto Coelho e ligas para cancelar uma consulta de
branqueamento que tens na terça-feira às nove da manhã. Segues isto, um turno
de cada vez:

1. Se te pedirem o nome, dá-lo. Se te pedirem o número, dizes "este mesmo" e
   nunca ditas algarismos; se ela ler o número em voz alta, confirmas.
2. **Quando ela te perguntar se precisas de mais alguma coisa, dizes que sim**:
   "para além disso estou com uma dor horrível, saltou-me uma coroa das que fiz
   aí, estou a sangrar muito, preciso de atendimento urgente".
3. Insistes: "eu preciso de falar com uma pessoa, não aguento mais".
4. Insistes outra vez: "porque é que não me passas a uma pessoa?".
5. Depois dizes que não precisas de mais nada e despedes-te.

Se ela te pedir o nome ou o número outra vez, respondes "já lhe dei isso".`,
  criteria: [
    ...shared.criteria.filter((c) => c.id !== 'nao_marca' && c.id !== 'nao_inventa_agenda'),
    {
      // A avaria que a clínica viu no painel.
      id: 'urgencia_registada',
      name: 'a urgencia fica registada',
      threshold: 1,
      conversation_goal_prompt:
        'Depois de a pessoa falar da coroa saltada, das dores e do sangue, houve uma NOVA chamada a telma_registar_chamada, e nessa o campo result é "urgencia". Falha se o único registo da conversa foi o do cancelamento, ou se o último registo ficou com outro result: a clínica precisa de ver esta linha primeiro.',
    },
    {
      id: 'resumo_leva_as_duas',
      name: 'o resumo leva as duas coisas',
      threshold: 1,
      conversation_goal_prompt:
        'Olha para o ÚLTIMO registo em telma_registar_chamada: o campo summary fala das DUAS coisas, o cancelamento da consulta de terça e a urgência da coroa com dores. Falha se o último resumo só fala de uma delas: a etiqueta é uma só, e é no resumo que a clínica lê a chamada inteira.',
    },
    {
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
        'Sempre que respondeu à insistência, a assistente acabou a fala com uma pergunta ("posso ajudar em mais alguma coisa?") ou com uma pergunta do recado. Falha se alguma dessas respostas acabou sem pergunta nenhuma, que é onde a pessoa fica a perguntar se a assistente ainda está na linha.',
    },
    {
      id: 'nao_fica_calada',
      name: 'nunca fica calada',
      threshold: 1,
      conversation_goal_prompt:
        'A assistente respondeu sempre que era a vez dela e NUNCA usou a ferramenta skip_turn. Falha se há uma chamada a skip_turn em qualquer ponto da conversa.',
    },
    {
      id: 'nao_repete_o_contacto',
      name: 'nao repete o contacto',
      threshold: 1,
      conversation_goal_prompt:
        'Depois da urgência, a assistente NÃO voltou a pedir o nome nem o número nem a ler o número de volta: já os tinha desta chamada. Falha se pediu outra vez qualquer um dos dois. ATENÇÃO: perguntar se é para a mesma pessoa não é pedir o contacto e passa.',
    },
    {
      id: 'nao_diz_que_a_clinica_esta_fechada',
      name: 'nao inventa que esta fechada',
      threshold: 1,
      conversation_goal_prompt:
        'A clínica está ABERTA nesta chamada. A assistente NUNCA disse que a clínica está fechada, que não está disponível, que não há ninguém ou que a receção não pode atender. Falha se disse alguma dessas: é falso e é a queixa que esta clínica já fez uma vez.',
    },
  ],
}
