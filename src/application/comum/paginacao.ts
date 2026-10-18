export interface Paginacao {
  page: number;
  limit: number;
}

export interface Pagina<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const paginar = <T>(data: T[], total: number, { page, limit }: Paginacao): Pagina<T> => ({
  data,
  meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
});

export const deslocamento = ({ page, limit }: Paginacao) => ({ skip: (page - 1) * limit, take: limit });
