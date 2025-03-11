const puppeteer = require('puppeteer');
const admin = require('firebase-admin');
const { MAX_MENSAJES_POR_NUMERO, RETRASO_MIN, RETRASO_MAX } = require('./config');

// Inicializa Firebase Admin. En Cloud Functions se configura automáticamente.
admin.initializeApp();
const db = admin.firestore();

let whatsappSessions = []; // Guardará las sesiones activas

/**
 * Carga las cookies almacenadas en Firestore.
 * @return {Promise<Array>} Una promesa que se resuelve con el array de cookies.
 */
async function cargarCookies() {
  try {
    const doc = await db.collection('sessions').doc('whatsappSession').get();
    if (!doc.exists) {
      console.log('No se encontraron cookies almacenadas en Firestore.');
      return [];
    }
    const data = doc.data();
    console.log("cookies:", data);
    return data.cookies || [];
  } catch (error) {
    console.error("Error al cargar cookies:", error);
    return [];
  }
}

/**
 * Guarda las cookies actualizadas en Firestore.
 * @param {Array} cookies El array de cookies a guardar.
 * @return {Promise<void>}
 */
async function guardarCookies(cookies) {
  try {
    await db.collection('sessions').doc('whatsappSession').set({ cookies });
    console.log("Cookies actualizadas en Firestore.");
  } catch (error) {
    console.error("Error al guardar cookies:", error);
  }
}

/**
 * Inicia una nueva sesión de WhatsApp.
 * Se carga las cookies desde Firestore, se inyectan en la página y luego se actualizan tras la navegación.
 * @return {Promise<void>} Una promesa que se resuelve cuando la sesión ha sido iniciada.
 */
async function iniciarSesionWhatsApp() {
  // Usamos headless: true en Firebase Cloud Functions
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  // Cargar cookies desde Firestore e inyectarlas en la página
  const cookies = await cargarCookies();
  if (cookies.length > 0) {
    await page.setCookie(...cookies);
    console.log("Cookies cargadas en la sesión.");
  }

  // Navegar a WhatsApp Web y esperar a que la red se estabilice
  await page.goto('https://web.whatsapp.com', { waitUntil: 'networkidle2' });
  console.log("Iniciando sesión en WhatsApp Web.");

  // Intentar detectar si se muestra el QR para escanear (lo que indicaría que la sesión no se restauró)
  try {
    await page.waitForSelector('canvas[aria-label="Scan me!"]', { timeout: 5000 });
    console.log("QR code visible. Es necesario escanear para autenticar la sesión.");
    // Esperar 30 segundos para permitir el escaneo del QR manual (en caso de que sea necesario)
    await new Promise((resolve) => setTimeout(resolve, 30000));
  } catch (e) {
    console.log("Sesión restaurada correctamente, no se detectó QR.");
  }

  // Guardar las cookies actualizadas para futuras ejecuciones
  const nuevasCookies = await page.cookies();
  await guardarCookies(nuevasCookies);

  whatsappSessions.push({ browser, page, mensajesEnviados: 0 });
}

/**
 * Obtiene una sesión de WhatsApp disponible.
 * @return {object} La sesión con menos mensajes enviados.
 */
function obtenerSesionDisponible() {
  return whatsappSessions.sort((a, b) => a.mensajesEnviados - b.mensajesEnviados)[0];
}

/**
 * Genera un retraso aleatorio entre mensajes.
 * @return {Promise<void>} Una promesa que se resuelve después del retraso.
 */
function retrasoAleatorio() {
  const tiempo = Math.floor(Math.random() * (RETRASO_MAX - RETRASO_MIN + 1)) + RETRASO_MIN;
  return new Promise((resolve) => setTimeout(resolve, tiempo));
}

/**
 * Envía un mensaje de WhatsApp a un número específico.
 * @param {string} numero El número de teléfono destino.
 * @param {string} mensaje El mensaje a enviar.
 * @return {Promise<object>} Una promesa que se resuelve con el resultado del envío.
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
    // Esperar a que se cargue el chat y enviar el mensaje
    await page.waitForSelector('div[contenteditable="true"]', { timeout: 60000 });
    await page.keyboard.press('Enter');
    console.log(`Mensaje enviado a ${numero}.`);
    session.mensajesEnviados += 1;
    // Si se ha superado el límite de mensajes, se crea una nueva sesión
    if (session.mensajesEnviados >= MAX_MENSAJES_POR_NUMERO) {
      console.log("Número alcanzó el límite. Cambiando de sesión.");
      whatsappSessions = whatsappSessions.filter((s) => s !== session);
      await iniciarSesionWhatsApp();
      console.log("Sesiones activas:", whatsappSessions.length);
    }
    return { success: true };
  } catch (error) {
    console.error("Error enviando mensaje, reintentando...", error);
    await retrasoAleatorio();
    return await enviarMensajeWhatsApp(numero, mensaje);
  }
}

module.exports = {
  iniciarSesionWhatsApp,
  enviarMensajeWhatsApp,
};
