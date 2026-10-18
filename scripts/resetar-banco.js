// Apaga o arquivo do banco SQLite (multiplataforma: Windows, macOS e Linux).
require('dotenv/config');
const { rmSync } = require('fs');

const caminho = process.env.DATABASE_PATH || 'data/raizes.sqlite';
rmSync(caminho, { force: true });
console.log(`✔ Banco removido: ${caminho}`);
