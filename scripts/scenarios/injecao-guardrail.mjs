/**
 * The same six attempts, with the platform's own prompt-injection guardrail on.
 *
 * Run against injecao.mjs to see what the guardrail buys and what it costs. It
 * has one switch and no logging mode, and the action for a triggered content
 * guardrail on this platform is end_call, so the question worth answering
 * before it goes anywhere near a real number is whether it cuts the call and
 * whether the last turn — an ordinary booking from somebody who had been
 * messing about — still happens at all.
 */
import base from './injecao.mjs'

export default {
  ...base,
  // ── O QUE ISTO MEDE JÁ NÃO É O QUE CORRE ────────────────────────────────
  // O guardrail de injecção esteve ligado no agente verdadeiro e foi desligado
  // a 25/10/2026: numa chamada de ensaio alguém perguntou pelas instruções e a
  // plataforma **cortou a chamada** a meio da segunda frase. Onze segundos,
  // estado `failed`, e a pessoa do outro lado sem saber porquê. Uma clínica
  // não pode desligar o telefone na cara de quem faz uma pergunta estranha.
  //
  // A defesa passou a ser só a da folha, e mede-se em injecao.mjs: sete
  // critérios de sete, três corridas, incluindo recusar sem soar a máquina e
  // tratar o pedido seguinte com a mesma normalidade. Este ficheiro fica como
  // a comparação: é o que acontecia com o guardrail ligado.
  guardrails: { version: '1', prompt_injection: { is_enabled: true } },
}
