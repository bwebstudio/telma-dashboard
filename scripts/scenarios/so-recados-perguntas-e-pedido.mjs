/**
 * As chamadas de 30/10 ao meio-dia, que são o dia normal da clínica: uma
 * pergunta, e um pedido a seguir.
 *
 * O que elas mostraram, por ordem de gravidade:
 *
 * 1. **Duas chamadas de seis acabaram sem registo nenhum.** Ela disse "fica
 *    anotado, a clínica liga-lhe de volta", a pessoa desligou, e a ferramenta
 *    nunca foi chamada. O webhook de fim de chamada escreveu a linha -- por
 *    isso a clínica não perdeu o recado -- mas escreveu-a como "informação",
 *    que é a cor errada para um pedido de marcação.
 * 2. **"Diga-me o seu primeiro e último nome e qual é o melhor número."** Duas
 *    perguntas numa, com a proibição escrita duas linhas acima na folha.
 * 3. **"Fica o número de onde está a ligar, nove, um, quatro, cinco, um,
 *    dois, quatro, três, sete. Qual é o motivo da consulta?"** Os nove
 *    algarismos ditos e a pergunta seguinte na mesma fala: aquele número nunca
 *    foi confirmado por ninguém.
 * 4. **"Acabei de dizer, é o cheque-dentista."** Perguntou o motivo a quem o
 *    tinha explicado duas falas antes.
 */
import { shared } from './so-recados.mjs'

export default {
  ...shared,
  clinic: {
    ...shared.clinic,
    caller_id: '+351914512437',
    within_opening_hours: true,
    // O horário da clínica a sério, com as duas pausas, que é o que a pergunta
    // do horário tem de devolver. A clínica partilhada tem um horário corrido
    // e deixava o critério a medir outra coisa.
    opening_hours: [
      'Segunda: 08:00-13:00 e 14:00-19:00',
      'Terça: 08:00-13:00 e 14:00-19:00',
      'Quarta: 08:00-13:00 e 14:00-19:00',
      'Quinta: 08:00-13:00 e 14:00-19:00',
      'Sexta: 08:00-13:00 e 14:00-19:00',
    ],
  },
  dynamicVariables: {
    ...shared.dynamicVariables,
    system__conversation_id: 'sim-perguntas-e-pedido',
    system__caller_id: '+351914512437',
  },
  tools: ['tool_5301kzp690rye3kbgkk7kk17v6rn'],
  firstMessage: 'Olá, qual é o vosso horário de funcionamento?',
  caller: `Chamas-te Andreia Fernandes e ligas por duas coisas. Segues isto, um
turno de cada vez:

1. Perguntas o horário de funcionamento.
2. Quando ela responder, dizes: "tenho um cheque-dentista, posso marcar uma
   consulta para isso?".
3. Se te pedirem o nome, respondes "Andreia Fernandes e o contacto é este
   mesmo de onde estou a ligar". Nunca ditas algarismos.
4. Se ela ler o número em voz alta e perguntar se está certo, confirmas.
5. **Se te perguntarem para que é a consulta, respondes "acabei de dizer, é o
   cheque-dentista"**, porque já o explicaste no ponto 2.
6. Quando ela perguntar se precisas de mais alguma coisa, dizes que não e
   despedes-te.`,
  criteria: [
    ...shared.criteria.filter((c) => c.id !== 'nao_marca' && c.id !== 'nao_inventa_agenda'),
    {
      // A pior das quatro: sem isto a clínica fica a depender do webhook de
      // fim de chamada, que escreve a linha mas não sabe o que ela pediu.
      id: 'registou_a_chamada',
      name: 'registou a chamada',
      threshold: 1,
      conversation_goal_prompt:
        'Houve pelo menos uma chamada à ferramenta telma_registar_chamada antes do fim da conversa, e foi feita ANTES de a assistente dizer que o recado fica anotado. Falha se a conversa acabou sem nenhuma chamada à ferramenta, e falha se ela disse "fica anotado" sem ter registado antes: quem desliga a seguir deixa a clínica sem recado nenhum.',
    },
    {
      id: 'uma_pergunta_de_cada_vez',
      name: 'uma pergunta de cada vez',
      threshold: 1,
      conversation_goal_prompt:
        'Cada fala da assistente pede UMA coisa só. Falha se alguma juntou duas perguntas, por exemplo "diga-me o seu primeiro e último nome e qual é o melhor número para lhe ligarem". ATENÇÃO: uma frase de contexto seguida de uma pergunta ("fico com o recado. Diga-me o seu nome") é uma pergunta só e passa.',
    },
    {
      id: 'nao_repete_o_motivo',
      name: 'nao repete o motivo',
      threshold: 1,
      conversation_goal_prompt:
        'A pessoa explicou no início que o pedido era por causa de um cheque-dentista. A assistente NÃO voltou a perguntar para que era a consulta depois disso. Falha se perguntou o motivo quando a pessoa já o tinha dito, que é o que faz alguém responder "acabei de dizer".',
    },
    {
      id: 'responde_ao_horario',
      name: 'responde ao horario',
      threshold: 1,
      conversation_goal_prompt:
        'A assistente respondeu ao horário de funcionamento com o que está na folha (segunda a sexta, das oito às treze e das catorze às dezanove) e não inventou nem sábados nem domingos. Falha se não respondeu ou se deu um horário diferente do da folha.',
    },
  ],
}
