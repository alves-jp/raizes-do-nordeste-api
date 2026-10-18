import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import {
  CanalPedido,
  CategoriaProduto,
  FinalidadeConsentimento,
  Perfil,
  TipoMovimentacaoEstoque,
  TipoTransacaoFidelidade,
  TipoUnidade,
} from '../../../domain/enums';
import { Campanha, Consentimento, Estoque, ItemCardapio, MovimentacaoEstoque, Produto, TransacaoFidelidade, Unidade, Usuario } from '../entidades';

/** Senha de TODOS os usuários de demonstração. */
export const SENHA_PADRAO_SEED = 'Raizes@2026';

const UNIDADES = [
  { nome: 'Raízes do Nordeste — Salvador (Rio Vermelho)', cidade: 'Salvador', uf: 'BA', tipo: TipoUnidade.PROPRIA, horarioFuncionamento: '07:00-22:00' },
  { nome: 'Raízes do Nordeste — Fortaleza (Meireles)', cidade: 'Fortaleza', uf: 'CE', tipo: TipoUnidade.FRANQUIA, horarioFuncionamento: '07:00-23:00' },
  { nome: 'Raízes do Nordeste — Belo Horizonte (Savassi)', cidade: 'Belo Horizonte', uf: 'MG', tipo: TipoUnidade.FRANQUIA, horarioFuncionamento: '10:00-22:00' },
];

/** [nome, descrição, categoria, sazonal?, mês início, mês fim] — ids 1 a 13 na ordem abaixo. */
const PRODUTOS: [string, string, CategoriaProduto, boolean?, number?, number?][] = [
  ['Tapioca de carne de sol com queijo coalho', 'Goma de tapioca recheada com carne de sol desfiada e queijo coalho na chapa.', CategoriaProduto.TAPIOCAS],
  ['Tapioca de coco com leite condensado', 'Tapioca doce com coco ralado fresco e leite condensado.', CategoriaProduto.TAPIOCAS],
  ['Cuscuz nordestino com ovo', 'Cuscuz de milho no vapor com ovo frito e manteiga de garrafa.', CategoriaProduto.CUSCUZ],
  ['Cuscuz recheado com charque', 'Cuscuz de milho recheado com charque acebolada.', CategoriaProduto.CUSCUZ],
  ['Baião de dois com queijo coalho', 'Arroz, feijão-de-corda, queijo coalho em cubos e coentro.', CategoriaProduto.PRATOS],
  ['Bolo de rolo (fatia)', 'Massa fina enrolada com goiabada — receita pernambucana.', CategoriaProduto.DOCES],
  ['Cartola', 'Banana frita, queijo coalho derretido, açúcar e canela.', CategoriaProduto.DOCES],
  ['Acarajé completo', 'Bolinho de feijão-fradinho frito no dendê com vatapá, caruru e camarão.', CategoriaProduto.SALGADOS],
  ['Suco de cajá (500 ml)', 'Suco natural da polpa de cajá.', CategoriaProduto.BEBIDAS],
  ['Café coado com leite', 'Café passado na hora com leite vaporizado.', CategoriaProduto.BEBIDAS],
  ['Caldinho de feijão', 'Caldo cremoso de feijão com bacon e cheiro-verde (copo 300 ml).', CategoriaProduto.PRATOS],
  ['Pamonha doce', 'Pamonha de milho verde cozida na palha — item junino.', CategoriaProduto.DOCES, true, 6, 7],
  ['Milho cozido na espiga', 'Milho verde cozido com manteiga — item junino.', CategoriaProduto.SALGADOS, true, 6, 7],
];

/** Preço (R$) por unidade [Salvador, Fortaleza, BH]; null = fora do cardápio daquela unidade. */
const PRECOS: (number | null)[][] = [
  [24.9, 23.9, 27.9],
  [16.9, 15.9, null],
  [18.5, 17.9, 21.9],
  [22.9, 21.9, null],
  [32.9, 31.9, 36.9],
  [12.0, 12.5, 14.9],
  [14.5, 13.9, null],
  [19.9, null, null],
  [10.0, 9.5, 12.0],
  [7.5, 7.0, 8.9],
  [11.9, 10.9, null],
  [9.5, 9.0, null],
  [8.0, 7.5, null],
];

/** Estoque inicial [Salvador, Fortaleza, BH] — Bolo de rolo baixo e Cartola zerada em Salvador para demonstrar as regras. */
const ESTOQUE: number[][] = [
  [60, 40, 25],
  [40, 30, 0],
  [60, 40, 25],
  [30, 20, 0],
  [35, 25, 15],
  [4, 20, 10],
  [0, 15, 0],
  [30, 0, 0],
  [80, 50, 30],
  [100, 60, 40],
  [30, 20, 0],
  [25, 20, 0],
  [25, 20, 0],
];

