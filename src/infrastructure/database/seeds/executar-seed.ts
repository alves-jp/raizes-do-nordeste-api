import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { opcoesDoBanco } from '../opcoes-banco';
import { semearDadosIniciais, SENHA_PADRAO_SEED } from './dados-iniciais';

/**
 * npm run setup   → aplica migrations pendentes e insere os dados de demonstração.
 * npm run db:reset → apaga o arquivo do banco e executa o setup do zero.
 * Execute com a API PARADA (o SQLite em arquivo é aberto por um processo por vez).
 */
async function executar() {
  const dataSource = await new DataSource(opcoesDoBanco()).initialize();
  try {
    const migrations = await dataSource.runMigrations({ transaction: 'each' });
    console.log(migrations.length ? `✔ Migrations aplicadas: ${migrations.map((m) => m.name).join(', ')}` : '✔ Banco já está na versão mais recente');
    const semeou = await semearDadosIniciais(dataSource);
    console.log(semeou ? `✔ Dados de demonstração inseridos (senha de todos os usuários: ${SENHA_PADRAO_SEED})` : '✔ Banco já possui dados — seed ignorado');
  } finally {
    await dataSource.destroy();
  }
}

executar().catch((erro) => {
  console.error('✘ Falha no setup do banco:', erro);
  process.exit(1);
});
