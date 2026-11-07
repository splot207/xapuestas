# JIJA$ Dashboard + Bot de WhatsApp

Una página web con usuario y contraseña donde cargas tus apuestas. El bot, que va en tu **número secundario**, manda cada apuesta y su resultado a tu grupo de WhatsApp.

## Instalar (una sola vez)
1. Instala Node.js 18 o superior: https://nodejs.org
2. Abre esta carpeta en VS Code y en la Terminal escribe:
   ```
   npm install
   ```

## Arrancar
```
npm start
```
Luego abre en el navegador: **http://localhost:3000**

- Usuario: `admin`
- Contraseña: `admin`

(Puedes cambiarlos en `config.json`.)

## Conectar el número secundario
1. En el dashboard, en el panel **WhatsApp**, aparece un código QR.
2. En el celular del número secundario: WhatsApp → Dispositivos vinculados → Vincular dispositivo → escanea el QR.
3. Agrega ese número a tu grupo de apuestas, si todavía no está.
4. En el dashboard elige el grupo en la lista y dale **Guardar grupo**.

La sesión queda guardada en la carpeta `.sesion/`, así que no tienes que volver a escanear.

## Uso diario
1. **Capital inicial**: ponlo arriba a la izquierda, por ejemplo S/ 2000, y dale Guardar.
2. **Sube las fotos de los tickets**: toca el recuadro 📸, arrastra las imágenes o pégalas con Ctrl+V. Puedes subir 2, 3 o las que quieras de una vez. Cada ticket se lee solo y llena Apuesta, Mercado, Partido y Cuota.
3. **Revisa y corrige**: todos los campos se pueden editar. El stake viene en 5% y lo cambias escribiéndolo o con los botones 1%, 2%, 3%, 5%, 7% y 10%. Con **+ Agregar apuesta a mano** sumas una apuesta sin foto. A la derecha ves cómo va a llegar cada mensaje.
4. **Guardar apuestas**: se guardan todas juntas y se mandan al grupo una tras otra como "Apuesta 1", "Apuesta 2"…
5. Cuando termina el partido, marca ✅ (ganada), ❌ (perdida) o ⚪ (nula). El resultado se manda solo al grupo.
6. Arriba ves siempre el capital actual, la ganancia total en plata y en %, el récord, el acierto y el yield.

Otros botones:
- 📤 reenvía el mensaje de una apuesta
- 🗑️ borra una apuesta
- **Enviar resumen de hoy** manda el resumen del día cuando quieras
- Todas las noches a las 22:00 se manda el resumen automáticamente (se cambia en `config.json` → `horaResumen`)

## Mensajes que manda
Al cargar la apuesta:
```
*Apuesta 1*

Más de 1.5
Universitario de Deportes - Goles totales Más/Menos
Universitario vs Sport Boys

Pendiente ⏳

Cuota 2.40

Stake: 5% (S/ 100.00)
Ganancia posible: +S/ 140.00
Porcentaje posible: +7.00%
```
Al marcarla ganada:
```
*Apuesta 1*

Más de 1.5
Universitario de Deportes - Goles totales Más/Menos
Universitario vs Sport Boys

Ganada ✅✅✅

Cuota 2.40

Ganancias: +S/ 140.00
Porcentaje: +7.00%
```

## Cómo calcula
- Monto = capital inicial × stake %. Ejemplo: 2000 × 5% = S/ 100
- Ganada: monto × (cuota − 1). Ejemplo: 100 × 1.40 = +S/ 140, que es +7% del capital
- Perdida: −monto. Ejemplo: −S/ 100, que es −5%
- Nula: 0
- Capital actual = capital inicial + la suma de todas las ganancias

## Lectura de tickets
- Funciona en tu PC, sin pagar nada ni usar servicios externos.
- La primera vez tarda unos segundos más porque carga el lector.
- Funciona mejor con capturas de pantalla del ticket que con fotos tomadas a la pantalla.
- El monto que aparece en el ticket se muestra como referencia ("En el ticket: S/ 100.00"). El stake que cuenta es el que pones tú.

## Probar sin WhatsApp
```
node server.js --sin-bot
```
Abre el dashboard sin conectar WhatsApp. Sirve para probar.

## Importante
- **El PC tiene que estar prendido** para que el bot mande mensajes y el resumen de la noche. Si quieres que funcione 24/7, súbelo a un VPS.
- Usa una librería no oficial de WhatsApp (`whatsapp-web.js`). Por eso es buena idea que vaya en el número secundario y no en el principal.
- Tus datos se guardan en `data/db.json`. Haz una copia de ese archivo de vez en cuando.
- Si lo subes a internet, cambia el usuario, la contraseña y `sessionSecret` en `config.json`.
