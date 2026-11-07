# xapuestas — Dashboard JIJA$ + Bot de WhatsApp

- **Dashboard** (en Vercel): cargas las apuestas subiendo las fotos de los tickets, las marcas como ganadas o perdidas y ves tu capital.
- **Base de datos** (Upstash Redis, gratis): guarda las apuestas y la cola de mensajes.
- **Bot** (en tu PC, con el número secundario): toma los mensajes de la cola y los manda a tu grupo de WhatsApp. También manda el resumen de las 22:00.

```
Dashboard (Vercel)  →  Upstash Redis  ←  Bot en tu PC  →  Grupo de WhatsApp
```

Acceso al dashboard: usuario `admin`, contraseña `admin`. Para cambiarlos, crea en Vercel las variables `ADMIN_USER` y `ADMIN_PASS`.

---

## 1. Conectar la base de datos en Vercel (una sola vez)
1. Entra a tu proyecto **xapuestas** en vercel.com.
2. Ve a **Storage** → **Create Database** → **Upstash for Redis** (plan Free) → **Connect**.
3. Ve a **Deployments**, abre el último y dale **⋯ → Redeploy** para que tome la base de datos.

## 2. Prender el bot en tu PC
1. Instala Node.js 18 o superior: https://nodejs.org
2. Clona o descarga este repositorio y ábrelo en VS Code.
3. Crea un archivo `.env` copiando `.env.example` y llena:
   - `KV_REST_API_URL` y `KV_REST_API_TOKEN`: los encuentras en Vercel → Storage → tu base Upstash → pestaña **.env.local** → **Show secret**.
4. En la terminal:
   ```
   npm install
   npm run instalar-bot
   npm run bot
   ```
5. Abre el dashboard. En el panel **WhatsApp** aparece el QR: escanéalo con el número secundario (WhatsApp → Dispositivos vinculados).
6. Elige tu grupo en la lista y dale **Guardar grupo**.

Mientras la terminal con `npm run bot` esté abierta, los mensajes salen solos. Si el bot está apagado, los mensajes quedan en espera y se mandan cuando lo prendas.

## Uso diario
1. Sube las fotos de los tickets: toca el recuadro 📸, arrástralas o pégalas con Ctrl+V. Puedes subir varias a la vez.
2. Revisa los datos. Todo se puede editar: apuesta, mercado, partido, cuota y stake (viene en 5%). Con **+ Agregar apuesta a mano** sumas una sin foto.
3. Dale **Guardar apuestas** y se mandan al grupo como "Apuesta 1", "Apuesta 2"…
4. Cuando termina el partido, marca ✅, ❌ o ⚪ y el resultado se manda al grupo.

## Probar todo en tu PC sin Vercel
```
npm install
npm run dev        # dashboard en http://localhost:3000
npm run bot        # en otra terminal
```
Si no hay `.env`, los datos se guardan en `data/local.json`.

## Mensajes que se mandan
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
- Ganada: monto × (cuota − 1). Ejemplo: +S/ 140, que es +7%
- Perdida: −monto. Nula: 0
- Capital actual = capital inicial + la suma de las ganancias

## Archivos
- `public/`: páginas del dashboard (HTML, CSS, JS) y el lector de tickets en `vendor/`
- `api/index.js`: entrada para Vercel
- `src/`: API, cálculos, mensajes y base de datos
- `bot/`: bot de WhatsApp para tu PC
- `config.json`: hora del resumen, zona horaria y usuario por defecto

## Importante
- WhatsApp no tiene una API oficial para grupos, así que el bot usa la librería no oficial `whatsapp-web.js`. Úsalo con el número secundario.
- Nunca subas el archivo `.env` a GitHub (ya está en `.gitignore`).
