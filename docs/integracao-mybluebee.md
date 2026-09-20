# Telma · Integração com o MyBlueBee

Documento de integração para a equipa de produto do MyBlueBee. Descreve o que a
Telma é, o que precisa de consultar e escrever na agenda da clínica, e o que
disso já está coberto pela API de marcação de consultas que nos enviaram a 19 de
agosto.

Escrito para responder a uma pergunta concreta do Vinícius na reunião: *"primeiro
gostaríamos de entender o que nós temos que integrar"*. A resposta curta está na
secção 3.

> **Estado:** a Telma atende chamadas reais e marca consultas na sua própria
> agenda. **Ainda não está ligada a nenhum software de gestão de clínica.** O
> MyBlueBee seria o primeiro, e é por isso que este documento descreve o que a
> Telma consome, não uma integração que já exista.

---

## 1. O que é a Telma

Uma rececionista virtual que atende ao telefone, por voz. Atende a chamada,
percebe o que a pessoa quer, responde às dúvidas correntes da clínica (horários,
morada, o que se faz e o que não se faz), marca, cancela e, quando não consegue
resolver, encaminha para a equipa da clínica.

**O idioma é configuração, não é limite.** Cada clínica escolhe em que língua a
Telma atende, e uma clínica pode atender em mais do que uma: o Algarve e a Costa
del Sol recebem tanta chamada em inglês como na língua do país. Em produção,
hoje, estão o português e o espanhol.

O que a distingue de um menu de opções é que não há menu: a pessoa fala como
falaria com uma rececionista, e a Telma responde. O que a distingue de um chatbot
é o canal: é uma chamada telefónica, com o tempo de resposta que uma conversa
falada tolera.

Existe para as horas em que não há ninguém na receção. Uma clínica que fecha às
19h perde as chamadas das 19h às 9h e as de sábado, e a maior parte delas são
marcações.

---

## 2. Onde é que a integração entra

Hoje a Telma tem agenda própria: a clínica diz-nos que horas oferece, e a Telma
oferece essas. Funciona, e é o que está a correr, mas obriga a clínica a manter
duas agendas, o que nenhuma clínica quer fazer e nenhuma faz bem durante muito
tempo.

Integrada com o MyBlueBee, a agenda deixa de ser nossa. A Telma passa a ler e a
escrever na agenda que a clínica já usa, e a receção continua a trabalhar
exactamente como trabalha hoje, sem saber que a Telma existe a não ser pelas
marcações que aparecem.

É esse o desenho que queremos, e é o que nos traz aqui.

---

## 3. O esforço do vosso lado

**A integração é de sentido único: a Telma chama a vossa API, e o MyBlueBee não
precisa de chamar nada nosso.** Não há webhook para receber, não há endpoint para
expor, não há evento para publicar.

Pelo que lemos na `APPOINTMENTS-API.md`, os quinze campos do scope
`appointments-bot` cobrem o fluxo todo da Telma. Não identificámos nenhuma
funcionalidade que tenhamos de vos pedir para construir. O que fica do vosso lado
é: gerar uma chave por clínica piloto, correr o `seed-appointments-scope.sql`, e
o acesso ao ambiente de qualidade com a sessão de formação que o Vinícius
propôs.

Se isto estiver certo, o esforço de desenvolvimento é todo nosso. As três
questões da secção 9 são as que podem mudar esta conclusão, e são perguntas, não
pedidos.

---

## 4. O que a Telma faz, e contra que campo

Uma marcação, do princípio ao fim, e o campo da vossa API que a Telma chamaria
em cada passo.

