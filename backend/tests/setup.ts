// Aísla los tests del `.env` local: aunque el dev use MESSAGING_PROVIDER=whatsapp
// (envío real por el dispositivo de la clínica), la suite corre contra el
// proveedor mock para ser determinística y no abrir sockets de WhatsApp.
// dotenv no sobrescribe variables ya presentes → esto gana.
process.env.MESSAGING_PROVIDER = 'mock'
process.env.SMTP_ENABLED = 'false'