const functions = require('firebase-functions');
const express = require('express');
const cors = require('cors');
const { iniciarSesionWhatsApp, enviarMensajeWhatsApp } = require('./whatsapp');

const app = express();

// Habilitar CORS para permitir peticiones desde otros dominios
app.use(cors());

// Middleware para parsear JSON
app.use(express.json());

// Endpoint para enviar mensajes
app.post('/enviar-mensaje', async (req, res) => {
    const { telefono, mensaje } = req.body;
    if (!telefono || !mensaje) {
        return res.status(400).json({ error: "Número y mensaje son requeridos." });
    }

    try {
        const resultado = await enviarMensajeWhatsApp(telefono, mensaje);
        return res.json(resultado);
    } catch (error) {
        console.error("Error en el endpoint /enviar-mensaje:", error);
        return res.status(500).json({ error: "Error interno del servidor." });
    }
});

// Inicializar la sesión de WhatsApp al arrancar la función
iniciarSesionWhatsApp().catch(console.error);

// Exportar la API como una función HTTP de Firebase
exports.api = functions.https.onRequest(app);