| # | Na conversa | O que a Telma precisa | Campo |
|---|---|---|---|
| 1 | A chamada chega | Saber de que clínica se trata | (nosso: o número marcado) |
| 2 | "Boa tarde, era para marcar" | Quem está a ligar | `patientByPhone`, e `patientsByPhone` quando o número é de mais do que uma pessoa |
| 3 | "Para uma limpeza" | O que esta clínica marca | `bookableSpecialties`, `bookableProfessionals` |
| 4 | "Tenho quinta às 10h ou sexta às 15h" | As horas realmente livres | `openSlots` |
| 5 | "Sim, quinta às 10h" | Confirmar que ainda está livre | `validateSlot` |
| 6 | "Está marcado" | Escrever a marcação | `bookAppointment` |
| 7 | "Era para desmarcar" | O que este número tem marcado | `patientAppointments`, `cancelAppointment` |
| 8 | "Era para mudar para outro dia" | Mover a marcação | `rescheduleAppointment` |
| 9 | As regras da clínica | Antecedências e horizonte | `appointmentPolicy` |
| 10 | "Confirmo, lá estarei" | Registar a confirmação | `confirmAppointment`, e ver a nota abaixo |

### Sobre os lembretes, e é uma lacuna nossa

Lemos na secção 9 da vossa documentação que não há notificações de saída, e que
enviar o lembrete e recolher a resposta é responsabilidade do canal. Concordamos
com o desenho, e queremos ser claros sobre onde estamos: **hoje a Telma atende,
não contacta.** Não liga nem escreve a ninguém por iniciativa própria, portanto o
`confirmAppointment` só teria uso quando a pessoa liga por sua conta a confirmar,
que acontece pouco.

Isto está no nosso caminho, como extensão por mensagem, e a vossa API já tem o
campo certo à espera. Mas não o vamos apresentar como coberto quando não está.
Se para o piloto a clínica contar com lembretes automáticos, é preciso dizer-se
agora de que lado saem, porque hoje não saem de nenhum.

Hoje a Telma faz os passos 2 a 7 contra a sua própria agenda, e a mudança é de
para onde aponta, não do que faz. O passo 8 é a única capacidade nova: hoje
remarcar é cancelar e voltar a marcar, o que gera dois eventos onde devia haver
um, e a vossa API resolve isso melhor do que nós.

### Três coisas da vossa documentação que já estão incorporadas no desenho

