const puppeteer = require('puppeteer');
const { MAX_MENSAJES_POR_NUMERO, RETRASO_MIN, RETRASO_MAX } = require('./config');

let whatsappSessions = []; // Guardará las sesiones activas

/**
 * Inicia una nueva sesión de WhatsApp sin cargar ni guardar cookies persistentes.
 * Se usará la sesión generada en el momento.
 * @return {Promise<void>}
 */
async function iniciarSesionWhatsApp() {
  // Usamos headless: false para poder ver WhatsApp Web y escanear el QR
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  // Ir directamente a WhatsApp Web sin inyectar cookies previas
  await page.goto('https://web.whatsapp.com', { waitUntil: 'networkidle2' });
  console.log("Abriendo WhatsApp Web.");

  // Esperar a que se muestre el QR para escanear
  try {
    await page.waitForSelector('canvas[aria-label="Scan me!"]', { timeout: 5000 });
    console.log("QR code visible. Por favor, escanea el código para autenticar la sesión.");
    // Espera 30 segundos para permitir escanear el código QR manualmente
    await new Promise(resolve => setTimeout(resolve, 30000));
  } catch (e) {
    console.log("No se detectó el QR. Es posible que la sesión ya esté activa.");
  }

  whatsappSessions.push({ browser, page, mensajesEnviados: 0 });
}

/**
 * Obtiene la sesión de WhatsApp disponible (la que ha enviado menos mensajes).
 * @return {object} La sesión activa.
 */
function obtenerSesionDisponible() {
  return whatsappSessions.sort((a, b) => a.mensajesEnviados - b.mensajesEnviados)[0];
}

/**
 * Genera un retraso aleatorio entre mensajes.
 * @return {Promise<void>}
 */
function retrasoAleatorio() {
  const tiempo = Math.floor(Math.random() * (RETRASO_MAX - RETRASO_MIN + 1)) + RETRASO_MIN;
  return new Promise(resolve => setTimeout(resolve, tiempo));
}

/**
 * Envía un mensaje de WhatsApp a un número específico utilizando la sesión activa.
 * @param {string} numero El número de teléfono destino.
 * @param {string} mensaje El mensaje a enviar.
 * @return {Promise<object>} Se resuelve con el resultado del envío.
 */
async function enviarMensajeWhatsApp(numero, mensaje) {
  if (whatsappSessions.length === 0) {
    return { error: "No hay sesiones activas." };
  }
  const session = obtenerSesionDisponible();
  const { page } = session;
  const whatsappUrl = `https://web.whatsapp.com/send?phone=${numero}&text=${encodeURIComponent(mensaje)}`;
  await page.goto(whatsappUrl);
  try {
    // Esperar un retraso aleatorio antes de enviar el mensaje
    await retrasoAleatorio();
    // Esperar a que cargue el chat y enviar el mensaje
    await page.waitForSelector('div[contenteditable="true"]', { timeout: 60000 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    console.log(`Mensaje enviado a ${numero}.`);
    session.mensajesEnviados += 1;
    // Si se alcanza el límite de mensajes, se inicia una nueva sesión
    if (session.mensajesEnviados >= MAX_MENSAJES_POR_NUMERO) {
      console.log("Límite de mensajes alcanzado. Creando nueva sesión.");
      whatsappSessions = whatsappSessions.filter(s => s !== session);
      await iniciarSesionWhatsApp();
    }
    return { success: true };
  } catch (error) {
    console.error("Error al enviar mensaje, reintentando...", error);
    await retrasoAleatorio();
    return await enviarMensajeWhatsApp(numero, mensaje);
  }
}

module.exports = {
  iniciarSesionWhatsApp,
  enviarMensajeWhatsApp
};
