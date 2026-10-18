import { DefaultNamingStrategy, NamingStrategyInterface } from 'typeorm';

const snake = (texto: string) =>
  texto
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();

/** Converte propriedades camelCase do TypeScript em colunas snake_case no banco. */
export class EstrategiaDeNomesSnakeCase extends DefaultNamingStrategy implements NamingStrategyInterface {
  columnName(nomePropriedade: string, nomeCustomizado: string | undefined, prefixos: string[]): string {
    return snake(prefixos.concat(nomeCustomizado ?? nomePropriedade).join('_'));
  }

  relationName(nomePropriedade: string): string {
    return snake(nomePropriedade);
  }

  joinColumnName(nomeRelacao: string, nomeColunaReferenciada: string): string {
    return snake(`${nomeRelacao}_${nomeColunaReferenciada}`);
  }
}