const USUARIOS = [
  { nome: 'Marina Albuquerque', email: 'admin@raizesdonordeste.com.br', perfil: Perfil.ADMIN, unidade: null },
  { nome: 'Joana Bittencourt', email: 'gerente.salvador@raizesdonordeste.com.br', perfil: Perfil.GERENTE, unidade: 1 },
  { nome: 'Diego Santana', email: 'atendente.salvador@raizesdonordeste.com.br', perfil: Perfil.ATENDENTE, unidade: 1 },
  { nome: 'Severino Araújo', email: 'cozinha.salvador@raizesdonordeste.com.br', perfil: Perfil.COZINHA, unidade: 1 },
  { nome: 'Totem 01 — Salvador', email: 'totem01.salvador@raizesdonordeste.com.br', perfil: Perfil.TOTEM, unidade: 1 },
  { nome: 'Iracema Freitas', email: 'gerente.fortaleza@raizesdonordeste.com.br', perfil: Perfil.GERENTE, unidade: 2 },
  { nome: 'Ana Souza', email: 'ana.souza@email.com', perfil: Perfil.CLIENTE, unidade: null, telefone: '(71) 99876-1234' },
  { nome: 'Bruno Costa', email: 'bruno.costa@email.com', perfil: Perfil.CLIENTE, unidade: null },
];

/**
 * Popula o banco com dados de demonstração. Idempotente: não faz nada se já houver unidades.
 * @returns true se semeou, false se o banco já tinha dados.
 */
export async function semearDadosIniciais(dataSource: DataSource): Promise<boolean> {
  if ((await dataSource.getRepository(Unidade).count()) > 0) return false;
  const senhaHash = bcrypt.hashSync(SENHA_PADRAO_SEED, 10);

  await dataSource.transaction(async (em) => {
    const unidades = await em.save(UNIDADES.map((u) => em.create(Unidade, u)));
    const produtos = await em.save(
      PRODUTOS.map(([nome, descricao, categoria, sazonal = false, mesInicio = null, mesFim = null]) =>
        em.create(Produto, { nome, descricao, categoria, sazonal, mesInicio, mesFim }),
      ),
    );

    for (const [p, produto] of produtos.entries()) {
      for (const [u, unidade] of unidades.entries()) {
        const preco = PRECOS[p][u];
        if (preco === null) continue;
        await em.insert(ItemCardapio, { unidadeId: unidade.id, produtoId: produto.id, precoCentavos: Math.round(preco * 100) });
        const quantidade = ESTOQUE[p][u];
        await em.insert(Estoque, { unidadeId: unidade.id, produtoId: produto.id, quantidade });
        if (quantidade > 0) {
          await em.insert(MovimentacaoEstoque, {
            unidadeId: unidade.id,
            produtoId: produto.id,
            tipo: TipoMovimentacaoEstoque.ENTRADA,
            quantidade,
            saldoApos: quantidade,
            motivo: 'Carga inicial de estoque',
          });
        }
      }
    }

    const usuarios = await em.save(
      USUARIOS.map((u) =>
        em.create(Usuario, {
          nome: u.nome,
          email: u.email,
          senhaHash,
          telefone: u.telefone ?? null,
          perfil: u.perfil,
          unidadeId: u.unidade,
          versaoTermosAceita: u.perfil === Perfil.CLIENTE ? 'v1.0' : null,
          termosAceitosEm: u.perfil === Perfil.CLIENTE ? new Date() : null,
        }),
      ),
    );

    const ana = usuarios.find((u) => u.email === 'ana.souza@email.com')!;
    const bruno = usuarios.find((u) => u.email === 'bruno.costa@email.com')!;
    const consentimentos: [Usuario, FinalidadeConsentimento, boolean][] = [
      [ana, FinalidadeConsentimento.FIDELIDADE, true],
      [ana, FinalidadeConsentimento.MARKETING, true],
      [bruno, FinalidadeConsentimento.FIDELIDADE, false],
      [bruno, FinalidadeConsentimento.MARKETING, false],
    ];
    for (const [usuario, finalidade, concedido] of consentimentos) {
      await em.insert(Consentimento, { usuarioId: usuario.id, finalidade, concedido, versaoTermo: 'v1.0', origem: 'CADASTRO' });
    }
    await em.insert(TransacaoFidelidade, {
      clienteId: ana.id,
      tipo: TipoTransacaoFidelidade.ACUMULO,
      pontos: 120,
      descricao: 'Pontos de compras anteriores (carga inicial de demonstração)',
    });

    await em.save([
      em.create(Campanha, {
        codigo: 'APPRAIZ10',
        descricao: '10% de desconto em pedidos feitos pelo App (rede toda)',
        percentualDesconto: 10,
        inicio: new Date('2026-01-01T03:00:00Z'),
        fim: new Date('2027-12-31T23:59:59Z'),
        canalPedido: CanalPedido.APP,
        valorMinimoCentavos: 2000,
      }),
      em.create(Campanha, {
        codigo: 'FORTALEZA15',
        descricao: '15% de desconto na unidade Fortaleza para pedidos a partir de R$ 40',
        percentualDesconto: 15,
        inicio: new Date('2026-01-01T03:00:00Z'),
        fim: new Date('2027-12-31T23:59:59Z'),
        unidadeId: unidades[1].id,
        valorMinimoCentavos: 4000,
      }),
      em.create(Campanha, {
        codigo: 'ARRAIA2026',
        descricao: 'Arraiá Raízes 2026 — 20% em toda a rede (encerrada)',
        percentualDesconto: 20,
        inicio: new Date('2026-06-01T03:00:00Z'),
        fim: new Date('2026-07-01T02:59:59Z'),
      }),
    ]);
  });
  return true;
}
