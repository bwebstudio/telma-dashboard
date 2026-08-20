# Dónde se ejecuta la aplicación

## Lo que estaba pasando

Las cabeceras de la demo decían esto:

```
x-vercel-id: cdg1::iad1::...
```

La petición entra por París y **se ejecuta en Washington**. Sin configuración,
Vercel pone las funciones en `iad1`, Estados Unidos.

Dos consecuencias, y ninguna es cosmética.

## 1. La lentitud

Cada página del panel hace varias consultas a la base. Si la base está en
Europa y la función en Washington, **cada consulta cruza el Atlántico dos
veces**: unos 90 milisegundos de ida y otros tantos de vuelta, multiplicado por
el número de consultas de esa página.

Medido en la demo: `/login`, que no toca la base, responde en 0,3 s. Una
llamada a la API que solo comprueba que una clínica no existe tarda 0,83 s.
Esa diferencia es el viaje.

`vercel.json` fija ahora las funciones en `cdg1`, París, que es lo más cerca
que hay de Iberia.

## 2. El contrato

Esto era uno de los tres huecos del anexo de tratamiento de datos, y la
respuesta resultó ser la mala: **los datos de pacientes se estaban procesando
en servidores de Estados Unidos**. Nombres, teléfonos y el motivo de la cita
pasaban por allí en cada consulta.

No se *almacenaban* allí — la base es Supabase y el almacenamiento es donde
esté ese proyecto — pero el tratamiento sí ocurría fuera del Espacio Económico
Europeo, y eso es una transferencia internacional que hay que declarar.

Con las funciones en París deja de haberla por este lado.

## Lo que hace falta confirmar

**La región del proyecto de Supabase**, en Project Settings, General. Dos
cosas dependen de ella:

- Si está en Europa, con este cambio la lentitud debería desaparecer y el
  anexo puede decir que no hay transferencia internacional.
- Si está en Estados Unidos, hay que mover el proyecto o declararlo, y además
  poner las funciones donde esté la base: tenerlas en París con la base en
  Virginia sería el mismo viaje al revés.

El cambio de región no se aplica hasta el siguiente despliegue.
