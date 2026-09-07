// Aísla los tests del `.env` local: aunque el dev use MESSAGING_PROVIDER=whatsapp
// o USE_MOCK=false (Supabase real), la suite corre contra el proveedor mock
// para ser determinística y no tocar servicios externos.
// dotenv no sobrescribe variables ya presentes → esto gana.
process.env.MESSAGING_PROVIDER = 'mock'
process.env.SMTP_ENABLED = 'false'
process.env.USE_MOCK = 'true'
process.env.SUPABASE_URL = ''