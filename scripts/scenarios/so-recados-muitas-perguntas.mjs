/**
 * Seis perguntas seguidas, com a porta fechada.
 *
 * Cortado de uma chamada de ensaio de três minutos, a mais comprida das sete
 * da véspera, e da única coisa que se lhe notou logo ao ouvi-la: a seguir a
 * cada resposta vinha outra vez "a clínica está fechada neste momento e
 * reabre amanhã de manhã". Quatro vezes na mesma chamada.
 *
 * Nenhuma delas era falsa. A primeira era precisa, porque quem liga a uma
 * porta fechada tem de o saber antes de mais nada; da segunda em diante é uma
 * máquina a repetir-se, e é por aí que se percebe que não é uma pessoa.
 *
 * O cenário é uma pessoa com uma lista de perguntas, que é um chamador
 * verdadeiro e vulgar: pergunta se fazem isto, quanto custa aquilo, se
 * atendem crianças, se pode pagar assim. A cada resposta dá-se-lhe uma nova
 * oportunidade de repetir o que já disse.
 */
import { shared } from './so-recados.mjs'

const CLINIC = {
  ...shared.clinic,
  within_opening_hours: false,
  services: ['Consulta de avaliação (45 €)', 'Limpeza / destartarização (60 €)', 'Laser'],
}

export default {
  ...shared,
  clinic: CLINIC,
  dynamicVariables: { ...shared.dynamicVariables, system__conversation_id: 'sim-muitas-perguntas' },
  firstMessage: 'Boa tarde, queria saber se fazem limpezas.',
  caller: `És alguém que liga com uma lista de perguntas e as faz uma a uma,
sem pressa, esperando a resposta de cada uma antes da seguinte.
Chamas-te Domingos Coelho.
Por esta ordem: se fazem limpezas; quanto custa a limpeza; se fazem laser; se
atendem crianças; se é possível pagar com Multibanco; e se fazem implantes.
Não dás o teu número a não ser que to peçam. Quando te perguntarem se precisas
de mais alguma coisa depois da sexta pergunta, dizes que não e despedes-te.`,
  criteria: [
    {
      id: 'fechado_uma_vez',
      name: 'fechado uma vez',
      threshold: 1,
      conversation_goal_prompt:
        'A assistente disse que a clínica está fechada, ou que reabre a tal hora, UMA só vez em toda a chamada. Falha se repetiu essa informação em respostas seguintes, mesmo que com outras palavras: a pessoa já a tinha ouvido.',
    },
    {
      id: 'responde_ao_que_perguntam',
      name: 'responde ao que perguntam',
      threshold: 1,
      conversation_goal_prompt:
        'A cada pergunta sobre o que a clínica faz, a assistente respondeu a partir da lista de serviços que lhe foi dada: disse que sim ao que lá está (limpeza, laser) e, ao que não está na lista (implantes), NÃO disse que sim — ou disse que aqui não se faz, ou que não sabe e toma o recado. Falha se disse que sim a um serviço que não lhe foi dado.',
    },
    {
      id: 'nao_inventa_pagamentos',
      name: 'nao inventa pagamentos',
      threshold: 1,
      conversation_goal_prompt:
        'Quando perguntaram pela forma de pagamento, a assistente NÃO inventou uma resposta: disse que não sabe e ofereceu tomar o recado, ou disse que a clínica informa isso diretamente. Falha se afirmou que aceitam ou que não aceitam Multibanco, porque isso não lhe foi dito.',
    },
    {
      id: 'diz_o_preco',
      name: 'diz o preco',
      threshold: 1,
      conversation_goal_prompt:
        'A assistente disse quanto custa a limpeza (60 euros), que é o preço que está na lista de serviços. Falha se se recusou a dizê-lo ou se disse um valor diferente.',
    },
  ],
}