**O `start` é reenviado tal e qual.** A regra de não reformatar nem somar offsets
está percebida. A Telma já separa hoje a hora que diz em voz alta ("quinta-feira
às dez") do identificador com que essa hora é marcada, precisamente para não
haver uma conversão pelo meio.

**Não se lê o nome em voz alta.** A vossa regra sobre o NIF ("é o utente que o
fornece, não o contrário") é a mesma que já aplicamos ao nome: quando alguém quer
cancelar, a Telma nunca diz o nome que está na marcação e pergunta se é aquele.
É a pessoa que diz o nome e o servidor compara.

**As recusas são ditas, não mostradas.** Os vossos `message` vêm redigidos para
uma pessoa ler num ecrã. Num telefone, a Telma vai usar o `code` e dizer a mesma
coisa por palavras dela, que é como uma rececionista o faria. É intencional, e a
pergunta associada está na secção 9.

---

## 5. O que fica do nosso lado

Nada disto toca na vossa API nem na vossa base:

- **A chamada em si**: gravação, duração, resumo, resultado, e o registo de que o
  telefone tocou mesmo quando não houve marcação nenhuma.
- **O painel da clínica**: um sítio onde a clínica vê o que a Telma andou a
  fazer, chamada a chamada, com transcrição.
- **A conversa**: o que a Telma diz, quando encaminha para um humano, o protocolo
  de urgências, o que faz quando alguém liga fora de horas.
- **A faturação do nosso serviço**, que é por minutos de conversa.

Uma clínica integrada continuaria a ver, no painel da Telma, o registo das
chamadas. O que deixa de estar lá é a agenda: essa passa a ser a vossa, e é onde
deve estar.

---

## 6. A telefonia

Ficou uma pergunta em aberto na reunião ("se o número vai ser vosso"). Sim.

O número é nosso, comprado e gerido por nós. A clínica ou mantém o número que já
tem, portando-o, ou recebe um novo. A camada de voz corre na nossa
infraestrutura. Não há nada a instalar do lado da clínica e não há nada a
instalar do vosso.

---

## 7. Volume e latência

Sobre o ponto que o Vinícius levantou, e que é o mesmo que nos preocupa: quem
está ao telefone não espera. Uma pausa de dois segundos numa chamada já se ouve.

**Quantas queries por chamada.** Uma marcação completa são quatro pedidos:
identificar, ver vagas, revalidar, marcar. Um cancelamento são três. Uma chamada
que é só uma pergunta ("a que horas abrem?") são zero, porque essa informação
vem do nosso lado.

Não é um padrão de acesso pesado: são pedidos pequenos, em série, espaçados pelo
tempo que a pessoa leva a falar. Não fazemos varrimentos, não listamos históricos
e não pedimos nada de que não precisemos naquela frase.

**Os vossos 300 milissegundos servem.** O limite de 30 segundos nunca seria
atingido por nós, mas o cenário que descreveram, uma agenda parametrizada ao
segundo, é exactamente o tipo de coisa que rebentaria uma chamada. Se acontecer,
para nós é uma chamada perdida, e queremos saber que aconteceu.

**O `limit` do `openSlots`.** A Telma pede tipicamente uma semana de uma vez, para
poder oferecer horas em dias diferentes sem fazer sete pedidos. Com o máximo de
50 vagas por resposta, uma agenda com muita disponibilidade trunca. Pergunta na
secção 9.

---

## 8. Dados e RGPD

A cadeia, como a entendemos, e é a mesma que o Vinícius descreveu na reunião:

- **A clínica é a responsável pelo tratamento.**
- **Nós somos subcontratantes** dela, para atender o telefone.
- **O MyBlueBee é subcontratante** dela, para o software de gestão.
- Não somos subcontratantes um do outro. Cada um responde perante a clínica, e a
  clínica autoriza expressamente o acesso da Telma aos dados de que precisa.

**O que a Telma trataria dos vossos dados.** Só o que precisa para a frase
seguinte: se aquele número corresponde a um utente, o primeiro nome para o
tratar por ele, as vagas livres e as marcações daquele número. Nada clínico.
Notámos, e agradecemos, que a vossa API já limita a resposta a isso mesmo.

**O que guardamos.** A gravação e a transcrição da chamada vivem **sete dias** na
camada de voz e são apagadas. Na nossa base ficam a duração, o
resultado, o número de quem ligou e o resumo, com prazos definidos, e a
transcrição não é guardada: a coluna foi eliminada do esquema para que não possa
voltar a sê-lo por engano. O motivo da consulta é guardado como o serviço da
agenda, não nas palavras do paciente.

**Onde correm as duas camadas, e são duas respostas diferentes.**

A nossa aplicação, que é onde ficam as marcações, o registo das chamadas e o
painel da clínica, corre e armazena **na União Europeia**.

A camada de voz corre sobre um subcontratante nosso que **armazena nos Estados
Unidos**. Dizemo-lo assim, em vez de o deixar implícito, porque é o ponto que
qualquer anexo sério tem de declarar e não escondemos aquilo que teríamos de
declarar na mesma. A transferência está coberta por um contrato de tratamento de
dados em vigor, que incorpora as **Cláusulas Contratuais-Tipo** da Decisão de
Execução (UE) 2021/914 da Comissão, no módulo aplicável entre responsável e
subcontratante, dadas por executadas com a aceitação do contrato. Esse
subcontratante mantém lista pública de subcontratantes ulteriores, com **30 dias
de pré-aviso** antes de acrescentar ou substituir qualquer um e direito de
oposição fundamentada. Podemos partilhar convosco o contrato e a lista.

O que reduz a exposição é a retenção: sete dias, e o que sai da chamada para a
nossa base já não é a conversa, é o resultado dela.

**O caminho a partir daqui.** Existe residência de dados na União Europeia nessa
camada, em nível empresarial, e é para lá que queremos ir. Não está contratado
hoje porque o volume ainda não o justifica. Uma clínica piloto com o MyBlueBee é
exactamente o tipo de compromisso que muda essa conta, e se para a vossa
administração isso for condição e não preferência, digam-no já: é uma decisão de
custo do nosso lado, não é um obstáculo técnico.

---

## 9. O que precisamos de perguntar

Por ordem de importância. A primeira muda o desenho da conversa toda, as outras
quatro são detalhes de implementação.

**1. `allowsUnknownPatients` está a `false`, e a API não cria utentes.**

Esta é a pergunta que interessa. Uma boa parte de quem liga fora de horas está a
ligar pela primeira vez, e é precisamente essa a chamada que hoje se perde: a
clínica está fechada, a pessoa não é utente, e ninguém atende.

Se a Telma não puder marcar para essas pessoas, o piloto ainda funciona, mas
funciona a meio: a Telma identifica, informa, recolhe o contacto e deixa o recado
para a receção tratar no dia seguinte. É útil, e é bastante menos do que podia
ser.

A pergunta concreta: é uma configuração por instalação que a clínica piloto pode
abrir, ou é uma decisão de produto vossa que se mantém fechada? Se for a
primeira, o que é que a clínica tem de garantir para a abrir?

**2. O `limit` do `openSlots` e a janela de sete dias.** Com o máximo de 50 vagas
por resposta, uma consulta de uma semana a uma agenda cheia trunca. Truncar
por onde: pelas primeiras 50 no tempo, ou distribuídas? Se for pelas primeiras,
a Telma passa a pedir dia a dia, e são mais pedidos por chamada.

**3. A janela real do `SLOT_TAKEN`.** Percebemos que não há reserva temporária e
que o `validateSlot` antes de confirmar não é opcional. Entre o `validateSlot` e o
"sim, confirmo" da pessoa passam alguns segundos de conversa. Têm alguma medida
da frequência com que uma vaga foge nesse intervalo, em clínicas com volume?

**4. O mapeamento de serviço.** O nosso catálogo por clínica ("limpeza",
"destartarização", "consulta de avaliação") contra o vosso `specialtyId` mais
`eventType` (F, O, E). Quem mantém essa tabela quando a clínica acrescenta um
serviço, e existe alguma forma de a ler da vossa API em vez de a manter à mão?

**5. Usar o `code` em vez do `message`.** Como escrevemos na secção 4, a Telma vai
dizer a recusa por palavras dela a partir do `code`, porque os vossos `message`
estão escritos para ser lidos e não ditos. Compromete alguma coisa do vosso lado,
contratual ou de suporte, se o texto literal não for reproduzido?

**E uma que não é pergunta, é um comentário.** A lista de espera que o João
mencionou é o destino natural de quem não encontra hora, e é onde uma
rececionista que está sempre disponível vale mais: pode ligar de volta quando
uma vaga abre. Ficamos atentos se algum dia houver API para isso.

---

## 10. O que a Telma não faz

Para não haver expectativa a mais:

- **Não substitui a receção.** Encaminha para uma pessoa sempre que a conversa
  sai do que sabe fazer, e uma urgência interrompe tudo o resto.
- **Não fala de preços** a não ser que a clínica lhe tenha dito o preço concreto
  de um serviço concreto.
- **Não dá informação clínica.** Não interpreta sintomas, não sugere tratamentos
  e não diz se algo é grave.
- **Não marca sessões de tratamento.** Lemos que essas nascem de uma prescrição e
  continuam no agendador da clínica. Concordamos, e não é território nosso.
- **Esta integração é para o canal de voz.** É onde está o problema que a Telma
  resolve: o telefone que toca quando não há ninguém para o atender.

---

## 11. Próximos passos que propomos

1. **Demo de uma chamada real**, do nosso lado, com a agenda que temos hoje. É o
   que dá para perceber o encaixe melhor do que qualquer documento.
2. **Resposta à pergunta 1 da secção 9**, que é a que decide o que o piloto
   consegue provar.
3. **A sessão de formação e o acesso ao ambiente de qualidade** que o Vinícius
   propôs, com uma chave para a clínica piloto.
4. Com isso, conseguimos dar uma estimativa de esforço do nosso lado, que é o que
   o João precisa de levar à administração.
