# Partir la base en nodos

Qué es, por qué, y en qué orden. Escrito antes de tocar nada, para poder
discutirlo sin leer código.

## El problema, medido

Telma recibe hoy **una sola hoja de instrucciones** al empezar la llamada, y
la lee entera en cada frase que dice. Da igual que la llamada sea para
cancelar: también está leyendo las reglas de urgencias, de precios y de
idiomas.

Eso funcionaba con nueve páginas menos. Hoy no:

```
misma regla, mismas palabras
con 17.000 caracteres alrededor  →  se cumple 5 de cada 10 veces
con 22.000 caracteres alrededor  →  1 de cada 8
```

No cambió la regla. Cambió cuánto ruido tiene al lado. Y como las reglas van a
seguir creciendo conforme afinemos el comportamiento, una base que empeora con
cada regla nueva no es una base sobre la que construir.

## Lo que existe en la plataforma

Comprobado contra la API, no supuesto:

- **Nodos** con sus propias instrucciones, que **sustituyen** a las generales
  mientras la conversación está dentro (`conversation_config`), o que **se
  suman** a ellas (`additional_prompt`).
- **Nodos con sus propias herramientas**: la de cancelar solo existe dentro
  del nodo de cancelar.
- **Aristas con condiciones escritas en lenguaje normal**: "la persona quiere
  pedir una cita". No hay que programar la decisión, se describe.

## Cómo quedaría

```
    núcleo          quién es, cómo habla, lo que nunca hace,
                    urgencias, y los datos de la clínica
                    ~4 páginas, siempre presentes

    ├── reservar    el orden de una cita        ~2 páginas
    ├── cancelar    identidad y cancelación     ~1 página
    ├── informar    horarios, precios, servicios ~1 página
    └── despedir    el cierre                   ~½ página
```

Urgencias se queda en el núcleo a propósito: es lo único que tiene que poder
interrumpir cualquier otra cosa, y un nodo al que hay que llegar es un nodo al
que se puede no llegar.

## El riesgo, y es real

**El traspaso.** Carlos cancela su cita y luego pide otra para su hija. Si al
pasar del nodo de cancelar al de reservar se pierde que ya dio su nombre y su
teléfono, volvemos al fallo que llevamos dos semanas persiguiendo, y encima
por una causa nueva.

Por eso la primera prueba después de partir es esa llamada exacta, y el
listón es el que ya está medido: `no_repite_datos` tiene que salir mejor que
1 de 8, o la partición no ha servido para nada.

## Orden de trabajo

1. **Respaldo hecho.** `docs/base-congelada/` tiene las dos bases enteras, y
   la etiqueta `base-monolitica-2026-08-18` marca el punto exacto del que
   partimos. Volver es una orden de git.
2. Separar el núcleo del resto **sin cambiar una palabra**, y medir. Si algo
   cae aquí, es la partición y no el contenido.
3. Nodo de reservar, que es donde está la regla que falla.
4. Nodo de cancelar, que es donde se pierde el estado.
5. Informar y despedir.

Cada paso se mide con los escenarios que ya existen, contra los números que ya
tenemos. Sin eso, partir en nodos es reorganizar a ciegas.

## Lo que no cambia

Los 60 tests del prompt, los escenarios, los correctores validados y el arnés
de simulación siguen valiendo igual: miden comportamiento, no dónde está
escrita cada regla.
